# Alias/2 Directive Formatting Implementation

## Overview

This document describes the implementation of alias/2 directive formatting in the `LogtalkDocumentFormattingEditProvider`. Alias/2 directives create local aliases for predicates and non-terminals from other entities, allowing shorter or more convenient names to be used within the current entity.

## Features Implemented

### 1. Multi-line Formatting
All alias/2 directives with list content are formatted as multi-line with proper indentation:

```logtalk
% Before:
:- alias(collection, [member/2 as collection_member/2, append/3 as collection_append/3]).

% After:
	:- alias(collection, [
		member/2 as collection_member/2,
		append/3 as collection_append/3
	]).
```

### 2. Consistent Indentation
- **Directive prefix** starts with one tab indentation
- **List elements** are indented with two tabs
- **Closing bracket** aligns with the directive prefix

### 3. Support for All Alias Types
The formatter handles all types of aliases:
- **Predicate indicators** - `predicate/arity as alias/arity`
- **Non-terminal indicators** - `non_terminal//arity as alias//arity`
- **Mixed aliases** - Both predicates and non-terminals in the same directive

### 4. Robust Parsing
Uses `ArgumentUtils.parseArguments()` for reliable parsing of:
- **Compound terms** as first argument (e.g., `rectangle(_, _)`, `library(lists)`)
- **Complex predicate names** with special characters
- **Nested structures** in alias specifications
- **Quoted strings** and escape sequences
- **Mixed predicate and non-terminal indicators**

## Implementation Details

### Core Methods

1. **`formatAliasDirectives()`** - Main method that scans for alias/2 directives
2. **`formatAliasDirectiveContent()`** - Formats the complete directive structure

### Detection Pattern
```typescript
/^:-\s+alias\s*\(/.test(lineText)
```
This pattern identifies alias/2 directives for processing.

### Parsing Logic
```typescript
// Uses ArgumentUtils.parseArguments() to parse ALL directive arguments
const directiveArguments = ArgumentUtils.parseArguments(argumentsText);
const objectName = directiveArguments[0].trim();  // Handles compound terms
const listArgument = directiveArguments[1].trim();
// Then parses list content separately
const elements = ArgumentUtils.parseArguments(listContent);
```

## Formatting Rules

### 1. Empty Lists
```logtalk
% Input:
:- alias(empty_library, []).

% Output (stays single-line):
	:- alias(empty_library, []).
```

### 2. Single Element
```logtalk
% Input:
:- alias(single_library, [only_predicate/1 as lib_only_predicate/1]).

% Output (becomes multi-line):
	:- alias(single_library, [
		only_predicate/1 as lib_only_predicate/1
	]).
```

### 3. Multiple Elements
```logtalk
% Input:
:- alias(collection, [member/2 as collection_member/2, append/3 as collection_append/3]).

% Output (becomes multi-line):
	:- alias(collection, [
		member/2 as collection_member/2,
		append/3 as collection_append/3
	]).
```

### 4. Compound Terms as First Argument
```logtalk
% Input:
:- alias(rectangle(_, _), [width/1 as side/1]).

% Output (correctly parsed and formatted):
	:- alias(rectangle(_, _), [
		width/1 as side/1
	]).
```

## Example Transformations

### Before Formatting
```logtalk
:- alias(set, [member/2 as set_member/2, append/3 as set_append/3, reverse/2 as set_reverse/2]).

:- alias(words, [singular//0 as peculiar//0, plural//1 as strange//1]).

:- alias(mixed_library, [predicate/1 as lib_predicate/1, non_terminal//2 as lib_non_terminal//2]).
```

### After Formatting
```logtalk
	:- alias(set, [
		member/2 as set_member/2,
		append/3 as set_append/3,
		reverse/2 as set_reverse/2
	]).

	:- alias(words, [
		singular//0 as peculiar//0,
		plural//1 as strange//1
	]).

	:- alias(mixed_library, [
		predicate/1 as lib_predicate/1,
		non_terminal//2 as lib_non_terminal//2
	]).
```

## Alias Types Supported

### Predicate Aliases
```logtalk
	:- alias(list, [
		member/2 as list_member/2,
		append/3 as list_append/3,
		reverse/2 as list_reverse/2
	]).
```

### Non-terminal Aliases
```logtalk
	:- alias(grammar, [
		noun//1 as grammar_noun//1,
		verb//2 as grammar_verb//2,
		sentence//0 as grammar_sentence//0
	]).
```

### Mixed Aliases
```logtalk
	:- alias(utilities, [
		process/2 as util_process/2,
		parse//1 as util_parse//1,
		validate/1 as util_validate/1
	]).
```

## Integration

### Registration
The alias/2 directive formatting is integrated into the main formatting flow:

```typescript
// 6. Format uses/2 directives if present
this.formatUsesDirectives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

// 7. Format alias/2 directives if present
this.formatAliasDirectives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);
```

### Compatibility
- Works alongside existing directive formatting (info/1, info/2, uses/2)
- Uses the same `ArgumentUtils.parseArguments()` utility for consistency
- Follows the same indentation patterns as other directive formatters
- Handles both simple and complex alias specifications

## Testing

Comprehensive test suite covers:
- Multi-element alias formatting
- Single-element alias formatting
- Non-terminal indicator handling
- Mixed predicate and non-terminal aliases
- Empty list handling
- Proper indentation and structure

## Benefits

1. **Consistent Code Style** - Ensures all alias directives follow the same formatting standards
2. **Improved Readability** - Multi-line formatting makes complex alias lists easier to read
3. **Automatic Formatting** - Developers don't need to manually format complex alias directives
4. **Robust Parsing** - Uses battle-tested ArgumentUtils for reliable parsing
5. **Universal Support** - Works with all types of aliases (predicates, non-terminals, mixed)
6. **Integration** - Seamlessly works with other directive formatters

## Relationship to Uses/2 Directives

The alias/2 directive formatting follows the same patterns as uses/2 directive formatting:
- Both use multi-line formatting for list elements
- Both use consistent indentation (tabs)
- Both use `ArgumentUtils.parseArguments()` for robust parsing
- Both handle complex nested structures reliably

This ensures consistency across all list-based directive formatting in the Logtalk extension.
