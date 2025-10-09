# Info/2 Directive Formatting Implementation

## Overview

This document describes the implementation of info/2 directive formatting in the `LogtalkDocumentFormattingEditProvider`. Info/2 directives are predicate-specific documentation directives that provide detailed information about individual predicates.

## Features Implemented

### 1. Info/2 Directive Detection and Formatting
- **Automatic detection** of info/2 directives (e.g., `:- info(predicate/arity, [...]).`)
- **Multi-line formatting** with proper indentation structure
- **Consistent formatting** similar to uses/2 directives

### 2. Special List Key Handling
The formatter provides special handling for three specific keys that contain lists:
- **`arguments`** - Predicate argument descriptions
- **`exceptions`** - Exception specifications  
- **`examples`** - Usage examples

### 3. Nested List Formatting
When `arguments`, `exceptions`, or `examples` keys contain multiple list elements, they are formatted with proper nested indentation:

```logtalk
	:- info(predicate/3, [
		comment is 'Description',
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

## Implementation Details

### Core Methods

1. **`formatInfo2Directives()`** - Main method that scans for info/2 directives
2. **`formatInfo2DirectiveContent()`** - Formats the complete directive structure
3. **`formatInfo2Element()`** - Handles individual list elements with special processing for list keys

### Detection Pattern
```typescript
/^:-\s+info\s*\(\s*[^,\[]+,/.test(lineText)
```
This pattern distinguishes info/2 directives from info/1 directives by looking for a comma after the first argument.

### Special List Key Processing
```typescript
const listKeyMatch = element.match(/^(arguments|exceptions|examples)\s+is\s+\[(.*)\]$/);
```
This pattern identifies the three special keys that contain lists requiring nested formatting.

## Formatting Rules

### 1. Basic Structure
```logtalk
% Input:
:- info(predicate/2, [comment is 'Description', argnames is ['A', 'B']]).

% Output:
	:- info(predicate/2, [
		comment is 'Description',
		argnames is ['A', 'B']
	]).
```

### 2. Single-Element Lists in Special Keys
```logtalk
% Input:
arguments is ['Input'-'Single argument description']

% Output (stays single-line):
arguments is ['Input'-'Single argument description']
```

### 3. Multi-Element Lists in Special Keys
```logtalk
% Input:
arguments is ['Input'-'First arg', 'Output'-'Second arg']

% Output (becomes multi-line):
arguments is [
	'Input'-'First arg',
	'Output'-'Second arg'
]
```

## Example Transformations

### Before Formatting
```logtalk
:- info(complex_predicate/3, [
comment is 'A complex predicate with detailed documentation',
argnames is ['Input', 'Options', 'Result'],
arguments is ['Input'-'The input data', 'Options'-'Processing options', 'Result'-'The result'],
exceptions is [type_error(atom, Input), domain_error(positive_integer, Options)],
examples is ['complex_predicate(data, [option1], result) - Basic usage', 'complex_predicate([], [], []) - Empty case']
]).
```

### After Formatting
```logtalk
	:- info(complex_predicate/3, [
		comment is 'A complex predicate with detailed documentation',
		argnames is ['Input', 'Options', 'Result'],
		arguments is [
			'Input'-'The input data',
			'Options'-'Processing options',
			'Result'-'The result'
		],
		exceptions is [
			type_error(atom, Input),
			domain_error(positive_integer, Options)
		],
		examples is [
			'complex_predicate(data, [option1], result) - Basic usage',
			'complex_predicate([], [], []) - Empty case'
		]
	]).
```

## Integration

### Registration
The info/2 directive formatting is integrated into the main formatting flow:

```typescript
// 4. Format info/1 directive if present
this.formatInfoDirective(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

// 5. Format info/2 directives if present  
this.formatInfo2Directives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

// 6. Format uses/2 directives if present
this.formatUsesDirectives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);
```

### Compatibility
- Works alongside existing info/1 directive formatting
- Uses the same `parseListElements()` utility for consistent list parsing
- Follows the same indentation patterns as other directive formatting

## Testing

Comprehensive test suite covers:
- Basic info/2 directive formatting
- Special handling of `arguments`, `exceptions`, and `examples` keys
- Single vs multi-element list formatting
- Proper indentation and structure
- Integration with overall document formatting

## Benefits

1. **Consistent Documentation Style** - Ensures all predicate documentation follows the same formatting standards
2. **Improved Readability** - Multi-line formatting makes complex predicate documentation easier to read
3. **Automatic Formatting** - Developers don't need to manually format complex info/2 directives
4. **Nested List Support** - Properly handles the common pattern of lists within info/2 directives
5. **Extensible Design** - Easy to add support for additional special keys if needed
