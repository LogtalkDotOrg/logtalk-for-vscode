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
  TextDocument,
  workspace
} from "vscode";
import { getLogger } from "../utils/logger";
import { LOGTALK_SNIPPETS, ISnippetDictionary } from "../data/snippetsData";

/**
 * Logtalk keywords extracted from the syntax highlight tmLanguage file.
 * These are organized by category matching the tmLanguage scope names.
 */
interface LogtalkKeyword {
  name: string;
  category: string;
  description: string;
  hasParens: boolean;  // Whether this keyword requires parentheses
}

const LOGTALK_KEYWORDS: LogtalkKeyword[] = [
  // Control constructs (support.function.control.logtalk)
  { name: 'true', category: 'control', description: 'Always succeeds', hasParens: false },
  { name: 'fail', category: 'control', description: 'Always fails', hasParens: false },
  { name: 'false', category: 'control', description: 'Always fails (alias for fail)', hasParens: false },
  { name: 'repeat', category: 'control', description: 'Provides an infinite sequence of choice points', hasParens: false },
  { name: 'call', category: 'control', description: 'Meta-call predicate', hasParens: true },
  { name: 'catch', category: 'control', description: 'Catches exceptions thrown by throw/1', hasParens: true },
  { name: 'ignore', category: 'control', description: 'Calls goal once but always succeeds', hasParens: true },
  { name: 'throw', category: 'control', description: 'Throws an exception', hasParens: true },
  { name: 'once', category: 'control', description: 'Calls goal at most once', hasParens: true },
  { name: 'instantiation_error', category: 'control', description: 'Instantiation error term', hasParens: false },
  { name: 'system_error', category: 'control', description: 'System error term', hasParens: false },
  { name: 'type_error', category: 'control', description: 'Type error term', hasParens: true },
  { name: 'domain_error', category: 'control', description: 'Domain error term', hasParens: true },
  { name: 'consistency_error', category: 'control', description: 'Consistency error term', hasParens: true },
  { name: 'existence_error', category: 'control', description: 'Existence error term', hasParens: true },
  { name: 'permission_error', category: 'control', description: 'Permission error term', hasParens: true },
  { name: 'representation_error', category: 'control', description: 'Representation error term', hasParens: true },
  { name: 'evaluation_error', category: 'control', description: 'Evaluation error term', hasParens: true },
  { name: 'resource_error', category: 'control', description: 'Resource error term', hasParens: true },
  { name: 'syntax_error', category: 'control', description: 'Syntax error term', hasParens: true },
  { name: 'uninstantiation_error', category: 'control', description: 'Uninstantiation error term', hasParens: true },

  // Evaluable functors (support.function.evaluable.logtalk)
  { name: 'abs', category: 'arithmetic', description: 'Absolute value', hasParens: true },
  { name: 'acos', category: 'arithmetic', description: 'Arc cosine', hasParens: true },
  { name: 'asin', category: 'arithmetic', description: 'Arc sine', hasParens: true },
  { name: 'atan', category: 'arithmetic', description: 'Arc tangent', hasParens: true },
  { name: 'atan2', category: 'arithmetic', description: 'Arc tangent of Y/X', hasParens: true },
  { name: 'ceiling', category: 'arithmetic', description: 'Ceiling function', hasParens: true },
  { name: 'cos', category: 'arithmetic', description: 'Cosine', hasParens: true },
  { name: 'div', category: 'arithmetic', description: 'Integer division', hasParens: true },
  { name: 'exp', category: 'arithmetic', description: 'Exponential', hasParens: true },
  { name: 'float', category: 'arithmetic', description: 'Float conversion', hasParens: true },
  { name: 'float_integer_part', category: 'arithmetic', description: 'Integer part of float', hasParens: true },
  { name: 'float_fractional_part', category: 'arithmetic', description: 'Fractional part of float', hasParens: true },
  { name: 'floor', category: 'arithmetic', description: 'Floor function', hasParens: true },
  { name: 'log', category: 'arithmetic', description: 'Natural logarithm', hasParens: true },
  { name: 'max', category: 'arithmetic', description: 'Maximum of two numbers', hasParens: true },
  { name: 'min', category: 'arithmetic', description: 'Minimum of two numbers', hasParens: true },
  { name: 'mod', category: 'arithmetic', description: 'Modulo operation', hasParens: true },
  { name: 'rem', category: 'arithmetic', description: 'Remainder operation', hasParens: true },
  { name: 'round', category: 'arithmetic', description: 'Round to nearest integer', hasParens: true },
  { name: 'sign', category: 'arithmetic', description: 'Sign of a number', hasParens: true },
  { name: 'sin', category: 'arithmetic', description: 'Sine', hasParens: true },
  { name: 'sqrt', category: 'arithmetic', description: 'Square root', hasParens: true },
  { name: 'tan', category: 'arithmetic', description: 'Tangent', hasParens: true },
  { name: 'truncate', category: 'arithmetic', description: 'Truncate to integer', hasParens: true },
  { name: 'xor', category: 'arithmetic', description: 'Bitwise exclusive or', hasParens: true },
  { name: 'e', category: 'arithmetic', description: 'Euler\'s number', hasParens: false },
  { name: 'pi', category: 'arithmetic', description: 'Mathematical constant pi', hasParens: false },

  // Chars and bytes I/O (support.function.chars-and-bytes-io.logtalk)
  { name: 'get_char', category: 'io', description: 'Read a character', hasParens: true },
  { name: 'get_code', category: 'io', description: 'Read a character code', hasParens: true },
  { name: 'get_byte', category: 'io', description: 'Read a byte', hasParens: true },
  { name: 'peek_char', category: 'io', description: 'Peek at next character', hasParens: true },
  { name: 'peek_code', category: 'io', description: 'Peek at next character code', hasParens: true },
  { name: 'peek_byte', category: 'io', description: 'Peek at next byte', hasParens: true },
  { name: 'put_char', category: 'io', description: 'Write a character', hasParens: true },
  { name: 'put_code', category: 'io', description: 'Write a character code', hasParens: true },
  { name: 'put_byte', category: 'io', description: 'Write a byte', hasParens: true },
  { name: 'nl', category: 'io', description: 'Write a newline', hasParens: false },

  // Atom and term processing (support.function.atom-term-processing.logtalk)
  { name: 'atom_length', category: 'atom', description: 'Get length of an atom', hasParens: true },
  { name: 'atom_chars', category: 'atom', description: 'Convert atom to/from character list', hasParens: true },
  { name: 'atom_concat', category: 'atom', description: 'Concatenate atoms', hasParens: true },
  { name: 'atom_codes', category: 'atom', description: 'Convert atom to/from code list', hasParens: true },
  { name: 'sub_atom', category: 'atom', description: 'Extract sub-atom', hasParens: true },
  { name: 'char_code', category: 'atom', description: 'Convert character to/from code', hasParens: true },
  { name: 'number_chars', category: 'atom', description: 'Convert number to/from character list', hasParens: true },
  { name: 'number_codes', category: 'atom', description: 'Convert number to/from code list', hasParens: true },

  // Term testing (support.function.term-testing.logtalk)
  { name: 'var', category: 'term-testing', description: 'Test if term is a variable', hasParens: true },
  { name: 'atom', category: 'term-testing', description: 'Test if term is an atom', hasParens: true },
  { name: 'atomic', category: 'term-testing', description: 'Test if term is atomic', hasParens: true },
  { name: 'integer', category: 'term-testing', description: 'Test if term is an integer', hasParens: true },
  { name: 'float', category: 'term-testing', description: 'Test if term is a float', hasParens: true },
  { name: 'callable', category: 'term-testing', description: 'Test if term is callable', hasParens: true },
  { name: 'compound', category: 'term-testing', description: 'Test if term is compound', hasParens: true },
  { name: 'nonvar', category: 'term-testing', description: 'Test if term is not a variable', hasParens: true },
  { name: 'number', category: 'term-testing', description: 'Test if term is a number', hasParens: true },
  { name: 'ground', category: 'term-testing', description: 'Test if term is ground', hasParens: true },
  { name: 'acyclic_term', category: 'term-testing', description: 'Test if term is acyclic', hasParens: true },

  // Term comparison (support.function.term-comparison.logtalk)
  { name: 'compare', category: 'term-comparison', description: 'Compare two terms', hasParens: true },

  // Term I/O (support.function.term-io.logtalk)
  { name: 'read', category: 'term-io', description: 'Read a term', hasParens: true },
  { name: 'read_term', category: 'term-io', description: 'Read a term with options', hasParens: true },
  { name: 'write', category: 'term-io', description: 'Write a term', hasParens: true },
  { name: 'writeq', category: 'term-io', description: 'Write a term quoted', hasParens: true },
  { name: 'write_canonical', category: 'term-io', description: 'Write a term in canonical form', hasParens: true },
  { name: 'write_term', category: 'term-io', description: 'Write a term with options', hasParens: true },
  { name: 'current_char_conversion', category: 'term-io', description: 'Query character conversion', hasParens: true },
  { name: 'char_conversion', category: 'term-io', description: 'Define character conversion', hasParens: true },
  { name: 'current_op', category: 'term-io', description: 'Query current operator', hasParens: true },
  { name: 'op', category: 'term-io', description: 'Define an operator', hasParens: true },

  // Term creation and decomposition (support.function.term-creation-and-decomposition.logtalk)
  { name: 'arg', category: 'term', description: 'Access argument of compound term', hasParens: true },
  { name: 'copy_term', category: 'term', description: 'Copy a term', hasParens: true },
  { name: 'functor', category: 'term', description: 'Get/construct functor', hasParens: true },
  { name: 'numbervars', category: 'term', description: 'Number variables in a term', hasParens: true },
  { name: 'term_variables', category: 'term', description: 'Get variables in a term', hasParens: true },

  // Term unification (support.function.term-unification.logtalk)
  { name: 'subsumes_term', category: 'unification', description: 'Test if term subsumes another', hasParens: true },
  { name: 'unify_with_occurs_check', category: 'unification', description: 'Unify with occurs check', hasParens: true },

  // Stream selection and control (support.function.stream-selection-and-control.logtalk)
  { name: 'set_input', category: 'stream', description: 'Set current input stream', hasParens: true },
  { name: 'set_output', category: 'stream', description: 'Set current output stream', hasParens: true },
  { name: 'current_input', category: 'stream', description: 'Get current input stream', hasParens: true },
  { name: 'current_output', category: 'stream', description: 'Get current output stream', hasParens: true },
  { name: 'open', category: 'stream', description: 'Open a stream', hasParens: true },
  { name: 'close', category: 'stream', description: 'Close a stream', hasParens: true },
  { name: 'flush_output', category: 'stream', description: 'Flush output stream', hasParens: false },
  { name: 'stream_property', category: 'stream', description: 'Query stream property', hasParens: true },
  { name: 'at_end_of_stream', category: 'stream', description: 'Test if at end of stream', hasParens: false },
  { name: 'set_stream_position', category: 'stream', description: 'Set stream position', hasParens: true },

  // Prolog flags (support.function.prolog-flags.logtalk)
  { name: 'set_prolog_flag', category: 'flag', description: 'Set Prolog flag value', hasParens: true },
  { name: 'current_prolog_flag', category: 'flag', description: 'Query Prolog flag value', hasParens: true },

  // Compiling and loading (support.function.compiling-and-loading.logtalk)
  { name: 'logtalk_compile', category: 'loading', description: 'Compile Logtalk source files', hasParens: true },
  { name: 'logtalk_library_path', category: 'loading', description: 'Library alias path', hasParens: true },
  { name: 'logtalk_load', category: 'loading', description: 'Load Logtalk source files', hasParens: true },
  { name: 'logtalk_load_context', category: 'loading', description: 'Access compilation context', hasParens: true },
  { name: 'logtalk_make', category: 'loading', description: 'Make target', hasParens: false },
  { name: 'logtalk_make_target_action', category: 'loading', description: 'Make target action', hasParens: true },

  // Event handling (support.function.event-handling.logtalk)
  { name: 'abolish_events', category: 'events', description: 'Abolish matching events', hasParens: true },
  { name: 'define_events', category: 'events', description: 'Define events', hasParens: true },
  { name: 'current_event', category: 'events', description: 'Query current events', hasParens: true },

  // Implementation-defined hooks (support.function.implementation-defined-hooks.logtalk)
  { name: 'create_logtalk_flag', category: 'hook', description: 'Create a new Logtalk flag', hasParens: true },
  { name: 'current_logtalk_flag', category: 'hook', description: 'Query Logtalk flag value', hasParens: true },
  { name: 'set_logtalk_flag', category: 'hook', description: 'Set Logtalk flag value', hasParens: true },
  { name: 'halt', category: 'hook', description: 'Halt Prolog execution', hasParens: false },

  // Sorting (support.function.sorting.logtalk)
  { name: 'sort', category: 'sorting', description: 'Sort a list removing duplicates', hasParens: true },
  { name: 'keysort', category: 'sorting', description: 'Sort key-value pairs by key', hasParens: true },

  // Entity creation and abolishing (support.function.entity-creation-and-abolishing.logtalk)
  { name: 'create_object', category: 'entity', description: 'Create a dynamic object', hasParens: true },
  { name: 'create_protocol', category: 'entity', description: 'Create a dynamic protocol', hasParens: true },
  { name: 'create_category', category: 'entity', description: 'Create a dynamic category', hasParens: true },
  { name: 'current_object', category: 'entity', description: 'Enumerate/check objects', hasParens: true },
  { name: 'current_protocol', category: 'entity', description: 'Enumerate/check protocols', hasParens: true },
  { name: 'current_category', category: 'entity', description: 'Enumerate/check categories', hasParens: true },
  { name: 'abolish_object', category: 'entity', description: 'Abolish a dynamic object', hasParens: true },
  { name: 'abolish_protocol', category: 'entity', description: 'Abolish a dynamic protocol', hasParens: true },
  { name: 'abolish_category', category: 'entity', description: 'Abolish a dynamic category', hasParens: true },

  // Reflection (support.function.reflection.logtalk)
  { name: 'object_property', category: 'reflection', description: 'Query object property', hasParens: true },
  { name: 'protocol_property', category: 'reflection', description: 'Query protocol property', hasParens: true },
  { name: 'category_property', category: 'reflection', description: 'Query category property', hasParens: true },
  { name: 'complements_object', category: 'reflection', description: 'Query complementing category', hasParens: true },
  { name: 'conforms_to_protocol', category: 'reflection', description: 'Query protocol conformance', hasParens: true },
  { name: 'extends_object', category: 'reflection', description: 'Query object extension', hasParens: true },
  { name: 'extends_protocol', category: 'reflection', description: 'Query protocol extension', hasParens: true },
  { name: 'extends_category', category: 'reflection', description: 'Query category extension', hasParens: true },
  { name: 'imports_category', category: 'reflection', description: 'Query category import', hasParens: true },
  { name: 'implements_protocol', category: 'reflection', description: 'Query protocol implementation', hasParens: true },
  { name: 'instantiates_class', category: 'reflection', description: 'Query class instantiation', hasParens: true },
  { name: 'specializes_class', category: 'reflection', description: 'Query class specialization', hasParens: true },
  { name: 'current_predicate', category: 'reflection', description: 'Enumerate visible predicates', hasParens: true },
  { name: 'predicate_property', category: 'reflection', description: 'Query predicate property', hasParens: true },

  // All solutions (support.function.all-solutions.logtalk)
  { name: 'bagof', category: 'solutions', description: 'Collect solutions as a bag', hasParens: true },
  { name: 'setof', category: 'solutions', description: 'Collect solutions as a set', hasParens: true },
  { name: 'findall', category: 'solutions', description: 'Find all solutions', hasParens: true },
  { name: 'forall', category: 'solutions', description: 'For all solutions, goal succeeds', hasParens: true },

  // Database (support.function.database.logtalk)
  { name: 'abolish', category: 'database', description: 'Abolish a predicate', hasParens: true },
  { name: 'asserta', category: 'database', description: 'Assert clause at beginning', hasParens: true },
  { name: 'assertz', category: 'database', description: 'Assert clause at end', hasParens: true },
  { name: 'clause', category: 'database', description: 'Access clause', hasParens: true },
  { name: 'retract', category: 'database', description: 'Retract a clause', hasParens: true },
  { name: 'retractall', category: 'database', description: 'Retract all matching clauses', hasParens: true },

  // Multi-threading (support.function.multi-threading.logtalk)
  { name: 'threaded', category: 'threading', description: 'Prove goals in threads', hasParens: true },
  { name: 'threaded_call', category: 'threading', description: 'Make asynchronous call', hasParens: true },
  { name: 'threaded_cancel', category: 'threading', description: 'Cancel asynchronous call', hasParens: true },
  { name: 'threaded_once', category: 'threading', description: 'Make asynchronous deterministic call', hasParens: true },
  { name: 'threaded_ignore', category: 'threading', description: 'Make asynchronous call ignoring result', hasParens: true },
  { name: 'threaded_exit', category: 'threading', description: 'Get result of asynchronous call', hasParens: true },
  { name: 'threaded_peek', category: 'threading', description: 'Peek at asynchronous call result', hasParens: true },
  { name: 'threaded_wait', category: 'threading', description: 'Wait for notification', hasParens: true },
  { name: 'threaded_notify', category: 'threading', description: 'Send notification', hasParens: true },

  // Engines (support.function.engines.logtalk)
  { name: 'threaded_engine', category: 'engines', description: 'Query engine existence', hasParens: true },
  { name: 'threaded_engine_create', category: 'engines', description: 'Create an engine', hasParens: true },
  { name: 'threaded_engine_destroy', category: 'engines', description: 'Destroy an engine', hasParens: true },
  { name: 'threaded_engine_self', category: 'engines', description: 'Get engine identifier', hasParens: true },
  { name: 'threaded_engine_next', category: 'engines', description: 'Get next engine answer', hasParens: true },
  { name: 'threaded_engine_next_reified', category: 'engines', description: 'Get next engine answer reified', hasParens: true },
  { name: 'threaded_engine_yield', category: 'engines', description: 'Yield engine answer', hasParens: true },
  { name: 'threaded_engine_post', category: 'engines', description: 'Post term to engine', hasParens: true },
  { name: 'threaded_engine_fetch', category: 'engines', description: 'Fetch term from engine', hasParens: true },

  // Event handlers (support.function.event-handler.logtalk)
  { name: 'before', category: 'event-handler', description: 'Before event handler', hasParens: true },
  { name: 'after', category: 'event-handler', description: 'After event handler', hasParens: true },

  // Message forwarding handler (support.function.message-forwarding-handler.logtalk)
  { name: 'forward', category: 'forwarding', description: 'Message forwarding handler', hasParens: true },

  // Grammar rules (support.function.grammar-rule.logtalk)
  { name: 'expand_goal', category: 'grammar', description: 'Expand a goal', hasParens: true },
  { name: 'expand_term', category: 'grammar', description: 'Expand a term', hasParens: true },
  { name: 'goal_expansion', category: 'grammar', description: 'Goal expansion hook', hasParens: true },
  { name: 'term_expansion', category: 'grammar', description: 'Term expansion hook', hasParens: true },
  { name: 'phrase', category: 'grammar', description: 'Apply grammar rule', hasParens: true },

  // Execution context (support.function.execution-context.logtalk)
  { name: 'context', category: 'context', description: 'Execution context', hasParens: true },
  { name: 'parameter', category: 'context', description: 'Entity parameter', hasParens: true },
  { name: 'self', category: 'context', description: 'Self reference', hasParens: true },
  { name: 'sender', category: 'context', description: 'Message sender', hasParens: true },
  { name: 'this', category: 'context', description: 'This reference', hasParens: true },

  // Entity relations (storage.type.relations.logtalk)
  { name: 'complements', category: 'relation', description: 'Category complements object', hasParens: true },
  { name: 'extends', category: 'relation', description: 'Entity extension', hasParens: true },
  { name: 'instantiates', category: 'relation', description: 'Object instantiates class', hasParens: true },
  { name: 'imports', category: 'relation', description: 'Entity imports category', hasParens: true },
  { name: 'implements', category: 'relation', description: 'Entity implements protocol', hasParens: true },
  { name: 'specializes', category: 'relation', description: 'Class specializes class', hasParens: true },
];

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
 * Provider for Logtalk code snippets
 * Handles all snippets previously defined in logtalk.json
 */
export class LogtalkSnippetCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();
  private snippets: ISnippetDictionary;

  constructor() {
    this.snippets = LOGTALK_SNIPPETS;
  }

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    _context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    try {
      const lineText = document.lineAt(position.line).text;
      const textBeforeCursor = lineText.substring(0, position.character);

      // Check if we're in a context suitable for directive snippets
      const isDirectiveContext = /^\s*$/.test(textBeforeCursor) || /^\s*:-/.test(textBeforeCursor);

      // Extract the word being typed at the cursor position for case-sensitive filtering
      // For directive snippets, extract text after ":-"
      // For regular snippets, extract the current word
      let typedPrefix = '';
      if (isDirectiveContext && /^\s*:-/.test(textBeforeCursor)) {
        // Extract text after ":-" for directive context
        const directiveMatch = textBeforeCursor.match(/:-\s*(.*)$/);
        typedPrefix = directiveMatch ? directiveMatch[1] : '';
      } else {
        // Extract the current word being typed (alphanumeric and underscore characters)
        const wordMatch = textBeforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
        typedPrefix = wordMatch ? wordMatch[1] : '';
      }

      const completionItems: CompletionItem[] = [];

      for (const [key, snippet] of Object.entries(this.snippets)) {
        // Directive snippets (prefix starts with ":-") should only be offered
        // when there's only whitespace before the cursor or before ":-"
        if (snippet.prefix.startsWith(':-')) {
          if (!isDirectiveContext) {
            continue; // Skip directive snippets in non-directive contexts
          }
          // For directive snippets, get the prefix part after ":-" for matching
          const snippetPrefixAfterDirective = snippet.prefix.substring(2).trimStart();
          // Case-sensitive filtering for directive snippets
          if (typedPrefix && !snippetPrefixAfterDirective.startsWith(typedPrefix)) {
            continue;
          }
        } else {
          // Non-directive snippets should NOT be offered in directive contexts
          if (isDirectiveContext && /^\s*:-/.test(textBeforeCursor)) {
            continue; // Skip non-directive snippets when user has typed ":-"
          }
          // Case-sensitive filtering for regular snippets
          if (typedPrefix && !snippet.prefix.startsWith(typedPrefix)) {
            continue;
          }
        }

        const item = new CompletionItem(snippet.prefix, CompletionItemKind.Snippet);
        item.insertText = new SnippetString(snippet.body);

        // Set filterText to ensure case-sensitive matching by VS Code
        item.filterText = snippet.prefix;

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
}

/**
 * Provider for Logtalk keywords extracted from syntax highlighting
 * Provides completion items for all Logtalk built-in predicates and keywords
 */
export class LogtalkKeywordCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    _context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    try {
      const lineText = document.lineAt(position.line).text;
      const textBeforeCursor = lineText.substring(0, position.character);

      // Respect user's editor.quickSuggestions setting for strings and comments
      const editorConfig = workspace.getConfiguration('editor', document.uri);
      const quickSuggestions = editorConfig.get<{ strings?: boolean; comments?: boolean; other?: boolean }>('quickSuggestions');

      // Check if we're inside a string and if completions are disabled for strings
      if (this.isInsideString(textBeforeCursor)) {
        if (quickSuggestions && quickSuggestions.strings === false) {
          return [];
        }
      }

      // Check if we're inside a comment and if completions are disabled for comments
      if (this.isInsideComment(document, position)) {
        if (quickSuggestions && quickSuggestions.comments === false) {
          return [];
        }
      }

      // Extract the partial word being typed
      const wordMatch = textBeforeCursor.match(/([a-z_][a-z0-9_]*)$/i);
      const partialWord = wordMatch ? wordMatch[1].toLowerCase() : '';

      // Filter keywords that match the partial word
      const filteredKeywords = LOGTALK_KEYWORDS.filter(kw =>
        kw.name.toLowerCase().startsWith(partialWord)
      );

      // Create completion items
      const completionItems: CompletionItem[] = filteredKeywords.map((keyword, index) => {
        const item = new CompletionItem(
          keyword.name,
          CompletionItemKind.Keyword
        );

        item.detail = `${keyword.category}: ${keyword.description}`;

        // Create documentation
        const documentation = new MarkdownString();
        documentation.appendText(`**Category:** ${keyword.category}\n\n`);
        documentation.appendText(keyword.description);
        if (keyword.hasParens) {
          documentation.appendText('\n\n');
          documentation.appendCodeblock(`${keyword.name}(...)`, 'logtalk');
        }
        item.documentation = documentation;

        // Insert text with parentheses and cursor positioning for predicates
        if (keyword.hasParens) {
          item.insertText = new SnippetString(`${keyword.name}($1)$0`);
        } else {
          item.insertText = keyword.name;
        }

        // Sorting: prioritize exact prefix matches
        item.sortText = String(index).padStart(4, '0');

        return item;
      });

      this.logger.debug(`Keyword completion: suggesting ${completionItems.length} items for "${partialWord}"`);
      return completionItems;
    } catch (error: any) {
      this.logger.error(`Error in LogtalkKeywordCompletionProvider: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if the cursor is inside a string literal
   */
  private isInsideString(textBeforeCursor: string): boolean {
    // Count unescaped single and double quotes
    let singleQuotes = 0;
    let doubleQuotes = 0;
    for (let i = 0; i < textBeforeCursor.length; i++) {
      const char = textBeforeCursor[i];
      const prevChar = i > 0 ? textBeforeCursor[i - 1] : '';
      if (char === "'" && prevChar !== '\\') {
        singleQuotes++;
      } else if (char === '"' && prevChar !== '\\') {
        doubleQuotes++;
      }
    }
    // Odd number of quotes means we're inside a string
    return (singleQuotes % 2 !== 0) || (doubleQuotes % 2 !== 0);
  }

  /**
   * Check if the cursor is inside a comment
   */
  private isInsideComment(document: TextDocument, position: Position): boolean {
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, position.character);

    // Check for line comment (%)
    const percentIndex = textBeforeCursor.indexOf('%');
    if (percentIndex !== -1) {
      // Make sure it's not inside a string
      const textBeforePercent = textBeforeCursor.substring(0, percentIndex);
      if (!this.isInsideString(textBeforePercent)) {
        return true;
      }
    }

    // Check for block comment /* ... */
    // This is a simplified check - we look backwards from current position
    const fullTextBefore = document.getText(new Range(0, 0, position.line, position.character));
    const lastBlockCommentStart = fullTextBefore.lastIndexOf('/*');
    const lastBlockCommentEnd = fullTextBefore.lastIndexOf('*/');

    if (lastBlockCommentStart !== -1 && lastBlockCommentStart > lastBlockCommentEnd) {
      return true;
    }

    return false;
  }
}
