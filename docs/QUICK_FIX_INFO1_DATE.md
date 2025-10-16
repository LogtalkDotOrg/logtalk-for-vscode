# Quick Fixes for info/1 Directive Date Warnings

## Overview

This document describes the implementation of quick fixes for date-related warnings in the Logtalk Documentation Linter:
1. "Invalid date in info/1 directive: <date>"
2. "Date in info/1 directive is in the future: <date>"

Both quick fixes replace the invalid or future date with the current date in YYYY-MM-DD format.

## Implementation Location

**File**: `src/features/logtalkDocumentationLinter.ts`

## Implementation Details

### 1. Updated `canFix` Method

Extended the method to detect the two date-related warning types:

```typescript
private canFix(diagnostic: Diagnostic): boolean {
  if (diagnostic.message.includes('Missing directive: info/1')) {
    return true;
  } else if (diagnostic.message.includes('Missing info/2 directive for predicate:')) {
    return true;
  } else if (diagnostic.message.includes('Missing mode/2 directive for predicate:')) {
    return true;
  } else if (diagnostic.message.includes('Invalid date in info/1 directive:')) {
    return true;
  } else if (diagnostic.message.includes('Date in info/1 directive is in the future:')) {
    return true;
  }
  return false;
}
```

### 2. Extended `createQuickFix` Method

Added a unified handler for both date warnings (lines 259-328):

#### Implementation Steps:

1. **Extract Invalid Date**: Parse the diagnostic message to extract the invalid/future date
2. **Determine Action Title**: Set appropriate title based on warning type
3. **Locate info/1 Directive**: Search backwards from warning line to find directive opening
4. **Get Directive Range**: Use `PredicateUtils.getDirectiveRange()` to get full range
5. **Extract Directive Text**: Concatenate all lines of the directive
6. **Generate Current Date**: Create current date in YYYY-MM-DD format
7. **Replace Date**: Use regex to replace the invalid date with current date
8. **Update Document**: Replace the entire directive with the updated version

#### Code:

```typescript
} else if (diagnostic.message.includes('Invalid date in info/1 directive:') || 
           diagnostic.message.includes('Date in info/1 directive is in the future:')) {
  // Extract the invalid date from the diagnostic message
  const dateMatch = diagnostic.message.match(/(?:Invalid date in info\/1 directive:|Date in info\/1 directive is in the future:)\s*(.+)/);
  if (!dateMatch) {
    return null;
  }

  const invalidDate = dateMatch[1].trim();

  // Determine the action title based on the warning type
  const actionTitle = diagnostic.message.includes('Invalid date') 
    ? `Fix invalid date in info/1 directive`
    : `Fix future date in info/1 directive`;

  action = new CodeAction(
    actionTitle,
    CodeActionKind.QuickFix
  );

  // The warning line is the line containing the invalid date
  const warningLine = diagnostic.range.start.line;

  // Find the info/1 directive starting from the warning line
  // Search backwards to find the directive opening
  let infoDirectiveLine = -1;
  for (let i = warningLine; i >= 0; i--) {
    const lineText = document.lineAt(i).text.trim();
    if (lineText.match(/^\:-\s*info\(\[/)) {
      infoDirectiveLine = i;
      break;
    }
  }

  if (infoDirectiveLine === -1) {
    return null;
  }

  // Get the full range of the info/1 directive
  const directiveRange = PredicateUtils.getDirectiveRange(document, infoDirectiveLine);

  // Get the directive text
  let directiveText = '';
  for (let i = infoDirectiveLine; i <= directiveRange.end; i++) {
    directiveText += document.lineAt(i).text;
    if (i < directiveRange.end) {
      directiveText += '\n';
    }
  }

  // Get current date in YYYY-MM-DD format
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const currentDate = `${year}-${month}-${day}`;

  // Replace the invalid date with the current date
  const updatedDirectiveText = directiveText.replace(
    new RegExp(`date is ${invalidDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    `date is ${currentDate}`
  );

  // Replace the entire directive with the updated version
  const directiveStartPos = new Position(infoDirectiveLine, 0);
  const directiveEndPos = new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length);
  const directiveFullRange = new Range(directiveStartPos, directiveEndPos);

  edit.replace(document.uri, directiveFullRange, updatedDirectiveText);
}
```

## Examples

### Example 1: Invalid Date Format

#### Before Quick Fix

```logtalk
:- object(my_object).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2025/10/16,
		comment is ''
	]).

:- end_object.
```

**Warning**: Invalid date in info/1 directive: 2025/10/16

#### After Quick Fix

```logtalk
:- object(my_object).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2025-10-16,
		comment is ''
	]).

:- end_object.
```

### Example 2: Future Date

#### Before Quick Fix

```logtalk
:- object(my_object).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2026-12-31,
		comment is ''
	]).

:- end_object.
```

**Warning**: Date in info/1 directive is in the future: 2026-12-31

#### After Quick Fix (assuming current date is 2025-10-16)

```logtalk
:- object(my_object).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2025-10-16,
		comment is ''
	]).

:- end_object.
```

### Example 3: Multi-line info/1 Directive with Invalid Date

#### Before Quick Fix

```logtalk
:- object(my_object).

	:- info([
		version is 1:0:0,
		author is 'John Doe',
		date is 20251016,
		comment is 'This is a test object'
	]).

:- end_object.
```

**Warning**: Invalid date in info/1 directive: 20251016

#### After Quick Fix

```logtalk
:- object(my_object).

	:- info([
		version is 1:0:0,
		author is 'John Doe',
		date is 2025-10-16,
		comment is 'This is a test object'
	]).

:- end_object.
```

### Example 4: Parametric Entity with Future Date

#### Before Quick Fix

```logtalk
:- object(list(_Type)).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2027-01-01,
		comment is '',
		parnames is ['Type']
	]).

:- end_object.
```

**Warning**: Date in info/1 directive is in the future: 2027-01-01

#### After Quick Fix (assuming current date is 2025-10-16)

```logtalk
:- object(list(_Type)).

	:- info([
		version is 1:0:0,
		author is '',
		date is 2025-10-16,
		comment is '',
		parnames is ['Type']
	]).

:- end_object.
```

## Key Features

### Date Validation and Replacement:
- ✅ Detects "Invalid date in info/1 directive:" warnings
- ✅ Detects "Date in info/1 directive is in the future:" warnings
- ✅ Extracts the invalid/future date from the diagnostic message
- ✅ Searches backwards from warning line to locate info/1 directive opening
- ✅ Uses `PredicateUtils.getDirectiveRange()` to handle multi-line directives
- ✅ Generates current date in YYYY-MM-DD format
- ✅ Uses regex with proper escaping to replace the date
- ✅ Replaces entire directive to maintain formatting
- ✅ Provides descriptive action titles based on warning type

### Regex Escaping:
- ✅ Escapes special regex characters in the invalid date string
- ✅ Uses `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` to escape metacharacters
- ✅ Ensures accurate date replacement even with special characters

## Integration

The quick fixes are automatically available in VS Code when:
1. An "Invalid date in info/1 directive:" or "Date in info/1 directive is in the future:" warning is present
2. The user clicks on the warning or places the cursor on the warning line
3. The user triggers the quick fix action (e.g., Cmd+. on macOS, Ctrl+. on Windows/Linux)

The quick fixes appear in the context menu as:
- "Fix invalid date in info/1 directive"
- "Fix future date in info/1 directive"

## Dependencies

- **PredicateUtils.getDirectiveRange()** - Computes the full range of multi-line directives
- **Position, Range** - VS Code API for text positions and ranges
- **WorkspaceEdit** - VS Code API for document edits

## Technical Notes

### Date Format

The current date is generated in YYYY-MM-DD format:
```typescript
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const currentDate = `${year}-${month}-${day}`;
```

### Regex Escaping

Special regex characters in the invalid date are escaped to ensure accurate replacement:
```typescript
invalidDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
```

This handles dates that might contain special characters like:
- `2025/10/16` (slashes)
- `2025.10.16` (dots)
- `2025-10-16` (hyphens)

### Backward Search for Directive

The implementation searches backwards from the warning line to find the info/1 directive opening:
```typescript
for (let i = warningLine; i >= 0; i--) {
  const lineText = document.lineAt(i).text.trim();
  if (lineText.match(/^\:-\s*info\(\[/)) {
    infoDirectiveLine = i;
    break;
  }
}
```

This ensures the correct directive is found even when the warning is on a line within the directive body.

## Testing Recommendations

To ensure the quick fixes work correctly, test with:
1. Invalid date formats (e.g., `2025/10/16`, `20251016`, `2025.10.16`)
2. Future dates in valid format (e.g., `2027-01-01`)
3. Multi-line info/1 directives
4. info/1 directives with parnames (parametric entities)
5. info/1 directives with various other keys (author, comment, etc.)
6. Edge cases with special characters in dates

