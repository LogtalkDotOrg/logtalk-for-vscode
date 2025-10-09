# Logtalk Code Extraction Refactoring

This document describes the code extraction refactoring features for the Logtalk VS Code extension.

## Overview

The refactor provider offers two types of code extraction:

1. **Extract to new Logtalk entity**: Creates a new entity (object, protocol, or category) with proper structure
2. **Extract to new Logtalk file**: Creates a new file with verbatim copy of selected code

These features are useful for:

- Breaking down large entities into smaller, more manageable pieces
- Creating reusable components
- Improving code organization and modularity
- Quick code snippets and examples

## How to Use

1. **Select Code**: In a Logtalk file, select the code you want to extract (predicates, directives, etc.)

2. **Trigger Refactoring**:
   - Right-click on the selected code
   - Choose either:
     - "Extract to new Logtalk entity" for structured entity creation
     - "Extract to new Logtalk file" for simple file creation
   - Or use the Command Palette (Ctrl/Cmd+Shift+P) and search for the desired extraction type

## Extract to New Entity

1. **Choose Entity Type**: Select the type of entity to create:
   - **Object**: For creating new objects with predicates and facts
   - **Protocol**: For creating new protocols with predicate declarations
   - **Category**: For creating new categories with shared predicates

2. **Enter Entity Name**: Provide a name for the new entity (must be a valid Logtalk atom)

3. **Confirm Filename**: Edit or confirm the filename (without extension) for the new file

4. **Save File**: Use the save dialog to choose the directory and finalize the file location

5. **Result**:
   - A new `.lgt` file is created with:
     - Entity opening directive (`:- object(name).`, `:- protocol(name).`, or `:- category(name).`)
     - Empty line
     - `info/1` directive with version, author, date, and comment
     - Empty line
     - Your selected code (copied verbatim with trimmed empty lines)
     - Empty line
     - Entity closing directive (`:- end_object.`, `:- end_protocol.`, or `:- end_category.`)
   - The selected code is removed from the original file
   - The original file is marked as modified (user can save or undo)

## Extract to New File

1. **Enter Filename**: Provide a filename (without extension) for the new file

2. **Save File**: Use the save dialog to choose the directory and finalize the file location

3. **Result**:
   - A new `.lgt` file is created with the selected code copied verbatim (with trimmed empty lines)
   - The selected code is removed from the original file
   - The original file is marked as modified (user can save or undo)

## Example

If you select this code:
```logtalk
helper_predicate(Input, Output) :-
    atom_codes(Input, Codes),
    reverse(Codes, ReversedCodes),
    atom_codes(Output, ReversedCodes).

another_helper(X, Y) :-
    length(X, Len),
    Y is Len * 2.
```

And choose to extract it to an object named `string_utilities`, the generated file will be:

```logtalk
:- object(string_utilities).

	:- info([
		version is 1:0:0,
		author is 'Your Name',
		date is 2024-01-01,
		comment is 'Extracted object entity'
	]).

	helper_predicate(Input, Output) :-
		atom_codes(Input, Codes),
		reverse(Codes, ReversedCodes),
		atom_codes(Output, ReversedCodes).

	another_helper(X, Y) :-
		length(X, Len),
		Y is Len * 2.

:- end_object.
```

## Implementation Details

- **File**: `src/refactorProvider.ts`
- **Registration**: Added to `src/extension.ts`
- **Command**: `logtalk.refactor.extractToEntity`
- **Tests**: `tests/refactorProvider.test.ts`

## Features

- ✅ Code action provider integration
- ✅ Two extraction modes:
  - Extract to new entity (with proper Logtalk structure)
  - Extract to new file (verbatim copy)
- ✅ Entity type selection (object, protocol, category)
- ✅ Entity name validation
- ✅ Filename validation
- ✅ Save dialog for file name and location selection
- ✅ Automatic `info/1` directive generation (for entities)
- ✅ Verbatim code copying with empty line trimming
- ✅ Automatic removal of extracted code from source file
- ✅ Git author detection
- ✅ Error handling and user feedback

## Troubleshooting

### Save Dialog Issues

The implementation now uses a two-step approach to ensure filename editability:

1. **Filename Input**: First prompts for filename confirmation/editing
2. **Directory Selection**: Then uses save dialog for directory selection

If you encounter issues:

1. **Check VS Code Version**: Ensure you're using a recent version of VS Code
2. **Platform Differences**: Behavior may vary between Windows, macOS, and Linux
3. **Enable Debug Logs**:
   - Command Palette → "Logtalk: Show Extension Logs"
   - Look for save dialog debug messages
4. **Test with Different Names**: Try different entity names to rule out character issues

### Common Issues

- **Filename not editable**: This may be a platform-specific VS Code issue
- **Wrong default directory**: Check that the current file is saved and has a valid path
- **File filters not working**: Ensure your VS Code version supports file filters in save dialogs

## Future Enhancements

Potential improvements for future versions:
- Extract to existing entity
- Smart entity type detection based on selected code
- Automatic import/use directive generation
- Refactor entity relationships
- Extract with dependency analysis
