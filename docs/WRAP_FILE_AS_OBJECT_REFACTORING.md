# Wrap File Contents as an Object Refactoring

## Overview

This document describes the "Wrap file contents as an object" refactoring feature for the Logtalk VS Code extension.

## Feature Description

The refactoring provides a quick way to wrap existing Logtalk code that doesn't have any entity or module directives into a proper Logtalk object. This is useful when:

- Converting plain Prolog-style code to Logtalk
- Organizing loose predicates into an object structure
- Preparing code for better encapsulation and modularity

## How It Works

### Trigger Conditions

The refactoring action appears in the refactoring menu when:

1. The cursor is in a Logtalk file (no selection required)
2. The file contains **no** entity opening directives (`:- object(...)`, `:- protocol(...)`, `:- category(...)`)
3. The file contains **no** entity closing directives (`:- end_object.`, `:- end_protocol.`, `:- end_category.`)
4. The file contains **no** module opening directive (`:- module(...)`)

### Action

When triggered, the refactoring:

1. **Determines the object name**: Uses the basename of the file (without any extension) converted to lowercase as the object name
2. **Validates the object name**: Ensures it's a valid Logtalk atom (starts with lowercase letter, contains only letters, digits, and underscores)
3. **Trims empty lines**: Removes all empty lines at the beginning and end of the file
4. **Adds object opening directive**: Inserts `:- object(name).` at the top of the file with exactly one empty line after it
5. **Adds object closing directive**: Inserts `:- end_object.` at the bottom of the file with exactly one empty line before it

### Example

**Before** (file: `test_wrap.lgt`):
```logtalk
% Test file for wrap as object refactoring
% This file has no entity or module directives

:- public(foo/1).

foo(bar).
foo(baz).

:- public(test/0).

test :-
    foo(X),
    write(X), nl.
```

**After** applying "Wrap file contents as an object":
```logtalk
:- object(test_wrap).

% Test file for wrap as object refactoring
% This file has no entity or module directives

:- public(foo/1).

foo(bar).
foo(baz).

:- public(test/0).

test :-
    foo(X),
    write(X), nl.

:- end_object.
```

## Implementation Details

### Files Modified

1. **`src/features/refactorProvider.ts`**:
   - Added `fileContainsEntityOrModule()` method to check if file has entities or modules
   - Added `wrapFileAsObject()` method to perform the wrapping
   - Modified `provideCodeActions()` to offer the action when conditions are met

2. **`src/extension.ts`**:
   - Registered the `logtalk.refactor.wrapFileAsObject` command

### Key Methods

#### `fileContainsEntityOrModule(document: TextDocument): boolean`

Scans the document to check for:
- Entity opening directives using `PatternSets.entityOpening`
- Entity closing directives using `PatternSets.entityEnding`
- Module opening directive using regex `/^:-\s*module\(/`

Returns `true` if any are found, `false` otherwise.

#### `wrapFileAsObject(document: TextDocument): Promise<void>`

Performs the wrapping operation:

1. Extracts object name from filename (removing any extension and converting to lowercase)
2. Validates the object name
3. Finds and trims all empty lines at the beginning of the file
4. Finds and trims all empty lines at the end of the file
5. Creates a `WorkspaceEdit` with deletions and insertions:
   - Deletes empty lines at the beginning (if any)
   - Deletes empty lines at the end (if any)
   - Inserts opening directive at position (0, 0)
   - Inserts closing directive at the end of the file
6. Applies the edit and shows feedback to the user

### Validation

The object name must:

- Start with a lowercase letter
- Contain only letters, digits, and underscores
- Match the regex: `/^[a-z][a-zA-Z0-9_]*$/`

**Note**: The filename (without extension) is automatically converted to lowercase to prevent simple validation failures. For example, `MyFile.lgt` becomes object `myfile`, and `Test_Helper.pl` becomes object `test_helper`.

If the filename (after lowercase conversion) doesn't produce a valid object name, an error message is shown.

### Spacing Rules

The implementation ensures proper spacing:

**Empty line trimming**:

- All empty lines at the beginning of the file are removed
- All empty lines at the end of the file are removed

**Opening directive**:

- Inserted at the very beginning of the file (after trimming)
- Followed by exactly one empty line

**Closing directive**:

- Inserted at the end of the file (after trimming)
- Preceded by exactly one empty line

This ensures consistent formatting with exactly one empty line after the opening directive and one empty line before the closing directive, regardless of how many empty lines were in the original file.

## Usage

1. Open a Logtalk file that has no entity or module directives
2. Place the cursor anywhere in the file (no selection needed)
3. Open the refactoring menu:
   - Right-click and select "Refactor..."
   - Or use the keyboard shortcut (Ctrl/Cmd + Shift + R)
   - Or use the lightbulb icon if it appears
4. Select "Wrap file contents as an object"
5. The file will be wrapped with object directives

## Error Handling

The refactoring handles several error cases:

1. **Invalid filename**: If the filename doesn't produce a valid Logtalk object name, an error message is shown
2. **Edit failure**: If the workspace edit fails to apply, an error message is shown
3. **Exceptions**: Any exceptions during the process are caught, logged, and shown to the user

## Benefits

- **Quick conversion**: Instantly wrap existing code in an object structure
- **Automatic naming**: Uses the filename as the object name
- **Proper formatting**: Ensures correct spacing and structure
- **Safe operation**: Validates object name before applying changes
- **User feedback**: Clear success/error messages

## Future Enhancements

Potential improvements:
- Allow user to customize the object name
- Add option to include an `info/1` directive
- Support wrapping into protocol or category
- Handle files with partial entity structure
- Add undo/redo support with proper change tracking

## Testing

Test the feature with:

- Files with various content (predicates, directives, comments)
- Files with different naming patterns
- Files with invalid names (e.g., starting with uppercase)
- Files with empty lines at the beginning
- Files with empty lines at the end
- Files with empty lines at both beginning and end
- Empty files
- Files with only comments
- Files with trailing whitespace

## Related Features

- **Convert module to object**: Converts Prolog modules to Logtalk objects
- **Extract to new entity**: Extracts selected code to a new entity
- **Entity type conversions**: Converts between object, protocol, and category

