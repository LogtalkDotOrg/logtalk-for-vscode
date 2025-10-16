# Quick Fixes for Predicate Documentation Warnings

## Overview

This document describes the implementation of quick fixes for the Logtalk Documentation Linter warnings related to missing predicate documentation directives:
1. "Missing info/2 directive for predicate: <indicator>"
2. "Missing mode/2 directive for predicate: <indicator>"

These quick fixes automatically add the missing directives after the predicate scope directive with appropriate default values.

## Implementation Location

**File**: `src/features/logtalkDocumentationLinter.ts`

## Implementation Details

### 1. Updated `canFix` Method

Extended the method to detect the two new warning types:

```typescript
private canFix(diagnostic: Diagnostic): boolean {
  if (diagnostic.message.includes('Missing directive: info/1')) {
    return true;
  } else if (diagnostic.message.includes('Missing info/2 directive for predicate:')) {
    return true;
  } else if (diagnostic.message.includes('Missing mode/2 directive for predicate:')) {
    return true;
  }
  return false;
}
```

### 2. Extended `createQuickFix` Method

Added two new branches to handle the predicate-level documentation warnings.

#### Quick Fix for "Missing info/2 directive for predicate:"

**Implementation Steps:**

1. **Extract Predicate Indicator**: Parse the diagnostic message to extract the predicate indicator (e.g., `foo/2`)
2. **Parse Indicator**: Use `PredicateUtils.parseIndicator()` to extract name and arity
3. **Locate Scope Directive**: The warning line is the line of the predicate scope directive
4. **Get Directive Range**: Use `PredicateUtils.getDirectiveRange()` to get the full range
5. **Preserve Indentation**: Extract indentation from the scope directive line
6. **Generate argnames List**: Create a list of empty strings (`''`) based on the predicate arity
7. **Create info/2 Directive**: Generate the directive with `comment` and `argnames` keys
8. **Insert Directive**: Add after the scope directive

**Code:**

```typescript
else if (diagnostic.message.includes('Missing info/2 directive for predicate:')) {
  // Extract predicate indicator from the diagnostic message
  const indicatorMatch = diagnostic.message.match(/Missing info\/2 directive for predicate:\s*(.+)/);
  if (!indicatorMatch) {
    return null;
  }

  const indicator = indicatorMatch[1].trim();
  const parsed = PredicateUtils.parseIndicator(indicator);
  if (!parsed) {
    return null;
  }

  action = new CodeAction(
    `Add info/2 directive for ${indicator}`,
    CodeActionKind.QuickFix
  );

  // The warning line is the line of the predicate scope directive
  const scopeLine = diagnostic.range.start.line;
  
  // Get the full range of the scope directive
  const directiveRange = PredicateUtils.getDirectiveRange(document, scopeLine);

  // Get indentation from the scope directive
  const scopeLineText = document.lineAt(scopeLine).text;
  const indent = scopeLineText.match(/^(\s*)/)[1];

  // Create the info/2 directive
  let infoDirective: string;
  if (parsed.arity === 0) {
    // No argnames for zero-arity predicates
    infoDirective = `${indent}:- info(${indicator}, [\n` +
      `${indent}\tcomment is ''\n` +
      `${indent}]).\n`;
  } else {
    // Create argnames list with empty strings based on arity
    const argnamesList = Array(parsed.arity).fill("''").join(', ');
    infoDirective = `${indent}:- info(${indicator}, [\n` +
      `${indent}\tcomment is '',\n` +
      `${indent}\targnames is [${argnamesList}]\n` +
      `${indent}]).\n`;
  }

  // Insert the info/2 directive after the scope directive
  const insertPosition = new Position(directiveRange.end + 1, 0);
  edit.insert(document.uri, insertPosition, infoDirective);
}
```

#### Quick Fix for "Missing mode/2 directive for predicate:"

**Implementation Steps:**

1. **Extract Predicate Indicator**: Parse the diagnostic message to extract the predicate indicator
2. **Parse Indicator**: Use `PredicateUtils.parseIndicator()` to extract name and arity
3. **Locate Scope Directive**: The warning line is the line of the predicate scope directive
4. **Get Directive Range**: Use `PredicateUtils.getDirectiveRange()` to get the full range
5. **Preserve Indentation**: Extract indentation from the scope directive line
6. **Construct Call Template**: Create predicate call form with `?` for each argument
7. **Create mode/2 Directive**: Generate the directive with `zero_or_more` as the second argument
8. **Insert Directive**: Add after the scope directive

**Code:**

```typescript
else if (diagnostic.message.includes('Missing mode/2 directive for predicate:')) {
  // Extract predicate indicator from the diagnostic message
  const indicatorMatch = diagnostic.message.match(/Missing mode\/2 directive for predicate:\s*(.+)/);
  if (!indicatorMatch) {
    return null;
  }

  const indicator = indicatorMatch[1].trim();
  const parsed = PredicateUtils.parseIndicator(indicator);
  if (!parsed) {
    return null;
  }

  action = new CodeAction(
    `Add mode/2 directive for ${indicator}`,
    CodeActionKind.QuickFix
  );

  // The warning line is the line of the predicate scope directive
  const scopeLine = diagnostic.range.start.line;
  
  // Get the full range of the scope directive
  const directiveRange = PredicateUtils.getDirectiveRange(document, scopeLine);

  // Get indentation from the scope directive
  const scopeLineText = document.lineAt(scopeLine).text;
  const indent = scopeLineText.match(/^(\s*)/)[1];

  // Construct the predicate call template with ? for each argument
  let callTemplate: string;
  if (parsed.arity === 0) {
    callTemplate = parsed.name;
  } else {
    const args = Array(parsed.arity).fill('?').join(', ');
    callTemplate = `${parsed.name}(${args})`;
  }

  // Create the mode/2 directive
  const modeDirective = `${indent}:- mode(${callTemplate}, zero_or_more).\n`;

  // Insert the mode/2 directive after the scope directive
  const insertPosition = new Position(directiveRange.end + 1, 0);
  edit.insert(document.uri, insertPosition, modeDirective);
}
```

## Examples

### Example 1: Missing info/2 directive for predicate with arity 0

#### Before Quick Fix

```logtalk
:- object(my_object).

    :- public(reset/0).

    reset :-
        % ... implementation ...

:- end_object.
```

**Warning**: Missing info/2 directive for predicate: reset/0

#### After Quick Fix

```logtalk
:- object(my_object).

    :- public(reset/0).
    :- info(reset/0, [
    	comment is ''
    ]).

    reset :-
        % ... implementation ...

:- end_object.
```

### Example 2: Missing info/2 directive for predicate with arity 2

#### Before Quick Fix

```logtalk
:- object(my_object).

    :- public(process/2).

    process(Input, Output) :-
        % ... implementation ...

:- end_object.
```

**Warning**: Missing info/2 directive for predicate: process/2

#### After Quick Fix

```logtalk
:- object(my_object).

    :- public(process/2).
    :- info(process/2, [
    	comment is '',
    	argnames is ['', '']
    ]).

    process(Input, Output) :-
        % ... implementation ...

:- end_object.
```

### Example 3: Missing mode/2 directive for predicate with arity 3

#### Before Quick Fix

```logtalk
:- object(my_object).

    :- public(calculate/3).

    calculate(X, Y, Result) :-
        % ... implementation ...

:- end_object.
```

**Warning**: Missing mode/2 directive for predicate: calculate/3

#### After Quick Fix

```logtalk
:- object(my_object).

    :- public(calculate/3).
    :- mode(calculate(?, ?, ?), zero_or_more).

    calculate(X, Y, Result) :-
        % ... implementation ...

:- end_object.
```

### Example 4: Missing mode/2 directive for predicate with arity 0

#### Before Quick Fix

```logtalk
:- object(my_object).

    :- public(initialize/0).

    initialize :-
        % ... implementation ...

:- end_object.
```

**Warning**: Missing mode/2 directive for predicate: initialize/0

#### After Quick Fix

```logtalk
:- object(my_object).

    :- public(initialize/0).
    :- mode(initialize, zero_or_more).

    initialize :-
        % ... implementation ...

:- end_object.
```

## Integration

The quick fixes are automatically available in VS Code when:
1. A warning is present in the PROBLEMS pane
2. The user clicks on the warning or places the cursor on the warning line
3. The user triggers the quick fix action (e.g., Cmd+. on macOS, Ctrl+. on Windows/Linux)

The quick fixes appear in the context menu as:
- "Add info/2 directive for <indicator>"
- "Add mode/2 directive for <indicator>"

## Key Features

### info/2 Directive Quick Fix:
- ✅ Extracts predicate indicator from diagnostic message
- ✅ Parses indicator to get name and arity
- ✅ Locates scope directive using diagnostic range
- ✅ Computes directive range using `PredicateUtils.getDirectiveRange()`
- ✅ Preserves indentation from scope directive
- ✅ Adds directive after scope directive
- ✅ Sets `comment` to empty string
- ✅ For zero-arity predicates: only includes `comment` key
- ✅ For non-zero arity predicates: includes both `comment` and `argnames` keys
- ✅ Generates `argnames` list with correct number of empty strings based on arity

### mode/2 Directive Quick Fix:
- ✅ Extracts predicate indicator from diagnostic message
- ✅ Parses indicator to get name and arity
- ✅ Locates scope directive using diagnostic range
- ✅ Computes directive range using `PredicateUtils.getDirectiveRange()`
- ✅ Preserves indentation from scope directive
- ✅ Constructs call template with `?` for each argument
- ✅ Handles zero-arity predicates correctly (no parentheses)
- ✅ Adds directive after scope directive
- ✅ Sets second argument to `zero_or_more`

## Dependencies

- `PredicateUtils.parseIndicator()` - Parses predicate indicators into components
- `PredicateUtils.getDirectiveRange()` - Computes the full range of multi-line directives
- `DiagnosticsUtils` - Utilities for diagnostic management (inherited from base implementation)

## Notes

- The implementation follows the same pattern as other quick fixes in the file
- Indentation is preserved from the scope directive
- The `argnames` list contains the correct number of empty strings based on the predicate arity
- The mode/2 directive uses `?` for each argument as a placeholder
- The second argument of mode/2 is always set to `zero_or_more` as specified
- Both directives are inserted immediately after the scope directive (no empty line)

