# Quick Fix for "Missing punctuation at the end of text:" Warning

## Overview

This document describes the implementation of a quick fix for the Logtalk Documentation Linter warning "Missing punctuation at the end of text: '<text>'". The quick fix automatically adds a period at the end of the text that's missing punctuation in info/1 or info/2 directives.

## Implementation Location

**File**: `src/features/logtalkDocumentationLinter.ts`

## Warning Format

The warning message follows this format:
```
Missing punctuation at the end of text: '<text without punctuation>'
```

For example:
```
Missing punctuation at the end of text: 'This is a comment without punctuation'
```

This warning is generated for both:
- `info/1` directives (entity documentation)
- `info/2` directives (predicate documentation)

## Implementation Details

### 1. Updated `canFix` Method

Added detection for the missing punctuation warning:

```typescript
private canFix(diagnostic: Diagnostic): boolean {
  // ... other checks ...
  } else if (diagnostic.message.includes('Missing punctuation at the end of text:')) {
    return true;
  }
  return false;
}
```

### 2. Quick Fix Implementation in `createQuickFix` Method

The implementation follows these steps:

#### Step 1: Extract the Text Without Punctuation

```typescript
const textMatch = diagnostic.message.match(/Missing punctuation at the end of text:\s*'(.*)'/);
if (!textMatch) {
  return null;
}

const textWithoutPunctuation = textMatch[1];
```

#### Step 2: Create the Code Action

```typescript
action = new CodeAction(
  'Add missing punctuation',
  CodeActionKind.QuickFix
);
```

#### Step 3: Find the Info Directive

Search forward from the warning line to find the info directive (either info/1 or info/2):

```typescript
const warningLine = diagnostic.range.start.line;
let infoDirectiveLine = -1;
for (let i = warningLine; i < document.lineCount; i++) {
  const lineText = document.lineAt(i).text.trim();
  // Match both info/1 and info/2 directives
  if (lineText.match(/^\:-\s*info\((\[|[^,]+,)/)) {
    infoDirectiveLine = i;
    break;
  }
}
```

The regex pattern `^\:-\s*info\((\[|[^,]+,)` matches:
- `:-\s*info\(\[` - info/1 directive (starts with `[`)
- `:-\s*info\([^,]+,` - info/2 directive (has predicate indicator followed by comma)

#### Step 4: Get the Directive Range

Use `PredicateUtils.getDirectiveRange()` to handle multi-line directives:

```typescript
const directiveRange = PredicateUtils.getDirectiveRange(document, infoDirectiveLine);
```

#### Step 5: Get the Directive Text

Read all lines of the directive:

```typescript
let directiveText = '';
for (let i = infoDirectiveLine; i <= directiveRange.end; i++) {
  directiveText += document.lineAt(i).text;
  if (i < directiveRange.end) {
    directiveText += '\n';
  }
}
```

#### Step 6: Replace Text and Add Punctuation

Replace the text without punctuation with the same text ending with a period:

```typescript
// Escape special regex characters in the text
const escapedText = textWithoutPunctuation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const updatedDirectiveText = directiveText.replace(
  new RegExp(`'${escapedText}'`, 'g'),
  `'${textWithoutPunctuation}.'`
);
```

#### Step 7: Replace the Directive

Replace the entire directive with the updated version:

```typescript
const directiveStartPos = new Position(infoDirectiveLine, 0);
const directiveEndPos = new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length);
const directiveFullRange = new Range(directiveStartPos, directiveEndPos);

edit.replace(document.uri, directiveFullRange, updatedDirectiveText);
```

## Examples

### Example 1: Missing Punctuation in info/1 Directive

#### Before Quick Fix

```logtalk
:- object(my_object).

    :- info([
        version is 1:0:0,
        author is 'John Doe',
        date is 2025-10-17,
        comment is 'This is a test object'
    ]).

:- end_object.
```

**Warning**: Missing punctuation at the end of text: 'This is a test object'

#### After Quick Fix

```logtalk
:- object(my_object).

    :- info([
        version is 1:0:0,
        author is 'John Doe',
        date is 2025-10-17,
        comment is 'This is a test object.'
    ]).

:- end_object.
```

### Example 2: Missing Punctuation in info/2 Directive

#### Before Quick Fix

```logtalk
:- object(my_object).

    :- public(process/2).
    :- info(process/2, [
        comment is 'Processes the input and produces output',
        argnames is ['Input', 'Output']
    ]).

    process(Input, Output) :-
        % ... implementation ...

:- end_object.
```

**Warning**: Missing punctuation at the end of text: 'Processes the input and produces output'

#### After Quick Fix

```logtalk
:- object(my_object).

    :- public(process/2).
    :- info(process/2, [
        comment is 'Processes the input and produces output.',
        argnames is ['Input', 'Output']
    ]).

    process(Input, Output) :-
        % ... implementation ...

:- end_object.
```

### Example 3: Multi-line info/1 Directive

#### Before Quick Fix

```logtalk
:- object(complex_object).

    :- info([
        version is 1:0:0,
        author is 'Jane Smith',
        date is 2025-10-17,
        comment is 'A complex object that demonstrates
                     multi-line comment handling'
    ]).

:- end_object.
```

**Warning**: Missing punctuation at the end of text: 'A complex object that demonstrates multi-line comment handling'

#### After Quick Fix

```logtalk
:- object(complex_object).

    :- info([
        version is 1:0:0,
        author is 'Jane Smith',
        date is 2025-10-17,
        comment is 'A complex object that demonstrates
                     multi-line comment handling.'
    ]).

:- end_object.
```

## Integration

The quick fix is automatically available in VS Code when:
1. A "Missing punctuation at the end of text:" warning is present in the PROBLEMS pane
2. The user clicks on the warning or places the cursor on the warning line
3. The user triggers the quick fix action (e.g., Cmd+. on macOS, Ctrl+. on Windows/Linux)

The quick fix appears in the context menu as "Add missing punctuation".

## Dependencies

- `PredicateUtils.getDirectiveRange()` - Computes the full range of multi-line directives
- `DiagnosticsUtils` - Utilities for diagnostic management

## Technical Notes

### Regex Escaping

The implementation properly escapes special regex characters in the text to avoid regex errors:

```typescript
const escapedText = textWithoutPunctuation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

This ensures that text containing special characters like `(`, `)`, `[`, `]`, etc., is handled correctly.

### Global Replacement

The replacement uses the `g` flag to replace all occurrences of the text in the directive:

```typescript
new RegExp(`'${escapedText}'`, 'g')
```

This handles cases where the same text might appear multiple times in the directive (though this is rare).

### Directive Detection

The regex pattern for detecting info directives handles both formats:
- `:-\s*info\(\[` - info/1 directive (entity documentation)
- `:-\s*info\([^,]+,` - info/2 directive (predicate documentation)

This ensures the quick fix works for both entity and predicate documentation.

## Conclusion

This quick fix provides a simple and effective way to add missing punctuation to documentation text in Logtalk info directives. It handles both info/1 and info/2 directives, multi-line directives, and text with special characters.

