# File Rename and Deletion Propagation Implementation

## Overview

These features automatically propagate file renames and deletions to `loader.lgt` and `tester.lgt` files in the same directory.

- **File Rename**: When a Logtalk file is renamed in VS Code, the extension automatically updates all references to that file in `logtalk_load/1` and `logtalk_load/2` calls.
- **File Deletion**: When a Logtalk file is deleted in VS Code, the extension automatically removes all references to that file in `logtalk_load/1` and `logtalk_load/2` calls, handling commas appropriately to avoid syntax errors.

## Implementation Details

### Core Components

1. **FileRenameHandler** (`src/utils/fileRenameHandler.ts`)
   - Main class that handles both rename and deletion propagation logic
   - Searches for loader and tester files in the same directory
   - For renames: Updates file references while preserving format
   - For deletions: Removes file references and handles commas to avoid syntax errors

2. **Integration** (`src/extension.ts`)
   - Uses four workspace event handlers:
     - **`workspace.onWillRenameFiles`**: Provides rename preview
       - Called before the rename happens
       - Returns a `WorkspaceEdit` with all propagation changes
       - VS Code includes these changes in the rename preview dialog
       - User can review and confirm or cancel all changes
     - **`workspace.onDidRenameFiles`**: Cleanup after rename
       - Called after the rename is completed
       - Cleans up diagnostics for the old file path
     - **`workspace.onWillDeleteFiles`**: Provides deletion preview
       - Called before the deletion happens
       - Returns a `WorkspaceEdit` with all propagation changes (removed references)
       - VS Code includes these changes in the deletion preview dialog
       - User can review and confirm or cancel all changes
     - **`workspace.onDidDeleteFiles`**: Cleanup after deletion
       - Called after the deletion is completed
       - Cleans up diagnostics for the deleted file

### Supported Reference Formats

The implementation handles all common ways files are referenced in `logtalk_load/1` and `logtalk_load/2`:

1. **Unquoted atoms**: `logtalk_load(example)` or `logtalk_load([example, other])`
2. **Single-quoted**: `logtalk_load('example')` or `logtalk_load(['example'])`
3. **Double-quoted**: `logtalk_load("example")` or `logtalk_load(["example"])`
4. **With extensions**: `logtalk_load('example.lgt')` or `logtalk_load("example.logtalk")`
5. **Mixed formats**: `logtalk_load([example, 'other', "third"])`
6. **Multi-line calls**: Properly handles `logtalk_load` calls that span multiple lines:

   ```logtalk
   logtalk_load([
       state_space,
       water_jug,
       farmer,
       bridge,
       eight_puzzle
   ])
   ```

### Format Preservation

The implementation preserves the original format of file references:

- If a file was referenced as `example`, it becomes `new_name`
- If a file was referenced as `'example'`, it becomes `'new_name'`
- If a file was referenced as `"example"`, it becomes `"new_name"`
- If a file was referenced as `'example.lgt'`, it becomes `'new_name.lgt'`

### Library Notation Handling

The implementation correctly skips library notation references:

- `lgtunit(loader)` is NOT affected by renaming a file called `loader.lgt`
- `library(types)` is NOT affected by renaming a file called `types.lgt`
- `logtalk_load(example)` IS affected (direct argument to loading predicate)

This is achieved by:

1. Checking if an unquoted match is preceded by `(`
2. Extracting the atom before the `(`
3. Checking if that atom is a loading predicate (`logtalk_load`, `ensure_loaded`, `include`, `use_module`, `load_files`)
4. If it's a loading predicate, proceed with rename; otherwise skip (it's library notation)

### Edge Cases

1. **Renaming loader.lgt or tester.lgt**: These files are skipped to avoid circular updates
2. **Moving files to different directories**: Currently logs a message but doesn't automatically add to new directory's loader/tester
3. **Multiple references**: All references in a file are updated
4. **Multi-line logtalk_load calls**: Each line is processed independently

## Testing

See `README.md` in this directory for comprehensive testing instructions.

## Future Enhancements

Potential improvements:

1. Handle file moves to different directories by offering to add to new directory's loader/tester
2. Support for other loading predicates (e.g., `ensure_loaded/1`, `include/1`)
3. User confirmation dialog before applying changes
4. Undo support for rename propagation
5. Handle comments that reference the file name

## Technical Notes

### Regex Patterns

The implementation uses three main regex patterns:

1. **Single-quoted**: `'(filename)(?:\.(lgt|logtalk))?'`
2. **Double-quoted**: `"(filename)(?:\.(lgt|logtalk))?"`
3. **Unquoted**: `\b(filename)(?:\.(lgt|logtalk))?\b`

### Comma Handling (File Deletion)

When deleting a file reference, the implementation handles commas to avoid syntax errors:

1. **Comma after the reference (same line)**: Deletes the reference and the trailing comma
   - Example: `[file1, file2, file3]` → `[file1, file3]` (when deleting `file2`)

2. **Comma before the reference on the same line (no comma after)**: Deletes the leading comma and the reference
   - Example: `[file1, file2]` → `[file1]` (when deleting `file2`)

3. **Comma on the previous line (multi-line lists)**: When the reference is the last item and the comma is on the previous line
   - Example:

     ```logtalk
     logtalk_load([
         file1,
         file2
     ])
     ```

     When deleting `file2`, both the comma after `file1` and the entire line containing `file2` are deleted, preserving the indentation of remaining lines

4. **Empty line after deletion**: Deletes the entire line including the newline
   - Example: A line containing only the deleted reference is completely removed

### Performance

- Only processes files in the same directory as the renamed file
- Tracks nesting depth to efficiently handle multi-line `logtalk_load` calls
- Uses efficient regex matching with proper state reset
- **Timeout protection**: Operations timeout after 5 seconds to prevent hanging
- **Infinite loop prevention**: Maximum iteration limit (100) per line

### Error Handling

- Wrapped in try-catch blocks with appropriate logging
- Continues processing even if one file fails
- Reports errors through the logger utility
- **Empty match protection**: Advances regex manually if an empty match is detected
- **Graceful timeout**: Returns null if operation takes too long, allowing rename to proceed
