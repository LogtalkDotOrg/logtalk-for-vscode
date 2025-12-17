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
 * CompletionItemProvider for logtalk_make/1 goals
 * Provides target completions when typing "logtalk_make("
 */
export class LogtalkMakeCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();

  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    this.logger.debug(`LogtalkMake completion triggered at position ${position.line}:${position.character}`);

    if (context.triggerCharacter === '(') {
      return this.handleOpenParen(document, position);
    }

    // If triggered by any trigger character, don't also handle as typing inside
    // (avoids duplicates from dual registration)
    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    return this.handleTypingInsideParens(document, position);
  }

  private handleOpenParen(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const textBeforeParen = lineText.substring(0, position.character);

      const match = textBeforeParen.match(/logtalk_make\($/);
      if (!match) {
        return null;
      }

      const charAfterCursor = lineText.substring(position.character, position.character + 1);
      const closingParenHandling = charAfterCursor === ')' ? 'skip' : 'add';

      return this.createTargetCompletionItems('', closingParenHandling);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleOpenParen: ${errorMessage}`);
      return null;
    }
  }

  private handleTypingInsideParens(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const textBeforeCursor = lineText.substring(0, position.character);

      const match = textBeforeCursor.match(/logtalk_make\(([a-z_]*)$/);
      if (!match) {
        return null;
      }

      const partialText = match[1] || '';
      // If no partial text, let handleOpenParen handle it (avoids duplicates)
      if (partialText === '') {
        return null;
      }
      return this.createTargetCompletionItems(partialText, 'none');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleTypingInsideParens: ${errorMessage}`);
      return null;
    }
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
 * CompletionItemProvider for current_logtalk_flag/2 goals
 * Provides flag name completions for the first argument (all flags)
 * and value completions for the second argument
 */
export class CurrentLogtalkFlagCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): CompletionItem[] | null {
    // Check if triggered by "("
    if (context.triggerCharacter === '(') {
      return this.handleOpenParen(document, position);
    }

    // Check if triggered by ","
    if (context.triggerCharacter === ',') {
      return this.handleComma(document, position);
    }

    // If triggered by any trigger character, don't also handle as typing inside
    // (avoids duplicates from dual registration)
    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    // Otherwise, check if we're typing inside current_logtalk_flag(...)
    return this.handleTypingInside(document, position);
  }

  private handleOpenParen(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const textBeforeParen = lineText.substring(0, position.character);

      const match = textBeforeParen.match(/current_logtalk_flag\($/);
      if (!match) {
        return null;
      }

      const charAfterCursor = lineText.substring(position.character, position.character + 1);
      const closingParenHandling = charAfterCursor === ')' ? 'skip' : 'add';

      return this.createFlagCompletionItems('', closingParenHandling);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleOpenParen: ${errorMessage}`);
      return null;
    }
  }

  private handleComma(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const textBeforeComma = lineText.substring(0, position.character);

      // Match current_logtalk_flag(flag_name,
      const match = textBeforeComma.match(/current_logtalk_flag\(([a-z_]+),$/);
      if (!match) {
        return null;
      }

      const flagName = match[1];
      const charAfterCursor = lineText.substring(position.character, position.character + 1);
      const closingParenHandling: 'add' | 'skip' | 'none' = charAfterCursor === ')' ? 'skip' : 'add';

      // Triggered by comma - add space before value
      return this.createValueCompletionItems(flagName, '', closingParenHandling, true);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleComma: ${errorMessage}`);
      return null;
    }
  }

  private handleTypingInside(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const textBeforeCursor = lineText.substring(0, position.character);

      // Check if typing first argument (flag name)
      const flagMatch = textBeforeCursor.match(/current_logtalk_flag\(([a-z_]*)$/);
      if (flagMatch) {
        const partialText = flagMatch[1] || '';
        // If no partial text, let handleOpenParen handle it (avoids duplicates)
        if (partialText === '') {
          return null;
        }
        return this.createFlagCompletionItems(partialText, 'none');
      }

      // Check if typing second argument (value)
      const valueMatch = textBeforeCursor.match(/current_logtalk_flag\(([a-z_]+),\s*([a-z_]*)$/);
      if (valueMatch) {
        const flagName = valueMatch[1];
        const partialValue = valueMatch[2] || '';
        // If no partial value, let handleComma handle it (avoids duplicates)
        if (partialValue === '' && textBeforeCursor.match(/,\s*$/)) {
          return null;
        }
        // Typing inside - don't add space (already there from comma), don't handle paren
        return this.createValueCompletionItems(flagName, partialValue, 'none', false);
      }

      return null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleTypingInside: ${errorMessage}`);
      return null;
    }
  }

  private createFlagCompletionItems(partialText: string, closingParenHandling: 'add' | 'skip' | 'none'): CompletionItem[] {
    // All flags are available for current_logtalk_flag/2
    const filteredFlags = partialText
      ? LOGTALK_FLAGS.filter(f => f.name.startsWith(partialText.toLowerCase()))
      : LOGTALK_FLAGS;

    return filteredFlags.map((flag, index) => {
      const variableName = keyToVariableName(flag.name);
      const item = new CompletionItem(flag.name, CompletionItemKind.EnumMember);
      item.detail = flag.description;
      const documentation = new MarkdownString();
      documentation.appendCodeblock(`current_logtalk_flag(${flag.name}, ${variableName})`, 'logtalk');
      if (flag.values.length > 0) {
        documentation.appendText(`\nPossible values: ${flag.values.join(', ')}`);
      }
      if (flag.readOnly) {
        documentation.appendText('\n(Read-only flag)');
      }
      item.documentation = documentation;

      switch (closingParenHandling) {
        case 'skip':
          item.insertText = `${flag.name}, ${variableName}`;
          item.command = { command: 'cursorRight', title: 'Move cursor past closing paren' };
          break;
        case 'add':
          item.insertText = `${flag.name}, ${variableName})`;
          break;
        case 'none':
        default:
          item.insertText = flag.name;
          break;
      }

      item.sortText = String(index).padStart(3, '0');
      return item;
    });
  }

  private createValueCompletionItems(
    flagName: string,
    partialValue: string,
    closingParenHandling: 'add' | 'skip' | 'none',
    addLeadingSpace: boolean
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
      documentation.appendCodeblock(`current_logtalk_flag(${flagName}, ${value})`, 'logtalk');
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
}

/**
 * CompletionItemProvider for set_logtalk_flag/2 goals
 * Provides flag name completions for the first argument (writable flags only)
 * and value completions for the second argument
 */
export class SetLogtalkFlagCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): CompletionItem[] | null {
    // Check if triggered by "("
    if (context.triggerCharacter === '(') {
      return this.handleOpenParen(document, position);
    }

    // Check if triggered by ","
    if (context.triggerCharacter === ',') {
      return this.handleComma(document, position);
    }

    // If triggered by any trigger character, don't also handle as typing inside
    // (avoids duplicates from dual registration)
    if (context.triggerKind === CompletionTriggerKind.TriggerCharacter) {
      return null;
    }

    // Otherwise, check if we're typing inside set_logtalk_flag(...)
    return this.handleTypingInside(document, position);
  }

  private handleOpenParen(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const textBeforeParen = lineText.substring(0, position.character);

      const match = textBeforeParen.match(/set_logtalk_flag\($/);
      if (!match) {
        return null;
      }

      const charAfterCursor = lineText.substring(position.character, position.character + 1);
      const closingParenHandling = charAfterCursor === ')' ? 'skip' : 'add';

      return this.createFlagCompletionItems('', closingParenHandling);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleOpenParen: ${errorMessage}`);
      return null;
    }
  }

  private handleComma(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const textBeforeComma = lineText.substring(0, position.character);

      // Match set_logtalk_flag(flag_name,
      const match = textBeforeComma.match(/set_logtalk_flag\(([a-z_]+),$/);
      if (!match) {
        return null;
      }

      const flagName = match[1];
      const charAfterCursor = lineText.substring(position.character, position.character + 1);
      const closingParenHandling: 'add' | 'skip' | 'none' = charAfterCursor === ')' ? 'skip' : 'add';

      // Triggered by comma - add space before value
      return this.createValueCompletionItems(flagName, '', closingParenHandling, true);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleComma: ${errorMessage}`);
      return null;
    }
  }

  private handleTypingInside(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const textBeforeCursor = lineText.substring(0, position.character);

      // Check if typing first argument (flag name)
      const flagMatch = textBeforeCursor.match(/set_logtalk_flag\(([a-z_]*)$/);
      if (flagMatch) {
        const partialText = flagMatch[1] || '';
        // If no partial text, let handleOpenParen handle it (avoids duplicates)
        if (partialText === '') {
          return null;
        }
        return this.createFlagCompletionItems(partialText, 'none');
      }

      // Check if typing second argument (value)
      const valueMatch = textBeforeCursor.match(/set_logtalk_flag\(([a-z_]+),\s*([a-z_]*)$/);
      if (valueMatch) {
        const flagName = valueMatch[1];
        const partialValue = valueMatch[2] || '';
        // If no partial value, let handleComma handle it (avoids duplicates)
        if (partialValue === '' && textBeforeCursor.match(/,\s*$/)) {
          return null;
        }
        // Typing inside - don't add space (already there from comma), don't handle paren
        return this.createValueCompletionItems(flagName, partialValue, 'none', false);
      }

      return null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in handleTypingInside: ${errorMessage}`);
      return null;
    }
  }

  private createFlagCompletionItems(partialText: string, closingParenHandling: 'add' | 'skip' | 'none'): CompletionItem[] {
    // Only writable flags are available for set_logtalk_flag/2
    const writableFlags = LOGTALK_FLAGS.filter(f => !f.readOnly);
    const filteredFlags = partialText
      ? writableFlags.filter(f => f.name.startsWith(partialText.toLowerCase()))
      : writableFlags;

    return filteredFlags.map((flag, index) => {
      const item = new CompletionItem(flag.name, CompletionItemKind.EnumMember);
      item.detail = flag.description;
      const documentation = new MarkdownString();
      if (flag.values.length > 0) {
        documentation.appendText(`Possible values: ${flag.values.join(', ')}`);
      } else {
        documentation.appendText('Takes an arbitrary value');
      }
      item.documentation = documentation;

      switch (closingParenHandling) {
        case 'skip':
          item.insertText = `${flag.name}, `;
          // Don't move cursor, let user type value
          break;
        case 'add':
          item.insertText = `${flag.name}, `;
          break;
        case 'none':
        default:
          item.insertText = flag.name;
          break;
      }

      item.sortText = String(index).padStart(3, '0');
      return item;
    });
  }

  private createValueCompletionItems(
    flagName: string,
    partialValue: string,
    closingParenHandling: 'add' | 'skip' | 'none',
    addLeadingSpace: boolean
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
      documentation.appendCodeblock(`set_logtalk_flag(${flagName}, ${value})`, 'logtalk');
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

