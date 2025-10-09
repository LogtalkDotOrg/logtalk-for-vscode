# Space-to-Tab Conversion Implementation

## Overview

This document describes the space-to-tab conversion functionality in the `LogtalkDocumentFormattingEditProvider` that uses VS Code's native "Convert Indentation to Tabs" command followed by simplified entity content indentation.

## VS Code Native Command Integration

The Logtalk formatter now uses VS Code's native `editor.action.indentationToTabs` command to handle space-to-tab conversion:

1. **First step**: Execute `await vscode.commands.executeCommand('editor.action.indentationToTabs')`
2. **Second step**: Apply Logtalk-specific formatting rules to the tab-converted content
3. **Benefits**: Leverages VS Code's robust, well-tested conversion logic
4. **Simplicity**: Eliminates complex custom space-to-tab conversion code

## Problem Solved

The original `indentEntityContent` method only handled cases where content was not indented at all, but it didn't properly handle source code that used spaces for indentation. This caused issues when:

1. **Source code used spaces** instead of tabs for indentation
2. **Mixed indentation** was present (tabs and spaces combined)
3. **Different tab size settings** were used in the editor
4. **Inconsistent spacing** was present in the source

## Solution Implementation

### Implementation Architecture

The space-to-tab conversion uses VS Code's native command followed by Logtalk-specific formatting:

1. **`await vscode.commands.executeCommand('editor.action.indentationToTabs')`** - Uses VS Code's native command
2. **`indentEntityContent()`** - Ensures all entity content has at least one tab of indentation

### Algorithm

The conversion process:

1. **Native conversion** - VS Code's command handles all space-to-tab conversion automatically
2. **Respects user settings** - Uses the editor's configured tab size for conversion
3. **Handles all patterns** - Spaces, mixed indentation, any tab size setting
4. **Entity indentation** - Simple check to ensure minimum one tab for entity content
5. **Preserves content** - Only modifies leading whitespace, preserves all code content

### Important Notes

- The native command operates on the active editor, so it may not affect documents being formatted in the background
- The `indentEntityContent()` method provides a fallback to ensure proper entity content indentation
- No custom space-to-tab conversion logic is implemented - we rely entirely on VS Code's native functionality

### Conversion Logic

```typescript
// Convert leading spaces to tabs based on tab size
let currentIndentLevel = 0;
for (let i = 0; i < leadingWhitespace.length; i++) {
  if (leadingWhitespace[i] === '\t') {
    currentIndentLevel++;
  } else if (leadingWhitespace[i] === ' ') {
    // Count consecutive spaces and convert to tabs
    let spaceCount = 0;
    while (i < leadingWhitespace.length && leadingWhitespace[i] === ' ') {
      spaceCount++;
      i++;
    }
    i--; // Adjust for loop increment
    currentIndentLevel += Math.floor(spaceCount / options.tabSize);
  }
}
```

## Conversion Examples

### Basic Space-to-Tab Conversion

**Tab Size: 4**
```logtalk
% Before (spaces):
:- object(test).
    :- info([version is 1:0:0]).
        test_predicate(X) :-
            X > 0.
:- end_object.

% After (tabs):
:- object(test).
	:- info([version is 1:0:0]).
		test_predicate(X) :-
			X > 0.
:- end_object.
```

### Mixed Indentation Normalization

**Tab Size: 4**
```logtalk
% Before (mixed tabs and spaces):
:- object(test).
	    :- info([version is 1:0:0]).  % Tab + 4 spaces → 2 tabs
    test_predicate(X) :-              % 4 spaces → 1 tab
	        X > 0.                    % Tab + 8 spaces → 3 tabs
:- end_object.

% After (normalized to tabs):
:- object(test).
	:- info([version is 1:0:0]).      % 2 tabs
	test_predicate(X) :-              % 1 tab
		X > 0.                        % 3 tabs
:- end_object.
```

### Different Tab Size Settings

**Tab Size: 2**
```logtalk
% Before:
  :- info([version is 1:0:0]).       % 2 spaces
      test_predicate(X) :-           % 6 spaces
        X > 0.                       % 8 spaces

% After:
	:- info([version is 1:0:0]).     % 1 tab (2 spaces ÷ 2)
		test_predicate(X) :-         % 3 tabs (6 spaces ÷ 2)
			X > 0.                   % 4 tabs (8 spaces ÷ 2)
```

**Tab Size: 8**
```logtalk
% Before:
    :- info([version is 1:0:0]).     % 4 spaces
        test_predicate(X) :-         % 8 spaces
            X > 0.                   % 12 spaces

% After:
	:- info([version is 1:0:0]).     % 1 tab (minimum)
		test_predicate(X) :-         % 1 tab (8 spaces ÷ 8)
		X > 0.                       % 1 tab (12 spaces ÷ 8 = 1.5, rounded down)
```

## Key Features

### 1. Respects Tab Size Settings
- Uses `FormattingOptions.tabSize` to determine space-to-tab conversion ratio
- Supports any tab size setting (2, 4, 8, etc.)
- Calculates tabs as `Math.floor(spaceCount / tabSize)`

### 2. Handles Mixed Indentation
- Processes both tabs and spaces in leading whitespace
- Converts spaces to equivalent tabs based on tab size
- Normalizes inconsistent indentation patterns

### 3. Ensures Minimum Indentation
- Guarantees entity content has at least one tab of indentation
- Handles cases where original indentation is insufficient
- Maintains proper Logtalk code structure

### 4. Preserves Content Integrity
- Only modifies leading whitespace
- Preserves all code content exactly as written
- Maintains comments, strings, and special characters

### 5. Efficient Processing
- Only creates edits when changes are needed
- Skips empty lines and already-correct indentation
- Minimizes unnecessary text replacements

## Integration

### Method Signature Update
```typescript
// Old signature:
private indentEntityContent(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void

// New signature:
private indentEntityContent(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[], options: FormattingOptions): void
```

### Usage in Main Formatting Flow
```typescript
// 3. Indent all content inside the entity
this.indentEntityContent(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits, options);
```

## Edge Cases Handled

### 1. Partial Space Groups
```logtalk
% 3 spaces with tab size 4 → 0 tabs (rounded down) → minimum 1 tab
   :- info([version is 1:0:0]).
→
	:- info([version is 1:0:0]).
```

### 2. Large Space Counts
```logtalk
% 20 spaces with tab size 4 → 5 tabs
                    test_predicate(X).
→
					test_predicate(X).
```

### 3. Already Correct Indentation
```logtalk
% No change needed - already uses tabs
	:- info([version is 1:0:0]).
→
	:- info([version is 1:0:0]).  % No edit created
```

## Testing

Comprehensive test suite covers:
- **Basic space-to-tab conversion** with standard tab sizes
- **Mixed indentation normalization** with tabs and spaces
- **Different tab size settings** (2, 4, 8)
- **Edge cases** like partial space groups and large indentations
- **Content preservation** ensuring no code content is lost
- **Performance** with minimal unnecessary edits

## Benefits

1. **Consistent Code Style** - Ensures all Logtalk code uses tab indentation
2. **Respects User Preferences** - Uses editor's tab size setting
3. **Handles Legacy Code** - Converts existing space-indented code
4. **Robust Processing** - Handles mixed and inconsistent indentation
5. **Preserves Content** - Never modifies actual code content
6. **Efficient Operation** - Only creates edits when necessary

## Compatibility

- **Works with all tab sizes** - 2, 4, 8, or any custom setting
- **Handles all indentation patterns** - spaces, tabs, mixed
- **Preserves existing formatting** - Only changes leading whitespace
- **Maintains VS Code integration** - Uses standard FormattingOptions interface

This enhancement ensures that the Logtalk DocumentFormattingEditProvider can handle any source code indentation style and convert it to consistent, professional tab-based indentation while respecting the user's editor preferences.
