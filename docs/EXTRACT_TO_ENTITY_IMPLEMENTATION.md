# Extract to Logtalk Entity Refactoring Implementation

## Overview

This document describes the implementation of the "Extract to Logtalk entity" refactoring operation, which allows users to move selected code from one file to an existing Logtalk entity in another file.

## Implementation Details

### Location
- **File**: `src/features/refactorProvider.ts`
- **Method**: `extractToEntity(document: TextDocument, selection: Selection): Promise<void>`
- **Lines**: 413-526

### Command Registration
- **File**: `src/extension.ts`
- **Command ID**: `logtalk.refactor.extractToEntity`
- **Lines**: 437-443

### Functionality

The refactoring operation performs the following steps:

1. **Validate Selection**: Checks that the user has selected non-empty code
2. **Prompt for Entity Name**: Asks the user to enter the name of the target entity
3. **Find Entity Definition**: Uses `LogtalkTerminal.getEntityDefinition()` to locate the entity definition file and line number by entity name
4. **Determine Entity Type**: Analyzes the opening directive to determine if it's an object, protocol, or category
5. **Find Closing Directive**: Uses `findEntityClosingDirective()` to locate the entity's closing directive (`:- end_object.`, `:- end_protocol.`, or `:- end_category.`)
6. **Process Selected Code**: Trims empty lines at the beginning and end while preserving indentation
7. **Determine Insertion Point**: Checks if there's already an empty line before the closing directive to determine the optimal insertion position and spacing
8. **Insert Code**: Inserts the processed code with appropriate spacing to ensure one empty line before and after the moved code
9. **Remove Original Code**: Deletes the selected code from the source file
10. **Open Target File**: Opens the target entity file and positions the cursor at the insertion point

### Code Action Provider Integration

The refactoring is available as a code action when:
- The user has selected multiple lines of code, OR
- The selection includes at least one complete line

The code action appears in the "Refactor..." menu alongside other extraction operations:
- Extract to Logtalk entity (new implementation)
- Extract to new Logtalk entity
- Extract to new Logtalk file
- Replace with include/1 directive

### Key Features

1. **Reuses Existing Infrastructure**:
   - Uses `LogtalkTerminal.getEntityDefinition()` to find entity definitions by name (same method used by the profiling feature)
   - Uses `findEntityClosingDirective()` helper method for locating entity boundaries
   - Uses `processSelectedCode()` for consistent code formatting

2. **Error Handling**:
   - Validates that the workspace folder is open
   - Checks that the entity definition can be found
   - Verifies that the entity type can be determined
   - Ensures the closing directive exists
   - Provides user-friendly error messages for all failure cases

3. **User Experience**:
   - Simple input box for entity name with validation
   - Automatic file opening and cursor positioning
   - Informative success/error messages
   - Preserves code indentation and formatting
   - Ensures proper spacing: one empty line before the moved code and one empty line before the entity closing directive

### Example Usage

Given a source file with selected code:
```logtalk
% Source file
foo :-
    bar,
    baz.
```

And a target entity:
```logtalk
:- object(my_object).

    % Existing code

:- end_object.
```

After running "Extract to Logtalk entity" and entering "my_object":

```logtalk
:- object(my_object).

    % Existing code

    foo :-
        bar,
        baz.

:- end_object.
```

The selected code is removed from the source file and inserted before the closing directive in the target entity.

**Spacing Logic**: The implementation ensures proper spacing with two different strategies:

1. **When there's already an empty line before the closing directive**:
   - Inserts at the empty line position with format: `\n${processedCode}\n`
   - First `\n` ends the previous content line
   - The code is inserted
   - Second `\n` ends the moved code
   - The existing empty line (where we inserted) serves as the separator before the closing directive
   - Result: One empty line before code, one empty line before closing directive

2. **When there's content immediately before the closing directive**:
   - Inserts at the closing directive with format: `\n\n${processedCode}\n\n`
   - First `\n` ends the previous content line
   - Second `\n` creates an empty line before the moved code
   - The code is inserted
   - Third `\n` ends the moved code
   - Fourth `\n` creates an empty line before the closing directive
   - Result: One empty line before code, one empty line before closing directive

This maintains consistent, readable formatting regardless of the target entity's current state.

## Testing

The implementation can be tested by:
1. Creating a Logtalk file with an entity definition
2. Creating another file with code to extract
3. Selecting the code to extract
4. Opening the "Refactor..." menu (Ctrl+Shift+R or Cmd+Shift+R)
5. Selecting "Extract to Logtalk entity"
6. Entering the target entity name
7. Verifying that the code is moved correctly

## Future Enhancements

Potential improvements for future versions:
- Auto-complete suggestions for entity names
- Preview of the target entity before extraction
- Support for extracting to entities in the same file
- Automatic detection of the target entity based on context
- Undo/redo support with proper transaction handling

