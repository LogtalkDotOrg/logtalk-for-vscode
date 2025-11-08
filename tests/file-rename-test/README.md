# File Rename and Deletion Propagation Test

This directory contains test files for verifying that file renames and deletions are properly propagated to `loader.lgt` and `tester.lgt` files.

## Test Files

- `example.lgt` - A sample Logtalk file that can be renamed (referenced without quotes)
- `another_file.lgt` - Another sample file (referenced with single quotes)
- `third_file.lgt` - Third sample file (referenced with double quotes)
- `loader.lgt` - Loader file that references all three files in different formats
- `tester.lgt` - Tester file that references `example`

## How to Test

### Test 1: Rename a file in the same directory

1. Open this directory in VS Code
2. Right-click on `example.lgt` in the file explorer
3. Select "Rename" (or press F2)
4. Rename it to `example_renamed.lgt`
5. **Preview Dialog**: VS Code will show a preview dialog with all the changes:
   - The file rename: `example.lgt` → `example_renamed.lgt`
   - Updates to `loader.lgt`: `example` → `example_renamed`
   - Updates to `tester.lgt`: `example` → `example_renamed`
6. Click "Apply" to confirm the changes
7. Check that:
   - `loader.lgt` now contains `example_renamed` instead of `example`
   - `tester.lgt` now contains `example_renamed` instead of `example`

### Test 2: Rename with different extension formats

The rename handler should handle files referenced:

- Without extension: `example` → `example_renamed`
- With .lgt extension: `'example.lgt'` → `'example_renamed.lgt'`
- With .logtalk extension: `'example.logtalk'` → `'example_renamed.logtalk'`
- With single quotes: `'example'` → `'example_renamed'`
- With double quotes: `"example"` → `"example_renamed"`

### Test 3: Verify loader.lgt and tester.lgt are not renamed

1. Try renaming `loader.lgt` to `loader_new.lgt`
2. Verify that no propagation occurs (the rename handler should skip loader/tester files)

### Test 4: Rename another_file (single-quoted reference)

1. Rename `another_file.lgt` to `different_file.lgt`
2. Check that `loader.lgt` is updated with `'different_file'` (preserving single quotes)

### Test 5: Rename third_file (double-quoted reference)

1. Rename `third_file.lgt` to `new_third_file.lgt`
2. Check that `loader.lgt` is updated with `"new_third_file"` (preserving double quotes)

### Test 6: Delete a file

1. Right-click on `example.lgt` in the file explorer
2. Select "Delete" (or press Delete/Cmd+Backspace)
3. **Preview Dialog**: VS Code will show a preview dialog with all the changes:
   - The file deletion: `example.lgt`
   - Updates to `loader.lgt`: Reference to `example` will be removed
   - Updates to `tester.lgt`: Reference to `example` will be removed
4. Click "Delete" to confirm the changes
5. Check that:
   - `example.lgt` is deleted
   - `loader.lgt` has the reference to `example` removed (including trailing/leading commas)
   - `tester.lgt` has the reference to `example` removed (including trailing/leading commas)
   - If the line becomes empty after deletion, the entire line is removed

### Test 7: Delete multiple files

1. Select multiple files (e.g., `another_file.lgt` and `third_file.lgt`)
2. Press Delete
3. Verify that all references in `loader.lgt` are removed

## Expected Behavior

### File Rename

When you rename a Logtalk file (other than `loader.lgt` or `tester.lgt`):

1. **Preview Dialog**: VS Code shows a preview of all changes before applying them
   - You can review all the file updates that will be made
   - You can cancel the rename if the changes are not what you expected
2. The file is renamed as usual
3. Any references to the file in `logtalk_load/1` or `logtalk_load/2` calls in `loader.lgt` are automatically updated
4. Any references to the file in `logtalk_load/1` or `logtalk_load/2` calls in `tester.lgt` are automatically updated
5. References with extensions (`.lgt`, `.logtalk`) are also updated
6. The format (quotes, extension) of the reference is preserved:
   - Unquoted: `example` → `example_renamed`
   - Single-quoted: `'example'` → `'example_renamed'`
   - Double-quoted: `"example"` → `"example_renamed"`
   - With extension: `'example.lgt'` → `'example_renamed.lgt'`

### File Deletion

When you delete a Logtalk file (other than `loader.lgt` or `tester.lgt`):

1. **Preview Dialog**: VS Code shows a preview of all changes before applying them
   - You can review all the file updates that will be made
   - You can cancel the deletion if the changes are not what you expected
2. The file is deleted as usual
3. Any references to the file in `logtalk_load/1` or `logtalk_load/2` calls in `loader.lgt` are removed
4. Any references to the file in `logtalk_load/1` or `logtalk_load/2` calls in `tester.lgt` are removed
5. Trailing or leading commas are automatically handled to avoid syntax errors
6. If a line becomes empty after deletion, the entire line is removed

## How It Works

### File Rename

The file rename handler:

1. Detects when a Logtalk file is about to be renamed in VS Code (using `onWillRenameFiles` event)
2. Searches for `loader.lgt` and `tester.lgt` files in the same directory
3. Finds all references to the old file name in `logtalk_load/1` and `logtalk_load/2` calls
4. Updates the references while preserving the original format (quotes, extension)
5. Returns the edits to VS Code, which includes them in the rename preview dialog
6. When the user confirms, all changes are applied together

### File Deletion

The file deletion handler:

1. Detects when a Logtalk file is about to be deleted in VS Code (using `onWillDeleteFiles` event)
2. Searches for `loader.lgt` and `tester.lgt` files in the same directory
3. Finds all references to the deleted file name in `logtalk_load/1` and `logtalk_load/2` calls
4. Deletes those references and handles commas appropriately:
   - If there's a comma after the reference, deletes the reference and the comma
   - If there's no comma after but there's one before, deletes the comma and the reference
   - If the line becomes empty, deletes the entire line
5. Returns the edits to VS Code, which includes them in the deletion preview dialog
6. When the user confirms, all changes are applied together

## Logging

To see detailed logging of the rename propagation:

1. Open the Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
2. Run "Logtalk: Set Extension Logging Level"
3. Select "debug"
4. Open the Output panel and select "Logtalk Extension" from the dropdown
5. Perform a file rename and observe the log messages

## Notes

- The rename and deletion propagation only works for files in the same directory as the loader/tester files
- Files referenced with library notation (e.g., `lgtunit(loader)`) are not affected
- The rename feature preserves the original format of file references (quotes, extension)
- The deletion feature removes references and handles commas to avoid syntax errors
- Both features include a preview dialog so you can review changes before applying them
