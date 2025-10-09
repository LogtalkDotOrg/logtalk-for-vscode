# Logtalk Document Formatting Edit Provider Implementation

## Overview

This document describes the implementation of the `LogtalkDocumentFormattingEditProvider` class that provides automatic formatting for Logtalk source files in VS Code.

## Features Implemented

### 1. Entity Opening and Closing Directives Formatting
- **Entity opening directives** (`:- object(...)`, `:- protocol(...)`, `:- category(...)`) are formatted to start at the first character position (column 0)
- **Multi-argument entity directives** are formatted as multi-line with relations indented:
  ```logtalk
  :- object(complex_object,
  	implements(protocol1),
  	imports(category1),
  	extends(parent_object)).
  ```
- **Single-argument or simple directives** remain single-line for readability
- **Empty line** is ensured after the opening directive
- **Entity closing directives** (`:- end_object.`, etc.) start at column 0 with an empty line after

### 2. Content Indentation
- All code and line comments inside entity opening and closing directives are indented by one tab
- **Space-to-tab conversion** - Converts space-based indentation to tabs using tab size setting
- **Mixed indentation normalization** - Handles combinations of tabs and spaces
- **Respects tab size settings** - Uses FormattingOptions.tabSize for conversion
- Preserves existing structure while ensuring consistent indentation
- Skips empty lines to avoid unnecessary modifications

### 3. Info/1 Directive Formatting
- Formats the `info/1` directive with proper indentation structure:
  ```logtalk
  	:- info([
  		version is 1:0:0,
  		author is 'Author Name',
  		date is 2024-01-01,
  		comment is 'Description'
  	]).
  ```
- Adds an empty line after the info/1 directive
- Parses list elements and formats each on its own line with proper indentation

### 4. Info/2 Directive Formatting
- Formats predicate-specific `info/2` directives with proper indentation:
  ```logtalk
  	:- info(predicate/3, [
  		comment is 'Predicate description',
  		argnames is ['Arg1', 'Arg2', 'Arg3'],
  		arguments is [
  			'Arg1'-'Description of first argument',
  			'Arg2'-'Description of second argument',
  			'Arg3'-'Description of third argument'
  		],
  		examples is [
  			'predicate(a, b, c) - Basic usage',
  			'predicate([], [], []) - Empty case'
  		]
  	]).
  ```
- **Special handling** for `arguments`, `exceptions`, and `examples` keys that contain lists
- **Nested indentation** for multi-element lists within these special keys
- **Single-line preservation** for single-element lists in special keys

### 5. Uses/2 Directive Formatting
- Formats `uses/2` directives with proper list indentation:
  ```logtalk
  	:- uses(object_name, [
  		predicate1/2,
  		predicate2/3,
  		callable_form(+arg, -result)
  	]).
  ```
- Handles both simple single-line and complex multi-line uses directives
- Preserves mixed predicate indicator and callable form syntax

### 6. Alias/2 Directive Formatting
- Formats `alias/2` directives with proper list indentation:
  ```logtalk
  	:- alias(collection, [
  		member/2 as collection_member/2,
  		append/3 as collection_append/3
  	]).
  ```
- **Multi-line formatting** for all alias directives
- **Support for all alias types** - predicates, non-terminals, and mixed

### 7. Multiple Entity Support
- **Formats ALL entities** in a single source file
- **Supports mixed entity types** - objects, protocols, and categories in the same file
- **Proper entity matching** - correctly pairs opening and closing directives
- **Independent formatting** - each entity is formatted independently with its own directives

### 8. List Directive Formatting
- **Uses/1 directives** - Library imports with multi-line formatting
- **Use_module/1 directives** - Prolog module imports with multi-line formatting
- **Use_module/2 directives** - Prolog module imports with specific predicates (same as uses/2)
- **Scope directives** - public/1, protected/1, private/1 with multi-line formatting
- **Property directives** - dynamic/1, discontiguous/1, multifile/1, synchronized/1, coinductive/1 with multi-line formatting
- **Consistent formatting** - All list directives follow the same multi-line pattern

## Implementation Details

### Core Components

1. **`LogtalkDocumentFormattingEditProvider`** - Main class implementing VS Code's `DocumentFormattingEditProvider` interface

2. **Key Methods:**
   - `provideDocumentFormattingEdits()` - Main entry point for formatting
   - `findAllEntityDirectives()` - Locates ALL entity opening and closing directives in the document
   - `formatEntityOpeningDirective()` - Formats entity opening with proper structure
   - `formatEntityOpeningDirectiveContent()` - Handles multi-line entity directive formatting
   - `parseEntityRelations()` - Parses entity relations for multi-line formatting
   - `formatEntityClosingDirective()` - Ensures closing directive formatting
   - `indentEntityContent()` - Applies consistent indentation to entity content
   - `formatInfoDirective()` - Specialized formatting for info/1 directives
   - `formatInfo2Directives()` - Specialized formatting for info/2 directives
   - `formatInfo2Element()` - Handles special list keys in info/2 directives
   - `formatUsesDirectives()` - Specialized formatting for uses/2 directives
   - `formatAliasDirectives()` - Specialized formatting for alias/2 directives
   - `formatUses1Directives()` - Specialized formatting for uses/1 directives
   - `formatUseModuleDirectives()` - Specialized formatting for use_module/1 directives
   - `formatUseModule2Directives()` - Specialized formatting for use_module/2 directives
   - `formatScopeDirectives()` - Specialized formatting for public/1, protected/1, private/1 directives
   - `formatPredicatePropertyDirectives()` - Specialized formatting for dynamic/1, discontiguous/1, etc.
   - `formatListDirectiveContent()` - Generic method for all list directive formatting
   - Uses `ArgumentUtils.parseArguments()` - Robust utility for parsing complex list structures

### Integration

The provider is registered in `src/extension.ts`:
```typescript
context.subscriptions.push(
  languages.registerDocumentFormattingEditProvider(LOGTALK_MODE, new LogtalkDocumentFormattingEditProvider())
);
```

### Dependencies

- Uses existing `PredicateUtils.getDirectiveRange()` function for accurate directive boundary detection
- Integrates with the existing logger utility for debugging
- Follows established patterns from other providers in the codebase

## Usage

Users can format Logtalk documents using:
- **Command Palette**: "Format Document" command
- **Keyboard Shortcut**: Shift+Alt+F (or Cmd+Shift+P on Mac)
- **Right-click context menu**: "Format Document" option

## Example Transformation

**Before formatting:**
```logtalk
:- object(test_formatting,
implements(some_protocol),
imports(some_category)).
:- info([
version is 1:0:0,
author is 'Test Author',
comment is 'Test object'
]).
:- uses(list, [append/3, member/2]).
test_predicate(X) :-
write('Testing: '), write(X), nl.
:- end_object.
```

**After formatting:**
```logtalk
:- object(test_formatting,
	implements(some_protocol),
	imports(some_category)).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		comment is 'Test object'
	]).

	:- uses(list, [append/3, member/2]).

	test_predicate(X) :-
		write('Testing: '), write(X), nl.

:- end_object.

```

## Testing

Comprehensive test suite in `tests/documentFormattingEditProvider.test.ts` covers:
- Basic formatting functionality
- Entity directive formatting
- Info directive formatting with proper indentation
- Uses directive formatting with list elements
- Content indentation within entities
- Handling of documents without entity directives

## Error Handling

- Graceful handling of malformed directives
- Skips formatting for documents without entity directives
- Comprehensive error logging for debugging
- Preserves original content when parsing fails

## Future Enhancements

Potential areas for future improvement:
- Support for additional directive types (mode/2, meta_predicate/1, etc.)
- Configurable indentation preferences (tabs vs spaces)
- More sophisticated comment formatting
- Integration with Logtalk coding style guidelines
