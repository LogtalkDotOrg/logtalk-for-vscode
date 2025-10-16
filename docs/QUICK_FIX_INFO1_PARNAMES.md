# Quick Fix for info/1 Directive with parnames Support

## Overview

This document describes the refinement of the quick fix for the "Missing directive: info/1" warning to support parametric entities. The quick fix now automatically detects if an entity name is a compound term and adds a `parnames` key to the info/1 directive with the entity parameters.

## Implementation Location

**File**: `src/features/logtalkDocumentationLinter.ts`

## Key Changes

### 1. Added Import for ArgumentUtils

```typescript
import { ArgumentUtils } from "../utils/argumentUtils";
```

### 2. Enhanced Entity Parameter Extraction

The implementation now:
1. Extracts the full entity opening directive text (handling multi-line directives)
2. Parses the entity name to detect if it's a compound term
3. Uses `ArgumentUtils.extractArgumentsFromCall()` to parse entity parameters
4. Processes each parameter by trimming leading and trailing underscores
5. Wraps cleaned parameter names in single quotes
6. Adds the `parnames` key as the last element in the info/1 directive

### 3. Implementation Details

#### Extract Entity Opening Directive Text

```typescript
// Get the entity opening directive text
let entityText = '';
for (let i = entityLine; i <= directiveRange.end; i++) {
  entityText += document.lineAt(i).text;
  if (i < directiveRange.end) {
    entityText += '\n';
  }
}
```

#### Parse Entity Name and Parameters

```typescript
// Extract entity name and parameters
const entityMatch = entityText.match(/:-\s*(object|protocol|category)\(([^(),.]+(?:\([^)]*\))?)/);
let parnames: string[] = [];

if (entityMatch) {
  const entityNamePart = entityMatch[2].trim();
  
  // Check if entity name is a compound term (has parentheses)
  const parenPos = entityNamePart.indexOf('(');
  if (parenPos !== -1) {
    // Extract arguments from the compound term
    const args = ArgumentUtils.extractArgumentsFromCall(entityNamePart);
    
    // Process each argument: trim underscores from prefix and suffix, wrap in quotes
    parnames = args.map(arg => {
      const trimmed = arg.trim();
      // Remove leading and trailing underscores
      const cleaned = trimmed.replace(/^_+/, '').replace(/_+$/, '');
      return `'${cleaned}'`;
    });
  }
}
```

#### Generate info/1 Directive with Conditional parnames

```typescript
// Create the info/1 directive with the specified keys
let infoDirective: string;
if (parnames.length > 0) {
  // Include parnames for parametric entities
  infoDirective = `${indent}:- info([\n` +
    `${indent}\tversion is 1:0:0,\n` +
    `${indent}\tauthor is '',\n` +
    `${indent}\tdate is ${currentDate},\n` +
    `${indent}\tcomment is '',\n` +
    `${indent}\tparnames is [${parnames.join(', ')}]\n` +
    `${indent}]).\n`;
} else {
  // No parnames for non-parametric entities
  infoDirective = `${indent}:- info([\n` +
    `${indent}\tversion is 1:0:0,\n` +
    `${indent}\tauthor is '',\n` +
    `${indent}\tdate is ${currentDate},\n` +
    `${indent}\tcomment is ''\n` +
    `${indent}]).\n`;
}
```

## Examples

### Example 1: Non-Parametric Entity

#### Before Quick Fix

```logtalk
:- object(my_object).

    % ... implementation ...

:- end_object.
```

**Warning**: Missing directive: info/1

#### After Quick Fix

```logtalk
:- object(my_object).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2025-10-16,
		comment is ''
	]).

    % ... implementation ...

:- end_object.
```

### Example 2: Parametric Entity with Simple Parameters

#### Before Quick Fix

```logtalk
:- object(list(_Type)).

    % ... implementation ...

:- end_object.
```

**Warning**: Missing directive: info/1

#### After Quick Fix

```logtalk
:- object(list(_Type)).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2025-10-16,
		comment is '',
		parnames is ['Type']
	]).

    % ... implementation ...

:- end_object.
```

**Note**: The leading underscore `_` is trimmed from `_Type` to produce `'Type'`.

### Example 3: Parametric Entity with Multiple Parameters

#### Before Quick Fix

```logtalk
:- object(dictionary(_Key, _Value_)).

    % ... implementation ...

:- end_object.
```

**Warning**: Missing directive: info/1

#### After Quick Fix

```logtalk
:- object(dictionary(_Key, _Value_)).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2025-10-16,
		comment is '',
		parnames is ['Key', 'Value']
	]).

    % ... implementation ...

:- end_object.
```

**Note**: 
- Leading underscore `_` is trimmed from `_Key` to produce `'Key'`
- Both leading and trailing underscores are trimmed from `_Value_` to produce `'Value'`

### Example 4: Parametric Category

#### Before Quick Fix

```logtalk
:- category(monitoring(_Subject_)).

    % ... implementation ...

:- end_category.
```

**Warning**: Missing directive: info/1

#### After Quick Fix

```logtalk
:- category(monitoring(_Subject_)).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2025-10-16,
		comment is '',
		parnames is ['Subject']
	]).

    % ... implementation ...

:- end_category.
```

### Example 5: Multi-line Entity Opening Directive

#### Before Quick Fix

```logtalk
:- object(complex_object(
    _Param1,
    _Param2_
)).

    % ... implementation ...

:- end_object.
```

**Warning**: Missing directive: info/1

#### After Quick Fix

```logtalk
:- object(complex_object(
    _Param1,
    _Param2_
)).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2025-10-16,
		comment is '',
		parnames is ['Param1', 'Param2']
	]).

    % ... implementation ...

:- end_object.
```

## Key Features

### Parameter Name Processing:
- ✅ Detects compound entity names (parametric entities)
- ✅ Uses `ArgumentUtils.extractArgumentsFromCall()` for robust parameter parsing
- ✅ Handles multi-line entity opening directives
- ✅ Trims leading underscores (e.g., `_Type` → `Type`)
- ✅ Trims trailing underscores (e.g., `Value_` → `Value`)
- ✅ Trims both leading and trailing underscores (e.g., `_Subject_` → `Subject`)
- ✅ Wraps cleaned parameter names in single quotes
- ✅ Adds `parnames` as the last key in the info/1 directive

### Directive Generation:
- ✅ For non-parametric entities: includes `version`, `author`, `date`, `comment`
- ✅ For parametric entities: includes `version`, `author`, `date`, `comment`, `parnames`
- ✅ Preserves indentation from entity opening directive
- ✅ Uses current date in YYYY-MM-DD format
- ✅ Inserts directive after entity opening directive with an empty line

## Dependencies

- **ArgumentUtils.extractArgumentsFromCall()** - Parses entity parameters from compound terms
- **PredicateUtils.getDirectiveRange()** - Computes the full range of multi-line directives
- **Utils.findEntityOpeningDirective()** - Locates the entity opening directive

## Technical Notes

### Underscore Trimming Logic

The implementation uses regular expressions to trim underscores:
- `replace(/^_+/, '')` - Removes one or more leading underscores
- `replace(/_+$/, '')` - Removes one or more trailing underscores

This ensures that parameter names like:
- `_Type` → `Type`
- `Value_` → `Value`
- `_Subject_` → `Subject`
- `__Key__` → `Key`

### Regex Pattern for Entity Matching

The regex pattern `/:-\s*(object|protocol|category)\(([^(),.]+(?:\([^)]*\))?)/` matches:
- `:-\s*` - Directive start with optional whitespace
- `(object|protocol|category)` - Entity type
- `\(` - Opening parenthesis
- `([^(),.]+(?:\([^)]*\))?)` - Entity name (simple or compound):
  - `[^(),.]+` - Simple name (no parentheses, commas, or dots)
  - `(?:\([^)]*\))?` - Optional parameters in parentheses

### Multi-line Directive Handling

The implementation correctly handles multi-line entity opening directives by:
1. Using `PredicateUtils.getDirectiveRange()` to find the complete directive range
2. Concatenating all lines from `entityLine` to `directiveRange.end`
3. Parsing the complete entity text to extract parameters

## Integration

The quick fix is automatically available in VS Code when:
1. A "Missing directive: info/1" warning is present
2. The user clicks on the warning or places the cursor on the warning line
3. The user triggers the quick fix action (e.g., Cmd+. on macOS, Ctrl+. on Windows/Linux)

The quick fix appears in the context menu as:
- "Add info/1 directive"

## Testing Recommendations

To ensure the quick fix works correctly, test with:
1. Non-parametric entities (objects, protocols, categories)
2. Parametric entities with single parameter
3. Parametric entities with multiple parameters
4. Parameters with leading underscores only
5. Parameters with trailing underscores only
6. Parameters with both leading and trailing underscores
7. Multi-line entity opening directives
8. Nested parameter structures (if applicable)

