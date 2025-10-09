# Entity Opening Directive Formatting Implementation

## Overview

This document describes the implementation of entity opening directive formatting in the `LogtalkDocumentFormattingEditProvider`. Entity opening directives define objects, protocols, and categories with their relationships to other entities.

## Features Implemented

### 1. Multi-line Formatting for Multiple Relations
When an entity opening directive has more than one relation (implements, imports, extends, instantiates, specializes), it is automatically formatted as multi-line with proper indentation:

```logtalk
% Before:
:- object(complex_object, implements(protocol1), imports(category1), extends(parent_object)).

% After:
:- object(complex_object,
	implements(protocol1),
	imports(category1),
	extends(parent_object)).
```

### 2. Single-line Preservation for Simple Cases
Entity directives with no relations or only one relation remain single-line for better readability:

```logtalk
% Simple entity (stays single-line):
:- object(simple_object).

% Single relation (stays single-line):
:- object(single_relation, implements(protocol)).
```

### 3. Support for All Entity Types
The formatter handles all Logtalk entity types:
- **Objects** - `object(...)`
- **Protocols** - `protocol(...)`  
- **Categories** - `category(...)`

### 4. Complex Parameter Handling
Properly handles parametric entities and complex nested structures:

```logtalk
% Parametric object with relations:
:- object(parametric(Param1, "String", 42),
	implements(protocol),
	imports(category),
	extends(parent(Param1))).

% Complex nested parameters:
:- object(complex_nested,
	implements(protocol(param1, param2)),
	imports(category(nested(deep))),
	extends(parent(complex, structure))).
```

## Implementation Details

### Core Methods

1. **`formatEntityOpeningDirective()`** - Main method that processes entity opening directives
2. **`formatEntityOpeningDirectiveContent()`** - Formats the directive content with proper structure
3. **`parseEntityRelations()`** - Parses and separates entity relations

### Parsing Logic

The formatter uses the robust `ArgumentUtils.parseArguments()` utility to handle:
- **Parentheses nesting** - Correctly handles deeply nested parameters in relations
- **Comma separation** - Distinguishes between argument separators and parameter separators
- **Quote handling** - Properly handles quoted strings and character codes
- **Bracket nesting** - Handles nested list structures
- **Escape sequences** - Correctly processes escaped characters

### Detection Pattern
```typescript
/^:-\s+(object|protocol|category)\s*\(/.test(lineText)
```
This pattern identifies entity opening directives for processing.

### Argument Parsing
```typescript
// Uses the robust ArgumentUtils.parseArguments() utility
const entityArguments = ArgumentUtils.parseArguments(argumentsText);
// Correctly handles complex nested structures and quoted strings
```

## Formatting Rules

### 1. Single Relation or No Relations
```logtalk
% Input:
:- object(simple, implements(protocol)).

% Output (stays single-line):
:- object(simple, implements(protocol)).
```

### 2. Multiple Relations
```logtalk
% Input:
:- object(complex, implements(protocol1), imports(category1), extends(parent)).

% Output (becomes multi-line):
:- object(complex,
	implements(protocol1),
	imports(category1),
	extends(parent)).
```

### 3. Visibility Modifiers
```logtalk
% Input:
:- object(visibility, implements(public::protocol1), implements(protected::protocol2)).

% Output:
:- object(visibility,
	implements(public::protocol1),
	implements(protected::protocol2)).
```

## Example Transformations

### Before Formatting
```logtalk
:- object(speech(Season, Event), imports((dress(Season), speech(Event)))).

:- object(class_object, implements(protected::protocol), imports(private::category), instantiates(metaclass), specializes(superclass)).

:- category(test_category, implements(protocol), extends(other_category)).
```

### After Formatting
```logtalk
:- object(speech(Season, Event),
	imports((dress(Season), speech(Event)))).

:- object(class_object,
	implements(protected::protocol),
	imports(private::category),
	instantiates(metaclass),
	specializes(superclass)).

:- category(test_category,
	implements(protocol),
	extends(other_category)).
```

## Supported Relations

### Object Relations
- **`implements(Protocol)`** - Protocol implementation
- **`imports(Category)`** - Category importation
- **`extends(Parent)`** - Prototype extension
- **`instantiates(Class)`** - Class instantiation
- **`specializes(Superclass)`** - Class specialization

### Protocol Relations
- **`extends(Protocol)`** - Protocol extension

### Category Relations
- **`implements(Protocol)`** - Protocol implementation
- **`extends(Category)`** - Category extension

## Integration

### Registration
The entity opening directive formatting is integrated into the main formatting flow:

```typescript
// 1. Format entity opening directive (ensure it starts at column 0 with empty line after)
this.formatEntityOpeningDirective(document, entityInfo.opening, edits);
```

### Compatibility
- Works alongside existing directive formatting
- Uses the same indentation patterns (tabs) as other formatters
- Preserves entity parameter structures and visibility modifiers
- Handles both simple and complex entity definitions

## Testing

Comprehensive test suite covers:
- Multi-relation entity formatting
- Single-relation preservation
- Parametric entity handling
- Category and protocol formatting
- Complex nested parameter structures
- Visibility modifier preservation

## Benefits

1. **Consistent Code Style** - Ensures all entity definitions follow the same formatting standards
2. **Improved Readability** - Multi-line formatting makes complex entity relationships easier to understand
3. **Automatic Formatting** - Developers don't need to manually format complex entity directives
4. **Flexible Handling** - Adapts formatting based on complexity (single-line vs multi-line)
5. **Robust Parsing** - Correctly handles nested parameters and complex structures
6. **Universal Support** - Works with all Logtalk entity types and relation combinations

## Edge Cases Handled

1. **Parametric Entities** - Correctly preserves parameter lists in entity names
2. **Nested Parameters** - Handles complex nested structures in relations
3. **Visibility Modifiers** - Preserves `public::`, `protected::`, `private::` modifiers
4. **Mixed Relation Types** - Handles entities with multiple different relation types
5. **Already Formatted Code** - Preserves existing good formatting while fixing issues
6. **Whitespace Normalization** - Removes excessive whitespace while preserving structure
