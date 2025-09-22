"use strict";

import {
  TextDocument,
  Position,
  workspace,
  Location,
  CancellationToken,
  Uri,
  Range
} from "vscode";
import { getLogger } from "./logger";

const logger = getLogger();

/**
 * Parsed predicate/non-terminal indicator information
 */
export interface PredicateIndicatorInfo {
  name: string;
  arity: number;
  isNonTerminal: boolean;
  separator: string;
  fullIndicator: string;
}

/**
 * Result of predicate/non-terminal type determination
 */
export interface PredicateTypeResult {
  isNonTerminal: boolean;
  currentIndicator: string;
  newIndicator: string;
  wasInferred: boolean;
  inferenceMethod?: 'declaration' | 'dcg_context' | 'original';
}

/**
 * Utility functions for working with predicate and non-terminal indicators
 */
export class PredicateUtils {

  /**
   * Get the range (start and end line) of a directive starting at the given line
   */
  static getDirectiveRange(doc: TextDocument, startLine: number): { start: number; end: number } {
    const totalLines = doc.lineCount;
    let endLine = startLine;

    // Find the end of the directive by looking for the closing ).
    // Only match when ). is followed by whitespace and/or line comment
    for (let lineNum = startLine; lineNum < totalLines; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      // Match ). followed by optional whitespace and optional line comment
      if (/\)\.(\s*(%.*)?)?$/.test(lineText)) {
        endLine = lineNum;
        break;
      }
    }

    return { start: startLine, end: endLine };
  }

  /**
   * Get the range (start and end line) of a clause starting at the given line
   * Supports both facts and rules, including multi-line clauses
   */
  static getClauseRange(doc: TextDocument, startLine: number): { start: number; end: number } {
    const totalLines = doc.lineCount;
    let endLine = startLine;

    // Find the end of the clause by looking for the terminating period
    // Handle both facts (predicate(...). ) and rules (predicate(...) :- body.)
    for (let lineNum = startLine; lineNum < totalLines; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if this line contains a period that terminates the clause
      // Match period followed by optional whitespace and optional line comment
      if (/\.\s*(?:%.*)?$/.test(lineText)) {
        endLine = lineNum;
        break;
      }
    }

    return { start: startLine, end: endLine };
  }

  /**
   * Parse a predicate or non-terminal indicator into its components
   */
  static parseIndicator(indicator: string): PredicateIndicatorInfo | null {
    if (!indicator) {
      return null;
    }

    let isNonTerminal: boolean;
    let separator: string;
    let parts: string[];

    if (indicator.includes('//')) {
      isNonTerminal = true;
      separator = '//';
      parts = indicator.split('//');
    } else if (indicator.includes('/')) {
      isNonTerminal = false;
      separator = '/';
      parts = indicator.split('/');
    } else {
      return null;
    }

    if (parts.length !== 2) {
      return null;
    }

    const name = parts[0];
    const arity = parseInt(parts[1], 10);

    if (isNaN(arity)) {
      return null;
    }

    return {
      name,
      arity,
      isNonTerminal,
      separator,
      fullIndicator: indicator
    };
  }

  /**
   * Create an indicator string from components
   */
  static createIndicator(name: string, arity: number, isNonTerminal: boolean): string {
    const separator = isNonTerminal ? '//' : '/';
    return `${name}${separator}${arity}`;
  }

  /**
   * Convert a predicate indicator to a non-terminal indicator (or vice versa)
   */
  static convertIndicatorType(indicator: string, toNonTerminal: boolean): string {
    const parsed = this.parseIndicator(indicator);
    if (!parsed) {
      return indicator;
    }
    return this.createIndicator(parsed.name, parsed.arity, toNonTerminal);
  }

  /**
   * Definitively determine if a predicate/non-terminal is a predicate or non-terminal
   * by analyzing the declaration line and using heuristics when needed
   */
  static async determinePredicateType(
    document: TextDocument,
    position: Position,
    currentIndicator: string,
    declarationProvider: any,
    token: CancellationToken
  ): Promise<PredicateTypeResult> {
    const parsed = this.parseIndicator(currentIndicator);
    if (!parsed) {
      throw new Error(`Invalid indicator: ${currentIndicator}`);
    }

    const currentArity = parsed.arity;
    const newArity = currentArity + 1;
    let finalIsNonTerminal = parsed.isNonTerminal;
    let inferenceMethod: 'declaration' | 'dcg_context' | 'original' = 'original';
    let wasInferred = false;

    // Extract just the predicate name without any message sending or super call prefixes
    const cleanPredicateName = parsed.name.replace(/^.*(?:::|\^\^|@)/, '');

    try {
      // Step 1: Try to get declaration location
      const declarationLocation = await declarationProvider.provideDeclaration(document, position, token);

      if (declarationLocation && this.isValidLocation(declarationLocation)) {
        // Case 1: Declaration found - definitively determine from declaration
        logger.debug(`Found declaration at: ${declarationLocation.uri.fsPath}:${declarationLocation.range.start.line + 1}`);

        const declarationDocument = await workspace.openTextDocument(declarationLocation.uri);
        const declarationStartLine = declarationLocation.range.start.line;

        // Get the full directive range in case it's multi-line
        const directiveRange = this.getDirectiveRange(declarationDocument, declarationStartLine);

        // Check the entire directive range for the predicate indicator
        let directiveText = '';
        for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
          directiveText += declarationDocument.lineAt(lineNum).text + '\n';
        }

        // Definitively determine type by checking the entire directive
        if (directiveText.includes(`${cleanPredicateName}//`)) {
          finalIsNonTerminal = true;
          inferenceMethod = 'declaration';
          wasInferred = true;
          logger.debug(`Definitively determined as non-terminal from declaration`);
        } else if (directiveText.includes(`${cleanPredicateName}/`)) {
          finalIsNonTerminal = false;
          inferenceMethod = 'declaration';
          wasInferred = true;
          logger.debug(`Definitively determined as predicate from declaration`);
        } else {
          logger.debug(`Could not find indicator in declaration, using original determination`);
        }
      } else {
        // Case 2: No declaration found - use heuristics
        logger.debug(`No declaration found. Using heuristics to determine type...`);

        // First, try to find the definition to check its context
        try {
          // Import the definition provider dynamically to avoid circular dependencies
          const { LogtalkDefinitionProvider } = await import('../features/definitionProvider');
          const definitionProvider = new LogtalkDefinitionProvider();
          const definitionLocation = await definitionProvider.provideDefinition(document, position, token);

          if (definitionLocation && 'uri' in definitionLocation) {
            // Found definition - check if it's a DCG rule
            const definitionDocument = await import('vscode').then(vscode => vscode.workspace.openTextDocument(definitionLocation.uri));
            const definitionLineText = definitionDocument.lineAt(definitionLocation.range.start.line).text;

            if (definitionLineText.includes('-->')) {
              // Definition contains DCG operator - it's a non-terminal
              finalIsNonTerminal = true;
              inferenceMethod = 'dcg_context';
              wasInferred = true;
              logger.debug(`DCG rule found in definition, inferring non-terminal`);
            } else if (definitionLineText.includes(':-') || definitionLineText.includes('.')) {
              // Definition contains predicate operator or fact - it's a predicate
              finalIsNonTerminal = false;
              inferenceMethod = 'dcg_context';
              wasInferred = true;
              logger.debug(`Predicate rule/fact found in definition, inferring predicate`);
            } else {
              // Fallback to current line context
              const currentLineText = document.lineAt(position.line).text;
              const isDCGContext = currentLineText.includes('-->');

              if (isDCGContext && currentIndicator.includes('/') && !currentIndicator.includes('//')) {
                finalIsNonTerminal = true;
                inferenceMethod = 'dcg_context';
                wasInferred = true;
                logger.debug(`DCG context detected in current line, inferring non-terminal`);
              } else {
                finalIsNonTerminal = currentIndicator.includes('//');
                logger.debug(`Using original determination: ${finalIsNonTerminal ? 'non-terminal' : 'predicate'}`);
              }
            }
          } else {
            // No definition found - fallback to current line context
            const currentLineText = document.lineAt(position.line).text;
            const isDCGContext = currentLineText.includes('-->');

            if (isDCGContext && currentIndicator.includes('/') && !currentIndicator.includes('//')) {
              finalIsNonTerminal = true;
              inferenceMethod = 'dcg_context';
              wasInferred = true;
              logger.debug(`DCG context detected in current line, inferring non-terminal`);
            } else {
              finalIsNonTerminal = currentIndicator.includes('//');
              logger.debug(`Using original determination: ${finalIsNonTerminal ? 'non-terminal' : 'predicate'}`);
            }
          }
        } catch (error) {
          logger.debug(`Error finding definition for heuristics: ${error}`);
          // Fallback to current line context
          const currentLineText = document.lineAt(position.line).text;
          const isDCGContext = currentLineText.includes('-->');

          if (isDCGContext && currentIndicator.includes('/') && !currentIndicator.includes('//')) {
            finalIsNonTerminal = true;
            inferenceMethod = 'dcg_context';
            wasInferred = true;
            logger.debug(`DCG context detected in current line, inferring non-terminal`);
          } else {
            finalIsNonTerminal = currentIndicator.includes('//');
            logger.debug(`Using original determination: ${finalIsNonTerminal ? 'non-terminal' : 'predicate'}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Error determining predicate type: ${error}`);
      // Fallback to original determination
      finalIsNonTerminal = currentIndicator.includes('//');
    }

    const finalCurrentIndicator = this.createIndicator(cleanPredicateName, currentArity, finalIsNonTerminal);
    const finalNewIndicator = this.createIndicator(cleanPredicateName, newArity, finalIsNonTerminal);

    logger.debug(`Final determination: ${finalIsNonTerminal ? 'non-terminal' : 'predicate'} ${finalCurrentIndicator} → ${finalNewIndicator}`);

    return {
      isNonTerminal: finalIsNonTerminal,
      currentIndicator: finalCurrentIndicator,
      newIndicator: finalNewIndicator,
      wasInferred,
      inferenceMethod
    };
  }

  /**
   * Find the exact position of a predicate/non-terminal name in a declaration line
   */
  static findPredicatePositionInDeclaration(
    doc: TextDocument,
    declarationLine: number,
    predicateIndicator: string
  ): Position {
    const parsed = this.parseIndicator(predicateIndicator);
    if (!parsed) {
      return new Position(declarationLine, 0);
    }

    // First try to find the predicate on the declaration line itself
    const lineText = doc.lineAt(declarationLine).text;
    const namePattern = new RegExp(`\\b${parsed.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    let match: RegExpExecArray | null;
    let pos = 0;

    while ((match = namePattern.exec(lineText.substring(pos))) !== null) {
      const actualPos = pos + match.index;
      // Simple validation - just return the first match for now
      // More sophisticated validation could be added here
      return new Position(declarationLine, actualPos);
    }

    // Fallback: return start of line
    return new Position(declarationLine, 0);
  }

  /**
   * Find the exact position of a predicate/non-terminal name in a definition line
   */
  static findPredicatePositionInDefinition(
    doc: TextDocument,
    definitionLine: number,
    predicateIndicator: string,
    isNonTerminal: boolean
  ): Position {
    const parsed = this.parseIndicator(predicateIndicator);
    if (!parsed) {
      return new Position(definitionLine, 0);
    }

    const lineText = doc.lineAt(definitionLine).text;
    const expectedOperator = isNonTerminal ? '-->' : ':-';

    // Look for the predicate name at the start of the line (for definitions)
    const namePattern = new RegExp(`\\b${parsed.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    let match: RegExpExecArray | null;
    let pos = 0;

    while ((match = namePattern.exec(lineText.substring(pos))) !== null) {
      const actualPos = pos + match.index;

      // Check if this occurrence is followed by the expected operator or is a fact
      const afterMatch = lineText.substring(actualPos + match[0].length);
      const operatorMatch = afterMatch.match(/^\s*(\(.*?\))?\s*(-->|:-)/);
      const factMatch = afterMatch.match(/^\s*(\(.*?\))?\s*\./);

      if (operatorMatch && operatorMatch[2] === expectedOperator) {
        // Found predicate/non-terminal with expected operator
        return new Position(definitionLine, actualPos);
      } else if (!isNonTerminal && factMatch) {
        // Found predicate fact (no operator, just arguments and period)
        return new Position(definitionLine, actualPos);
      }

      pos = actualPos + match[0].length;
    }

    // Fallback: return start of line if not found
    return new Position(definitionLine, 0);
  }

  /**
   * Check if a location is valid
   */
  private static isValidLocation(location: Location | { uri: any; range: any } | null): boolean {
    return location !== null && location.uri !== undefined && location.range !== undefined;
  }

  /**
   * Computes the range of all clauses of a predicate or all rules of a non-terminal
   * starting from the first clause/rule position.
   *
   * @param uri The URI of the document
   * @param position The position of the first clause/rule
   * @param indicator The predicate/non-terminal indicator (Name/Arity for predicates, Name//Arity for non-terminals)
   * @returns The range covering all consecutive clauses/rules, or null if none found
   */
  static async getPredicateDefinitionRange(
    uri: Uri,
    position: Position,
    indicator: string
  ): Promise<Range | null> {
    try {
      const document = await workspace.openTextDocument(uri);

      // Parse the indicator to determine if it's a non-terminal and extract the name
      const parsed = this.parseIndicator(indicator);
      if (!parsed) {
        logger.error(`Invalid indicator: ${indicator}`);
        return null;
      }

      const isNonTerminal = parsed.isNonTerminal;
      const predicateName = parsed.name;

      // Find all consecutive clauses/rules
      const ranges = this.findConsecutivePredicateClauseRanges(
        document,
        predicateName,
        position.line,
        isNonTerminal
      );

      if (ranges.length === 0) {
        return null;
      }

      // Compute the overall range from first to last clause/rule
      const firstRange = ranges[0];
      const lastRange = ranges[ranges.length - 1];

      return new Range(
        firstRange.start,
        lastRange.end
      );
    } catch (error) {
      logger.error(`Error computing predicate definition range: ${error}`);
      return null;
    }
  }

  /**
   * Computes the range of all consecutive directives for a predicate or non-terminal
   * starting from the scope directive position.
   *
   * @param uri The URI of the document
   * @param position The position of the scope directive
   * @param indicator The predicate/non-terminal indicator (Name/Arity for predicates, Name//Arity for non-terminals)
   * @returns The range covering all consecutive directives, or null if none found
   */
  static async getPredicateDeclarationRange(
    uri: Uri,
    position: Position,
    indicator: string
  ): Promise<Range | null> {
    try {
      const document = await workspace.openTextDocument(uri);

      // Parse the indicator to determine if it's a non-terminal and extract the name
      const parsed = this.parseIndicator(indicator);
      if (!parsed) {
        logger.error(`Invalid indicator: ${indicator}`);
        return null;
      }

      const isNonTerminal = parsed.isNonTerminal;
      const predicateName = parsed.name;

      // Find all consecutive directive ranges
      const ranges = this.findConsecutiveDirectiveRanges(
        document,
        predicateName,
        position.line,
        isNonTerminal,
        indicator
      );

      if (ranges.length === 0) {
        return null;
      }

      // Compute the overall range from first to last directive
      const firstRange = ranges[0];
      const lastRange = ranges[ranges.length - 1];

      return new Range(
        firstRange.start,
        lastRange.end
      );
    } catch (error) {
      logger.error(`Error computing predicate declaration range: ${error}`);
      return null;
    }
  }

  /**
   * Find consecutive predicate clauses or non-terminal rules starting from a known position
   */
  private static findConsecutivePredicateClauseRanges(
    document: TextDocument,
    predicateName: string,
    startLine: number,
    isNonTerminal: boolean
  ): Range[] {
    const ranges: Range[] = [];

    // Search forwards from startLine to find all consecutive clauses
    let lineNum = startLine;
    while (lineNum < document.lineCount) {
      const lineText = document.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Stop if we hit an entity boundary
      if (this.isEntityBoundary(trimmedLine)) {
        break;
      }

      // Skip comments and empty/whitespace-only lines, but continue searching
      if (trimmedLine === '' || trimmedLine.startsWith('%') ||
          trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.startsWith('*/')) {
        lineNum++;
        continue;
      }

      // Stop if we hit a different predicate clause or non-terminal rule
      if (this.isDifferentPredicateClause(lineText, predicateName, isNonTerminal)) {
        break;
      }

      // Check if this is a clause/rule for our predicate/non-terminal
      if (this.isPredicateClause(lineText, predicateName, isNonTerminal)) {
        // Find the end of this clause
        const clauseEndLine = this.findClauseEndLine(document, lineNum);

        // Add the range for this clause
        ranges.push(new Range(
          new Position(lineNum, 0),
          new Position(clauseEndLine, document.lineAt(clauseEndLine).text.length)
        ));

        // Skip ahead to after the end of this clause
        lineNum = clauseEndLine + 1;
      } else {
        lineNum++;
      }
    }

    return ranges;
  }

  /**
   * Check if a line represents an entity boundary
   */
  private static isEntityBoundary(trimmedLine: string): boolean {
    return trimmedLine.startsWith(':- object(') ||
           trimmedLine.startsWith(':- protocol(') ||
           trimmedLine.startsWith(':- category(') ||
           trimmedLine.startsWith(':- end_object') ||
           trimmedLine.startsWith(':- end_protocol') ||
           trimmedLine.startsWith(':- end_category');
  }

  /**
   * Check if a line is a clause for a different predicate or non-terminal
   */
  private static isDifferentPredicateClause(lineText: string, predicateName: string, isNonTerminal: boolean = false): boolean {
    const trimmedLine = lineText.trim();

    // Skip comments, empty lines, and directives - these don't count as different predicates
    if (trimmedLine.startsWith('%') || trimmedLine === '' || trimmedLine.startsWith(':-') ||
        trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.startsWith('*/')) {
      return false;
    }

    // Skip lines that are clearly clause body content
    if (trimmedLine.startsWith(',') || trimmedLine.startsWith(';')) {
      return false;
    }

    // Skip lines with significant indentation (likely clause body content)
    // Predicate clauses typically start at column 0 or with minimal indentation (1-4 spaces)
    if (/^\s{8,}/.test(lineText)) {
      return false;
    }

    // Check if this starts a predicate clause or non-terminal rule
    if (isNonTerminal) {
      // For non-terminals, look for pattern: name(...) --> or name -->
      const nonTerminalPattern = /^\s*([a-z][a-zA-Z0-9_]*|'[^']*')(\(.*\))?\s*-->/;
      const match = lineText.match(nonTerminalPattern);

      if (match) {
        const foundNonTerminalName = match[1];
        // Only return true if it's a different non-terminal (not our target non-terminal)
        return foundNonTerminalName !== predicateName;
      }
    } else {
      // For predicates, look for pattern: name(...) :- or name(...)
      const clausePattern = /^\s*([a-z][a-zA-Z0-9_]*|'[^']*')(\(.*\))?(\s*:-|\.)/;
      const match = lineText.match(clausePattern);

      if (match) {
        const foundPredicateName = match[1];
        // Only return true if it's a different predicate (not our target predicate)
        return foundPredicateName !== predicateName;
      }
    }

    // If it doesn't match a predicate/non-terminal clause pattern, it's not a different one
    return false;
  }

  /**
   * Check if a line is a clause for the specified predicate or non-terminal
   */
  private static isPredicateClause(lineText: string, predicateName: string, isNonTerminal: boolean = false): boolean {
    if (isNonTerminal) {
      // A non-terminal rule starts with the non-terminal name followed by optional ( and then -->
      const nonTerminalPattern = new RegExp(`^\\s*${this.escapeRegex(predicateName)}\\s*(\\(.*\\)?\\s*)?-->`);
      return nonTerminalPattern.test(lineText);
    } else {
      // A predicate clause starts with the predicate name followed by:
      // - ( for predicates with arguments
      // - :- for rules
      // - . for facts without arguments (arity 0)
      // - whitespace followed by . for facts without arguments
      const clausePattern = new RegExp(`^\\s*${this.escapeRegex(predicateName)}\\s*[\\(:-]|^\\s*${this.escapeRegex(predicateName)}\\s*\\.`);
      return clausePattern.test(lineText);
    }
  }

  /**
   * Find the end line of a clause starting from a given line
   */
  private static findClauseEndLine(document: TextDocument, startLine: number): number {
    let currentLine = startLine;

    while (currentLine < document.lineCount) {
      const lineText = document.lineAt(currentLine).text;
      const trimmedLine = lineText.trim();

      // Check if clause is complete (ends with period)
      if (trimmedLine.endsWith('.')) {
        return currentLine;
      }

      currentLine++;
    }

    // If no period found, return the start line
    return startLine;
  }

  /**
   * Find consecutive directive ranges for a predicate/non-terminal starting from a known position
   */
  private static findConsecutiveDirectiveRanges(
    document: TextDocument,
    predicateName: string,
    startLine: number,
    isNonTerminal: boolean,
    indicator: string
  ): Range[] {
    const ranges: Range[] = [];

    // Search forwards from startLine to find all consecutive directives
    let lineNum = startLine;
    while (lineNum < document.lineCount) {
      const lineText = document.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Stop if we hit an entity boundary
      if (this.isEntityBoundary(trimmedLine)) {
        break;
      }

      // Skip empty/whitespace-only lines and comments, but continue searching
      if (trimmedLine === '' || trimmedLine.startsWith('%') ||
          trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.startsWith('*/')) {
        lineNum++;
        continue;
      }

      // Stop if we hit a predicate clause or non-terminal rule
      if (this.isPredicateClause(lineText, predicateName, isNonTerminal)) {
        break;
      }

      // Stop if we hit a different predicate clause or non-terminal rule
      if (this.isDifferentPredicateClause(lineText, predicateName, isNonTerminal)) {
        break;
      }

      // Check if this is a directive
      if (trimmedLine.startsWith(':-')) {
        // Find the end of this directive first (may be multi-line)
        const directiveEndLine = this.findDirectiveEndLine(document, lineNum);

        // Check if this directive is for our predicate/non-terminal by checking the entire directive range
        if (this.isDirectiveForPredicateInRange(document, lineNum, directiveEndLine, predicateName, indicator)) {
          // Add the range for this directive
          ranges.push(new Range(
            new Position(lineNum, 0),
            new Position(directiveEndLine, document.lineAt(directiveEndLine).text.length)
          ));

          // Skip ahead to after the end of this directive
          lineNum = directiveEndLine + 1;
        } else {
          // This is a directive for a different predicate/non-terminal, stop
          break;
        }
      } else {
        // This is not a directive, comment, or empty line, stop
        break;
      }
    }

    return ranges;
  }

  /**
   * Check if a directive range is for the specified predicate/non-terminal
   */
  private static isDirectiveForPredicateInRange(
    document: TextDocument,
    startLine: number,
    endLine: number,
    predicateName: string,
    indicator: string
  ): boolean {
    // Check for various directive types that might contain the predicate/non-terminal
    const directiveTypes = [
      'public', 'protected', 'private',
      'mode', 'info', 'meta_predicate', 'meta_non_terminal',
      'dynamic', 'discontiguous', 'multifile', 'uses'
    ];

    // First check if the first line contains a recognized directive type
    const firstLineText = document.lineAt(startLine).text;
    let isRecognizedDirective = false;

    for (const directiveType of directiveTypes) {
      if (firstLineText.includes(`${directiveType}(`)) {
        isRecognizedDirective = true;
        break;
      }
    }

    if (!isRecognizedDirective) {
      return false;
    }

    // Now check if any line in the directive range contains our predicate name or indicator
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text;
      if (lineText.includes(predicateName) || lineText.includes(indicator)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find the end line of a directive starting from a given line
   */
  private static findDirectiveEndLine(document: TextDocument, startLine: number): number {
    let currentLine = startLine;

    while (currentLine < document.lineCount) {
      const lineText = document.lineAt(currentLine).text;
      const trimmedLine = lineText.trim();

      // Check if directive is complete (ends with period)
      if (trimmedLine.endsWith('.')) {
        return currentLine;
      }

      currentLine++;
    }

    // If no period found, return the start line
    return startLine;
  }

  /**
   * Finds the range of a predicate call in a grammar rule starting at the given position
   * @param document The text document
   * @param position The position to start searching from
   * @param indicator The predicate indicator (name/arity)
   * @returns The range of the predicate call, or null if not found
   */
  static findPredicateCallRange(document: TextDocument, position: Position, indicator: string): Range | null {
    try {
      // Parse the indicator to extract predicate name
      const match = indicator.match(/^(.+)\/(\d+)$/);
      if (!match) {
        return null;
      }

      const predicateName = match[1];
      const namePattern = new RegExp(`\\b${this.escapeRegex(predicateName)}\\s*\\(`);

      // Find the complete clause/rule range starting from the diagnostic position
      const clauseRange = this.findClauseRangeFromPosition(document, position);
      if (!clauseRange) {
        return null;
      }

      // Search within the complete clause/rule for the predicate call
      for (let searchLine = clauseRange.start.line; searchLine <= clauseRange.end.line; searchLine++) {
        const lineText = document.lineAt(searchLine).text;
        let startChar = 0;

        // If this is the first line of the clause, start from the beginning
        // If this is the diagnostic line, start from the diagnostic position
        if (searchLine === position.line) {
          startChar = position.character;
        }

        // Find the predicate call starting from the position
        const searchText = lineText.substring(startChar);
        const nameMatch = namePattern.exec(searchText);

        if (nameMatch) {
          // Found the predicate call on this line
          const actualPosition = new Position(searchLine, startChar);
          return this.findPredicateCallRangeOnLine(document, actualPosition, nameMatch);
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error finding predicate call range: ${error}`);
      return null;
    }
  }

  /**
   * Find the complete clause/rule range starting from the given position (clause head)
   */
  private static findClauseRangeFromPosition(document: TextDocument, position: Position): Range | null {
    try {
      // The position already points to the clause head, so start from there
      const clauseStartLine = position.line;

      // Find the end of the clause starting from the clause head
      const clauseEndLine = this.findClauseEndLine(document, clauseStartLine);

      return new Range(
        new Position(clauseStartLine, 0),
        new Position(clauseEndLine, document.lineAt(clauseEndLine).text.length)
      );
    } catch (error) {
      logger.error(`Error finding clause range: ${error}`);
      return null;
    }
  }

  /**
   * Helper function to find the complete predicate call range on a specific line
   */
  private static findPredicateCallRangeOnLine(document: TextDocument, position: Position, nameMatch: RegExpExecArray): Range | null {
    try {
      // Calculate the start position of the predicate name
      const nameStartCol = position.character + nameMatch.index;

      // Find the opening parenthesis
      const openParenCol = nameStartCol + nameMatch[0].length - 1;

      // Find the matching closing parenthesis
      let parenCount = 1;
      let currentCol = openParenCol + 1;
      let currentLine = position.line;

      while (currentLine < document.lineCount && parenCount > 0) {
        const currentLineText = document.lineAt(currentLine).text;

        while (currentCol < currentLineText.length && parenCount > 0) {
          const char = currentLineText[currentCol];

          if (char === '(') {
            parenCount++;
          } else if (char === ')') {
            parenCount--;
          } else if (char === "'" || char === '"') {
            // Skip quoted strings
            const quote = char;
            currentCol++;
            while (currentCol < currentLineText.length && currentLineText[currentCol] !== quote) {
              if (currentLineText[currentCol] === '\\') {
                currentCol++; // Skip escaped character
              }
              currentCol++;
            }
          }

          currentCol++;
        }

        if (parenCount > 0) {
          currentLine++;
          currentCol = 0;
        }
      }

      if (parenCount === 0) {
        // Found the matching closing parenthesis
        return new Range(
          new Position(position.line, nameStartCol),
          new Position(currentLine, currentCol)
        );
      }

      return null;
    } catch (error) {
      logger.error(`Error finding predicate call range: ${error}`);
      return null;
    }
  }

  /**
   * Escape special regex characters in a string
   */
  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
