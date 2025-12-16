"use strict";

import {
  CancellationToken,
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  CompletionItemProvider,
  CompletionList,
  MarkdownString,
  Position,
  ProviderResult,
  TextDocument
} from "vscode";
import { getLogger } from "../utils/logger";

/**
 * List of all Logtalk library names
 */
const LOGTALK_LIBRARIES = [
  'arbitrary',
  'asdf',
  'assertions',
  'assignvars',
  'base64',
  'basic_types',
  'cbor',
  'ccsds',
  'code_metrics',
  'coroutining',
  'csv',
  'dates',
  'dead_code_scanner',
  'debugger',
  'debug_messages',
  'dependents',
  'diagrams',
  'dictionaries',
  'dif',
  'doclet',
  'edcg',
  'events',
  'expand_library_alias_paths',
  'expecteds',
  'format',
  'genint',
  'gensym',
  'git',
  'grammars',
  'heaps',
  'help',
  'hierarchies',
  'hook_flows',
  'hook_objects',
  'html',
  'ids',
  'intervals',
  'issue_creator',
  'java',
  'json',
  'json_lines',
  'lgtdoc',
  'lgtunit',
  'linter',
  'listing',
  'logging',
  'loops',
  'make',
  'meta',
  'meta_compiler',
  'mutations',
  'nested_dictionaries',
  'optionals',
  'options',
  'os',
  'packs',
  'ports_profiler',
  'profiler',
  'queues',
  'random',
  'reader',
  'recorded_database',
  'redis',
  'sets',
  'statistics',
  'term_io',
  'timeout',
  'toon',
  'tsv',
  'tutor',
  'types',
  'ulid',
  'unicode_data',
  'union_find',
  'uuid',
  'wrapper',
  'zippers'
];

/**
 * Valid first argument values for logtalk_load_context/2
 */
const LOGTALK_LOAD_CONTEXT_KEYS = [
  'entity_identifier',
  'entity_prefix',
  'entity_type',
  'entity_relation',
  'source',
  'file',
  'basename',
  'directory',
  'stream',
  'target',
  'flags',
  'term',
  'term_position',
  'variables',
  'variable_names',
  'variable_names(Term)',
  'singletons',
  'singletons(Term)',
  'parameter_variables'
];

/**
 * Convert a snake_case string to CamelCase with uppercase first letter
 * Handles special cases like 'variable_names(Term)' -> 'VariableNames'
 * @param key The snake_case key
 * @returns The CamelCase variable name
 */
function keyToVariableName(key: string): string {
  // Remove any (Term) suffix for variable name generation
  const baseKey = key.replace(/\(Term\)$/, '');

  // Split by underscore and capitalize each part
  return baseKey
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * CompletionItemProvider for logtalk_load/1-2 goals
 * Provides library name completions when typing "logtalk_load("
 */
export class LogtalkLoadCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();

  /**
   * Provide completion items for logtalk_load/1-2 goals
   * @param document The document in which the command was invoked
   * @param position The position at which the command was invoked
   * @param token A cancellation token
   * @param context How the completion was triggered
   * @returns An array of completion items or null
   */
  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    this.logger.debug(`LogtalkLoad completion triggered at position ${position.line}:${position.character}`);

    // Handle both trigger character and regular typing
    if (context.triggerCharacter === '(') {
      return this.handleOpenParen(document, position);
    }

    // Also check if we're typing inside logtalk_load(...)
    return this.handleTypingInsideParens(document, position);
  }

  /**
   * Handle completion when "(" is typed after logtalk_load
   * Provides library name completions
   * @param document The document
   * @param position The position where "(" was typed
   * @returns An array of completion items or null
   */
  private handleOpenParen(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;

      // Get text before the open paren
      const textBeforeParen = lineText.substring(0, position.character);

      this.logger.debug(`Text before paren: "${textBeforeParen}"`);

      // Check if we're in a logtalk_load context
      // Match patterns like: logtalk_load( or some_call, logtalk_load(
      const logtalkLoadMatch = textBeforeParen.match(/logtalk_load\($/);

      if (!logtalkLoadMatch) {
        this.logger.debug('Not in a logtalk_load context');
        return null;
      }

      // Check if there's already a closing paren after the cursor (from auto-close)
      const charAfterCursor = lineText.substring(position.character, position.character + 1);
      const closingParenHandling = charAfterCursor === ')' ? 'skip' : 'add';
      this.logger.debug(`Char after cursor: "${charAfterCursor}", closingParenHandling: ${closingParenHandling}`);

      return this.createLibraryCompletionItems('', closingParenHandling);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleOpenParen: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Handle completion when typing inside logtalk_load(...)
   * This handles the case when using snippets where the paren is already there
   * @param document The document
   * @param position The current cursor position
   * @returns An array of completion items or null
   */
  private handleTypingInsideParens(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const textBeforeCursor = lineText.substring(0, position.character);

      this.logger.debug(`Checking for logtalk_load context in: "${textBeforeCursor}"`);

      // Match logtalk_load( followed by optional partial text (the library name being typed)
      // This handles: "logtalk_load(lg" or "logtalk_load(Key" (from snippet)
      const match = textBeforeCursor.match(/logtalk_load\(([a-zA-Z_][a-zA-Z0-9_]*)?$/);

      if (!match) {
        return null;
      }

      const partialText = match[1] || '';
      this.logger.debug(`Inside logtalk_load, partial text: "${partialText}"`);

      // When typing inside parens, don't handle closing paren at all
      return this.createLibraryCompletionItems(partialText, 'none');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleTypingInsideParens: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Create completion items for libraries, optionally filtered by partial text
   * @param partialText The text typed so far (for filtering)
   * @param closingParenHandling How to handle the closing paren:
   *   - 'add': add closing paren (triggered by "(" with auto-close OFF)
   *   - 'skip': use cursorRight to skip existing paren (triggered by "(" with auto-close ON)
   *   - 'none': don't handle paren (typing inside parens from snippet)
   * @returns An array of completion items
   */
  private createLibraryCompletionItems(partialText: string, closingParenHandling: 'add' | 'skip' | 'none' = 'none'): CompletionItem[] {
    this.logger.debug('Providing library completions for logtalk_load');

    // Filter libraries if partial text is provided
    const filteredLibraries = partialText
      ? LOGTALK_LIBRARIES.filter(lib => lib.toLowerCase().startsWith(partialText.toLowerCase()))
      : LOGTALK_LIBRARIES;

    // Create completion items for each library
    const completionItems: CompletionItem[] = filteredLibraries.map((library, index) => {
      const item = new CompletionItem(`${library}(loader)`, CompletionItemKind.Module);
      item.detail = `Load ${library} library`;
      const documentation = new MarkdownString();
      documentation.appendCodeblock(`logtalk_load(${library}(loader))`, 'logtalk');
      item.documentation = documentation;

      switch (closingParenHandling) {
        case 'skip':
          // Closing paren already exists (from auto-close), just move cursor past it
          item.insertText = `${library}(loader)`;
          item.command = {
            command: 'cursorRight',
            title: 'Move cursor past closing paren'
          };
          break;
        case 'add':
          // No closing paren, add it
          item.insertText = `${library}(loader))`;
          break;
        case 'none':
        default:
          // Typing inside parens, don't handle closing paren
          item.insertText = `${library}(loader)`;
          break;
      }

      // Use padded index for sorting to maintain alphabetical order
      item.sortText = String(index).padStart(3, '0');
      return item;
    });

    this.logger.debug(`Suggesting ${completionItems.length} library completions`);

    return completionItems;
  }
}

/**
 * CompletionItemProvider for logtalk_load_context/2 goals
 * Provides first argument completions when typing "logtalk_load_context("
 */
export class LogtalkLoadContextCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();

  /**
   * Provide completion items for logtalk_load_context/2 goals
   * @param document The document in which the command was invoked
   * @param position The position at which the command was invoked
   * @param token A cancellation token
   * @param context How the completion was triggered
   * @returns An array of completion items or null
   */
  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    this.logger.debug(`LogtalkLoadContext completion triggered at position ${position.line}:${position.character}`);

    // Handle both trigger character and regular typing
    if (context.triggerCharacter === '(') {
      return this.handleOpenParen(document, position);
    }

    // Also check if we're typing inside logtalk_load_context(...)
    return this.handleTypingInsideParens(document, position);
  }

  /**
   * Handle completion when "(" is typed after logtalk_load_context
   * Provides first argument completions with generated second argument
   * @param document The document
   * @param position The position where "(" was typed
   * @returns An array of completion items or null
   */
  private handleOpenParen(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;

      // Get text before the open paren
      const textBeforeParen = lineText.substring(0, position.character);

      this.logger.debug(`Text before paren: "${textBeforeParen}"`);

      // Check if we're in a logtalk_load_context context
      const logtalkLoadContextMatch = textBeforeParen.match(/logtalk_load_context\($/);

      if (!logtalkLoadContextMatch) {
        this.logger.debug('Not in a logtalk_load_context context');
        return null;
      }

      // Check if there's already a closing paren after the cursor (from auto-close)
      const charAfterCursor = lineText.substring(position.character, position.character + 1);
      const closingParenHandling = charAfterCursor === ')' ? 'skip' : 'add';
      this.logger.debug(`Char after cursor: "${charAfterCursor}", closingParenHandling: ${closingParenHandling}`);

      // When triggered by "(", include both key and second argument
      return this.createKeyCompletionItems('', true, closingParenHandling);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleOpenParen: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Handle completion when typing inside logtalk_load_context(...)
   * This handles the case when using snippets where the paren is already there
   * Only inserts the key (not the second argument) since snippet already has the second argument placeholder
   * @param document The document
   * @param position The current cursor position
   * @returns An array of completion items or null
   */
  private handleTypingInsideParens(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const textBeforeCursor = lineText.substring(0, position.character);

      this.logger.debug(`Checking for logtalk_load_context context in: "${textBeforeCursor}"`);

      // Match logtalk_load_context( followed by optional partial text (the key being typed)
      // This handles: "logtalk_load_context(ent" or "logtalk_load_context(Key" (from snippet)
      const match = textBeforeCursor.match(/logtalk_load_context\(([a-zA-Z_][a-zA-Z0-9_]*)?$/);

      if (!match) {
        return null;
      }

      const partialText = match[1] || '';
      this.logger.debug(`Inside logtalk_load_context, partial text: "${partialText}"`);

      // When typing inside parens, only insert the key (not the second argument)
      // because the snippet already has the second argument placeholder
      return this.createKeyCompletionItems(partialText, false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleTypingInsideParens: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Create completion items for context keys, optionally filtered by partial text
   * @param partialText The text typed so far (for filtering)
   * @param includeSecondArg Whether to include the second argument
   * @param closingParenHandling How to handle the closing paren:
   *   - 'add': add closing paren (triggered by "(" with auto-close OFF)
   *   - 'skip': use cursorRight to skip existing paren (triggered by "(" with auto-close ON)
   *   - 'none': don't handle paren (typing inside parens from snippet)
   * @returns An array of completion items
   */
  private createKeyCompletionItems(partialText: string, includeSecondArg: boolean = true, closingParenHandling: 'add' | 'skip' | 'none' = 'none'): CompletionItem[] {
    this.logger.debug('Providing key completions for logtalk_load_context');

    // Filter keys if partial text is provided
    const filteredKeys = partialText
      ? LOGTALK_LOAD_CONTEXT_KEYS.filter(key => key.toLowerCase().startsWith(partialText.toLowerCase()))
      : LOGTALK_LOAD_CONTEXT_KEYS;

    // Create completion items for each key
    const completionItems: CompletionItem[] = filteredKeys.map((key, index) => {
      const variableName = keyToVariableName(key);

      const item = new CompletionItem(key, CompletionItemKind.EnumMember);
      item.detail = `logtalk_load_context(${key}, ${variableName})`;
      const documentation = new MarkdownString();
      documentation.appendCodeblock(`logtalk_load_context(${key}, ${variableName})`, 'logtalk');
      item.documentation = documentation;

      // When triggered by "(", include second argument
      // When typing inside parens, just insert the key
      if (includeSecondArg) {
        switch (closingParenHandling) {
          case 'skip':
            // Closing paren already exists (from auto-close), just move cursor past it
            item.insertText = `${key}, ${variableName}`;
            item.command = {
              command: 'cursorRight',
              title: 'Move cursor past closing paren'
            };
            break;
          case 'add':
            // No closing paren, add it
            item.insertText = `${key}, ${variableName})`;
            break;
          case 'none':
          default:
            // Typing inside parens, don't handle closing paren
            item.insertText = `${key}, ${variableName}`;
            break;
        }
      } else {
        item.insertText = key;
      }
      // Use padded index for sorting to maintain order
      item.sortText = String(index).padStart(3, '0');
      return item;
    });

    this.logger.debug(`Suggesting ${completionItems.length} key completions`);

    return completionItems;
  }
}

/**
 * CompletionItemProvider for Logtalk list patterns
 * Provides automatic tail variable suggestions when typing "|" in list patterns
 */
export class LogtalkListCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();

  /**
   * Provide completion items for the given position and document
   * @param document The document in which the command was invoked
   * @param position The position at which the command was invoked
   * @param token A cancellation token
   * @param context How the completion was triggered
   * @returns An array of completion items or null
   */
  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    this.logger.debug(`Completion triggered at position ${position.line}:${position.character}`);

    // Only trigger when "|" was just typed
    if (context.triggerCharacter === '|') {
      return this.handlePipeCharacter(document, position);
    }

    return null;
  }

  /**
   * Handle completion when "|" is typed in a list pattern
   * Suggests a tail variable name based on the head variable
   * @param document The document
   * @param position The position where "|" was typed
   * @returns An array of completion items or null
   */
  private handlePipeCharacter(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;

      // Get text before the pipe character
      const textBeforePipe = lineText.substring(0, position.character);

      this.logger.debug(`Text before pipe: "${textBeforePipe}"`);

      // Find the variable before the pipe
      // Look for pattern like [Variable| or [_Variable| or [Variable | (with optional spaces)
      // Match variables starting with uppercase letter OR underscore followed by uppercase letter
      const variableMatch = textBeforePipe.match(/\[([A-Z_][A-Za-z0-9_]*)\s*\|$/);

      if (!variableMatch) {
        this.logger.debug('No valid variable pattern found before pipe');
        return null;
      }

      const headVariable = variableMatch[1];
      this.logger.debug(`Found head variable: "${headVariable}"`);

      // Collect completion items
      const completionItems: CompletionItem[] = [];

      // Handle special case: Head -> Tail
      if (headVariable === 'Head') {
        const completionItem = new CompletionItem(` Tail`, CompletionItemKind.Variable);
        completionItem.detail = 'List tail variable';
        completionItem.documentation = `Suggested tail variable for list pattern [${headVariable}|...]`;
        completionItem.insertText = ` Tail`;
        completionItems.push(completionItem);
      }
      // Handle variables starting with underscore (but not just "_")
      else if (headVariable.startsWith('_') && headVariable.length > 1) {
        // Get the variable name without the leading underscore
        const withoutUnderscore = headVariable.substring(1);

        // Offer pluralized version with underscore
        const pluralizedWithUnderscore = '_' + this.pluralize(withoutUnderscore);
        const item1 = new CompletionItem(` ${pluralizedWithUnderscore}`, CompletionItemKind.Variable);
        item1.detail = 'List tail variable (with underscore)';
        item1.documentation = `Suggested tail variable for list pattern [${headVariable}|...]`;
        item1.insertText = ` ${pluralizedWithUnderscore}`;
        item1.sortText = '1'; // Show this first
        completionItems.push(item1);

        // Offer pluralized version without underscore
        const pluralizedWithoutUnderscore = this.pluralize(withoutUnderscore);
        const item2 = new CompletionItem(` ${pluralizedWithoutUnderscore}`, CompletionItemKind.Variable);
        item2.detail = 'List tail variable (without underscore)';
        item2.documentation = `Alternative tail variable for list pattern [${headVariable}|...]`;
        item2.insertText = ` ${pluralizedWithoutUnderscore}`;
        item2.sortText = '2'; // Show this second
        completionItems.push(item2);
      }
      // Handle regular variables (starting with uppercase letter)
      else {
        const tailVariable = this.pluralize(headVariable);
        const completionItem = new CompletionItem(` ${tailVariable}`, CompletionItemKind.Variable);
        completionItem.detail = 'List tail variable';
        completionItem.documentation = `Suggested tail variable for list pattern [${headVariable}|...]`;
        completionItem.insertText = ` ${tailVariable}`;
        completionItems.push(completionItem);
      }

      this.logger.debug(`Suggesting ${completionItems.length} tail variable(s): ${completionItems.map(item => item.label).join(', ')}`);

      return completionItems;
    } catch (error: any) {
      this.logger.error(`Error in handlePipeCharacter: ${error.message}`);
      return null;
    }
  }

  /**
   * Pluralize a variable name using simple English pluralization rules
   * @param singular The singular form of the variable name
   * @returns The plural form of the variable name
   */
  private pluralize(singular: string): string {
    // Handle common special cases
    const specialCases: { [key: string]: string } = {
      'Child': 'Children',
      'Person': 'Persons',
      'Man': 'Men',
      'Woman': 'Women',
      'Tooth': 'Teeth',
      'Foot': 'Feet',
      'Mouse': 'Mice',
      'Goose': 'Geese',
      'Ox': 'Oxen',
      'Datum': 'Data',
      'Index': 'Indices',
      'Matrix': 'Matrices',
      'Vertex': 'Vertices',
      'Axis': 'Axes',
      'Analysis': 'Analyses',
      'Basis': 'Bases',
      'Crisis': 'Crises',
      'Diagnosis': 'Diagnoses',
      'Hypothesis': 'Hypotheses',
      'Oasis': 'Oases',
      'Parenthesis': 'Parentheses',
      'Synthesis': 'Syntheses',
      'Thesis': 'Theses'
    };

    if (specialCases[singular]) {
      return specialCases[singular];
    }

    // Apply standard pluralization rules
    
    // Words ending in 'y' preceded by a consonant: change 'y' to 'ies'
    if (/[^aeiou]y$/i.test(singular)) {
      return singular.slice(0, -1) + 'ies';
    }

    // Words ending in 's', 'ss', 'sh', 'ch', 'x', 'z': add 'es'
    if (/(?:s|ss|sh|ch|x|z)$/i.test(singular)) {
      return singular + 'es';
    }

    // Words ending in 'f' or 'fe': change to 'ves'
    if (/f$/i.test(singular)) {
      return singular.slice(0, -1) + 'ves';
    }
    if (/fe$/i.test(singular)) {
      return singular.slice(0, -2) + 'ves';
    }

    // Words ending in 'o' preceded by a consonant: add 'es'
    // (but there are many exceptions, so we'll just add 's' for simplicity)
    if (/[^aeiou]o$/i.test(singular)) {
      // Common exceptions that just add 's': photo, piano, halo
      const oExceptions = ['Photo', 'Piano', 'Halo', 'Solo', 'Memo', 'Logo'];
      if (oExceptions.includes(singular)) {
        return singular + 's';
      }
      return singular + 'es';
    }

    // Default: just add 's'
    return singular + 's';
  }
}

