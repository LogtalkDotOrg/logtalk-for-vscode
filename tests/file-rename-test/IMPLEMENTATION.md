# File Rename Propagation Implementation

## Overview

This feature automatically propagates file renames to `loader.lgt` and `tester.lgt` files in the same directory. When a Logtalk file is renamed in VS Code, the extension automatically updates all references to that file in `logtalk_load/1` and `logtalk_load/2` calls.

## Implementation Details

### Core Components

1. **FileRenameHandler** (`src/utils/fileRenameHandler.ts`)
   - Main class that handles the rename propagation logic
   - Searches for loader and tester files in the same directory
   - Updates file references while preserving format

2. **Integration** (`src/extension.ts`)
   - Uses two workspace event handlers:
     - **`workspace.onWillRenameFiles`**: Provides rename preview
       - Called before the rename happens
       - Returns a `WorkspaceEdit` with all propagation changes
       - VS Code includes these changes in the rename preview dialog
       - User can review and confirm or cancel all changes
     - **`workspace.onDidRenameFiles`**: Cleanup after rename
       - Called after the rename is completed
       - Cleans up diagnostics for the old file path

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
