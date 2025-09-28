"use strict";

import { TextDocument } from "vscode";

/**
 * Regular expressions for matching Logtalk symbols
 */
export const SymbolRegexes = {
  // Entity opening directives + entity identifier
  object: /^(?:\:- object\()([^(),.]+(\(.*\))?)/,
  protocol: /^(?:\:- protocol\()([^(),.]+(\(.*\))?)/,
  category: /^(?:\:- category\()([^(),.]+(\(.*\))?)/,

  // Entity opening directives
  openingObject: /^(?:\:- object\()/,
  openingProtocol: /^(?:\:- protocol\()/,
  openingCategory: /^(?:\:- category\()/,

  // Entity ending directives
  endObject: /^(?:\:- end_object\.)/,
  endProtocol: /^(?:\:- end_protocol\.)/,
  endCategory: /^(?:\:- end_category\.)/,

  // Predicate scope directives (single predicate/non-terminal)
  publicPredicate: /(?:\s*\:- public\()(\w+[/]\d+)/,
  protectedPredicate: /(?:\s*\:- protected\()(\w+[/]\d+)/,
  privatePredicate: /(?:\s*\:- private\()(\w+[/]\d+)/,

  // Non-terminal scope directives (single non-terminal)
  publicNonTerminal: /(?:\s*\:- public\()(\w+[/][/]\d+)/,
  protectedNonTerminal: /(?:\s*\:- protected\()(\w+[/][/]\d+)/,
  privateNonTerminal: /(?:\s*\:- private\()(\w+[/][/]\d+)/,

  // Scope directive openings (for multi-line and multi-predicate parsing)
  // These patterns match scope directives that are NOT single predicate/non-terminal indicators
  publicScopeOpening: /^\s*\:- public\((?!\w+\/\/?\/?\d+\)\s*\.\s*$)/,
  protectedScopeOpening: /^\s*\:- protected\((?!\w+\/\/?\/?\d+\)\s*\.\s*$)/,
  privateScopeOpening: /^\s*\:- private\((?!\w+\/\/?\/?\d+\)\s*\.\s*$)/,

  // Predicate directive patterns
  mode: /^\s*\:- mode\(/,
  predicateInfo: /^\s*\:- info\((?!\[)/,
  metaPredicate: /^\s*\:- meta_predicate\(/,
  metaNonTerminal: /^\s*\:- meta_non_terminal\(/,
  dynamic: /^\s*\:- dynamic\(/,
  discontiguous: /^\s*\:- discontiguous\(/,
  multifile: /^\s*\:- multifile\(/,
  synchronized: /^\s*\:- synchronized\(/,
  coinductive: /^\s*\:- coinductive\(/,

  // Entity directive patterns
  entityInfo: /^\s*\:- info\(\[/,

  // General directive pattern (starts with :-)
  directive: /^\s*\:-/,

  // Predicate clause (rule head or fact) - simplified to match name and detect parentheses
  predicateClause: /^\s*([a-z][a-zA-Z0-9_]*|'[^']*')\s*(?:\(|\s*(?::-|\.))/,

  // Non-terminal rule using the --> operator - simplified to match name and detect parentheses
  nonTerminalRule: /^\s*([a-z][a-zA-Z0-9_]*|'[^']*')\s*(?:\(|\s*-->)/,

  // Line ending with comma or semicolon (continuation)
  continuation: /^\s*.*[,;]\s*(?:%.*)?$/,

  // Predicate and non-terminal indicators
  predicateIndicator: /(\w+)\/(\d+)/g,
  nonTerminalIndicator: /(\w+)\/\/(\d+)/g,

  // Directive termination (ends with period)
  directiveEnd: /\)\s*\.\s*(?:%.*)?$/
};

/**
 * Symbol types for consistent categorization
 */
export const SymbolTypes = {
  OBJECT: "object",
  PROTOCOL: "protocol", 
  CATEGORY: "category",
  PUBLIC_PREDICATE: "public",
  PROTECTED_PREDICATE: "protected",
  PRIVATE_PREDICATE: "private",
  PUBLIC_NON_TERMINAL: "public",
  PROTECTED_NON_TERMINAL: "protected",
  PRIVATE_NON_TERMINAL: "private",
  PREDICATE_CLAUSE: "definition",
  NON_TERMINAL_RULE: "definition"
} as const;

/**
 * Utility functions for symbol detection and processing
 */
export class SymbolUtils {
  /**
   * Find the matching closing bracket for an opening bracket, handling nested structures
   * @param text The text to search in
   * @param startPos The position of the opening bracket
   * @returns The position of the matching closing bracket, or -1 if not found
   */
  private static findMatchingBracket(text: string, startPos: number): number {
    const openChar = text[startPos];
    let closeChar: string;

    switch (openChar) {
      case '(':
        closeChar = ')';
        break;
      case '[':
        closeChar = ']';
        break;
      case '{':
        closeChar = '}';
        break;
      default:
        return -1;
    }

    let depth = 1;
    let inQuotes = false;
    let quoteChar = '';

    for (let i = startPos + 1; i < text.length; i++) {
      const char = text[i];

      // Handle quotes
      if (!inQuotes && (char === '"' || char === "'")) {
        // Check if this is a character code notation (zero followed by single quote)
        if (char === "'" && i > 0 && text[i - 1] === '0') {
          // This is character code notation like 0'0, 0'\n, etc.
          // Don't treat as quoted string, just continue
          continue;
        } else {
          // This is a regular quoted string
          inQuotes = true;
          quoteChar = char;
        }
      } else if (inQuotes && char === quoteChar) {
        // Check if it's escaped
        if (i === 0 || text[i - 1] !== '\\') {
          inQuotes = false;
          quoteChar = '';
        }
      }

      if (!inQuotes) {
        if (char === openChar) {
          depth++;
        } else if (char === closeChar) {
          depth--;
          if (depth === 0) {
            return i;
          }
        }
      }
    }

    return -1; // No matching bracket found
  }



  /**
   * Count the number of arguments in an argument string, handling nested structures
   * @param argsString The argument string (content between parentheses)
   * @returns The number of arguments
   */
  private static countArguments(argsString: string): number {
    if (argsString.trim() === '') {
      return 0;
    }

    let count = 1; // At least one argument if string is not empty
    let depth = 0;
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      // Handle quotes
      if (!inQuotes && (char === '"' || char === "'")) {
        // Check if this is a character code notation (zero followed by single quote)
        if (char === "'" && i > 0 && argsString[i - 1] === '0') {
          // This is character code notation like 0'0, 0'\n, etc.
          // Don't treat as quoted string, just continue
          continue;
        } else {
          // This is a regular quoted string
          inQuotes = true;
          quoteChar = char;
        }
      } else if (inQuotes && char === quoteChar) {
        // Check if it's escaped
        if (i === 0 || argsString[i - 1] !== '\\') {
          inQuotes = false;
          quoteChar = '';
        }
      }

      if (!inQuotes) {
        // Track nesting depth
        if (char === '(' || char === '[' || char === '{') {
          depth++;
        } else if (char === ')' || char === ']' || char === '}') {
          depth--;
        } else if (char === ',' && depth === 0) {
          // Top-level comma - indicates another argument
          count++;
        }
      }
    }

    return count;
  }
  /**
   * Extract predicate name from a predicate clause
   * @param clause The predicate clause string (e.g., "foo(X, Y)" or "foo")
   * @returns The predicate name (e.g., "foo") or null if not found
   */
  static extractPredicateName(clause: string): string | null {
    // Handle predicates with arguments: foo(X, Y)
    const parenPos = clause.indexOf('(');
    if (parenPos !== -1) {
      const name = clause.substring(0, parenPos);
      // Validate the name
      if (/^([a-z][a-zA-Z0-9_]*|'[^']*')$/.test(name)) {
        return name;
      }
      return null;
    }

    // Handle predicates with zero arguments: foo
    const matchZeroArgs = clause.match(/^([a-z][a-zA-Z0-9_]*|'[^']*')$/);
    return matchZeroArgs ? matchZeroArgs[1] : null;
  }

  /**
   * Extract predicate indicator from a predicate clause
   * @param clause The predicate clause string (e.g., "foo(X, Y)" or "foo")
   * @returns The predicate indicator (e.g., "foo/2" or "foo/0") or null if not found
   */
  static extractPredicateIndicator(clause: string): string | null {
    const parenPos = clause.indexOf('(');
    if (parenPos !== -1) {
      const name = clause.substring(0, parenPos);
      // Validate the name
      if (!/^([a-z][a-zA-Z0-9_]*|'[^']*')$/.test(name)) {
        return null;
      }

      // Find matching closing parenthesis
      const closingParen = this.findMatchingBracket(clause, parenPos);
      if (closingParen === -1) {
        return null;
      }

      const argsString = clause.substring(parenPos + 1, closingParen).trim();
      const arity = argsString === '' ? 0 : this.countArguments(argsString);
      return `${name}/${arity}`;
    }

    // Handle predicates with zero arguments: foo
    const matchZeroArgs = clause.match(/^([a-z][a-zA-Z0-9_]*|'[^']*')$/);
    if (matchZeroArgs) {
      return `${matchZeroArgs[1]}/0`;
    }

    return null;
  }

  /**
   * Extract non-terminal name from a non-terminal rule
   * @param rule The non-terminal rule string (e.g., "phrase(X)" or "phrase")
   * @returns The non-terminal name (e.g., "phrase") or null if not found
   */
  static extractNonTerminalName(rule: string): string | null {
    // Handle non-terminals with arguments: phrase(X)
    const parenPos = rule.indexOf('(');
    if (parenPos !== -1) {
      const name = rule.substring(0, parenPos);
      // Validate the name
      if (/^([a-z][a-zA-Z0-9_]*|'[^']*')$/.test(name)) {
        return name;
      }
      return null;
    }

    // Handle non-terminals with zero arguments: phrase
    const matchZeroArgs = rule.match(/^([a-z][a-zA-Z0-9_]*|'[^']*')$/);
    return matchZeroArgs ? matchZeroArgs[1] : null;
  }

  /**
   * Extract non-terminal indicator from a non-terminal rule
   * @param rule The non-terminal rule string (e.g., "phrase(X)" or "phrase")
   * @returns The non-terminal indicator (e.g., "phrase//2" or "phrase//0") or null if not found
   */
  static extractNonTerminalIndicator(rule: string): string | null {
    const parenPos = rule.indexOf('(');
    if (parenPos !== -1) {
      const name = rule.substring(0, parenPos);
      // Validate the name
      if (!/^([a-z][a-zA-Z0-9_]*|'[^']*')$/.test(name)) {
        return null;
      }

      // Find matching closing parenthesis
      const closingParen = this.findMatchingBracket(rule, parenPos);
      if (closingParen === -1) {
        return null;
      }

      const argsString = rule.substring(parenPos + 1, closingParen).trim();
      const arity = argsString === '' ? 0 : this.countArguments(argsString);
      return `${name}//${arity}`;
    }

    // Handle non-terminals with zero arguments: phrase
    const matchZeroArgs = rule.match(/^([a-z][a-zA-Z0-9_]*|'[^']*')$/);
    if (matchZeroArgs) {
      return `${matchZeroArgs[1]}//0`;
    }

    return null;
  }

  /**
   * Extract complete predicate head from a line of text
   * @param lineText The complete line text
   * @returns The complete predicate head or null if not found
   */
  static extractCompletePredicateHead(lineText: string): string | null {
    const match = lineText.match(SymbolRegexes.predicateClause);
    if (!match) {
      return null;
    }

    const name = match[1];
    const nameStart = match.index! + lineText.substring(match.index!).indexOf(name);
    const nameEnd = nameStart + name.length;

    // Check if there's a parenthesis after the name
    const afterName = lineText.substring(nameEnd).trim();
    if (afterName.startsWith('(')) {
      const parenPos = nameEnd + lineText.substring(nameEnd).indexOf('(');
      const closingParen = this.findMatchingBracket(lineText, parenPos);
      if (closingParen !== -1) {
        return lineText.substring(nameStart, closingParen + 1);
      }
    }

    // No parentheses, just return the name
    return name;
  }

  /**
   * Extract complete non-terminal head from a line of text
   * @param lineText The complete line text
   * @returns The complete non-terminal head or null if not found
   */
  static extractCompleteNonTerminalHead(lineText: string): string | null {
    const match = lineText.match(SymbolRegexes.nonTerminalRule);
    if (!match) {
      return null;
    }

    const name = match[1];
    const nameStart = match.index! + lineText.substring(match.index!).indexOf(name);
    const nameEnd = nameStart + name.length;

    // Check if there's a parenthesis after the name
    const afterName = lineText.substring(nameEnd).trim();
    if (afterName.startsWith('(')) {
      const parenPos = nameEnd + lineText.substring(nameEnd).indexOf('(');
      const closingParen = this.findMatchingBracket(lineText, parenPos);
      if (closingParen !== -1) {
        return lineText.substring(nameStart, closingParen + 1);
      }
    }

    // No parentheses, just return the name
    return name;
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

  /**
   * Check if a line starts a scope directive (public, protected, private)
   * @param lineText The text of the line to check
   * @returns Object with scope type and match, or null if not a scope directive opening
   */
  static matchScopeDirectiveOpening(lineText: string): { type: string; match: RegExpMatchArray } | null {
    const scopePatterns = [
      { regex: SymbolRegexes.publicScopeOpening, type: SymbolTypes.PUBLIC_PREDICATE },
      { regex: SymbolRegexes.protectedScopeOpening, type: SymbolTypes.PROTECTED_PREDICATE },
      { regex: SymbolRegexes.privateScopeOpening, type: SymbolTypes.PRIVATE_PREDICATE }
    ];

    return SymbolUtils.matchFirst(lineText, scopePatterns);
  }

  /**
   * Collect the complete text of a multi-line scope directive
   * @param doc The text document
   * @param startLine The line number where the directive starts
   * @returns Object with the complete directive text and the ending line number
   */
  static collectScopeDirectiveText(doc: TextDocument, startLine: number): { text: string; endLine: number } {
    let directiveText = '';
    let currentLine = startLine;
    let foundEnd = false;

    while (currentLine < doc.lineCount && !foundEnd) {
      const line = doc.lineAt(currentLine);
      const lineText = line.text;
      directiveText += lineText;

      // Check if this line ends the directive
      if (SymbolRegexes.directiveEnd.test(lineText)) {
        foundEnd = true;
      } else {
        directiveText += ' '; // Add space to join lines
        currentLine++;
      }
    }

    return { text: directiveText, endLine: currentLine };
  }

  /**
   * Extract predicate and non-terminal indicators from scope directive text
   * @param directiveText The complete text of the scope directive
   * @returns Array of objects containing indicator text and type (predicate or non-terminal)
   */
  static extractIndicatorsFromScopeDirective(directiveText: string): { indicator: string; isNonTerminal: boolean }[] {
    const indicators: { indicator: string; isNonTerminal: boolean }[] = [];

    // Remove the directive prefix and closing parts
    const cleanText = directiveText
      .replace(/^\s*:-\s*(public|protected|private)\s*\(\s*/, '')
      .replace(/\s*\)\s*\.\s*$/, '')
      .trim();

    // Handle list syntax: [pred1/1, pred2/2, ...]
    if (cleanText.startsWith('[') && cleanText.endsWith(']')) {
      const listContent = cleanText.slice(1, -1);
      const items = this.splitPredicateList(listContent);

      for (const item of items) {
        const trimmed = item.trim();
        if (trimmed) {
          indicators.push({
            indicator: trimmed,
            isNonTerminal: trimmed.includes('//')
          });
        }
      }
    }
    // Handle conjunction syntax: (pred1/1, pred2/2, ...)
    else if (cleanText.startsWith('(') && cleanText.endsWith(')')) {
      const conjunctionContent = cleanText.slice(1, -1);
      const items = this.splitPredicateList(conjunctionContent);

      for (const item of items) {
        const trimmed = item.trim();
        if (trimmed) {
          indicators.push({
            indicator: trimmed,
            isNonTerminal: trimmed.includes('//')
          });
        }
      }
    }
    // Handle single predicate/non-terminal
    else {
      const trimmed = cleanText.trim();
      if (trimmed) {
        indicators.push({
          indicator: trimmed,
          isNonTerminal: trimmed.includes('//')
        });
      }
    }

    return indicators;
  }

  /**
   * Split a comma-separated list of predicate indicators, handling nested parentheses
   * @param text The text containing comma-separated predicate indicators
   * @returns Array of individual predicate indicator strings
   */
  private static splitPredicateList(text: string): string[] {
    const items: string[] = [];
    let current = '';
    let parenDepth = 0;
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Handle line comments - ignore everything after % (unless inside quotes)
      if (!inQuotes && char === '%') {
        // Find the end of the current line and skip to next line or end
        let j = i;
        while (j < text.length && text[j] !== '\n' && text[j] !== '\r') {
          j++;
        }
        // Skip past the newline character(s)
        if (j < text.length && text[j] === '\r' && j + 1 < text.length && text[j + 1] === '\n') {
          j += 2; // Skip \r\n
        } else if (j < text.length && (text[j] === '\n' || text[j] === '\r')) {
          j += 1; // Skip \n or \r
        }
        i = j - 1; // -1 because the loop will increment i
        continue;
      }

      if (!inQuotes && (char === '"' || char === "'")) {
        // Check if this is a character code notation (zero followed by single quote)
        if (char === "'" && i > 0 && text[i - 1] === '0') {
          // This is character code notation like 0'0, 0'\n, etc.
          // Don't treat as quoted string, just add to current
          current += char;
        } else {
          // This is a regular quoted string
          inQuotes = true;
          quoteChar = char;
          current += char;
        }
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
        current += char;
      } else if (!inQuotes && char === '(') {
        parenDepth++;
        current += char;
      } else if (!inQuotes && char === ')') {
        parenDepth--;
        current += char;
      } else if (!inQuotes && char === ',' && parenDepth === 0) {
        items.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      items.push(current.trim());
    }

    return items;
  }
}

/**
 * Predefined pattern sets for common matching scenarios
 */
export const PatternSets = {
  /**
   * Entity opening patterns
   */
  entityOpeningWithId: [
    { regex: SymbolRegexes.object, type: SymbolTypes.OBJECT },
    { regex: SymbolRegexes.protocol, type: SymbolTypes.PROTOCOL },
    { regex: SymbolRegexes.category, type: SymbolTypes.CATEGORY }
  ],

  /**
   * Entity opening patterns
   */
  entityOpening: [
    { regex: SymbolRegexes.openingObject, type: SymbolTypes.OBJECT },
    { regex: SymbolRegexes.openingProtocol, type: SymbolTypes.PROTOCOL },
    { regex: SymbolRegexes.openingCategory, type: SymbolTypes.CATEGORY }
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
   * Predicate directive patterns (non-scope)
   */
  predicateDirectives: [
    { regex: SymbolRegexes.mode, type: 'mode' },
    { regex: SymbolRegexes.predicateInfo, type: 'predicate_info' },
    { regex: SymbolRegexes.metaPredicate, type: 'meta_predicate' },
    { regex: SymbolRegexes.metaNonTerminal, type: 'meta_non_terminal' },
    { regex: SymbolRegexes.dynamic, type: 'dynamic' },
    { regex: SymbolRegexes.discontiguous, type: 'discontiguous' },
    { regex: SymbolRegexes.multifile, type: 'multifile' },
    { regex: SymbolRegexes.synchronized, type: 'synchronized' },
    { regex: SymbolRegexes.coinductive, type: 'coinductive' }
  ],

  /**
   * Entity directive patterns (non-opening/closing)
   */
  entityDirectives: [
    { regex: SymbolRegexes.entityInfo, type: 'entity_info' }
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
  ],

  /**
   * Scope directive opening patterns (for multi-line parsing)
   */
  scopeOpenings: [
    { regex: SymbolRegexes.publicScopeOpening, type: SymbolTypes.PUBLIC_PREDICATE },
    { regex: SymbolRegexes.protectedScopeOpening, type: SymbolTypes.PROTECTED_PREDICATE },
    { regex: SymbolRegexes.privateScopeOpening, type: SymbolTypes.PRIVATE_PREDICATE }
  ]
};
