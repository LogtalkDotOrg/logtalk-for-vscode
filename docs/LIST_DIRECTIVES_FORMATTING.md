# List Directives Formatting Implementation

## Overview

This document describes the implementation of comprehensive list directive formatting in the `LogtalkDocumentFormattingEditProvider`. The formatter now handles all major Logtalk directives that take a single list argument, providing consistent multi-line formatting with proper indentation.

## Directives Supported

### 1. Uses/1 Directive
Formats library import directives:
```logtalk
% Before:
:- uses([list, set, queue]).

% After:
	:- uses([
		list,
		set,
		queue
	]).
```

### 2. Use_module/1 Directive
Formats Prolog module import directives:
```logtalk
% Before:
:- use_module([library(lists), library(apply)]).

% After:
	:- use_module([
		library(lists),
		library(apply)
	]).
```

### 3. Use_module/2 Directive
Formats Prolog module import directives with specific predicates (same formatting as uses/2):
```logtalk
% Before:
:- use_module(library(lists), [member/2, append/3, reverse/2]).

% After:
	:- use_module(library(lists), [
		member/2,
		append/3,
		reverse/2
	]).
```

### 4. Scope Directives
Formats predicate visibility directives:

#### Public/1
```logtalk
% Before:
:- public([member/2, append/3, reverse/2]).

% After:
	:- public([
		member/2,
		append/3,
		reverse/2
	]).
```

#### Protected/1
```logtalk
% Before:
:- protected([helper_predicate/1, utility_function/2]).

% After:
	:- protected([
		helper_predicate/1,
		utility_function/2
	]).
```

#### Private/1
```logtalk
% Before:
:- private([internal_state/1, cache_data/2]).

% After:
	:- private([
		internal_state/1,
		cache_data/2
	]).
```

### 5. Predicate Property Directives
Formats predicate property declarations:

#### Dynamic/1
```logtalk
% Before:
:- dynamic([counter/1, cache/2, temporary_data/3]).

% After:
	:- dynamic([
		counter/1,
		cache/2,
		temporary_data/3
	]).
```

#### Discontiguous/1
```logtalk
% Before:
:- discontiguous([process/2, validate/1, transform/3]).

% After:
	:- discontiguous([
		process/2,
		validate/1,
		transform/3
	]).
```

#### Multifile/1
```logtalk
% Before:
:- multifile([hook_predicate/2, extension_point/1]).

% After:
	:- multifile([
		hook_predicate/2,
		extension_point/1
	]).
```

#### Synchronized/1
```logtalk
% Before:
:- synchronized([thread_safe_counter/1, shared_resource/2]).

% After:
	:- synchronized([
		thread_safe_counter/1,
		shared_resource/2
	]).
```

#### Coinductive/1
```logtalk
% Before:
:- coinductive([infinite_stream/1, lazy_list/2]).

% After:
	:- coinductive([
		infinite_stream/1,
		lazy_list/2
	]).
```

## Implementation Details

### Core Methods

1. **`formatUses1Directives()`** - Formats uses/1 directives
2. **`formatUseModuleDirectives()`** - Formats use_module/1 directives
3. **`formatUseModule2Directives()`** - Formats use_module/2 directives
4. **`formatScopeDirectives()`** - Formats public/1, protected/1, private/1 directives
5. **`formatPredicatePropertyDirectives()`** - Formats dynamic/1, discontiguous/1, etc.
6. **`formatListDirectiveContent()`** - Generic method for all list directive formatting
7. **`formatUseModule2DirectiveContent()`** - Specific method for use_module/2 directive formatting

### Generic Formatting Method

The `formatListDirectiveContent()` method provides consistent formatting for all list directives:

```typescript
private formatListDirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }, directiveName: string): string {
  // 1. Extract directive text
  // 2. Parse using regex pattern for the specific directive
  // 3. Use ArgumentUtils.parseArguments() for robust list parsing
  // 4. Format as multi-line with proper indentation
}
```

### Detection Patterns

Each directive type uses specific regex patterns for detection:

- **uses/1**: `/^:-\s+uses\s*\(\s*\[/`
- **use_module/1**: `/^:-\s+use_module\s*\(\s*\[/`
- **use_module/2**: `/^:-\s+use_module\(/`
- **Scope directives**: `/^:-\s+(public|protected|private)\s*\(\s*\[/`
- **Property directives**: `/^:-\s+(discontiguous|dynamic|coinductive|multifile|synchronized)\s*\(\s*\[/`

## Formatting Rules

### 1. Empty Lists
All empty lists remain single-line:
```logtalk
:- uses([]).
:- public([]).
:- dynamic([]).
```

### 2. Single Element Lists
Single elements are formatted as multi-line for consistency:
```logtalk
% Input:
:- uses([single_library]).

% Output:
	:- uses([
		single_library
	]).
```

### 3. Multiple Element Lists
Multiple elements are formatted as multi-line:
```logtalk
% Input:
:- public([pred1/1, pred2/2, pred3/3]).

% Output:
	:- public([
		pred1/1,
		pred2/2,
		pred3/3
	]).
```

### 4. Complex Predicate Indicators
Handles complex predicate indicators with modes and types:
```logtalk
% Input:
:- public([complex_predicate(+Type, -Result, ?Optional)]).

% Output:
	:- public([
		complex_predicate(+Type, -Result, ?Optional)
	]).
```

## Integration

### Registration in Main Formatting Flow

All list directive formatters are integrated into the main entity formatting sequence:

```typescript
// 8. Format uses/1 directives if present
this.formatUses1Directives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

// 9. Format use_module/1 directives if present
this.formatUseModuleDirectives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

// 10. Format scope directives (public/1, protected/1, private/1) if present
this.formatScopeDirectives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

// 11. Format predicate property directives if present
this.formatPredicatePropertyDirectives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);
```

### Robust Parsing

All list directive formatters use `ArgumentUtils.parseArguments()` for:
- **Complex predicate indicators** with nested parentheses
- **Library specifications** like `library(lists)`
- **Mode annotations** like `+Input`, `-Output`, `?Optional`
- **Quoted strings** and escape sequences
- **Mixed content** in lists

## Example Transformations

### Before Formatting
```logtalk
:- object(example).
:- uses([list, set, queue]).
:- public([member/2, append/3, reverse/2]).
:- dynamic([counter/1, cache/2]).
:- discontiguous([process/2, validate/1]).
:- end_object.
```

### After Formatting
```logtalk
:- object(example).
	:- uses([
		list,
		set,
		queue
	]).
	
	:- public([
		member/2,
		append/3,
		reverse/2
	]).
	
	:- dynamic([
		counter/1,
		cache/2
	]).
	
	:- discontiguous([
		process/2,
		validate/1
	]).
:- end_object.
```

## Benefits

1. **Consistent Code Style** - All list directives follow the same formatting pattern
2. **Improved Readability** - Multi-line formatting makes long lists easier to read
3. **Automatic Formatting** - No manual formatting required for any list directive
4. **Comprehensive Coverage** - Supports all major Logtalk list directives
5. **Robust Parsing** - Handles complex predicate indicators and library specifications
6. **Extensible Design** - Easy to add support for additional list directives

## Testing

Comprehensive test suite covers:
- All directive types (uses/1, use_module/1, scope, property)
- Single and multiple element lists
- Empty list handling
- Complex predicate indicators
- Library specifications
- Proper indentation and structure
- Mixed directive scenarios

## Relationship to Other Formatters

The list directive formatters complement existing formatters:
- **Info/1 directives** - Entity documentation
- **Info/2 directives** - Predicate documentation
- **Uses/2 directives** - Object imports with aliases
- **Alias/2 directives** - Predicate aliases
- **Entity directives** - Opening/closing entity declarations

All formatters use the same `ArgumentUtils.parseArguments()` utility and follow consistent indentation patterns, ensuring a unified formatting experience across all Logtalk directive types.
