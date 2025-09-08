"use strict";

import { TextDocument } from "vscode";

/**
 * Regular expressions for matching Logtalk symbols
 */
export const SymbolRegexes = {
  // Entity opening directives
  object: /^(?:\:- object\()([^(),.]+(\(.*\))?)/,
  protocol: /^(?:\:- protocol\()([^(),.]+(\(.*\))?)/,
  category: /^(?:\:- category\()([^(),.]+(\(.*\))?)/,
  
  // Entity ending directives
  endObject: /^(?:\:- end_object\.)/,
  endProtocol: /^(?:\:- end_protocol\.)/,
  endCategory: /^(?:\:- end_category\.)/,
  
  // Predicate scope directives
  publicPredicate: /(?:\s*\:- public\()(\w+[/]\d+)/,
  protectedPredicate: /(?:\s*\:- protected\()(\w+[/]\d+)/,
  privatePredicate: /(?:\s*\:- private\()(\w+[/]\d+)/,
  
  // Non-terminal scope directives
  publicNonTerminal: /(?:\s*\:- public\()(\w+[/][/]\d+)/,
  protectedNonTerminal: /(?:\s*\:- protected\()(\w+[/][/]\d+)/,
  privateNonTerminal: /(?:\s*\:- private\()(\w+[/][/]\d+)/,
  
  // Predicate clause (rule head or fact)
  predicateClause: /^\s*(\w+\([^)]*\))\s*(?::-|\.)$/,
  
  // Non-terminal rule using the --> operator
  nonTerminalRule: /^\s*(\w+\([^)]*\))\s*-->/,
  
  // Line ending with comma or semicolon (continuation)
  continuation: /^\s*.*[,;]\s*(?:%.*)?$/
};

/**
 * Symbol types for consistent categorization
 */
export const SymbolTypes = {
  OBJECT: "object",
  PROTOCOL: "protocol", 
  CATEGORY: "category",
  PUBLIC_PREDICATE: "public predicate",
  PROTECTED_PREDICATE: "protected predicate",
  PRIVATE_PREDICATE: "private predicate",
  PUBLIC_NON_TERMINAL: "public non-terminal",
  PROTECTED_NON_TERMINAL: "protected non-terminal",
  PRIVATE_NON_TERMINAL: "private non-terminal",
  PREDICATE_CLAUSE: "predicate clause",
  NON_TERMINAL_RULE: "non-terminal rule"
} as const;

/**
 * Utility functions for symbol detection and processing
 */
export class SymbolUtils {
  /**
   * Extract predicate name from a predicate clause
   * @param clause The predicate clause string (e.g., "foo(X, Y)")
   * @returns The predicate name (e.g., "foo") or null if not found
   */
  static extractPredicateName(clause: string): string | null {
    const match = clause.match(/(\w+)\s*\([^)]*\)/);
    return match ? match[1] : null;
  }

  /**
   * Extract non-terminal name from a non-terminal rule
   * @param rule The non-terminal rule string (e.g., "phrase(X)")
   * @returns The non-terminal name (e.g., "phrase") or null if not found
   */
  static extractNonTerminalName(rule: string): string | null {
    const match = rule.match(/(\w+)\s*\(/);
    return match ? match[1] : null;
  }

  /**
   * Find the position of the end entity directive for a given entity
   * @param doc The text document
   * @param startLine The line number where the entity starts
   * @param endRegex The regex to match the end directive
   * @returns The line number where the entity ends
   */
  static findEndEntityDirectivePosition(doc: TextDocument, startLine: number, endRegex: RegExp): number {
    let j = startLine + 1;
    let endEntity = false;
    while (!endEntity && j < doc.lineCount) {
      const line = doc.lineAt(j);
      if (line.text.match(endRegex)) {
        endEntity = true;
      } else {
        j++;
      }
    }
    return j;
  }

  /**
   * Check if a line indicates continuation of a multi-line term
   * @param lineText The text of the line to check
   * @returns True if the line continues a multi-line term
   */
  static isContinuationLine(lineText: string): boolean {
    return SymbolRegexes.continuation.test(lineText);
  }

  /**
   * Match a line against multiple regex patterns and return the first match
   * @param lineText The text to match against
   * @param patterns Array of regex patterns to try
   * @returns Object with the matched regex and result, or null if no match
   */
  static matchFirst(lineText: string, patterns: { regex: RegExp; type: string }[]): { type: string; match: RegExpMatchArray } | null {
    for (const pattern of patterns) {
      const match = lineText.match(pattern.regex);
      if (match) {
        return { type: pattern.type, match };
      }
    }
    return null;
  }
}

/**
 * Predefined pattern sets for common matching scenarios
 */
export const PatternSets = {
  /**
   * Entity opening patterns
   */
  entityOpening: [
    { regex: SymbolRegexes.object, type: SymbolTypes.OBJECT },
    { regex: SymbolRegexes.protocol, type: SymbolTypes.PROTOCOL },
    { regex: SymbolRegexes.category, type: SymbolTypes.CATEGORY }
  ],

  /**
   * Entity ending patterns
   */
  entityEnding: [
    { regex: SymbolRegexes.endObject, type: SymbolTypes.OBJECT },
    { regex: SymbolRegexes.endProtocol, type: SymbolTypes.PROTOCOL },
    { regex: SymbolRegexes.endCategory, type: SymbolTypes.CATEGORY }
  ],

  /**
   * Predicate scope directive patterns
   */
  predicateScopes: [
    { regex: SymbolRegexes.publicPredicate, type: SymbolTypes.PUBLIC_PREDICATE },
    { regex: SymbolRegexes.protectedPredicate, type: SymbolTypes.PROTECTED_PREDICATE },
    { regex: SymbolRegexes.privatePredicate, type: SymbolTypes.PRIVATE_PREDICATE }
  ],

  /**
   * Non-terminal scope directive patterns
   */
  nonTerminalScopes: [
    { regex: SymbolRegexes.publicNonTerminal, type: SymbolTypes.PUBLIC_NON_TERMINAL },
    { regex: SymbolRegexes.protectedNonTerminal, type: SymbolTypes.PROTECTED_NON_TERMINAL },
    { regex: SymbolRegexes.privateNonTerminal, type: SymbolTypes.PRIVATE_NON_TERMINAL }
  ],

  /**
   * All scope directive patterns (predicates and non-terminals)
   */
  allScopes: [
    { regex: SymbolRegexes.publicPredicate, type: SymbolTypes.PUBLIC_PREDICATE },
    { regex: SymbolRegexes.protectedPredicate, type: SymbolTypes.PROTECTED_PREDICATE },
    { regex: SymbolRegexes.privatePredicate, type: SymbolTypes.PRIVATE_PREDICATE },
    { regex: SymbolRegexes.publicNonTerminal, type: SymbolTypes.PUBLIC_NON_TERMINAL },
    { regex: SymbolRegexes.protectedNonTerminal, type: SymbolTypes.PROTECTED_NON_TERMINAL },
    { regex: SymbolRegexes.privateNonTerminal, type: SymbolTypes.PRIVATE_NON_TERMINAL }
  ]
};
