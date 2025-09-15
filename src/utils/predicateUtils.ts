"use strict";

import {
  TextDocument,
  Position,
  workspace,
  Location,
  CancellationToken
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

    try {
      // Step 1: Try to get declaration location
      const declarationLocation = await declarationProvider.provideDeclaration(document, position, token);

      if (declarationLocation && this.isValidLocation(declarationLocation)) {
        // Case 1: Declaration found - definitively determine from declaration
        logger.debug(`Found declaration at: ${declarationLocation.uri.fsPath}:${declarationLocation.range.start.line + 1}`);

        const declarationDocument = await workspace.openTextDocument(declarationLocation.uri);
        const declarationLineText = declarationDocument.lineAt(declarationLocation.range.start.line).text;

        // Definitively determine type by checking the declaration line
        if (declarationLineText.includes(`${parsed.name}//`)) {
          finalIsNonTerminal = true;
          inferenceMethod = 'declaration';
          wasInferred = true;
          logger.debug(`Definitively determined as non-terminal from declaration`);
        } else if (declarationLineText.includes(`${parsed.name}/`)) {
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

    const finalCurrentIndicator = this.createIndicator(parsed.name, currentArity, finalIsNonTerminal);
    const finalNewIndicator = this.createIndicator(parsed.name, newArity, finalIsNonTerminal);

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
    let match;
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
    let match;
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
}
