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
import { ArgumentUtils } from "./argumentUtils";

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

    // Check if the directive has arguments or not
    const firstLineText = doc.lineAt(startLine).text;
    const hasArguments = /^:-\s*[a-z_][a-zA-Z0-9_]*\(/.test(firstLineText.trim());

    if (hasArguments) {
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
    } else {
      // Directive without arguments - look for just the period
      // Match :- directive_name. on the same line
      if (/^:-\s*[a-z_][a-zA-Z0-9_]*\.(\s*(%.*)?)?$/.test(firstLineText.trim())) {
        endLine = startLine;
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
      const ranges = this.findConsecutivePredicateClauseRanges(document, indicator, position.line);

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
            // Check if this is a character code notation (zero followed by single quote)
            if (char === "'" && currentCol > 0 && currentLineText[currentCol - 1] === '0') {
              // This is character code notation like 0'0, 0'\n, etc.
              // Just skip the quote and the next character
              currentCol++; // Skip the quote
              if (currentCol < currentLineText.length) {
                currentCol++; // Skip the character after the quote
              }
            } else {
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

  /**
   * Find consecutive predicate clause ranges for a predicate/non-terminal with arity checking
   * This is used for test coverage to find all clauses of a specific predicate/arity
   * @param document The document to search
   * @param predicateIndicator The predicate indicator (name/arity or name//arity)
   * @param startLine The line number where the first clause is located
   * @returns Array of ranges for consecutive clauses
   */
  static findConsecutivePredicateClauseRanges(
    document: TextDocument,
    predicateIndicator: string,
    startLine: number
  ): Range[] {
    const ranges: Range[] = [];
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const parts = predicateIndicator.split(separator);

    if (parts.length !== 2) {
      return ranges;
    }

    const predicateName = parts[0];
    const expectedArity = parseInt(parts[1], 10);

    if (isNaN(expectedArity)) {
      return ranges;
    }

    let lineNum = startLine;
    while (lineNum < document.lineCount) {
      const lineText = document.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Stop at directives
      if (trimmedLine.startsWith(':-')) {
        break;
      }

      // Stop at entity boundaries
      if (this.isEntityBoundary(trimmedLine)) {
        break;
      }

      // Skip comments and empty lines
      if (trimmedLine.startsWith('%') || trimmedLine === '' ||
          trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.startsWith('*/')) {
        lineNum++;
        continue;
      }

      // Check if this line is a clause for our predicate with the correct arity
      if (this.isClauseForPredicateWithArity(document, lineNum, predicateName, expectedArity, isNonTerminal)) {
        const clauseEndLine = this.findClauseEndLine(document, lineNum);
        ranges.push(new Range(
          new Position(lineNum, 0),
          new Position(clauseEndLine, document.lineAt(clauseEndLine).text.length)
        ));
        lineNum = clauseEndLine + 1;
      } else {
        // Different predicate or different arity - stop
        break;
      }
    }

    return ranges;
  }

  /**
   * Check if a line is a clause for a specific predicate/non-terminal with the expected arity
   * Handles multi-line clause heads by reading additional lines if needed
   */
  private static isClauseForPredicateWithArity(
    document: TextDocument,
    startLine: number,
    predicateName: string,
    expectedArity: number,
    isNonTerminal: boolean
  ): boolean {
    // Read the complete clause head (may span multiple lines)
    let clauseHead = '';
    let currentLine = startLine;
    let foundEnd = false;

    while (currentLine < document.lineCount && !foundEnd) {
      const lineText = document.lineAt(currentLine).text;
      clauseHead += lineText;

      // Check if we've reached the end of the clause head
      if (lineText.includes(':-') || lineText.includes('-->') || lineText.trim().endsWith('.')) {
        foundEnd = true;
      } else {
        clauseHead += ' '; // Add space between lines
        currentLine++;
      }
    }

    // Extract just the head part (before :-, -->, or .)
    let headPart = clauseHead;
    const neckPos = clauseHead.indexOf(':-');
    const dcgPos = clauseHead.indexOf('-->');

    if (neckPos !== -1 && (dcgPos === -1 || neckPos < dcgPos)) {
      headPart = clauseHead.substring(0, neckPos);
    } else if (dcgPos !== -1) {
      headPart = clauseHead.substring(0, dcgPos);
    } else {
      // Fact - remove the trailing period
      const dotPos = clauseHead.lastIndexOf('.');
      if (dotPos !== -1) {
        headPart = clauseHead.substring(0, dotPos);
      }
    }

    const trimmed = headPart.trim();
    const escapedName = this.escapeRegex(predicateName);

    // Verify that this is actually a non-terminal if isNonTerminal is true
    if (isNonTerminal && !clauseHead.includes('-->')) {
      return false;
    }

    // Check for multifile clause: Entity::predicate(...)
    const multifileMatch = trimmed.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)(\(.+\))?::/);
    if (multifileMatch) {
      // Extract part after ::
      const afterDoubleColon = trimmed.substring(trimmed.indexOf('::') + 2).trim();
      return this.matchesPredicateWithArity(afterDoubleColon, escapedName, expectedArity, isNonTerminal);
    }

    // Regular clause
    return this.matchesPredicateWithArity(trimmed, escapedName, expectedArity, isNonTerminal);
  }

  /**
   * Check if text matches a predicate/non-terminal with the expected arity
   * Note: For non-terminals, the caller should verify that --> is present in the full clause
   */
  private static matchesPredicateWithArity(
    text: string,
    escapedPredicateName: string,
    expectedArity: number,
    isNonTerminal: boolean
  ): boolean {
    // Match: name with word boundary to prevent matching dead_predicate when looking for dead_predicate_1
    const match = text.match(new RegExp(`^\\s*${escapedPredicateName}\\b`));
    if (!match) {
      return false;
    }

    // Check if there's an opening parenthesis after the predicate name
    const afterName = text.substring(match[0].length).trimStart();
    const hasArgs = afterName.startsWith('(');

    if (!hasArgs) {
      return expectedArity === 0;
    }

    // Count arguments
    const openParenPos = text.indexOf('(', match[0].length);
    const arity = this.countArityAtPosition(text, openParenPos);
    return arity === expectedArity;
  }

  /**
   * Count the arity of a predicate/non-terminal at a given position
   */
  private static countArityAtPosition(text: string, openParenPos: number): number {
    if (openParenPos >= text.length || text[openParenPos] !== '(') {
      return 0;
    }

    // Find matching closing parenthesis using ArgumentUtils (handles quotes, escapes, etc.)
    const closeParenPos = ArgumentUtils.findMatchingCloseParen(text, openParenPos);

    if (closeParenPos === -1) {
      return 0;
    }

    // Extract arguments and count them
    const argsText = text.substring(openParenPos + 1, closeParenPos).trim();
    if (argsText === '') {
      return 0;
    }

    // Use ArgumentUtils.parseArguments for robust parsing
    const args = ArgumentUtils.parseArguments(argsText);
    return args.length;
  }

  /**
   * Find all variables used in a given range of text
   * Variables are identifiers that start with an uppercase letter or underscore
   * This method ignores variables inside:
   * - Single-quoted strings
   * - Double-quoted strings
   * - Line comments (%)
   * - Block comments
   *
   * @param document The text document
   * @param range The range to search for variables
   * @returns A Set of unique variable names found in the range
   */
  static findVariablesInRange(document: TextDocument, range: Range): Set<string> {
    const variables = new Set<string>();
    const text = document.getText(range);

    let inQuotes = false;
    let inSingleQuotes = false;
    let escapeNext = false;
    let inCharCode = false;
    let inLineComment = false;
    let inBlockComment = false;
    let currentToken = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = i + 1 < text.length ? text[i + 1] : '';

      // Handle newlines - reset line comment flag
      if (char === '\n') {
        inLineComment = false;
        // Process any accumulated token before the newline
        if (currentToken && !inQuotes && !inSingleQuotes && !inBlockComment) {
          this.addVariableIfValid(currentToken, variables);
        }
        currentToken = '';
        continue;
      }

      // Handle character code notation: after 0' we need to consume the character
      // This must be checked BEFORE backslash and quote handling
      if (inCharCode) {
        if (char === '\\') {
          // Escape sequence in char code (e.g., 0'\\, 0'\', 0'\")
          // Need to consume the next character as well
          if (i + 1 < text.length) {
            i++;
          }
        }
        inCharCode = false;
        continue;
      }

      // Skip everything inside comments
      if (inLineComment) {
        continue;
      }

      // Handle block comments
      if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
          inBlockComment = false;
          i++; // Skip the '/'
        }
        continue;
      }

      // Check for start of block comment
      if (!inQuotes && !inSingleQuotes && char === '/' && nextChar === '*') {
        // Process any accumulated token before entering block comment
        if (currentToken) {
          this.addVariableIfValid(currentToken, variables);
        }
        currentToken = '';
        inBlockComment = true;
        i++; // Skip the '*'
        continue;
      }

      // Check for start of line comment
      if (!inQuotes && !inSingleQuotes && char === '%') {
        // Process any accumulated token before entering line comment
        if (currentToken) {
          this.addVariableIfValid(currentToken, variables);
        }
        currentToken = '';
        inLineComment = true;
        continue;
      }

      // Handle escape sequences
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      // Handle double quotes
      if (char === '"' && !inSingleQuotes) {
        // Process any accumulated token before entering/exiting quotes
        if (!inQuotes && currentToken) {
          this.addVariableIfValid(currentToken, variables);
          currentToken = '';
        }
        inQuotes = !inQuotes;
        continue;
      }

      // Handle single quotes
      if (char === "'" && !inQuotes) {
        // Check if this is a character code notation (zero followed by single quote)
        // This only applies when we're NOT already inside a single-quoted string
        if (!inSingleQuotes && i > 0 && text[i - 1] === '0') {
          // This is character code notation like 0'x, 0'\n, etc.
          // Set flag to handle the next character(s) specially
          inCharCode = true;
          continue;
        } else {
          // Process any accumulated token before entering/exiting single quotes
          if (!inSingleQuotes && currentToken) {
            this.addVariableIfValid(currentToken, variables);
            currentToken = '';
          }
          // This is a regular quoted string (opening or closing quote)
          inSingleQuotes = !inSingleQuotes;
          continue;
        }
      }

      // Skip everything inside quotes
      if (inQuotes || inSingleQuotes) {
        continue;
      }

      // Build tokens from valid identifier characters
      if (/[a-zA-Z0-9_]/.test(char)) {
        currentToken += char;
      } else {
        // Non-identifier character - process accumulated token
        if (currentToken) {
          this.addVariableIfValid(currentToken, variables);
          currentToken = '';
        }
      }
    }

    // Process any remaining token at the end
    if (currentToken && !inQuotes && !inSingleQuotes && !inLineComment && !inBlockComment) {
      this.addVariableIfValid(currentToken, variables);
    }

    return variables;
  }

  /**
   * Helper method to add a token to the variables set if it's a valid variable name
   * Variables must start with an uppercase letter or underscore
   *
   * @param token The token to check
   * @param variables The set to add the variable to
   */
  private static addVariableIfValid(token: string, variables: Set<string>): void {
    // Variables must start with uppercase letter or underscore
    if (token && /^[A-Z_]/.test(token) && token !== '_') {
      variables.add(token);
    }
  }
}
