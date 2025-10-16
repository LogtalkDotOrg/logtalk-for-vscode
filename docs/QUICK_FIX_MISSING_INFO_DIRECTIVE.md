# Quick Fix for "Missing directive: info/1" Warning

## Overview

This document describes the implementation of a quick fix for the Logtalk Documentation Linter warning "Missing directive: info/1". The quick fix automatically adds an `info/1` directive after the entity opening directive with default values.

## Implementation Location

**File**: `src/features/logtalkDocumentationLinter.ts`

## Implementation Details

### 1. Updated Imports

Added the following imports to support the quick fix functionality:
- `CodeAction` - Represents a code action (quick fix)
- `CodeActionKind` - Specifies the kind of code action (QuickFix)
- `WorkspaceEdit` - Represents edits to be applied to the workspace
- `PredicateUtils` - Utility for getting directive ranges
- `Utils` - Utility for finding entity opening directives

### 2. Updated `provideCodeActions` Method

Changed the method signature from:
```typescript
provideCodeActions(...): Command[] | Thenable<Command[]>
```

To:
```typescript
public async provideCodeActions(...): Promise<CodeAction[]>
```

The method now:
1. Iterates through diagnostics in the current context
2. Checks if each diagnostic can be fixed using `canFix()`
3. Creates a quick fix using `createQuickFix()` if applicable
4. Returns an array of code actions

### 3. Implemented `canFix` Method

```typescript
private canFix(diagnostic: Diagnostic): boolean {
  if (diagnostic.message.includes('Missing directive: info/1')) {
    return true;
  }
  return false;
}
```

This method checks if a diagnostic has an associated quick fix available.

### 4. Implemented `createQuickFix` Method

The main quick fix implementation:

```typescript
private createQuickFix(document: TextDocument, diagnostic: Diagnostic): CodeAction | null {
  // Create the edit that will fix the issue
  const edit = new WorkspaceEdit();
  let action: CodeAction;

  if (diagnostic.message.includes('Missing directive: info/1')) {
    // Add info/1 directive after entity opening directive
    action = new CodeAction(
      'Add info/1 directive',
      CodeActionKind.QuickFix
    );

    // Find the entity opening directive from the warning location
    const entityLine = Utils.findEntityOpeningDirective(document, diagnostic.range.start.line);
    if (entityLine === null) {
      return null;
    }

    // Get the full range of the entity opening directive
    const directiveRange = PredicateUtils.getDirectiveRange(document, entityLine);
    
    // Get current date in YYYY-MM-DD format
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const currentDate = `${year}-${month}-${day}`;

    // Get indentation from the entity opening directive
    const entityLineText = document.lineAt(entityLine).text;
    const indent = entityLineText.match(/^(\s*)/)[1];

    // Create the info/1 directive with the specified keys
    const infoDirective = `${indent}:- info([\n` +
      `${indent}\tversion is 1:0:0,\n` +
      `${indent}\tauthor is '',\n` +
      `${indent}\tdate is ${currentDate},\n` +
      `${indent}\tcomment is ''\n` +
      `${indent}]).\n`;

    // Insert the info/1 directive after the entity opening directive with an empty line
    const insertPosition = new Position(directiveRange.end + 1, 0);
    edit.insert(document.uri, insertPosition, '\n' + infoDirective);
  }

  action.edit = edit;
  // Associate this action with the specific diagnostic
  action.diagnostics = [diagnostic];
  action.command = {
    title: 'Logtalk Documentation Linter',
    command: 'logtalk.update.diagnostics',
    arguments: [document.uri, diagnostic]
  };

  return action;
}
```

## Quick Fix Behavior

When the user triggers the quick fix on a "Missing directive: info/1" warning:

1. **Locates Entity Opening Directive**: Uses `Utils.findEntityOpeningDirective()` to search backwards from the warning location to find the entity opening directive (`:- object(...)`, `:- protocol(...)`, or `:- category(...)`).

2. **Computes Directive Range**: Uses `PredicateUtils.getDirectiveRange()` to find the complete range of the entity opening directive (handles multi-line directives).

3. **Generates Current Date**: Creates a date string in `YYYY-MM-DD` format using the current date.

4. **Preserves Indentation**: Extracts the indentation from the entity opening directive to maintain consistent code formatting.

5. **Creates info/1 Directive**: Generates an `info/1` directive with the following default keys:
   - `version is 1:0:0` - Initial version
   - `author is ''` - Empty author (to be filled by user)
   - `date is YYYY-MM-DD` - Current date
   - `comment is ''` - Empty comment (to be filled by user)

6. **Inserts Directive**: Adds the `info/1` directive after the entity opening directive with an empty line between them.

## Example

### Before Quick Fix

```logtalk
:- object(my_object).

    % ... predicates ...

:- end_object.
```

**Warning**: Missing directive: info/1

### After Quick Fix

```logtalk
:- object(my_object).

:- info([
	version is 1:0:0,
	author is '',
	date is 2025-10-16,
	comment is ''
]).

    % ... predicates ...

:- end_object.
```

## Integration

The quick fix is automatically available in VS Code when:
1. A "Missing directive: info/1" warning is present in the PROBLEMS pane
2. The user clicks on the warning or places the cursor on the warning line
3. The user triggers the quick fix action (e.g., Cmd+. on macOS, Ctrl+. on Windows/Linux)

The quick fix appears in the context menu as "Add info/1 directive".

## Dependencies

- `Utils.findEntityOpeningDirective()` - Finds entity opening directives by searching backwards
- `PredicateUtils.getDirectiveRange()` - Computes the full range of multi-line directives
- `DiagnosticsUtils` - Utilities for diagnostic management (inherited from base implementation)

## Notes

- The implementation follows the same pattern as quick fixes in `logtalkLinter.ts`
- The date format is `YYYY-MM-DD` as specified in the requirements
- Empty strings are used for `author` and `comment` to allow users to fill in their own values
- The version is set to `1:0:0` (major:minor:patch format)
- Indentation is preserved from the entity opening directive
- An empty line is added between the entity opening directive and the `info/1` directive for better readability

