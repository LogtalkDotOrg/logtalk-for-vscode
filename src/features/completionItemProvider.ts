"use strict";

import {
  CancellationToken,
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  CompletionItemProvider,
  CompletionList,
  CompletionTriggerKind,
  MarkdownString,
  Position,
  ProviderResult,
  Range,
  SnippetString,
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
 * Logtalk flag definitions with their possible values
 * Read-only flags can only be used with current_logtalk_flag/2
 * Writable flags can be used with both current_logtalk_flag/2 and set_logtalk_flag/2
 */
interface LogtalkFlag {
  name: string;
  values: string[];  // Empty array means flag takes arbitrary values (e.g., atoms, lists)
  readOnly: boolean;
  description: string;
}

const LOGTALK_FLAGS: LogtalkFlag[] = [
  // Read-only flags
  { name: 'settings_file', values: ['allow', 'restrict', 'deny'], readOnly: true, description: 'Allows or disables loading of a settings file at startup' },
  { name: 'prolog_dialect', values: ['b', 'ciao', 'cx', 'eclipse', 'gnu', 'ji', 'quintus', 'sicstus', 'swi', 'tau', 'trealla', 'xsb', 'xvm', 'yap'], readOnly: true, description: 'Identifier of the backend Prolog compiler' },
  { name: 'prolog_version', values: [], readOnly: true, description: 'Version of the backend Prolog compiler' },
  { name: 'prolog_compatible_version', values: [], readOnly: true, description: 'Compatible version of the backend Prolog compiler' },
  { name: 'unicode', values: ['unsupported', 'full', 'bmp'], readOnly: true, description: 'Unicode support level of the backend Prolog compiler' },
  { name: 'encoding_directive', values: ['unsupported', 'full', 'source'], readOnly: true, description: 'Support for the encoding/1 directive' },
  { name: 'tabling', values: ['unsupported', 'supported'], readOnly: true, description: 'Tabling programming support' },
  { name: 'engines', values: ['unsupported', 'supported'], readOnly: true, description: 'Threaded engines support' },
  { name: 'threads', values: ['unsupported', 'supported'], readOnly: true, description: 'Multi-threading support' },
  { name: 'modules', values: ['unsupported', 'supported'], readOnly: true, description: 'Module system support' },
  { name: 'coinduction', values: ['unsupported', 'supported'], readOnly: true, description: 'Coinductive predicates support' },
  { name: 'version_data', values: [], readOnly: true, description: 'Logtalk version data compound term' },
  // Lint flags
  { name: 'linter', values: ['on', 'off', 'default'], readOnly: false, description: 'Meta-flag for managing all linter flags' },
  { name: 'unknown_entities', values: ['warning', 'silent'], readOnly: false, description: 'Unknown entity warnings' },
  { name: 'unknown_predicates', values: ['error', 'warning', 'silent'], readOnly: false, description: 'Unknown predicate/message warnings' },
  { name: 'undefined_predicates', values: ['error', 'warning', 'silent'], readOnly: false, description: 'Undefined predicate warnings' },
  { name: 'steadfastness', values: ['warning', 'silent'], readOnly: false, description: 'Non-steadfast predicate definition warnings' },
  { name: 'portability', values: ['warning', 'silent'], readOnly: false, description: 'Non-ISO Prolog predicate/function warnings' },
  { name: 'deprecated', values: ['warning', 'silent'], readOnly: false, description: 'Deprecated predicate warnings' },
  { name: 'missing_directives', values: ['warning', 'silent'], readOnly: false, description: 'Missing predicate directive warnings' },
  { name: 'duplicated_directives', values: ['warning', 'silent'], readOnly: false, description: 'Duplicated predicate directive warnings' },
  { name: 'trivial_goal_fails', values: ['warning', 'silent'], readOnly: false, description: 'Trivial goal fails warnings' },
  { name: 'always_true_or_false_goals', values: ['warning', 'silent'], readOnly: false, description: 'Always true/false goal warnings' },
  { name: 'grammar_rules', values: ['warning', 'silent'], readOnly: false, description: 'Grammar rules related warnings' },
  { name: 'arithmetic_expressions', values: ['warning', 'silent'], readOnly: false, description: 'Arithmetic expression warnings' },
  { name: 'lambda_variables', values: ['warning', 'silent'], readOnly: false, description: 'Lambda variable warnings' },
  { name: 'suspicious_calls', values: ['warning', 'silent'], readOnly: false, description: 'Suspicious call warnings' },
  { name: 'redefined_built_ins', values: ['warning', 'silent'], readOnly: false, description: 'Redefined built-in predicate warnings' },
  { name: 'redefined_operators', values: ['warning', 'silent'], readOnly: false, description: 'Redefined operator warnings' },
  { name: 'singleton_variables', values: ['warning', 'silent'], readOnly: false, description: 'Singleton variable warnings' },
  { name: 'naming', values: ['warning', 'silent'], readOnly: false, description: 'Entity/predicate/variable naming warnings' },
  { name: 'duplicated_clauses', values: ['warning', 'silent'], readOnly: false, description: 'Duplicated clause warnings' },
  { name: 'disjunctions', values: ['warning', 'silent'], readOnly: false, description: 'Clause body disjunction warnings' },
  { name: 'conditionals', values: ['warning', 'silent'], readOnly: false, description: 'If-then-else and soft-cut warnings' },
  { name: 'catchall_catch', values: ['warning', 'silent'], readOnly: false, description: 'Catchall catch/3 goal warnings' },
  { name: 'left_recursion', values: ['warning', 'silent'], readOnly: false, description: 'Left-recursion warnings' },
  { name: 'tail_recursive', values: ['warning', 'silent'], readOnly: false, description: 'Non-tail recursive definition warnings' },
  { name: 'encodings', values: ['warning', 'silent'], readOnly: false, description: 'Source file text encoding warnings' },
  { name: 'general', values: ['warning', 'silent'], readOnly: false, description: 'General warnings not controlled by specific flags' },
  // Optional features compilation flags
  { name: 'complements', values: ['allow', 'restrict', 'deny'], readOnly: false, description: 'Complementing categories support' },
  { name: 'dynamic_declarations', values: ['allow', 'deny'], readOnly: false, description: 'Dynamic predicate declaration support' },
  { name: 'events', values: ['allow', 'deny'], readOnly: false, description: 'Event-driven programming support' },
  { name: 'context_switching_calls', values: ['allow', 'deny'], readOnly: false, description: 'Context-switching calls support' },
  // Backend Prolog compiler and loader flags
  { name: 'underscore_variables', values: ['dont_care', 'singletons'], readOnly: false, description: 'Underscore variable interpretation' },
  { name: 'prolog_compiler', values: [], readOnly: false, description: 'Compiler flags for generated Prolog files' },
  { name: 'prolog_loader', values: [], readOnly: false, description: 'Loader flags for generated Prolog files' },
  // Other flags
  { name: 'scratch_directory', values: [], readOnly: false, description: 'Directory for temporary compiler files' },
  { name: 'report', values: ['on', 'warnings', 'off'], readOnly: false, description: 'Message printing control' },
  { name: 'code_prefix', values: [], readOnly: false, description: 'Prefix for generated Prolog code functors' },
  { name: 'optimize', values: ['on', 'off'], readOnly: false, description: 'Compiler optimizations' },
  { name: 'source_data', values: ['on', 'off'], readOnly: false, description: 'Source file information retention' },
  { name: 'debug', values: ['on', 'off'], readOnly: false, description: 'Debug mode compilation' },
  { name: 'reload', values: ['skip', 'changed', 'always'], readOnly: false, description: 'Source file reloading behavior' },
  { name: 'relative_to', values: [], readOnly: false, description: 'Base directory for relative paths' },
  { name: 'hook', values: [], readOnly: false, description: 'Hook object for term/goal expansion' },
  { name: 'clean', values: ['on', 'off'], readOnly: false, description: 'Intermediate Prolog file cleanup' }
];

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

    // Handle trigger character '('
    if (context.triggerCharacter === '(') {
      return this.handleOpenParen(document, position);
    }

    // If triggered by any trigger character, don't also handle as typing inside
    // (avoids duplicates from dual registration)
    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    // Handle typing inside logtalk_load(...)
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
      // If no partial text, let handleOpenParen handle it (avoids duplicates)
      if (partialText === '') {
        return null;
      }
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
 * Possible targets for logtalk_make/1
 */
const LOGTALK_MAKE_TARGETS = [
  { name: 'all', description: 'Reload all modified source files' },
  { name: 'caches', description: 'Delete dynamic binding caches' },
  { name: 'clean', description: 'Delete intermediate files' },
  { name: 'check', description: 'Check for missing predicates and other issues' },
  { name: 'circular', description: 'Check for circular dependencies' },
  { name: 'documentation', description: 'Generate documentation' },
  { name: 'debug', description: 'Recompile in debug mode' },
  { name: 'normal', description: 'Recompile in normal mode' },
  { name: 'optimal', description: 'Recompile in optimal mode' }
];

/**
 * Configuration for single-argument predicate completion providers
 */
interface SingleArgCompletionConfig {
  predicateName: string;
  createCompletionItems: (partialText: string, closingParenHandling: 'add' | 'skip' | 'none') => CompletionItem[];
}

/**
 * Helper function to handle open paren for single-argument predicates
 */
function handleSingleArgOpenParen(
  document: TextDocument,
  position: Position,
  config: SingleArgCompletionConfig,
  logger: { error: (msg: string) => void }
): CompletionItem[] | null {
  try {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const textBeforeParen = lineText.substring(0, position.character);

    const pattern = new RegExp(`${config.predicateName}\\($`);
    if (!pattern.test(textBeforeParen)) {
      return null;
    }

    const charAfterCursor = lineText.substring(position.character, position.character + 1);
    const closingParenHandling = charAfterCursor === ')' ? 'skip' : 'add';

    return config.createCompletionItems('', closingParenHandling);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in handleOpenParen: ${errorMessage}`);
    return null;
  }
}

/**
 * Helper function to handle typing inside parens for single-argument predicates
 */
function handleSingleArgTypingInside(
  document: TextDocument,
  position: Position,
  config: SingleArgCompletionConfig,
  logger: { error: (msg: string) => void }
): CompletionItem[] | null {
  try {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const textBeforeCursor = lineText.substring(0, position.character);

    const pattern = new RegExp(`${config.predicateName}\\(([a-z_]*)$`);
    const match = textBeforeCursor.match(pattern);
    if (!match) {
      return null;
    }

    const partialText = match[1] || '';
    if (partialText === '') {
      return null;
    }

    return config.createCompletionItems(partialText, 'none');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in handleTypingInside: ${errorMessage}`);
    return null;
  }
}

/**
 * CompletionItemProvider for logtalk_make/1 goals
 * Provides target completions when typing "logtalk_make("
 */
export class LogtalkMakeCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();
  private config: SingleArgCompletionConfig = {
    predicateName: 'logtalk_make',
    createCompletionItems: (partialText, closingParenHandling) => this.createTargetCompletionItems(partialText, closingParenHandling)
  };

  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    if (context.triggerCharacter === '(') {
      return handleSingleArgOpenParen(document, position, this.config, this.logger);
    }

    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    return handleSingleArgTypingInside(document, position, this.config, this.logger);
  }

  private createTargetCompletionItems(partialText: string, closingParenHandling: 'add' | 'skip' | 'none'): CompletionItem[] {
    const filteredTargets = partialText
      ? LOGTALK_MAKE_TARGETS.filter(t => t.name.startsWith(partialText.toLowerCase()))
      : LOGTALK_MAKE_TARGETS;

    return filteredTargets.map((target, index) => {
      const item = new CompletionItem(target.name, CompletionItemKind.EnumMember);
      item.detail = target.description;
      const documentation = new MarkdownString();
      documentation.appendCodeblock(`logtalk_make(${target.name})`, 'logtalk');
      item.documentation = documentation;

      switch (closingParenHandling) {
        case 'skip':
          item.insertText = target.name;
          item.command = { command: 'cursorRight', title: 'Move cursor past closing paren' };
          break;
        case 'add':
          item.insertText = `${target.name})`;
          break;
        case 'none':
        default:
          item.insertText = target.name;
          break;
      }

      item.sortText = String(index).padStart(3, '0');
      return item;
    });
  }
}

/**
 * CompletionItemProvider for logtalk_make_target_action/1 goals
 * Provides target completions when typing "logtalk_make_target_action("
 */
export class LogtalkMakeTargetActionCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();
  private config: SingleArgCompletionConfig = {
    predicateName: 'logtalk_make_target_action',
    createCompletionItems: (partialText, closingParenHandling) => this.createTargetCompletionItems(partialText, closingParenHandling)
  };

  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    if (context.triggerCharacter === '(') {
      return handleSingleArgOpenParen(document, position, this.config, this.logger);
    }

    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    return handleSingleArgTypingInside(document, position, this.config, this.logger);
  }

  private createTargetCompletionItems(partialText: string, closingParenHandling: 'add' | 'skip' | 'none'): CompletionItem[] {
    const filteredTargets = partialText
      ? LOGTALK_MAKE_TARGETS.filter(t => t.name.startsWith(partialText.toLowerCase()))
      : LOGTALK_MAKE_TARGETS;

    return filteredTargets.map((target, index) => {
      const item = new CompletionItem(target.name, CompletionItemKind.EnumMember);
      item.detail = target.description;
      const documentation = new MarkdownString();
      documentation.appendCodeblock(`logtalk_make_target_action(${target.name})`, 'logtalk');
      item.documentation = documentation;

      switch (closingParenHandling) {
        case 'skip':
          item.insertText = target.name;
          item.command = { command: 'cursorRight', title: 'Move cursor past closing paren' };
          break;
        case 'add':
          item.insertText = `${target.name})`;
          break;
        case 'none':
        default:
          item.insertText = target.name;
          break;
      }

      item.sortText = String(index).padStart(3, '0');
      return item;
    });
  }
}

/**
 * Possible message kinds for print_message/3 and related predicates
 */
const PRINT_MESSAGE_KINDS = [
  { name: 'banner', description: 'Banner messages (startup, version info)' },
  { name: 'comment', description: 'Comment messages (informational)' },
  { name: 'comment(Topic)', description: 'Comment messages for a specific topic', insertText: 'comment(${1:Topic})', isSnippet: true },
  { name: 'debug', description: 'Debug messages (only shown when debugging)' },
  { name: 'debug(Topic)', description: 'Debug messages for a specific topic', insertText: 'debug(${1:Topic})', isSnippet: true },
  { name: 'error', description: 'Error messages' },
  { name: 'silent', description: 'Silent messages (not printed by default)' },
  { name: 'silent(Topic)', description: 'Silent messages for a specific topic', insertText: 'silent(${1:Topic})', isSnippet: true },
  { name: 'warning', description: 'Warning messages' },
  { name: 'warning(Topic)', description: 'Warning messages for a specific topic', insertText: 'warning(${1:Topic})', isSnippet: true }
];

/**
 * Helper functions for message kind completion providers
 */
function handleMessageKindOpenParen(
  document: TextDocument,
  position: Position,
  predicateName: string,
  docTemplate: string,
  logger: { error: (msg: string) => void }
): CompletionItem[] | null {
  try {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const textBeforeParen = lineText.substring(0, position.character);

    const pattern = new RegExp(`${predicateName}\\($`);
    if (!pattern.test(textBeforeParen)) {
      return null;
    }

    return createMessageKindCompletionItems('', docTemplate);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in handleOpenParen: ${errorMessage}`);
    return null;
  }
}

function handleMessageKindTypingInsideParens(
  document: TextDocument,
  position: Position,
  predicateName: string,
  docTemplate: string,
  logger: { error: (msg: string) => void }
): CompletionItem[] | null {
  try {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const textBeforeCursor = lineText.substring(0, position.character);

    const pattern = new RegExp(`${predicateName}\\(([a-z_()]*)$`);
    const match = textBeforeCursor.match(pattern);
    if (!match) {
      return null;
    }

    const partialText = match[1] || '';
    // If no partial text, let handleOpenParen handle it (avoids duplicates)
    if (partialText === '') {
      return null;
    }
    return createMessageKindCompletionItems(partialText, docTemplate);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in handleTypingInsideParens: ${errorMessage}`);
    return null;
  }
}

function createMessageKindCompletionItems(partialText: string, docTemplate: string): CompletionItem[] {
  const filteredKinds = partialText
    ? PRINT_MESSAGE_KINDS.filter(k => k.name.toLowerCase().startsWith(partialText.toLowerCase()))
    : PRINT_MESSAGE_KINDS;

  return filteredKinds.map((kind, index) => {
    const item = new CompletionItem(kind.name, CompletionItemKind.EnumMember);
    item.detail = kind.description;
    const documentation = new MarkdownString();
    const displayName = kind.isSnippet ? kind.name.replace('${1:Topic}', 'Topic') : kind.name;
    documentation.appendCodeblock(docTemplate.replace('KIND', displayName), 'logtalk');
    item.documentation = documentation;

    if (kind.isSnippet && kind.insertText) {
      item.insertText = new SnippetString(kind.insertText);
    } else {
      item.insertText = kind.name;
    }

    item.sortText = String(index).padStart(3, '0');
    return item;
  });
}

/**
 * CompletionItemProvider for print_message/3 goals
 * Provides message kind completions when typing "print_message("
 */
export class PrintMessageCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();
  private static readonly PREDICATE_NAME = 'print_message';
  private static readonly DOC_TEMPLATE = 'print_message(KIND, Component, Message)';

  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    this.logger.debug(`PrintMessage completion triggered at position ${position.line}:${position.character}`);

    if (context.triggerCharacter === '(') {
      return handleMessageKindOpenParen(document, position, PrintMessageCompletionProvider.PREDICATE_NAME, PrintMessageCompletionProvider.DOC_TEMPLATE, this.logger);
    }

    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    return handleMessageKindTypingInsideParens(document, position, PrintMessageCompletionProvider.PREDICATE_NAME, PrintMessageCompletionProvider.DOC_TEMPLATE, this.logger);
  }
}

/**
 * CompletionItemProvider for message_prefix_stream/4 goals
 * Provides message kind completions when typing "message_prefix_stream("
 */
export class MessagePrefixStreamCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();
  private static readonly PREDICATE_NAME = 'message_prefix_stream';
  private static readonly DOC_TEMPLATE = 'message_prefix_stream(KIND, Component, Prefix, Stream)';

  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    this.logger.debug(`MessagePrefixStream completion triggered at position ${position.line}:${position.character}`);

    if (context.triggerCharacter === '(') {
      return handleMessageKindOpenParen(document, position, MessagePrefixStreamCompletionProvider.PREDICATE_NAME, MessagePrefixStreamCompletionProvider.DOC_TEMPLATE, this.logger);
    }

    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    return handleMessageKindTypingInsideParens(document, position, MessagePrefixStreamCompletionProvider.PREDICATE_NAME, MessagePrefixStreamCompletionProvider.DOC_TEMPLATE, this.logger);
  }
}

/**
 * CompletionItemProvider for question_prompt_stream/4 goals
 * Provides message kind completions when typing "question_prompt_stream("
 */
export class QuestionPromptStreamCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();
  private static readonly PREDICATE_NAME = 'question_prompt_stream';
  private static readonly DOC_TEMPLATE = 'question_prompt_stream(KIND, Component, Prompt, Stream)';

  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    this.logger.debug(`QuestionPromptStream completion triggered at position ${position.line}:${position.character}`);

    if (context.triggerCharacter === '(') {
      return handleMessageKindOpenParen(document, position, QuestionPromptStreamCompletionProvider.PREDICATE_NAME, QuestionPromptStreamCompletionProvider.DOC_TEMPLATE, this.logger);
    }

    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    return handleMessageKindTypingInsideParens(document, position, QuestionPromptStreamCompletionProvider.PREDICATE_NAME, QuestionPromptStreamCompletionProvider.DOC_TEMPLATE, this.logger);
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

    // Handle trigger character '('
    if (context.triggerCharacter === '(') {
      return this.handleOpenParen(document, position);
    }

    // If triggered by any trigger character, don't also handle as typing inside
    // (avoids duplicates from dual registration)
    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    // Handle typing inside logtalk_load_context(...)
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
      // If no partial text, let handleOpenParen handle it (avoids duplicates)
      if (partialText === '') {
        return null;
      }
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
 * Configuration for flag completion providers
 */
interface FlagCompletionConfig {
  predicateName: string;
  includeReadOnly: boolean;
  flagInsertTemplate: (flag: LogtalkFlag, closingParenHandling: 'add' | 'skip' | 'none') => { insertText: string; command?: { command: string; title: string } };
  flagDocumentation: (flag: LogtalkFlag) => MarkdownString;
}

/**
 * Helper functions for flag completion providers
 */
function handleFlagOpenParen(
  document: TextDocument,
  position: Position,
  config: FlagCompletionConfig,
  logger: { error: (msg: string) => void }
): CompletionItem[] | null {
  try {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const textBeforeParen = lineText.substring(0, position.character);

    const pattern = new RegExp(`${config.predicateName}\\($`);
    if (!pattern.test(textBeforeParen)) {
      return null;
    }

    const charAfterCursor = lineText.substring(position.character, position.character + 1);
    const closingParenHandling = charAfterCursor === ')' ? 'skip' : 'add';

    return createFlagCompletionItems('', closingParenHandling, config);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in handleOpenParen: ${errorMessage}`);
    return null;
  }
}

function handleFlagComma(
  document: TextDocument,
  position: Position,
  config: FlagCompletionConfig,
  logger: { error: (msg: string) => void }
): CompletionItem[] | null {
  try {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const textBeforeComma = lineText.substring(0, position.character);

    const pattern = new RegExp(`${config.predicateName}\\(([a-z_]+),$`);
    const match = textBeforeComma.match(pattern);
    if (!match) {
      return null;
    }

    const flagName = match[1];
    const charAfterCursor = lineText.substring(position.character, position.character + 1);
    const closingParenHandling: 'add' | 'skip' | 'none' = charAfterCursor === ')' ? 'skip' : 'add';

    return createFlagValueCompletionItems(flagName, '', closingParenHandling, true, config.predicateName);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in handleComma: ${errorMessage}`);
    return null;
  }
}

function handleFlagTypingInside(
  document: TextDocument,
  position: Position,
  config: FlagCompletionConfig,
  logger: { error: (msg: string) => void }
): CompletionItem[] | null {
  try {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const textBeforeCursor = lineText.substring(0, position.character);

    // Check if typing first argument (flag name)
    const flagPattern = new RegExp(`${config.predicateName}\\(([a-z_]*)$`);
    const flagMatch = textBeforeCursor.match(flagPattern);
    if (flagMatch) {
      const partialText = flagMatch[1] || '';
      if (partialText === '') {
        return null;
      }
      return createFlagCompletionItems(partialText, 'none', config);
    }

    // Check if typing second argument (value)
    const valuePattern = new RegExp(`${config.predicateName}\\(([a-z_]+),\\s*([a-z_]*)$`);
    const valueMatch = textBeforeCursor.match(valuePattern);
    if (valueMatch) {
      const flagName = valueMatch[1];
      const partialValue = valueMatch[2] || '';
      if (partialValue === '' && textBeforeCursor.match(/,\s*$/)) {
        return null;
      }
      return createFlagValueCompletionItems(flagName, partialValue, 'none', false, config.predicateName);
    }

    return null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in handleTypingInside: ${errorMessage}`);
    return null;
  }
}

function createFlagCompletionItems(
  partialText: string,
  closingParenHandling: 'add' | 'skip' | 'none',
  config: FlagCompletionConfig
): CompletionItem[] {
  const availableFlags = config.includeReadOnly ? LOGTALK_FLAGS : LOGTALK_FLAGS.filter(f => !f.readOnly);
  const filteredFlags = partialText
    ? availableFlags.filter(f => f.name.startsWith(partialText.toLowerCase()))
    : availableFlags;

  return filteredFlags.map((flag, index) => {
    const item = new CompletionItem(flag.name, CompletionItemKind.EnumMember);
    item.detail = flag.description;
    item.documentation = config.flagDocumentation(flag);

    const insertConfig = config.flagInsertTemplate(flag, closingParenHandling);
    item.insertText = insertConfig.insertText;
    if (insertConfig.command) {
      item.command = insertConfig.command;
    }

    item.sortText = String(index).padStart(3, '0');
    return item;
  });
}

function createFlagValueCompletionItems(
  flagName: string,
  partialValue: string,
  closingParenHandling: 'add' | 'skip' | 'none',
  addLeadingSpace: boolean,
  predicateName: string
): CompletionItem[] {
  const flag = LOGTALK_FLAGS.find(f => f.name === flagName);
  if (!flag || flag.values.length === 0) {
    return [];
  }

  const filteredValues = partialValue
    ? flag.values.filter(v => v.startsWith(partialValue.toLowerCase()))
    : flag.values;

  return filteredValues.map((value, index) => {
    const item = new CompletionItem(value, CompletionItemKind.Value);
    item.detail = `Value for ${flagName}`;
    const documentation = new MarkdownString();
    documentation.appendCodeblock(`${predicateName}(${flagName}, ${value})`, 'logtalk');
    item.documentation = documentation;

    const prefix = addLeadingSpace ? ' ' : '';

    switch (closingParenHandling) {
      case 'skip':
        item.insertText = `${prefix}${value}`;
        item.command = { command: 'cursorRight', title: 'Move cursor past closing paren' };
        break;
      case 'add':
        item.insertText = `${prefix}${value})`;
        break;
      case 'none':
      default:
        item.insertText = value;
        break;
    }

    item.sortText = String(index).padStart(3, '0');
    return item;
  });
}

/**
 * CompletionItemProvider for current_logtalk_flag/2 goals
 * Provides flag name completions for the first argument (all flags)
 * and value completions for the second argument
 */
export class CurrentLogtalkFlagCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();
  private static readonly CONFIG: FlagCompletionConfig = {
    predicateName: 'current_logtalk_flag',
    includeReadOnly: true,
    flagInsertTemplate: (flag, closingParenHandling) => {
      const variableName = keyToVariableName(flag.name);
      switch (closingParenHandling) {
        case 'skip':
          return { insertText: `${flag.name}, ${variableName}`, command: { command: 'cursorRight', title: 'Move cursor past closing paren' } };
        case 'add':
          return { insertText: `${flag.name}, ${variableName})` };
        default:
          return { insertText: flag.name };
      }
    },
    flagDocumentation: (flag) => {
      const variableName = keyToVariableName(flag.name);
      const documentation = new MarkdownString();
      documentation.appendCodeblock(`current_logtalk_flag(${flag.name}, ${variableName})`, 'logtalk');
      if (flag.values.length > 0) {
        documentation.appendText(`\nPossible values: ${flag.values.join(', ')}`);
      }
      if (flag.readOnly) {
        documentation.appendText('\n(Read-only flag)');
      }
      return documentation;
    }
  };

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): CompletionItem[] | null {
    if (context.triggerCharacter === '(') {
      return handleFlagOpenParen(document, position, CurrentLogtalkFlagCompletionProvider.CONFIG, this.logger);
    }

    if (context.triggerCharacter === ',') {
      return handleFlagComma(document, position, CurrentLogtalkFlagCompletionProvider.CONFIG, this.logger);
    }

    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    return handleFlagTypingInside(document, position, CurrentLogtalkFlagCompletionProvider.CONFIG, this.logger);
  }
}

/**
 * CompletionItemProvider for set_logtalk_flag/2 goals
 * Provides flag name completions for the first argument (writable flags only)
 * and value completions for the second argument
 */
export class SetLogtalkFlagCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();
  private static readonly CONFIG: FlagCompletionConfig = {
    predicateName: 'set_logtalk_flag',
    includeReadOnly: false,
    flagInsertTemplate: (flag, closingParenHandling) => {
      switch (closingParenHandling) {
        case 'skip':
        case 'add':
          return { insertText: `${flag.name}, ` };
        default:
          return { insertText: flag.name };
      }
    },
    flagDocumentation: (flag) => {
      const documentation = new MarkdownString();
      if (flag.values.length > 0) {
        documentation.appendText(`Possible values: ${flag.values.join(', ')}`);
      } else {
        documentation.appendText('Takes an arbitrary value');
      }
      return documentation;
    }
  };

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): CompletionItem[] | null {
    if (context.triggerCharacter === '(') {
      return handleFlagOpenParen(document, position, SetLogtalkFlagCompletionProvider.CONFIG, this.logger);
    }

    if (context.triggerCharacter === ',') {
      return handleFlagComma(document, position, SetLogtalkFlagCompletionProvider.CONFIG, this.logger);
    }

    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    return handleFlagTypingInside(document, position, SetLogtalkFlagCompletionProvider.CONFIG, this.logger);
  }
}

/**
 * Error terms for throw/1 predicate
 */
const THROW_ERROR_TERMS = [
  { name: 'instantiation_error', snippet: 'instantiation_error', description: 'An argument is not sufficiently instantiated' },
  { name: 'uninstantiation_error(Culprit)', snippet: 'uninstantiation_error(${1:Culprit})', description: 'An argument should be uninstantiated but is not' },
  { name: 'type_error(Type, Culprit)', snippet: 'type_error(${1:Type}, ${2:Culprit})', description: 'An argument has an incorrect type' },
  { name: 'domain_error(Domain, Culprit)', snippet: 'domain_error(${1:Domain}, ${2:Culprit})', description: 'An argument has a value outside the expected domain' },
  { name: 'consistency_error(Consistency, Argument1, Argument2)', snippet: 'consistency_error(${1:Consistency}, ${2:Argument1}, ${3:Argument2})', description: 'Two arguments are inconsistent' },
  { name: 'existence_error(Thing, Culprit)', snippet: 'existence_error(${1:Thing}, ${2:Culprit})', description: 'A referenced object does not exist' },
  { name: 'permission_error(Operation, PermissionType, Culprit)', snippet: 'permission_error(${1:Operation}, ${2:PermissionType}, ${3:Culprit})', description: 'An operation is not permitted' },
  { name: 'representation_error(Flag)', snippet: 'representation_error(${1:Flag})', description: 'A representation limit has been exceeded' },
  { name: 'evaluation_error(Error)', snippet: 'evaluation_error(${1:Error})', description: 'An arithmetic evaluation error occurred' },
  { name: 'resource_error(Resource)', snippet: 'resource_error(${1:Resource})', description: 'A resource limit has been exceeded' },
  { name: 'syntax_error(Description)', snippet: 'syntax_error(${1:Description})', description: 'A syntax error was encountered' },
  { name: 'system_error', snippet: 'system_error', description: 'A system-level error occurred' }
];

/**
 * CompletionItemProvider for throw/1 goals
 * Provides error term completions for the argument
 */
export class ThrowCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();
  private config: SingleArgCompletionConfig = {
    predicateName: 'throw',
    createCompletionItems: (partialText, closingParenHandling) => this.createErrorTermCompletionItems(partialText, closingParenHandling)
  };

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): CompletionItem[] | null {
    if (context.triggerCharacter === '(') {
      return handleSingleArgOpenParen(document, position, this.config, this.logger);
    }

    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    return handleSingleArgTypingInside(document, position, this.config, this.logger);
  }

  private createErrorTermCompletionItems(partialText: string, closingParenHandling: 'add' | 'skip' | 'none'): CompletionItem[] {
    const filteredTerms = partialText
      ? THROW_ERROR_TERMS.filter(t => t.name.toLowerCase().startsWith(partialText.toLowerCase()))
      : THROW_ERROR_TERMS;

    return filteredTerms.map((term, index) => {
      const item = new CompletionItem(term.name, CompletionItemKind.Value);
      item.detail = term.description;

      const documentation = new MarkdownString();
      documentation.appendCodeblock(`throw(${term.name})`, 'logtalk');
      item.documentation = documentation;

      let snippetText = term.snippet;
      if (closingParenHandling === 'add') {
        snippetText += ')';
      }

      item.insertText = new SnippetString(snippetText);

      if (closingParenHandling === 'skip') {
        item.command = { command: 'cursorRight', title: 'Move cursor past closing paren' };
      }

      item.sortText = String(index).padStart(3, '0');
      return item;
    });
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

/**
 * Snippet data structure
 */
interface SnippetData {
  body: string;
  description?: string | string[];
  prefix: string;
  scope?: string;
}

/**
 * Provider for Logtalk code snippets
 * Handles all snippets previously defined in logtalk.json
 */
export class LogtalkSnippetCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();
  private snippets: { [key: string]: SnippetData };

  constructor() {
    this.snippets = this.initializeSnippets();
  }

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    try {
      const lineText = document.lineAt(position.line).text;
      const textBeforeCursor = lineText.substring(0, position.character);
      
      // Check if we're in a context suitable for directive snippets
      const isDirectiveContext = /^\s*$/.test(textBeforeCursor) || /^\s*:-/.test(textBeforeCursor);
      
      const completionItems: CompletionItem[] = [];
      
      for (const [key, snippet] of Object.entries(this.snippets)) {
        // Directive snippets (prefix starts with ":-") should only be offered 
        // when there's only whitespace before the cursor or before ":-"
        if (snippet.prefix.startsWith(':-')) {
          if (!isDirectiveContext) {
            continue; // Skip directive snippets in non-directive contexts
          }
        } else {
          // Non-directive snippets should NOT be offered in directive contexts
          if (isDirectiveContext && /^\s*:-/.test(textBeforeCursor)) {
            continue; // Skip non-directive snippets when user has typed ":-"
          }
        }
        
        const item = new CompletionItem(snippet.prefix, CompletionItemKind.Snippet);
        item.insertText = new SnippetString(snippet.body);
        
        // For directive snippets, replace any ":-" text (and any following text) that the user has already typed
        if (snippet.prefix.startsWith(':-')) {
          const directiveMatch = textBeforeCursor.match(/:-.*$/);
          if (directiveMatch) {
            const matchStart = position.character - directiveMatch[0].length;
            item.range = {
              inserting: new Range(position.line, matchStart, position.line, position.character),
              replacing: new Range(position.line, matchStart, position.line, position.character)
            };
          }
        }
        
        // Handle description
        if (snippet.description) {
          if (Array.isArray(snippet.description)) {
            item.documentation = new MarkdownString(snippet.description.join('\n\n'));
            item.detail = key; // Use snippet name to avoid duplication
          } else {
            item.documentation = new MarkdownString(snippet.description);
            item.detail = snippet.description;
          }
        } else {
          item.detail = key;
        }
        
        completionItems.push(item);
      }
      
      return completionItems;
    } catch (error: any) {
      this.logger.error(`Error in LogtalkSnippetCompletionProvider: ${error.message}`);
      return [];
    }
  }

  private initializeSnippets(): { [key: string]: SnippetData } {
    return {
      'entity:category (implements)': {
        body: "\n:- category(${1:Category},\n\timplements(${2:Protocol})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${3:Author}',\n\t\tdate is ${4:$CURRENT_YEAR}-${5:$CURRENT_MONTH}-${6:$CURRENT_DATE},\n\t\tcomment is '${7:Description}'\n\t]).\n\n$0\n\n:- end_category.\n",
        description: "Category with protocol",
        prefix: "category",
        scope: "source.logtalk"
      },
      'entity:category (standalone)': {
        body: "\n:- category(${1:Category}).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${2:Author}',\n\t\tdate is ${3:$CURRENT_YEAR}-${4:$CURRENT_MONTH}-${5:$CURRENT_DATE},\n\t\tcomment is '${6:Description}'\n\t]).\n\n$0\n\n:- end_category.\n",
        description: "Category",
        prefix: "category",
        scope: "source.logtalk"
      },
      'entity:category (complements)': {
        body: "\n:- category(${1:Category},\n\tcomplements(${2:Object})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${3:Author}',\n\t\tdate is ${4:$CURRENT_YEAR}-${5:$CURRENT_MONTH}-${6:$CURRENT_DATE},\n\t\tcomment is '${7:Description}'\n\t]).\n\n$0\n\n:- end_category.\n",
        description: "Complementing category",
        prefix: "category",
        scope: "source.logtalk"
      },
      'entity:category (extends)': {
        body: "\n:- category(${1:ExtendedCategory},\n\textends(${2:MinimalCategory})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${3:Author}',\n\t\tdate is ${4:$CURRENT_YEAR}-${5:$CURRENT_MONTH}-${6:$CURRENT_DATE},\n\t\tcomment is '${7:Description}'\n\t]).\n\n$0\n\n:- end_category.\n",
        description: "Extended category",
        prefix: "category",
        scope: "source.logtalk"
      },
      'entity:class': {
        body: "\n:- object(${1:Class},\n\timplements(${2:Protocol}),\n\timports(${3:Category}),\n\tinstantiates(${4:Metaclass}),\n\tspecializes(${5:Superclass})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${6:Author}',\n\t\tdate is ${7:$CURRENT_YEAR}-${8:$CURRENT_MONTH}-${9:$CURRENT_DATE},\n\t\tcomment is '${10:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Class with all",
        prefix: "class",
        scope: "source.logtalk"
      },
      'entity:class1': {
        body: "\n:- object(${1:Class},\n\timports(${2:Category}),\n\tspecializes(${3:Superclass})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${4:Author}',\n\t\tdate is ${5:$CURRENT_YEAR}-${6:$CURRENT_MONTH}-${7:$CURRENT_DATE},\n\t\tcomment is '${8:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Class with category",
        prefix: "class",
        scope: "source.logtalk"
      },
      'entity:class2': {
        body: "\n:- object(${1:Class},\n\tinstantiates(${2:Metaclass}),\n\tspecializes(${3:Superclass})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${4:Author}',\n\t\tdate is ${5:$CURRENT_YEAR}-${6:$CURRENT_MONTH}-${7:$CURRENT_DATE},\n\t\tcomment is '${8:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Class with metaclass",
        prefix: "class",
        scope: "source.logtalk"
      },
      'entity:class3': {
        body: "\n:- object(${1:Class},\n\timplements(${2:Protocol}),\n\tspecializes(${3:Superclass})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${4:Author}',\n\t\tdate is ${5:$CURRENT_YEAR}-${6:$CURRENT_MONTH}-${7:$CURRENT_DATE},\n\t\tcomment is '${8:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Class with protocol",
        prefix: "class",
        scope: "source.logtalk"
      },
      'entity:class4': {
        body: "\n:- object(${1:Class},\n\tspecializes(${2:Superclass})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${3:Author}',\n\t\tdate is ${4:$CURRENT_YEAR}-${5:$CURRENT_MONTH}-${6:$CURRENT_DATE},\n\t\tcomment is '${7:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Class",
        prefix: "class",
        scope: "source.logtalk"
      },
      'entity:category': {
        body: ":- category(${1:name}).\n\t$2\n:- end_category.\n",
        prefix: ":- cat",
        scope: "source.logtalk"
      },
      'entity:catrelation': {
        body: "${1|implements,extends,complements|}($2)",
        description: "relations between categories",
        prefix: "crel"
      },
      'entity:object': {
        body: ":- object(${1:name}).\n\t$2\n:- end_object.\n",
        prefix: ":- obj",
        scope: "source.logtalk"
      },
      'entity:objrelation': {
        body: "${1|implements,imports,extends,instantiates,specializes|}($2)",
        description: "relations between objects",
        prefix: "orel"
      },
      'entity:prorelation': {
        body: "extends(${1})",
        description: "relations between categories",
        prefix: "ext"
      },
      'entity:protocol': {
        body: ":- protocol(${1:name}).\n\t$2\n:- end_protocol.\n",
        prefix: ":- pro",
        scope: "source.logtalk"
      },
      'directives:alias/2': {
        body: ":- alias(${1:Entity}, ${2:PredicateAliases}).\n",
        description: ["Declares predicate and non-terminal aliases. A predicate (non-terminal) alias is an alternative name for a predicate (non-terminal) declared or defined in an extended protocol, an implemented protocol, an extended category, an imported category, an extended prototype, an instantiated class, or a specialized class. Predicate aliases may be used to solve conflicts between imported or inherited predicates. It may also be used to give a predicate (non-terminal) a name more appropriated in its usage context. This directive may be used in objects, protocols, and categories.\n","Template and modes","alias(@entity_identifier, +list(predicate_indicator_alias))","alias(@entity_identifier, +list(non_terminal_indicator_alias))"],
        prefix: ":- alias",
        scope: "source.logtalk"
      },
      'directives:built_in/0': {
        body: ":- built_in.\n",
        description: ["Declares an entity as built-in. Built-in entities cannot be redefined once loaded.\n","Template and modes","built_in"],
        prefix: ":- built_in",
        scope: "source.logtalk"
      },
      'directives:coinductive/1': {
        body: ":- coinductive(${1:Name}/${2:Arity}).\n",
        description: ["This is an experimental directive, used for declaring coinductive predicates. Requires a back-end Prolog compiler with minimal support for cyclic terms. The current implementation of coinduction allows the generation of only the basic cycles but all valid solutions should be recognized. Use a predicate indicator as argument when all the coinductive predicate arguments are relevant for coinductive success. Use a template when only some coinductive predicate arguments (represented by a \"+\") should be considered when testing for coinductive success (represent the arguments that should be disregarded by a \"-\"). It's possible to define local coinductive_success_hook/2 or coinductive_success_hook/1 predicates that are automatically called with the coinductive predicate term resulting from a successful unification with an ancestor goal as first argument. The second argument, when present, is the coinductive hypothesis (i.e. the ancestor goal) used. These hook predicates can provide an alternative to the use of tabling when defining some coinductive predicates. There is no overhead when these hook predicates are not defined.\n","Template and modes","coinductive(+predicate_indicator_term)","coinductive(+coinductive_predicate_template_term)"],
        prefix: ":- coinductive",
        scope: "source.logtalk"
      },
      'directives:discontiguous/1': {
        body: ":- discontiguous(${1:Name}/${2:Arity}).\n",
        description: ["Declares discontiguous predicates and discontiguous non-terminals. The use of this directive should be avoided as not all backend Prolog compilers support discontiguous predicates.\n","Template and modes","discontiguous(+predicate_indicator_term)","discontiguous(+non_terminal_indicator_term)"],
        prefix: ":- discontiguous",
        scope: "source.logtalk"
      },
      'directives:dynamic/0': {
        body: ":- dynamic.\n",
        description: ["Declares an entity and its contents as dynamic. Dynamic entities can be abolished at runtime.\n","Template and modes","dynamic"],
        prefix: ":- dynamic",
        scope: "source.logtalk"
      },
      'directives:dynamic/1': {
        body: ":- dynamic(${1:Name}/${2:Arity}).\n",
        description: ["Declares dynamic predicates and dynamic non-terminals. Note that an object can be static and have both static and dynamic predicates/non-terminals. Dynamic predicates cannot be declared as synchronized. When the dynamic predicates are local to an object, declaring them also as private predicates allows the Logtalk compiler to generate optimized code for asserting and retracting predicate clauses. Categories can also contain dynamic predicate directives but cannot contain clauses for dynamic predicates.\n","Template and modes","dynamic(+qualified_predicate_indicator_term)","dynamic(+qualified_non_terminal_indicator_term)"],
        prefix: ":- dynamic",
        scope: "source.logtalk"
      },
      'directives:elif/1': {
        body: ":- elif(${1:Goal}).\n",
        description: ["Supports embedded conditionals when performing conditional compilation. The code following the directive is compiled if Goal is true. The goal is subjected to goal expansion when the directive occurs in a source file.\n","Template and modes","elif(@callable)"],
        prefix: ":- elif",
        scope: "source.logtalk"
      },
      'directives:else/0': {
        body: ":- else.\n",
        description: ["Starts an else branch when performing conditional compilation.\n","Template and modes","else"],
        prefix: ":- else",
        scope: "source.logtalk"
      },
      'directives:endif/0': {
        body: ":- endif.\n",
        description: ["Ends an if branch when performing conditional compilation.\n","Template and modes","endif"],
        prefix: ":- endif",
        scope: "source.logtalk"
      },
      'directives:encoding/1': {
        body: ":- encoding(${1:Encoding}).\n",
        description: ["Declares the source file text encoding. This is an experimental source file directive, which is only supported on some back-end Prolog compilers. When used, this directive must be the first term in the source file in the first line. Currently recognized encodings values include 'US-ASCII', 'ISO-8859-1', 'ISO-8859-2', 'ISO-8859-15', 'UCS-2', 'UCS-2LE', 'UCS-2BE', 'UTF-8', 'UTF-16', 'UTF-16LE', 'UTF-16BE', 'UTF-32', 'UTF-32LE', 'UTF-32BE', 'Shift_JIS', and 'EUC-JP'. Be sure to use an encoding supported by the chosen back-end Prolog compiler (whose adapter file must define a table that translates between the Logtalk and Prolog-specific atoms that represent each supported encoding). When writing portable code that cannot be expressed using ASCII, 'UTF-8' is usually the best choice.\n","Template and modes","encoding(+atom)"],
        prefix: ":- encoding",
        scope: "source.logtalk"
      },
      'directives:if/1': {
        body: ":- if(${1:Goal}).\n",
        description: ["Starts an if-then branch when performing conditional compilation. The code following the directive is compiled if Goal is true. The goal is subjected to goal expansion when the directive occurs in a source file.\n","Template and modes","if(@callable)"],
        prefix: ":- if",
        scope: "source.logtalk"
      },
      'directives:include/1': {
        body: ":- include(${1:File}).\n",
        description: ["Includes a file contents, which must be valid terms, at the place of occurrence of the directive. The file can be specified as a relative path, an absolute path, or using library notation and is expanded as a source file name. Relative paths are interpreted as relative to the path of the file contining the directive.\n","Template and modes","include(@source_file_name)"],
        prefix: ":- include",
        scope: "source.logtalk"
      },
      'directives:info/1': {
        body: ":- info(${1:List}).\n",
        description: ["Documentation directive for objects, protocols, and categories. The directive argument is a list of pairs using the format Key is Value. See the documenting Logtalk programs section for a description of the default keys.\n","Template and modes","info(+entity_info_list)"],
        prefix: ":- info",
        scope: "source.logtalk"
      },
      'directives:info/2': {
        body: ":- info(${1:Name}/${2:Arity}, ${2:List}).\n",
        description: ["Documentation directive for predicates and non-terminals. The first argument is either a predicate indicator or a non-terminal indicator. The second argument is a list of pairs using the format Key is Value. See the documenting Logtalk programs section for a description of the default keys.\n","Template and modes","info(+predicate_indicator, +predicate_info_list)","info(+non_terminal_indicator, +predicate_info_list)"],
        prefix: ":- info",
        scope: "source.logtalk"
      },
      'directives:initialization/1': {
        body: ":- initialization(${1:Goal}).\n",
        description: ["When used within an object, this directive defines a goal to be called immediately after the object has been loaded into memory. When used at a global level within a source file, this directive defines a goal to be called immediately after the compiled source file is loaded into memory.\n","Template and modes","initialization(@callable)"],
        prefix: ":- initialization",
        scope: "source.logtalk"
      },
      'directives:meta_non_terminal/1': {
        body: ":- meta_non_terminal(${1:MetaNonTerminalTemplate}).\n",
        description: ["Declares meta-non-terminals, i.e., non-terminals that have arguments that will be called as non-terminals (or grammar rule bodies). An argument may also be a closure instead of a goal if the non-terminal uses the call//1-N or phrase//1 built-in methods.\n","Template and modes","meta_non_terminal(+meta_non_terminal_template_term)","meta_non_terminal(+object_identifier::+meta_non_terminal_template_term)","meta_non_terminal(+category_identifier::+meta_non_terminal_template_term)","meta_non_terminal(+module_identifier:+meta_non_terminal_template_term)"],
        prefix: ":- meta_non_terminal",
        scope: "source.logtalk"
      },
      'directives:meta_predicate/1': {
        body: ":- meta_predicate(${1:MetaPredicateTemplate}).\n",
        description: ["Declares meta-predicates, i.e., predicates that have arguments that will be called as goals. An argument may also be a closure instead of a goal if the meta-predicate uses the call/N Logtalk built-in methods to construct and call the actual goal from the closure and the additional arguments.\n","Template and modes","meta_predicate(+meta_predicate_template_term)","meta_predicate(+object_identifier::+meta_predicate_template_term)","meta_predicate(+category_identifier::+meta_predicate_template_term)","meta_predicate(+module_identifier:+meta_predicate_template_term)"],
        prefix: ":- meta_predicate",
        scope: "source.logtalk"
      },
      'directives:mode/2': {
        body: ":- mode(${1:Mode}, ${2|zero,zero_or_one,zero_or_more,one,one_or_more,zero_or_error,one_or_error,zero_or_one_or_error,zero_or_more_or_error,one_or_more_or_error,error|}).\n",
        description: ["Most predicates can be used with several instantiations modes. This directive enables the specification of each instantiation mode and the corresponding number of proofs (not necessarily distinct solutions).\n","Template and modes","mode(+predicate_mode_term, +number_of_proofs)"],
        prefix: ":- mode",
        scope: "source.logtalk"
      },
      'directives:mode_non_terminal/2': {
        body: ":- mode_non_terminal(${1:Mode}, ${2|zero,zero_or_one,zero_or_more,one,one_or_more,zero_or_error,one_or_error,zero_or_one_or_error,zero_or_more_or_error,one_or_more_or_error,error|}).\n",
        description: ["Most non-terminals can be used with several instantiations modes. This directive enables the specification of each instantiation mode and the corresponding number of proofs (not necessarily distinct solutions).\n","Template and modes","mode_non_terminal(+non_terminal_mode_term, +number_of_proofs)"],
        prefix: ":- mode",
        scope: "source.logtalk"
      },
      'directives:multifile/1 (predicate)': {
        body: ":- multifile(${1:Name}/${2:Arity}).\n",
        description: ["Declares multifile predicates. In the case of object or category multifile predicates, the predicate must also have a scope directive in the object or category holding its primary declaration (i.e. the declaration without the Entity:: prefix). Entities holding multifile predicate primary declarations must be compiled and loaded prior to any entities contributing with clauses for the multifile predicates.\n","Template and modes","multifile(+qualified_predicate_indicator_term)"],
        prefix: ":- multifile",
        scope: "source.logtalk"
      },
      'directives:multifile/1 (non-terminal)': {
        body: ":- multifile(${1:Name}//${2:Arity}).\n",
        description: ["Declares multifile non-terminals. In the case of object or category multifile non-terminals, the non-terminal must also have a scope directive in the object or category holding its primary declaration (i.e. the declaration without the Entity:: prefix). Entities holding multifile non-terminal primary declarations must be compiled and loaded prior to any entities contributing with clauses for the multifile non-terminals.\n","Template and modes","multifile(+qualified_non_terminal_indicator_term)"],
        prefix: ":- multifile",
        scope: "source.logtalk"
      },
      'directives:op/3': {
        body: ":- op(${1:Precedence}, ${2|fx,fy,xfx,xfy,yfx,xf,yf|}, ${3:Operator}).\n",
        description: ["Declares operators. Operators declared inside entities have local scope. Global operators can be declared inside a source file by writing the respective directives before the entity opening directives.\n","Template and modes","op(+integer, +associativity, +atom_or_atom_list)"],
        prefix: ":- op",
        scope: "source.logtalk"
      },
      'directives:private/1 (predicate)': {
        body: ":- private(${1:Name}/${2:Arity}).\n",
        description: ["Declares private predicates. A private predicate can only be called from the object containing the private directive.\n","Template and modes","private(+predicate_indicator)"],
        prefix: ":- private",
        scope: "source.logtalk"
      },
      'directives:private/1 (non-terminal)': {
        body: ":- private(${1:Name}//${2:Arity}).\n",
        description: ["Declares private non-terminals. A private non-terminal can only be used in a call of the phrase/2 and phrase/3 methods from the object containing the private directive.\n","Template and modes","private(+non_terminal_indicator)"],
        prefix: ":- private",
        scope: "source.logtalk"
      },
      'directives:private/1 (operator)': {
        body: ":- private(op(${1:Priority},${2|fx,fy,xfx,xfy,yfx,xf,yf|},${3:Operator})).\n",
        description: ["Declares private operators.\n","Template and modes","private(+operator_declaration)"],
        prefix: ":- private",
        scope: "source.logtalk"
      },
      'directives:protected/1 (predicate)': {
        body: ":- protected(${1:Name}/${2:Arity}).\n",
        description: ["Declares protected predicates. A protected predicate can only be called from the object containing the directive or from an object that inherits the directive.\n","Template and modes","protected(+predicate_indicator_term)"],
        prefix: ":- protected",
        scope: "source.logtalk"
      },
      'directives:protected/1 (non-terminal)': {
        body: ":- protected(${1:Name}//${2:Arity}).\n",
        description: ["Declares protected non-terminals. A protected non-terminal can only be used as an argument in a phrase/2 and phrase/3 calls from the object containing the directive or from an object that inherits the directive.\n","Template and modes","protected(+non_terminal_indicator_term)"],
        prefix: ":- protected",
        scope: "source.logtalk"
      },
      'directives:protected/1 (operator)': {
        body: ":- protected(op(${1:Priority},${2|fx,fy,xfx,xfy,yfx,xf,yf|},${3:Operator})).\n",
        description: ["Declares protected operators. Protected operators are not inherited but declaring them provides useful information for defining descendant objects.\n","Template and modes","protected(+operator_declaration)"],
        prefix: ":- protected",
        scope: "source.logtalk"
      },
      'directives:public/1 (predicate)': {
        body: ":- public(${1:Name}/${2:Arity}).\n",
        description: ["Declares public predicates. A public predicate can be called from any object.\n","Template and modes","public(+predicate_indicator_term)"],
        prefix: ":- public",
        scope: "source.logtalk"
      },
      'directives:public/1 (non-terminal)': {
        body: ":- public(${1:Name}//${2:Arity}).\n",
        description: ["Declares public non-terminals. A public non-terminal can be used as an argument in phrase/2 and phrase/3 calls from any object.\n","Template and modes","public(+non_terminal_indicator_term)"],
        prefix: ":- public",
        scope: "source.logtalk"
      },
      'directives:public/1 (operator)': {
        body: ":- public(op(${1:Priority},${2|fx,fy,xfx,xfy,yfx,xf,yf|},${3:Operator})).\n",
        description: ["Declares public operators. Public operators are not exported but declaring them provides useful information for defining client objects.\n","Template and modes","public(+operator_declaration)"],
        prefix: ":- public",
        scope: "source.logtalk"
      },
      'directives:set_logtalk_flag/2': {
        body: ":- set_logtalk_flag(${1:Flag}, ${2:Value}).\n",
        description: ["Sets Logtalk flag values. The scope of this directive is the entity or the source file containing it. For global scope, use the corresponding set_logtalk_flag/2 built-in predicate within an initialization/1 directive.\n","Template and modes","set_logtalk_flag(+atom, +nonvar)"],
        prefix: ":- set_logtalk_flag",
        scope: "source.logtalk"
      },
      'directives:synchronized/1 (predicate)': {
        body: ":- synchronized(${1:Name}/${2:Arity}).\n",
        description: ["Declares synchronized predicates. A synchronized predicate is protected by a mutex in order to allow for thread synchronization when proving a call to the predicate. All predicates declared in the same synchronized directive share the same mutex. In order to use a separate mutex for each predicate so that they are independently synchronized, a per-predicate synchronized directive must be used.\n","Template and modes","synchronized(+predicate_indicator_term)"],
        prefix: ":- synchronized",
        scope: "source.logtalk"
      },
      'directives:synchronized/1 (non-terminal)': {
        body: ":- synchronized(${1:Name}//${2:Arity}).\n",
        description: ["Declares synchronized non-terminals. A synchronized non-terminal is protected by a mutex in order to allow for thread synchronization when proving a call to the non-terminal. All non-terminals declared in the same synchronized directive share the same mutex. In order to use a separate mutex for each non-terminal so that they are independently synchronized, a per-non-terminal synchronized directive must be used.\n","Template and modes","synchronized(+non_terminal_indicator_term)"],
        prefix: ":- synchronized",
        scope: "source.logtalk"
      },
      'directives:threaded/0': {
        body: ":- threaded.\n",
        description: ["Declares that an object supports concurrent calls and asynchronous messages. Any object containing calls to the built-in multi-threading predicates (or importing a category that contains such calls) must include this directive.\n","Template and modes","threaded"],
        prefix: ":- threaded",
        scope: "source.logtalk"
      },
      'directives:use_module/1': {
        body: ":- use_module([${1:Module} as ${2:Alias}]).\n",
        description: ["Declares one or more module aliases.\n","Template and modes","use_module([+module_identifier as +module_identifier])"],
        prefix: ":- use_module",
        scope: "source.logtalk"
      },
      'directives:use_module/2': {
        body: ":- use_module(${1:Module}, ${2:Predicates}).\n",
        description: ["This directive declares that all calls (made from predicates defined in the category or object containing the directive) to the specified predicates are to be interpreted as calls to explicitly-qualified module predicates. Thus, this directive may be used to simplify writing of predicate definitions by allowing the programmer to omit the Module: prefix when using the predicates listed in the directive (as long as the predicate calls do not occur as arguments for non-standard Prolog meta-predicates not declared on the adapter files). It is also possible to include operator declarations, op(Precedence, Associativity, Operator), in the second argument.\n","Template and modes","use_module(+module_identifier, +predicate_indicator_list)"],
        prefix: ":- use_module",
        scope: "source.logtalk"
      },
      'directives:uses/1': {
        body: ":- uses([${1:Object} as ${2:Alias}]).\n",
        description: ["Declares one or more object aliases.\n","Template and modes","uses([+object_identifier as +object_identifier])"],
        prefix: ":- uses",
        scope: "source.logtalk"
      },
      'directives:uses/2': {
        body: ":- uses(${1:Object}, ${2:Predicates}).\n",
        description: ["Declares that all calls made from predicates (or non-terminals) defined in the category or object containing the directive to the specified predicates (or non-terminals) are to be interpreted as messages to the specified object. Thus, this directive may be used to simplify writing of predicate definitions by allowing the programmer to omit the Object:: prefix when using the predicates listed in the directive (as long as the  calls do not occur as arguments for non-standard Prolog meta-predicates not declared on the adapter files). It is also possible to include operator declarations, op(Precedence, Associativity, Operator), in the second argument.\n","Template and modes","uses(+object_identifier, +predicate_indicator_list)","uses(+object_identifier, +predicate_indicator_alias_list)","uses(+object_identifier, +non_terminal_indicator_list)","uses(+object_identifier, +non_terminal_indicator_alias_list)"],
        prefix: ":- uses",
        scope: "source.logtalk"
      },
      'instance': {
        body: "\n:- object(${1:Instance},\n\timplements(${2:Protocol}),\n\timports(${3:Category}),\n\tinstantiates(${4:Class})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${5:Author}',\n\t\tdate is ${6:$CURRENT_YEAR}-${7:$CURRENT_MONTH}-${8:$CURRENT_DATE},\n\t\tcomment is '${9:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Instance with all",
        prefix: "instance",
        scope: "source.logtalk"
      },
      'instance1': {
        body: "\n:- object(${1:Instance},\n\timports(${2:Category}),\n\tinstantiates(${3:Class})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${4:Author}',\n\t\tdate is ${5:$CURRENT_YEAR}-${6:$CURRENT_MONTH}-${7:$CURRENT_DATE},\n\t\tcomment is '${8:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Instance with category",
        prefix: "instance",
        scope: "source.logtalk"
      },
      'instance2': {
        body: "\n:- object(${1:Instance},\n\timplements(${2:Protocol}),\n\tinstantiates(${3:Class})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${4:Author}',\n\t\tdate is ${5:$CURRENT_YEAR}-${6:$CURRENT_MONTH}-${7:$CURRENT_DATE},\n\t\tcomment is '${8:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Instance with protocol",
        prefix: "instance",
        scope: "source.logtalk"
      },
      'instance3': {
        body: "\n:- object(${1:Instance},\n\tinstantiates(${2:Class})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${3:Author}',\n\t\tdate is ${4:$CURRENT_YEAR}-${5:$CURRENT_MONTH}-${6:$CURRENT_DATE},\n\t\tcomment is '${7:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Instance",
        prefix: "instance",
        scope: "source.logtalk"
      },
      'methods:abolish/1': {
        body: "abolish(${1:Predicate})$0",
        description: ["Abolishes a runtime declared dynamic predicate or a local dynamic predicate. When the predicate indicator for Head is declared in a uses/2 or use_module/2 directive, the predicate is abolished in the referenced object or module. Otherwise the predicate is abolished in an object's database. In the case of objects, only predicates that are dynamically declared (using a call to the asserta/1 or assertz/1 built-in methods) can be abolished.\n","Template and modes","abolish(+predicate_indicator)"],
        prefix: "abolish",
        scope: "source.logtalk"
      },
      'methods:after/3': {
        body: "after(${1:Object}, ${2:Message}, ${3:Sender})$0",
        description: ["User-defined method for handling after events. This method is declared in the monitoring built-in protocol as a public predicate. Note that you can make its scope protected or private by using, respectively, protected or private implementation of the monitoring protocol.\n","Template and modes","after(?object_identifier, ?callable, ?object_identifier)"],
        prefix: "after",
        scope: "source.logtalk"
      },
      'methods:ask_question/5': {
        body: "ask_question(${1:Question}, ${2:Kind}, ${3:Component}, ${4:Check}, ${5:Answer})$0",
        description: ["Built-in method for asking a question represented by a term, Question, which is converted to the question text using the logtalk::message_tokens(Question, Component) hook predicate. This method is declared in the logtalk built-in object as a public predicate. The default question prompt and the input stream used for each Kind-Component pair can be found using the logtalk::question_prompt_stream(Kind, Component, Prompt, Stream) hook predicate. The Check argument is a closure that is converted into a checking goal by extending it with the user supplied answer. This predicate implements a read-loop that terminates when the checking predicate succeeds.\n","Template and modes","ask_question(+nonvar, +nonvar, +nonvar, +callable, -term)"],
        prefix: "ask_question",
        scope: "source.logtalk"
      },
      'methods:asserta/1': {
        body: "asserta(${1:Clause})$0",
        description: ["Asserts a clause as the first one for a dynamic predicate. When the predicate indicator for Head is declared in a uses/2 or use_module/2 directive, the clause is asserted in the referenced object or module. Otherwise the clause is asserted for an object's dynamic predicate. If the predicate is not previously declared (using a scope directive), then a dynamic predicate declaration is added to the object (assuming that we are asserting locally or that the compiler flag dynamic_declarations was set to allow when the object was created or compiled).\n","Template and modes","asserta(+clause)"],
        prefix: "asserta",
        scope: "source.logtalk"
      },
      'methods:assertz/1': {
        body: "assertz(${1:Clause})$0",
        description: ["Asserts a clause as the last one for a dynamic predicate. When the predicate indicator for Head is declared in a uses/2 or use_module/2 directive, the clause is asserted in the referenced object or module. Otherwise the clause is asserted for an object's dynamic predicate. If the predicate is not previously declared (using a scope directive), then a dynamic predicate declaration is added to the object (assuming that we are asserting locally or that the compiler flag dynamic_declarations was set to allow when the object was created or compiled).\n","Template and modes","assertz(+clause)"],
        prefix: "assertz",
        scope: "source.logtalk"
      },
      'methods:bagof/3': {
        body: "bagof(${1:Template}, ${2:Goal}, ${3:List})$0",
        description: ["Collects a bag of solutions for the goal for each set of instantiations of the free variables in the goal. The order of the elements in the bag follows the order of the goal solutions. The free variables in the goal are the variables that occur in the goal but not in the template. Free variables can be ignored, however, by using the ^/2 existential qualifier. For example, if T is term containing all the free variables that we want to ignore, we can write T^Goal. Note that the term T can be written as V1^V2^....\n","Template and modes","bagof(@term, +callable, -list)"],
        prefix: "bagof",
        scope: "source.logtalk"
      },
      'methods:before/3': {
        body: "before(${1:Object}, ${2:Message}, ${3:Sender})$0",
        description: ["User-defined method for handling before events. This method is declared in the monitoring built-in protocol as a public predicate. Note that you can make its scope protected or private by using, respectively, protected or private implementation of the monitoring protocol.\n","Template and modes","before(?object_identifier, ?callable, ?object_identifier)"],
        prefix: "before",
        scope: "source.logtalk"
      },
      'methods:call//1-N': {
        body: "call(${1:Closure})$0",
        description: ["This non-terminal takes a closure and is processed by appending the input list of tokens and the list of remaining tokens to the arguments of the closure. This built-in non-terminal is interpreted as a private non-terminal and thus cannot be used as a message to an object. When using a back-end Prolog compiler supporting a module system, calls in the format call(Module:Closure) may also be used. By using as argument a lambda expression, this built-in non-terminal provides controlled access to the input list of tokens and to the list of the remaining tokens processed by the grammar rule containing the call.\n","Template and modes","call(+callable)","call(+callable, ?term)","call(+callable, ?term, ?term)","..."],
        prefix: "call",
        scope: "source.logtalk"
      },
      'methods:call/1-N': {
        body: "call(${1:Goal})$0",
        description: ["Calls a goal, which might be constructed by appending additional arguments to a closure. The upper limit for N depends on the upper limit for the arity of a compound term of the back-end Prolog compiler. This built-in meta-predicate is declared as a private method and thus cannot be used as a message to an object. The Closure argument can also be a lambda expression or a Logtalk control construct. When using a back-end Prolog compiler supporting a module system, calls in the format call(Module:Closure, Arg1, ...) may also be used.\n","Template and modes","call(+callable)","call(+callable, ?term)","call(+callable, ?term, ?term)","..."],
        prefix: "call",
        scope: "source.logtalk"
      },
      'methods:catch/3': {
        body: "catch(${1:Goal}, ${2:Catcher}, ${3:Recovery})$0",
        description: ["Catches exceptions thrown by a goal. See the Prolog ISO standard definition. This built-in meta-predicate is declared as a private method and thus cannot be used as a message to an object.\n","Template and modes","catch(?callable, ?term, ?term)"],
        prefix: "catch",
        scope: "source.logtalk"
      },
      'methods:clause/2': {
        body: "clause(${1:Head}, ${2:Body})$0",
        description: ["Enumerates, by backtracking, the clauses of a dynamic predicate. When the predicate indicator for Head is declared in a uses/2 or use_module/2 directive, the predicate enumerates the clauses in the referenced object or module. Otherwise it enumerates the clauses for an object's dynamic predicate.\n","Template and modes","clause(+callable, ?body)"],
        prefix: "clause",
        scope: "source.logtalk"
      },
      'methods:coinductive_success_hook/1': {
        body: "coinductive_success_hook(${1:Head})$0",
        description: ["User-defined hook predicates that are automatically called in case of coinductive success when proving a query for a coinductive predicates. The hook predicates are called with the head of the coinductive predicate on coinductive success.\n","Template and modes","coinductive_success_hook(+callable)"],
        prefix: "coinductive_success_hook",
        scope: "source.logtalk"
      },
      'methods:coinductive_success_hook/2': {
        body: "coinductive_success_hook(${1:Head}, ${2:Hypothesis})$0",
        description: ["User-defined hook predicates that are automatically called in case of coinductive success when proving a query for a coinductive predicates. The hook predicates are called with the head of the coinductive predicate on coinductive success and with the hypothesis used that to reach coinductive success.\n","Template and modes","coinductive_success_hook(+callable, +callable)"],
        prefix: "coinductive_success_hook",
        scope: "source.logtalk"
      },
      'methods:context/1': {
        body: "context(${1:Context})$0",
        description: ["Returns the execution context for a predicate call using the format logtalk(Call,ExecutionContext). Mainly used for providing a default error context when type-checking predicate arguments. The ExecutionContext should be regarded as an opaque term, which can be decoded using the logtalk::execution_context/7 predicate. Calls to this predicate are inlined at compilation time.\n","Template and modes","context(--callable)"],
        prefix: "context",
        scope: "source.logtalk"
      },
      'methods:current_op/3': {
        body: "current_op(${1:Priority},${2|fx,fy,xfx,xfy,yfx,xf,yf|},${3:Operator})$0",
        description: ["Enumerates, by backtracking, the visible operators declared for an object. Operators not declared using a scope directive are not enumerated.\n","Template and modes","current_op(?operator_priority, ?operator_specifier, ?atom)"],
        prefix: "current_op",
        scope: "source.logtalk"
      },
      'methods:current_predicate/1': {
        body: "current_predicate(${1:Predicate})$0",
        description: ["Enumerates, by backtracking, visible user predicates. When the predicate is declared in a uses/2 or use_module/2 directive, predicates are enumerated for the referenced object or module. Otherwise predicates are enumerated for an object. In the case of objects, predicates not declared using a scope directive are not enumerated.\n","Template and modes","current_predicate(?predicate_indicator)"],
        prefix: "current_predicate",
        scope: "source.logtalk"
      },
      'methods:eos//0': {
        body: "eos$0",
        description: ["This non-terminal matches the end-of-input. It is implemented by checking that the implicit difference list unifies with []-[].\n","Template and modes","eos"],
        prefix: "eos",
        scope: "source.logtalk"
      },
      'methods:expand_goal/2': {
        body: "expand_goal(${1:Goal}, ${2:ExpandedGoal})$0",
        description: ["Expands a goal.\n","Template and modes","expand_goal(?term, ?term)"],
        prefix: "expand_goal",
        scope: "source.logtalk"
      },
      'methods:expand_term/2': {
        body: "expand_term(${1:Term}, ${2:Expansion})$0",
        description: ["Expands a term. The most common use is to expand a grammar rule into a clause. Users may override the default Logtalk grammar rule translator by defining clauses for the term_expansion/2 hook predicate.\n","Template and modes","expand_term(?term, ?term)"],
        prefix: "expand_term",
        scope: "source.logtalk"
      },
      'methods:findall/3': {
        body: "findall(${1:Template}, ${2:Goal}, ${3:List})$0",
        description: ["Collects a list of solutions for the goal. The order of the elements in the list follows the order of the goal solutions. It succeeds returning an empty list when the goal have no solutions.\n","Template and modes","findall(?term, +callable, ?list)"],
        prefix: "findall",
        scope: "source.logtalk"
      },
      'methods:findall/4': {
        body: "findall(${1:Template}, ${2:Goal}, ${3:List}, ${4:Tail})$0",
        description: ["Variant of the findall/3 method that allows passing the tail of the results list. It succeeds returning the  tail argument when the goal have no solutions.\n","Template and modes","findall(?term, +callable, ?list, +list)"],
        prefix: "findall",
        scope: "source.logtalk"
      },
      'methods:forall/2': {
        body: "forall(${1:Generator}, ${2:Test})$0",
        description: ["For all solutions of Generator, Test is true. This built-in meta-predicate is declared as a private method and thus cannot be used as a message to an object.\n","Template and modes","forall(+callable, +callable)"],
        prefix: "forall",
        scope: "source.logtalk"
      },
      'methods:forward/1': {
        body: "forward(${1:Message})$0",
        description: ["User-defined method for forwarding unknown messages sent to an object (using the ::/2 control construct), automatically called by the runtime when defined. This method is declared in the forwarding built-in protocol as a public predicate. Note that you can make its scope protected or private by using, respectively, protected or private implementation of the forwarding protocol.\n","Template and modes","forward(+callable)"],
        prefix: "forward",
        scope: "source.logtalk"
      },
      'methods:goal_expansion/2': {
        body: "goal_expansion(${1:Goal}, ${2:ExpandedGoal})$0",
        description: ["Defines an expansion for a goal. The first argument is the goal to be expanded. The expanded goal is returned in the second argument. This predicate is called recursively on the expanded goal until a fixed point is reached. Thus, care must be taken to avoid compilation loops. This predicate, when defined and within scope, is automatically called by the expand_goal/2 method. Use of this predicate by the expand_goal/2 method may be restricted by changing its default public scope.\n","Template and modes","goal_expansion(+callable, -callable)"],
        prefix: "goal_expansion",
        scope: "source.logtalk"
      },
      'methods:ignore/1': {
        body: "ignore(${1:Goal})$0",
        description: ["This predicate succeeds whether its argument succeeds or fails and it is not re-executable. This built-in meta-predicate is declared as a private method and thus cannot be used as a message to an object.\n","Template and modes","ignore(+callable)"],
        prefix: "ignore",
        scope: "source.logtalk"
      },
      'methods:message_hook/4': {
        body: "message_hook(${1:Message}, ${2:Kind}, ${3:Component}, ${4:Tokens})$0",
        description: ["User-defined hook method for intercepting printing of a message, declared in the logtalk built-in object as a public, multifile, and dynamic predicate. This hook method is automatically called by the print_message/3 method. When the call succeeds, the print_message/3 method assumes that the message have been successfully printed.\n","Template and modes","message_hook(@nonvar, @nonvar, @nonvar, @list(nonvar))"],
        prefix: "message_hook",
        scope: "source.logtalk"
      },
      'methods:message_prefix_stream/4': {
        body: "message_prefix_stream(${1:Kind}, ${2:Component}, ${3:Prefix}, ${4:Stream})$0",
        description: ["User-defined hook method for specifying the default prefix and stream for printing a message for a given kind and component. This method is declared in the logtalk built-in object as a public, multifile, and dynamic predicate.\n","Template and modes","message_prefix_stream(?nonvar, ?nonvar, ?atom, ?stream_or_alias)"],
        prefix: "message_prefix_stream",
        scope: "source.logtalk"
      },
      'methods:message_tokens//2': {
        body: "message_tokens(${1:Message}, ${2:Component})$0",
        description: ["User-defined non-terminal hook used to rewrite a message term into a list of tokens and declared in the logtalk built-in object as a public, multifile, and dynamic non-terminal. The list of tokens can be printed by calling the print_message_tokens/3 method. This non-terminal hook is automatically called by the print_message/3 method.\n","Template and modes","message_tokens(+nonvar, +nonvar)"],
        prefix: "message_tokens",
        scope: "source.logtalk"
      },
      'methods:once/1': {
        body: "once(${1:Goal})$0",
        description: ["This predicate behaves as call(Goal) but it is not re-executable. This built-in meta-predicate is declared as a private method and thus cannot be used as a message to an object.\n","Template and modes","once(+callable)"],
        prefix: "once",
        scope: "source.logtalk"
      },
      'methods:parameter/2': {
        body: "parameter(${1:Number}, ${2:Term})$0",
        description: ["Used in parametric objects (and parametric categories), this private method provides runtime access to the parameter values of the entity that contains the predicate clause whose body is being executed by using the argument number in the entity identifier. This predicate is implemented as a unification between its second argument and the corresponding implicit execution-context argument in the predicate containing the call. This unification occurs at the clause head when the second argument is not instantiated (the most common case). When the second argument is instantiated, the unification must be delayed to runtime and thus occurs at the clause body. See also this/1.\n","Template and modes","parameter(+integer, ?term)"],
        prefix: "parameter",
        scope: "source.logtalk"
      },
      'methods:phrase//1': {
        body: "phrase(${1:NonTerminal})$0",
        description: ["This non-terminal takes a grammar rule body and parses it using the current implicit list of tokens. A common use is to wrap what otherwise would be a naked variable in a grammar rule body.\n","Template and modes","phrase(+callable)"],
        prefix: "phrase",
        scope: "source.logtalk"
      },
      'methods:phrase/2': {
        body: "phrase(${1:GrammarRuleBody}, ${2:Input})$0",
        description: ["True when the GrammarRuleBody grammar rule body can be applied to the Input list of tokens. In the most common case, GrammarRuleBody is a non-terminal defined by a grammar rule. This built-in method is declared private and thus cannot be used as a message to an object. When using a back-end Prolog compiler supporting a module system, calls in the format phrase(Module:GrammarRuleBody, Input) may also be used.\n","Template and modes","phrase(+callable, ?list)"],
        prefix: "phrase",
        scope: "source.logtalk"
      },
      'methods:phrase/3': {
        body: "phrase(${1:GrammarRuleBody}, ${2:Input}, ${3:Rest})$0",
        description: ["True when the GrammarRuleBody grammar rule body can be applied to the Input-Rest difference list of tokens. In the most common case, GrammarRuleBody is a non-terminal defined by a grammar rule. This built-in method is declared private and thus cannot be used as a message to an object. When using a back-end Prolog compiler supporting a module system, calls in the format phrase(Module:GrammarRuleBody, Input, Rest) may also be used.\n","Template and modes","phrase(+callable, ?list, ?list)"],
        prefix: "phrase",
        scope: "source.logtalk"
      },
      'methods:predicate_property/2': {
        body: "predicate_property(${1:Predicate}, ${2:Property})$0",
        description: ["Enumerates, by backtracking, the properties of a visible predicate. When the predicate indicator for Predicate is declared in a uses/2 or use_module/2 directive, properties are enumerated for the referenced object or module predicate. Otherwise properties are enumerated for an object predicate. In the case of objects, properties for predicates not declared using a scope directive are not enumerated. The valid predicate properties are listed in the language grammar.\n","Template and modes","predicate_property(+callable, ?predicate_property)"],
        prefix: "predicate_property",
        scope: "source.logtalk"
      },
      'methods:print_message/3': {
        body: "print_message(${1:Kind}, ${2:Component}, ${3:Term})$0",
        description: ["Built-in method for printing a message represented by a term, which is converted to the message text using the logtalk::message_tokens(Term, Component) hook non-terminal. This method is declared in the logtalk built-in object as a public predicate. The line prefix and the output stream used for each Kind-Component pair can be found using the logtalk::message_prefix_stream(Kind, Component, Prefix, Stream) hook predicate.\n","Template and modes","print_message(+nonvar, +nonvar, +nonvar)"],
        prefix: "print_message",
        scope: "source.logtalk"
      },
      'methods:print_message_token/4': {
        body: "print_message_token(${1:Stream}, ${2:Prefix}, ${3:Token}, ${4:Tokens})$0",
        description: ["User-defined hook method for printing a message token, declared in the logtalk built-in object as a public, multifile, and dynamic predicate. It allows the user to intercept the printing of a message token. This hook method is automatically called by the print_message_tokens/3 built-in method for each token.\n","Template and modes","print_message_token(@stream_or_alias, @atom, @nonvar, @list(nonvar))"],
        prefix: "print_message_token",
        scope: "source.logtalk"
      },
      'methods:print_message_tokens/3': {
        body: "print_message_tokens(${1:Stream}, ${2:Prefix}, ${3:Tokens})$0",
        description: ["Built-in method for printing a list of message tokens, declared in the logtalk built-in object as a public predicate. This method is automatically called by the print_message/3 method (assuming that the message was not intercepted by a message_hook/4 definition) and calls the user-defined hook predicate print_message_token/4 for each token. When a call to this hook predicate succeeds, the print_message_tokens/3 predicate assumes that the token have been printed. When the call fails, the print_message_tokens/3 predicate uses a default printing procedure for the token.\n","Template and modes","print_message_tokens(@stream_or_alias, +atom, @list(nonvar))"],
        prefix: "print_message_tokens",
        scope: "source.logtalk"
      },
      'methods:question_hook/6': {
        body: "question_hook(${1:Question}, ${2:Kind}, ${3:Component}, ${4:Tokens}, ${5:Check}, ${6:Answer})$0",
        description: ["User-defined hook method for intercepting asking a question, declared in the logtalk built-in object as a public, multifile, and dynamic predicate. This hook method is automatically called by the ask_question/5 method. When the call succeeds, the ask_question/5 method assumes that the question have been successfully asked and replied.\n","Template and modes","question_hook(+nonvar, +nonvar, +nonvar, +list(nonvar), +callable, -term)"],
        prefix: "question_hook",
        scope: "source.logtalk"
      },
      'methods:question_prompt_stream/4': {
        body: "question_prompt_stream(${1:Kind}, ${2:Component}, ${3:Prompt}, ${4:Stream})$0",
        description: ["User-defined hook method for specifying the default prompt and input stream for asking a question for a given kind and component. This method is declared in the logtalk built-in object as a public, multifile, and dynamic predicate.\n","Template and modes","question_prompt_stream(?nonvar, ?nonvar, ?atom, ?stream_or_alias)"],
        prefix: "question_prompt_stream",
        scope: "source.logtalk"
      },
      'methods:retract/1': {
        body: "retract(${1:Clause})$0",
        description: ["Retracts a clause for a dynamic predicate. When the predicate indicator for Head is declared in a uses/2 or use_module/2 directive, the clause is retracted in the referenced object or module. Otherwise the clause is retracted in an object's dynamic predicate. On backtracking, the predicate retracts the next matching clause.\n","Template and modes","retract(+clause)"],
        prefix: "retract",
        scope: "source.logtalk"
      },
      'methods:retractall/1': {
        body: "retractall(${1:Head})$0",
        description: ["Retracts all clauses with a matching head for a dynamic predicate. When the predicate indicator for Head is declared in a uses/2 or use_module/2 directive, the clauses are retracted in the referenced object or module. Otherwise the clauses are retracted in an object's dynamic predicate.\n","Template and modes","retractall(+callable)"],
        prefix: "retractall",
        scope: "source.logtalk"
      },
      'methods:self/1': {
        body: "self(${1:Self})$0",
        description: ["Returns the object that has received the message under processing. This private method is translated to a unification between its argument and the corresponding implicit context argument in the predicate containing the call. This unification occurs at the clause head when the argument is not instantiated (the most common case).\n","Template and modes","self(?object_identifier)"],
        prefix: "self",
        scope: "source.logtalk"
      },
      'methods:sender/1': {
        body: "sender(${1:Sender})$0",
        description: ["Returns the object that has sent the message under processing. This private method is translated into a unification between its argument and the corresponding implicit context argument in the predicate containing the call. This unification occurs at the clause head when the argument is not instantiated (the most common case).\n","Template and modes","sender(?object_identifier)"],
        prefix: "sender",
        scope: "source.logtalk"
      },
      'methods:setof/3': {
        body: "setof(${1:Template}, ${2:Goal}, ${3:List})$0",
        description: ["Collects a set of solutions for the goal for each set of instantiations of the free variables in the goal. The solutions are sorted using standard term order. The free variables in the goal are the variables that occur in the goal but not in the template. Free variables can be ignored, however, by using the ^/2 existential qualifier. For example, if T is term containing all the free variables that we want to ignore, we can write T^Goal. Note that the term T can be written as V1^V2^....\n","Template and modes","setof(@term, +callable, -list)"],
        prefix: "setof",
        scope: "source.logtalk"
      },
      'methods:term_expansion/2': {
        body: "term_expansion(${1:Term}, ${2:Expansion})$0",
        description: ["Defines an expansion for a term. This predicate, when defined and within scope, is automatically called by the expand_term/2 method. When that is not the case, the expand_term/2 method only uses the default expansions. Use of this predicate by the expand_term/2 method may be restricted by changing its default public scope.\n","Template and modes","term_expansion(+nonvar, -nonvar)","term_expansion(+nonvar, -list(nonvar))"],
        prefix: "term_expansion",
        scope: "source.logtalk"
      },
      'methods:this/1': {
        body: "this(${1:This})$0",
        description: ["Unifies its argument with the identifier of the object for which the predicate clause whose body is being executed is defined (or the object importing the category that contains the predicate clause). This private method is implemented as a unification between its argument and the corresponding implicit execution-context argument in the predicate containing the call. This unification occurs at the clause head when the argument is not instantiated (the most common case). This method is useful for avoiding hard-coding references to an object identifier or for retrieving all object parameters with a single call when using parametric objects. See also parameter/2.\n","Template and modes","this(?object_identifier)"],
        prefix: "this",
        scope: "source.logtalk"
      },
      'methods:throw/1': {
        body: "throw(${1:Exception})$0",
        description: ["Throws an exception. This built-in predicate is declared as a private method and thus cannot be used as a message to an object.\n","Template and modes","throw(+nonvar)"],
        prefix: "throw",
        scope: "source.logtalk"
      },
      'entity:object (standalone)': {
        body: "\n:- object(${1:Object}).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${2:Author}',\n\t\tdate is ${3:$CURRENT_YEAR}-${4:$CURRENT_MONTH}-${5:$CURRENT_DATE},\n\t\tcomment is '${6:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Prototype",
        prefix: "object",
        scope: "source.logtalk"
      },
      'entity:object (imports)': {
        body: "\n:- object(${1:Prototype},\n\timports(${2:Category})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${3:Author}',\n\t\tdate is ${4:$CURRENT_YEAR}-${5:$CURRENT_MONTH}-${6:$CURRENT_DATE},\n\t\tcomment is '${7:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Prototype with category",
        prefix: "object",
        scope: "source.logtalk"
      },
      'entity:object (extends)': {
        body: "\n:- object(${1:Prototype},\n\textends(${2:Parent})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${3:Author}',\n\t\tdate is ${4:$CURRENT_YEAR}-${5:$CURRENT_MONTH}-${6:$CURRENT_DATE},\n\t\tcomment is '${7:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Prototype with parent",
        prefix: "object",
        scope: "source.logtalk"
      },
      'entity:object (implements)': {
        body: "\n:- object(${1:Prototype},\n\timplements(${2:Protocol})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${3:Author}',\n\t\tdate is ${4:$CURRENT_YEAR}-${5:$CURRENT_MONTH}-${6:$CURRENT_DATE},\n\t\tcomment is '${7:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Prototype with protocol",
        prefix: "object",
        scope: "source.logtalk"
      },
      'entity:object (all)': {
        body: "\n:- object(${1:Prototype},\n\timplements(${2:Protocol}),\n\timports(${3:Category}),\n\textends(${4:Parent})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${5:Author}',\n\t\tdate is ${6:$CURRENT_YEAR}-${7:$CURRENT_MONTH}-${8:$CURRENT_DATE},\n\t\tcomment is '${9:Description}'\n\t]).\n\n$0\n\n:- end_object.\n",
        description: "Prototype with all",
        prefix: "object",
        scope: "source.logtalk"
      },
      'predicates:abolish_category/1': {
        body: "abolish_category(${1:Category})$0",
        description: ["Abolishes a dynamic category.\n","Template and modes","abolish_category(+category_identifier)"],
        prefix: "abolish_category",
        scope: "source.logtalk"
      },
      'predicates:abolish_events/5': {
        body: "abolish_events(${1:Event}, ${2:Object}, ${3:Message}, ${4:Sender}, ${5:Monitor})$0",
        description: ["Abolishes all matching events. The two types of events are represented by the atoms before and after. When the predicate is called with the first argument unbound, both types of events are abolished.\n","Template and modes","abolish_events(@term, @term, @term, @term, @term)"],
        prefix: "abolish_events",
        scope: "source.logtalk"
      },
      'predicates:abolish_object/1': {
        body: "abolish_object(${1:Object})$0",
        description: ["Abolishes a dynamic object.\n","Template and modes","abolish_object(+object_identifier)"],
        prefix: "abolish_object",
        scope: "source.logtalk"
      },
      'predicates:abolish_protocol/1': {
        body: "abolish_protocol(${1:Protocol})$0",
        description: ["Abolishes a dynamic protocol.\n","Template and modes","abolish_protocol(@protocol_identifier)"],
        prefix: "abolish_protocol",
        scope: "source.logtalk"
      },
      'predicates:category_property/2': {
        body: "category_property(${1:Category}, ${2:Property})$0",
        description: ["Enumerates, by backtracking, the properties associated with the defined categories. The valid category properties are listed in the language grammar.\n","Template and modes","category_property(?category_identifier, ?category_property)"],
        prefix: "category_property",
        scope: "source.logtalk"
      },
      'predicates:complements_object/2': {
        body: "complements_object(${1:Category}, ${2:Object})$0",
        description: ["Enumerates, by backtracking, all category–object pairs such that the category explicitly complements the object.\n","Template and modes","complements_object(?category_identifier, ?object_identifier)"],
        prefix: "complements_object",
        scope: "source.logtalk"
      },
      'predicates:conforms_to_protocol/2': {
        body: "conforms_to_protocol(${1:Object}, ${2:Protocol})$0",
        description: ["Enumerates, by backtracking, all pairs of entities such that an object or a category conforms to a protocol. This predicate implements a transitive closure for the protocol implementation relation.\n","Template and modes","conforms_to_protocol(?object_identifier, ?protocol_identifier)","conforms_to_protocol(?category_identifier, ?protocol_identifier)"],
        prefix: "conforms_to_protocol",
        scope: "source.logtalk"
      },
      'predicates:conforms_to_protocol/3': {
        body: "conforms_to_protocol(${1:Object}, ${2:Protocol}, ${3:Scope})$0",
        description: ["Enumerates, by backtracking, all pairs of entities such that an object or a category conforms to a protocol. The relation scope is represented by the atoms public, protected, and private. This predicate implements a transitive closure for the protocol implementation relation.\n","Template and modes","conforms_to_protocol(?object_identifier, ?protocol_identifier, ?scope)","conforms_to_protocol(?category_identifier, ?protocol_identifier, ?scope)"],
        prefix: "conforms_to_protocol",
        scope: "source.logtalk"
      },
      'predicates:create_category/4': {
        body: "create_category(${1:Identifier}, ${2:Relations}, ${3:Directives}, ${4:Clauses})$0",
        description: ["Creates a new, dynamic category. This predicate is often used as a primitive to implement high-level category creation methods.\n","Template and modes","create_category(?category_identifier, +list, +list, +list)"],
        prefix: "create_category",
        scope: "source.logtalk"
      },
      'predicates:create_logtalk_flag/3': {
        body: "create_logtalk_flag(${1:Flag}, ${2:Value}, ${3:Options})$0",
        description: ["Creates a new Logtalk flag and sets its default value. User-defined flags can be queried and set in the same way as pre-defined flags by using, respectively, the current_logtalk_flag/2 and set_logtalk_flag/2 built-in predicates.\n","Template and modes","create_logtalk_flag(+atom, +ground, +list(ground))"],
        prefix: "create_logtalk_flag",
        scope: "source.logtalk"
      },
      'predicates:create_object/4': {
        body: "create_object(${1:Identifier}, ${2:Relations}, ${3:Directives}, ${4:Clauses})$0",
        description: ["Creates a new, dynamic object. The word object is used here as a generic term. This predicate can be used to create new prototypes, instances, and classes. This predicate is often used as a primitive to implement high-level object creation methods.\n","Template and modes","create_object(?object_identifier, +list, +list, +list)"],
        prefix: "create_object",
        scope: "source.logtalk"
      },
      'predicates:create_protocol/3': {
        body: "create_protocol(${1:Identifier}, ${2:Relations}, ${3:Directives})$0",
        description: ["Creates a new, dynamic, protocol. This predicate is often used as a primitive to implement high-level protocol creation methods.\n","Template and modes","create_protocol(?protocol_identifier, +list, +list)"],
        prefix: "create_protocol",
        scope: "source.logtalk"
      },
      'predicates:current_category/1': {
        body: "current_category(${1:Category})$0",
        description: ["Enumerates, by backtracking, all currently defined categories. All categories are found, either static, dynamic, or built-in.\n","Template and modes","current_category(?category_identifier)"],
        prefix: "current_category",
        scope: "source.logtalk"
      },
      'predicates:current_event/5': {
        body: "current_event(${1:Event}, ${2:Object}, ${3:Message}, ${4:Sender}, ${5:Monitor})$0",
        description: ["Enumerates, by backtracking, all defined events. The two types of events are represented by the atoms before and after.\n","Template and modes","current_event(?event, ?term, ?term, ?term, ?object_identifier)"],
        prefix: "current_event",
        scope: "source.logtalk"
      },
      'predicates:current_logtalk_flag/2': {
        body: "current_logtalk_flag(${1:Flag}, ${2:Value})$0",
        description: ["Enumerates, by backtracking, the current Logtalk flag values.\n","Template and modes","current_logtalk_flag(?atom, ?atom)"],
        prefix: "current_logtalk_flag",
        scope: "source.logtalk"
      },
      'predicates:current_object/1': {
        body: "current_object(${1:Object})$0",
        description: ["Enumerates, by backtracking, all currently defined objects. All objects are found, either static, dynamic or built-in.\n","Template and modes","current_object(?object_identifier)"],
        prefix: "current_object",
        scope: "source.logtalk"
      },
      'predicates:current_protocol/1': {
        body: "current_protocol(${1:Protocol})$0",
        description: ["Enumerates, by backtracking, all currently defined protocols. All protocols are found, either static, dynamic, or built-in.\n","Template and modes","current_protocol(?protocol_identifier)"],
        prefix: "current_protocol",
        scope: "source.logtalk"
      },
      'predicates:define_events/5': {
        body: "define_events(${1:Event}, ${2:Object}, ${3:Message}, ${4:Sender}, ${5:Monitor})$0",
        description: ["Defines a new set of events. The two types of events are represented by the atoms before and after. When the predicate is called with the first argument unbound, both types of events are defined. The object Monitor must define the event handler methods required by the Event argument.\n","Template and modes","define_events(@term, @term, @term, @term, +object_identifier)"],
        prefix: "define_events",
        scope: "source.logtalk"
      },
      'predicates:extends_category/2': {
        body: "extends_category(${1:Category1}, ${2:Category2})$0",
        description: ["Enumerates, by backtracking, all pairs of categories such that the first one extends the second.\n","Template and modes","extends_category(?category_identifier, ?category_identifier)"],
        prefix: "extends_category",
        scope: "source.logtalk"
      },
      'predicates:extends_category/3': {
        body: "extends_category(${1:Category1}, ${2:Category2}, ${3:Scope})$0",
        description: ["Enumerates, by backtracking, all pairs of categories such that the first one extends the second. The relation scope is represented by the atoms public, protected, and private.\n","Template and modes","extends_category(?category_identifier, ?category_identifier, ?scope)"],
        prefix: "extends_category",
        scope: "source.logtalk"
      },
      'predicates:extends_object/2': {
        body: "extends_object(${1:Prototype}, ${2:Parent})$0",
        description: ["Enumerates, by backtracking, all pairs of objects such that the first one extends the second.\n","Template and modes","extends_object(?object_identifier, ?object_identifier)"],
        prefix: "extends_object",
        scope: "source.logtalk"
      },
      'predicates:extends_object/3': {
        body: "extends_object(${1:Prototype}, ${2:Parent}, ${3:Scope})$0",
        description: ["Enumerates, by backtracking, all pairs of objects such that the first one extends the second. The relation scope is represented by the atoms public, protected, and private.\n","Template and modes","extends_object(?object_identifier, ?object_identifier, ?scope)"],
        prefix: "extends_object",
        scope: "source.logtalk"
      },
      'predicates:extends_protocol/2': {
        body: "extends_protocol(${1:Protocol1}, ${2:Protocol2})$0",
        description: ["Enumerates, by backtracking, all pairs of protocols such that the first one extends the second.\n","Template and modes","extends_protocol(?protocol_identifier, ?protocol_identifier)"],
        prefix: "extends_protocol",
        scope: "source.logtalk"
      },
      'predicates:extends_protocol/3': {
        body: "extends_protocol(${1:Protocol1}, ${2:Protocol2}, ${3:Scope})$0",
        description: ["Enumerates, by backtracking, all pairs of protocols such that the first one extends the second. The relation scope is represented by the atoms public, protected, and private.\n","Template and modes","extends_protocol(?protocol_identifier, ?protocol_identifier, ?scope)"],
        prefix: "extends_protocol",
        scope: "source.logtalk"
      },
      'predicates:implements_protocol/2': {
        body: "implements_protocol(${1:Object}, ${2:Protocol})$0",
        description: ["Enumerates, by backtracking, all pairs of entities such that an object or a category implements a protocol. This predicate only returns direct implementation relations; it does not implement a transitive closure.\n","Template and modes","implements_protocol(?object_identifier, ?protocol_identifier)","implements_protocol(?category_identifier, ?protocol_identifier)"],
        prefix: "implements_protocol",
        scope: "source.logtalk"
      },
      'predicates:implements_protocol/3': {
        body: "implements_protocol(${1:Object}, ${2:Protocol}, ${3:Scope})$0",
        description: ["Enumerates, by backtracking, all pairs of entities such that an object or a category implements a protocol. The relation scope is represented by the atoms public, protected, and private. This predicate only returns direct implementation relations; it does not implement a transitive closure.\n","Template and modes","implements_protocol(?object_identifier, ?protocol_identifier, ?scope)","implements_protocol(?category_identifier, ?protocol_identifier, ?scope)"],
        prefix: "implements_protocol",
        scope: "source.logtalk"
      },
      'predicates:imports_category/2': {
        body: "imports_category(${1:Object}, ${2:Category})$0",
        description: ["Enumerates, by backtracking, importation relations between objects and categories.\n","Template and modes","imports_category(?object_identifier, ?category_identifier)"],
        prefix: "imports_category",
        scope: "source.logtalk"
      },
      'predicates:imports_category/3': {
        body: "imports_category(${1:Object}, ${2:Category}, ${3:Scope})$0",
        description: ["Enumerates, by backtracking, importation relations between objects and categories. The relation scope is represented by the atoms public, protected, and private.\n","Template and modes","imports_category(?object_identifier, ?category_identifier, ?scope)"],
        prefix: "imports_category",
        scope: "source.logtalk"
      },
      'predicates:instantiates_class/2': {
        body: "instantiates_class(${1:Instance}, ${2:Class})$0",
        description: ["Enumerates, by backtracking, all pairs of objects such that the first one instantiates the second. The relation scope is represented by the atoms public, protected, and private.\n","Template and modes","instantiates_class(?object_identifier, ?object_identifier)"],
        prefix: "instantiates_class",
        scope: "source.logtalk"
      },
      'predicates:instantiates_class/3': {
        body: "instantiates_class(${1:Instance}, ${2:Class}, ${3:Scope})$0",
        description: ["Enumerates, by backtracking, all pairs of objects such that the first one instantiates the second. The relation scope is represented by the atoms public, protected, and private.\n","Template and modes","instantiates_class(?object_identifier, ?object_identifier, ?scope)"],
        prefix: "instantiates_class",
        scope: "source.logtalk"
      },
      'predicates:logtalk_compile/1': {
        body: "logtalk_compile(${1:File})$0",
        description: ["Compiles to disk a source file or a list of source files using the current default compiler flag values. The Logtalk source file name extension (by default, .lgt) can be omitted. Source file paths can be absolute, relative to the current directory, or use library notation. This predicate can also be used to compile Prolog source files as Logtalk source code. When no recognized Logtalk or Prolog extension is specified, the compiler tries first to append a Logtalk source file extension and then a Prolog source file extension. If that fails, the compiler tries to use the file name as-is.\n","Template and modes","logtalk_compile(@source_file_name)","logtalk_compile(@list(source_file_name))"],
        prefix: "logtalk_compile",
        scope: "source.logtalk"
      },
      'predicates:logtalk_compile/2': {
        body: "logtalk_compile(${1:File}, ${2:Flags})$0",
        description: ["Compiles to disk a  source file or a list of source files using a list of compiler flags. The Logtalk source file name extension (by default, .lgt) can be omitted. Source file paths can be absolute, relative to the current directory, or use library notation. This predicate can also be used to compile Prolog source files as Logtalk source code. When no recognized Logtalk or Prolog extension is specified, the compiler tries first to append a Logtalk source file extension and then a Prolog source file extension. If that fails, the compiler tries to use the file name as-is. Compiler flags are represented as flag(value). For a description of the available compiler flags, please consult the User Manual.\n","Template and modes","logtalk_compile(@source_file_name, @list(compiler_flag))","logtalk_compile(@list(source_file_name), @list(compiler_flag))"],
        prefix: "logtalk_compile",
        scope: "source.logtalk"
      },
      'predicates:logtalk_library_path/2': {
        body: "logtalk_library_path(${1:Library}, ${2:Path})$0",
        description: ["Dynamic and multifile user-defined predicate, allowing the declaration of aliases to library paths. Library aliases may also be used on the second argument (using the notation alias(path)). Paths must always end with the path directory separator character ('/').\n","Template and modes","logtalk_library_path(?atom, -atom)","logtalk_library_path(?atom, -compound)"],
        prefix: "logtalk_library_path",
        scope: "source.logtalk"
      },
      'predicates:logtalk_load/1': {
        body: "logtalk_load(${1:File})$0",
        description: ["Compiles to disk and then loads to memory a source file or a list of source files using the current default compiler flag values. The Logtalk source file name extension (by default, .lgt) can be omitted. Source file paths can be absolute, relative to the current directory, or use library notation. This predicate can also be used to compile Prolog source files as Logtalk source code. When no recognized Logtalk or Prolog extension is specified, the compiler tries first to append a Logtalk source file extension and then a Prolog source file extension. If that fails, the compiler tries to use the file name as-is.\n","Template and modes","logtalk_load(@source_file_name)","logtalk_load(@list(source_file_name))"],
        prefix: "logtalk_load",
        scope: "source.logtalk"
      },
      'predicates:logtalk_load/2': {
        body: "logtalk_load(${1:File}, ${2:Flags})$0",
        description: ["Compiles to disk and then loads to memory a source file or a list of source files using a list of compiler flags. The Logtalk source file name extension (by default, .lgt) can be omitted. Compiler flags are represented as flag(value). This predicate can also be used to compile Prolog source files as Logtalk source code. When no recognized Logtalk or Prolog extension is specified, the compiler tries first to append a Logtalk source file extension and then a Prolog source file extension. If that fails, the compiler tries to use the file name as-is. For a description of the available compiler flags, please consult the User Manual. Source file paths can be absolute, relative to the current directory, or use library notation.\n","Template and modes","logtalk_load(@source_file_name, @list(compiler_flag))","logtalk_load(@list(source_file_name), @list(compiler_flag))"],
        prefix: "logtalk_load",
        scope: "source.logtalk"
      },
      'predicates:logtalk_load_context/2': {
        body: "logtalk_load_context(${1:Key}, ${2:Value})$0",
        description: ["Provides access to the Logtalk compilation/loading context. The following keys are currently supported: entity_identifier, entity_prefix, entity_type (returns the value module when compiling a module as an object), source, file (the actual file being compiled, which is different from source only when processing an include/1 directive), basename, directory, stream, target (the full path of the intermediate Prolog file), flags (the list of the explicit flags used for the compilation of the source file), term (the term being expanded), term_position (StartLine-EndLine), and variable_names ([Name1=Variable1, ...]). The term_position key is only supported in back-end Prolog compilers that provide access to the start and end lines of a read term.\n","Template and modes","logtalk_load_context(?atom, -nonvar)"],
        prefix: "logtalk_load_context",
        scope: "source.logtalk"
      },
      'predicates:logtalk_make/0': {
        body: "logtalk_make$0",
        description: ["Reloads all Logtalk source files that have been modified since the time they are last loaded. Only source files loaded using the logtalk_load/1-2 predicates are reloaded. Non-modified files will also be reloaded when there is a change to the compilation mode (i.e. when the files were loaded without explicit debug/1 or optimize/1 flags and the default values of these flags changed after loading; no check is made, however, for other implicit compiler flags that may have changed since loading). When an included file is modified, this predicate reloads its main file (i.e. the file that contains the include/1 directive).\n","Template and modes","logtalk_make"],
        prefix: "logtalk_make",
        scope: "source.logtalk"
      },
      'predicates:logtalk_make/1': {
        body: "logtalk_make(${1:Target})$0",
        description: ["Allows reloading all Logtalk source files that have been modified since last loaded when called with the target all, deleting all intermediate files generated by the compilation of Logtalk source files when called with the target clean, checking for code issues when called with the target check, and listing of circular dependencies between pairs or trios of objects when called with the target circular.\n","Template and modes","logtalk_make(+atom)"],
        prefix: "logtalk_make",
        scope: "source.logtalk"
      },
      'predicates:logtalk_make_target_action/1': {
        body: "logtalk_make_target_action(${1:Target})$0",
        description: ["Multifile and dynamic hook predicate that allows defining user actions for the logtalk_make/1 targets.\n","Template and modes","logtalk_make_target_action(+atom)"],
        prefix: "logtalk_make_target_action",
        scope: "source.logtalk"
      },
      'predicates:object_property/2': {
        body: "object_property(${1:Object}, ${2:Property})$0",
        description: ["Enumerates, by backtracking, the properties associated with the defined objects. The valid object properties are listed in the language grammar.\n","Template and modes","object_property(?object_identifier, ?object_property)"],
        prefix: "object_property",
        scope: "source.logtalk"
      },
      'predicates:protocol_property/2': {
        body: "protocol_property(${1:Protocol}, ${2:Property})$0",
        description: ["Enumerates, by backtracking, the properties associated with the currently defined protocols. The valid protocol properties are listed in the language grammar.\n","Template and modes","protocol_property(?protocol_identifier, ?protocol_property)"],
        prefix: "protocol_property",
        scope: "source.logtalk"
      },
      'predicates:set_logtalk_flag/2': {
        body: "set_logtalk_flag(${1:Flag}, ${2:Value})$0",
        description: ["Sets Logtalk default, global, flag values. For local flag scope, use the corresponding set_logtalk_flag/2 directive. To set a global flag value when compiling and loading a source file, wrap the calls to this built-in predicate with an initialization/1 directive.\n","Template and modes","set_logtalk_flag(+atom, +nonvar)"],
        prefix: "set_logtalk_flag",
        scope: "source.logtalk"
      },
      'predicates:specializes_class/2': {
        body: "specializes_class(${1:Class}, ${2:Superclass})$0",
        description: ["Enumerates, by backtracking, all pairs of objects such that the first one specializes the second.\n","Template and modes","specializes_class(?object_identifier, ?object_identifier)"],
        prefix: "specializes_class",
        scope: "source.logtalk"
      },
      'predicates:specializes_class/3': {
        body: "specializes_class(${1:Class}, ${2:Superclass}, Scope)$0",
        description: ["Enumerates, by backtracking, all pairs of objects such that the first one specializes the second. The relation scope is represented by the atoms public, protected, and private.\n","Template and modes","specializes_class(?object_identifier, ?object_identifier, ?scope)"],
        prefix: "specializes_class",
        scope: "source.logtalk"
      },
      'predicates:threaded/1': {
        body: "threaded(${1:Goals})$0",
        description: ["Proves each goal in a conjunction (disjunction) of goals in its own thread. This predicate is deterministic and opaque to cuts. The predicate argument is not flattened.\n","Template and modes","threaded(+callable)"],
        prefix: "threaded",
        scope: "source.logtalk"
      },
      'predicates:threaded_call/1': {
        body: "threaded_call(${1:Goal})$0",
        description: ["Proves Goal asynchronously using a new thread. The argument can be a message sending goal. Calls to this predicate always succeeds and return immediately. The results (success, failure, or exception) are sent back to the message queue of the object containing the call (this); they can be retrieved by calling the threaded_exit/1 predicate.\n","Template and modes","threaded_call(@callable)"],
        prefix: "threaded_call",
        scope: "source.logtalk"
      },
      'predicates:threaded_call/2': {
        body: "threaded_call(${1:Goal}, Tag)$0",
        description: ["Proves Goal asynchronously using a new thread. The argument can be a message sending goal. Calls to this predicate always succeeds and return immediately. The results (success, failure, or exception) are sent back to the message queue of the object containing the call (this); they can be retrieved by calling the threaded_exit/2 predicate.\n","Template and modes","threaded_call(@callable, -nonvar)"],
        prefix: "threaded_call",
        scope: "source.logtalk"
      },
      'predicates:threaded_engine/1': {
        body: "threaded_engine(${1:Engine})$0",
        description: ["Enumerates, by backtracking, all existing engines.\n","Template and modes","threaded_engine(?nonvar)"],
        prefix: "threaded_engine",
        scope: "source.logtalk"
      },
      'predicates:threaded_engine_create/3': {
        body: "threaded_engine_create(${1:AnswerTemplate}, ${2:Goal}, ${3:Engine})$0",
        description: ["Creates a new engine for proving the given goal and defines an answer template for retrieving the goal solution bindings. A message queue for passing arbitrary terms to the engine is also created. If the name for the engine is not given, a unique name is generated and returned.\n","Template and modes","threaded_engine_create(@term, @callable, ?nonvar)"],
        prefix: "threaded_engine_create",
        scope: "source.logtalk"
      },
      'predicates:threaded_engine_destroy/1': {
        body: "threaded_engine_destroy(${1:Engine})$0",
        description: ["Stops an engine.\n","Template and modes","threaded_engine_destroy(@nonvar)"],
        prefix: "threaded_engine_destroy",
        scope: "source.logtalk"
      },
      'predicates:threaded_engine_fetch/1': {
        body: "threaded_engine_fetch(${1:Term})$0",
        description: ["Fetches a term from the engine term queue. Blocks until a term is available. Fails in not called from within an engine.\n","Template and modes","threaded_engine_fetch(?term)"],
        prefix: "threaded_engine_fetch",
        scope: "source.logtalk"
      },
      'predicates:threaded_engine_next/2': {
        body: "threaded_engine_next(${1:Engine}, ${2:Answer})$0",
        description: ["Retrieves the next answer from an engine. This predicate blocks until an answer becomes available. The predicate fails when there are no more solutions to the engine goal. If the engine goal throws an exception, calling this predicate will re-throw the exception and subsequent calls will fail.\n","Template and modes","threaded_engine_next(@nonvar, ?term)"],
        prefix: "threaded_engine_next",
        scope: "source.logtalk"
      },
      'predicates:threaded_engine_next_reified/2': {
        body: "threaded_engine_next_reified(${1:Engine}, ${2:Answer})$0",
        description: ["Retrieves the next reified answer from an engine. This predicate predicate always succeeds and blocks until an answer becomes available. Answers are returned using the terms the(Answer), no, and exception(Error).\n","Template and modes","threaded_engine_next_reified(@nonvar, ?nonvar)"],
        prefix: "threaded_engine_next_reified",
        scope: "source.logtalk"
      },
      'predicates:threaded_engine_post/2': {
        body: "threaded_engine_post(${1:Engine}, ${2:Term})$0",
        description: ["Posts a term to the engine term queue.\n","Template and modes","threaded_engine_post(@nonvar, @term)"],
        prefix: "threaded_engine_post",
        scope: "source.logtalk"
      },
      'predicates:threaded_engine_self/1': {
        body: "threaded_engine_self(${1:Engine})$0",
        description: ["Queries the name of engine calling the predicate.\n","Template and modes","threaded_engine_self(?nonvar)"],
        prefix: "threaded_engine_self",
        scope: "source.logtalk"
      },
      'predicates:threaded_engine_yield/1': {
        body: "threaded_engine_yield(${1:Answer})$0",
        description: ["Returns an answer independent of the solutions of the engine goal. Fails if not called from within an engine. This predicate is usually used when the engine goal is call to a recursive predicate processing terms from the engine term queue.\n","Template and modes","threaded_engine_yield(@term)"],
        prefix: "threaded_engine_yield",
        scope: "source.logtalk"
      },
      'predicates:threaded_exit/1': {
        body: "threaded_exit(${1:Goal})$0",
        description: ["Retrieves the result of proving Goal in a new thread. This predicate blocks execution until the reply is sent to the this message queue by the thread executing the goal. When there is no thread proving the goal, the predicate generates an exception. This predicate is non-deterministic, providing access to any alternative solutions of its argument.\n","Template and modes","threaded_exit(+callable)"],
        prefix: "threaded_exit",
        scope: "source.logtalk"
      },
      'predicates:threaded_exit/2': {
        body: "threaded_exit(${1:Goal}, Tag)$0",
        description: ["Retrieves the result of proving Goal in a new thread. This predicate blocks execution until the reply is sent to the this message queue by the thread executing the goal. When there is no thread proving the goal, the predicate generates an exception. This predicate is non-deterministic, providing access to any alternative solutions of its argument.\n","Template and modes","threaded_exit(+callable, +nonvar)"],
        prefix: "threaded_exit",
        scope: "source.logtalk"
      },
      'predicates:threaded_ignore/1': {
        body: "threaded_ignore(${1:Goal})$0",
        description: ["Proves Goal asynchronously using a new thread. Only the first goal solution is found. The argument can be a message sending goal. This call always succeeds, independently of the result (success, failure, or exception), which is simply discarded instead of being sent back to the message queue of the object containing the call (this).\n","Template and modes","threaded_ignore(@callable)"],
        prefix: "threaded_ignore",
        scope: "source.logtalk"
      },
      'predicates:threaded_notify/1': {
        body: "threaded_notify(${1:Term})$0",
        description: ["Sends Term as a notification to any thread suspended waiting for it in order to proceed. The call must be made within the same object (this) containing the calls to the threaded_wait/1 predicate waiting for the notification. The argument may also be a list of notifications, [Term| Terms]. In this case, all notifications in the list will be sent to any threads suspended waiting for them in order to proceed.\n","Template and modes","threaded_notify(@term)","threaded_notify(@list(term))"],
        prefix: "threaded_notify",
        scope: "source.logtalk"
      },
      'predicates:threaded_once/1': {
        body: "threaded_once(${1:Goal})$0",
        description: ["Proves Goal asynchronously using a new thread. Only the first goal solution is found. The argument can be a message sending goal. This call always succeeds. The result (success, failure, or exception) is sent back to the message queue of the object containing the call (this).\n","Template and modes","threaded_once(@callable)"],
        prefix: "threaded_once",
        scope: "source.logtalk"
      },
      'predicates:threaded_once/2': {
        body: "threaded_once(${1:Goal}, Tag)$0",
        description: ["Proves Goal asynchronously using a new thread. Only the first goal solution is found. The argument can be a message sending goal. This call always succeeds. The result (success, failure, or exception) is sent back to the message queue of the object containing the call (this).\n","Template and modes","threaded_once(@callable, -nonvar)"],
        prefix: "threaded_once",
        scope: "source.logtalk"
      },
      'predicates:threaded_peek/1': {
        body: "threaded_peek(${1:Goal})$0",
        description: ["Checks if the result of proving Goal in a new thread is already available. This call succeeds or fails without blocking execution waiting for a reply to be available.\n","Template and modes","threaded_peek(+callable)"],
        prefix: "threaded_peek",
        scope: "source.logtalk"
      },
      'predicates:threaded_peek/2': {
        body: "threaded_peek(${1:Goal}, Tag)$0",
        description: ["Checks if the result of proving Goal in a new thread is already available. This call succeeds or fails without blocking execution waiting for a reply to be available.\n","Template and modes","threaded_peek(+callable, +nonvar)"],
        prefix: "threaded_peek",
        scope: "source.logtalk"
      },
      'predicates:threaded_wait/1': {
        body: "threaded_wait(${1:Term})$0",
        description: ["Suspends the thread making the call until a notification is received that unifies with Term. The call must be made within the same object (this) containing the calls to the threaded_notify/1 predicate that will eventually send the notification. The argument may also be a list of notifications, [Term| Terms]. In this case, the thread making the call will suspend until all notifications in the list are received.\n","Template and modes","threaded_wait(?term)","threaded_wait(+list(term))"],
        prefix: "threaded_wait",
        scope: "source.logtalk"
      },
      'predicate_declaration:private': {
        body: "\t:- private(${1:Functor}/0).\n\t:- mode(${1:Functor}, ${2:Solutions}).\n\t:- info(${1:Functor}/0, [\n\t\tcomment is '${3:Description}'\n\t]).\n\n$0",
        description: "Private predicate (with no arguments)",
        prefix: "private",
        scope: "source.logtalk"
      },
      'predicate_declaration:private1': {
        body: "\t:- private(${1:Name}/${2:Arity}).\n\t:- mode(${1:Functor}(${3:Arguments}), ${4:Solutions}).\n\t:- info(${1:Name}/${2:Arity}, [\n\t\tcomment is '${5:Description}',\n\t\targuments is ['$6'-'$7']\n\t]).\n\n$0",
        description: "Private predicate",
        prefix: "private",
        scope: "source.logtalk"
      },
      'predicate_declaration:protected': {
        body: "\t:- protected(${1:Functor}/0).\n\t:- mode(${1:Functor}, ${2:Solutions}).\n\t:- info(${1:Functor}/0, [\n\t\tcomment is '${3:Description}'\n\t]).\n\n$0",
        description: "Protected predicate (with no arguments)",
        prefix: "protected",
        scope: "source.logtalk"
      },
      'predicate_declaration:protected1': {
        body: "\t:- protected(${1:Name}/${2:Arity}).\n\t:- mode(${1:Functor}(${3:Arguments}), ${4:Solutions}).\n\t:- info(${1:Name}/${2:Arity}, [\n\t\tcomment is '${5:Description}',\n\t\targuments is ['$6'-'$7']\n\t]).\n\n$0",
        description: "Protected predicate",
        prefix: "protected",
        scope: "source.logtalk"
      },
      'entity:protocol (extends)': {
        body: "\n:- protocol(${1:Extended},\n\textends(${2:Minimal})).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${3:Author}',\n\t\tdate is ${4:$CURRENT_YEAR}-${5:$CURRENT_MONTH}-${6:$CURRENT_DATE},\n\t\tcomment is '${7:Description}'\n\t]).\n\n$0\n\n:- end_protocol.\n",
        description: "Extended protocol",
        prefix: "protocol",
        scope: "source.logtalk"
      },
      'entity:protocol (standalone)': {
        body: "\n:- protocol(${1:Protocol}).\n\n\t:- info([\n\t\tversion is 1:0:0,\n\t\tauthor is '${2:Author}',\n\t\tdate is ${3:$CURRENT_YEAR}-${4:$CURRENT_MONTH}-${5:$CURRENT_DATE},\n\t\tcomment is '${6:Description}'\n\t]).\n\n$0\n\n:- end_protocol.\n",
        description: "Protocol",
        prefix: "protocol",
        scope: "source.logtalk"
      },
      'predicate_declaration:public': {
        body: "\t:- public(${1:Functor}/0).\n\t:- mode(${1:Functor}, ${2:Solutions}).\n\t:- info(${1:Functor}/0, [\n\t\tcomment is '${3:Description}'\n\t]).\n\n$0",
        description: "Public predicate (with no arguments)",
        prefix: "public",
        scope: "source.logtalk"
      },
      'predicate_declaration:public1': {
        body: "\t:- public(${1:Name}/${2:Arity}).\n\t:- mode(${1:Functor}(${3:Arguments}), ${4:Solutions}).\n\t:- info(${1:Name}/${2:Arity}, [\n\t\tcomment is '${5:Description}',\n\t\targuments is ['$6'-'$7']\n\t]).\n\n$0",
        description: "Public predicate",
        prefix: "public",
        scope: "source.logtalk"
      },
      'predicates:instantiation_error/0': {
        body: "instantiation_error$0",
        description: ["Throws an instantiation error. Used when an argument or one of its sub-arguments is a variable but a non-variable term is required. For example, trying to open a file with a variable for the input/output mode.\n","Template and modes","instantiation_error"],
        prefix: "instantiation_error",
        scope: "source.logtalk"
      },
      'predicates:uninstantiation_error/1': {
        body: "uninstantiation_error(${1:Culprit})$0",
        description: ["Throws an uninstantiation error. Used when an argument or one of its sub-arguments is bound but a variable is required. For example, trying to open a file with a stream argument bound.\n","Template and modes","uninstantiation_error(@nonvar)"],
        prefix: "uninstantiation_error",
        scope: "source.logtalk"
      },
      'predicates:type_error/2': {
        body: "type_error(${1:Type}, ${2:Culprit})$0",
        description: ["Throws a type error. Used when the type of an argument is incorrect. For example, trying to use a non-callable term as a message.\n","Template and modes","type_error(@nonvar, @term)"],
        prefix: "type_error",
        scope: "source.logtalk"
      },
      'predicates:domain_error/2': {
        body: "domain_error(${1:Domain}, ${2:Culprit})$0",
        description: ["Throws a domain error. Used when an argument is of the correct type but outside the valid domain. For example, trying to use an atom as an operator specifier that is not a valid specifier.\n","Template and modes","domain_error(+atom, @nonvar)"],
        prefix: "domain_error",
        scope: "source.logtalk"
      },
      'predicates:consistency_error/3': {
        body: "consistency_error(${1:Expected}, ${2:Argument1}, ${3:Argument2})$0",
        description: ["Throws a consistency error. Used when two directive or predicate arguments are individually correct but together are not consistent. For example, a predicate and its alias having different arity in a uses/2 directive.\n","Template and modes","consistency_error(@atom, @nonvar, @nonvar)"],
        prefix: "consistency_error",
        scope: "source.logtalk"
      },
      'predicates:existence_error/2': {
        body: "existence_error(${1:Thing}, ${2:Culprit})$0",
        description: ["Throws an existence error. Used when the subject of an operation does not exist.\n","Template and modes","existence_error(@nonvar, @nonvar)"],
        prefix: "existence_error",
        scope: "source.logtalk"
      },
      'predicates:permission_error/3': {
        body: "permission_error(${1:Operation}, ${2:Permission}, ${3:Culprit})$0",
        description: ["Throws an permission error. Used when an operation is not allowed. For example, sending a message for a predicate that is not within the scope of the sender.\n","Template and modes","permission_error(@nonvar, @nonvar, @nonvar)"],
        prefix: "permission_error",
        scope: "source.logtalk"
      },
      'predicates:representation_error/1': {
        body: "representation_error(${1:Flag})$0",
        description: ["Throws a representation error. Used when some representation limit is exceeded. For example, trying to construct a compound term that exceeds the maximum arity supported by the backend Prolog system.\n","Template and modes","representation_error(+atom)"],
        prefix: "representation_error",
        scope: "source.logtalk"
      },
      'predicates:evaluation_error/1': {
        body: "evaluation_error(${1:Error})$0",
        description: ["Throws an evaluation error. Used when evaluating an arithmetic expression generates an exception.\n","Template and modes","evaluation_error(@nonvar)"],
        prefix: "evaluation_error",
        scope: "source.logtalk"
      },
      'predicates:resource_error/1': {
        body: "resource_error(${1:Resource})$0",
        description: ["Throws a resource error. Used when a required resource (e.g. memory or disk space) to complete execution is not available.\n","Template and modes","resource_error(@nonvar)"],
        prefix: "resource_error",
        scope: "source.logtalk"
      },
      'predicates:syntax_error/1': {
        body: "syntax_error(${1:Description})$0",
        description: ["Throws a syntax error. Used when the sequence of characters being read are not syntactically valid. \n","Template and modes","syntax_error(@nonvar)"],
        prefix: "syntax_error",
        scope: "source.logtalk"
      },
      'predicates:system_error/0': {
        body: "system_error$0",
        description: ["Throws a system error. Used when runtime execution can no longer proceed. For example, an exception is thrown without an active catcher.\n","Template and modes","system_error"],
        prefix: "system_error",
        scope: "source.logtalk"
      },
      'directives:object/1': {
        body: ":- object(${1:Object}).\n",
        description: ["Starting object directive.\n","Template and modes","object(@callable)"],
        prefix: ":- object",
        scope: "source.logtalk"
      },
      'directives:end_object/0': {
        body: ":- end_object.\n",
        description: ["Ending object directive.\n","Template and modes","end_object"],
        prefix: ":- end_object",
        scope: "source.logtalk"
      },
      'directives:protocol/1': {
        body: ":- protocol(${1:Protocol}).\n",
        description: ["Starting protocol directive.\n","Template and modes","protocol(+atom)"],
        prefix: ":- protocol",
        scope: "source.logtalk"
      },
      'directives:end_protocol/0': {
        body: ":- end_protocol.\n",
        description: ["Ending protocol directive.\n","Template and modes","end_protocol"],
        prefix: ":- end_protocol",
        scope: "source.logtalk"
      },
      'directives:category/1': {
        body: ":- category(${1:Category}).\n",
        description: ["Starting category directive.\n","Template and modes","category(@callable)"],
        prefix: ":- category",
        scope: "source.logtalk"
      },
      'directives:end_category/0': {
        body: ":- end_category.\n",
        description: ["Ending category directive.\n","Template and modes","end_category"],
        prefix: ":- end_category",
        scope: "source.logtalk"
      },
    };
  }
}
