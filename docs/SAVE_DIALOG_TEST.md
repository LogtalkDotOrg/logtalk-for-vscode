# Save Dialog Testing Instructions

To test if the save dialog allows filename editing:

## Manual Test Steps

1. **Open VS Code** with the Logtalk extension loaded
2. **Open a Logtalk file** (e.g., `tests/refactor-test-example.lgt`)
3. **Select some code** in the file (e.g., the helper predicates)
4. **Right-click** and choose "Extract to new Logtalk entity"
5. **Choose entity type** (e.g., "Object")
6. **Enter entity name** (e.g., "string_helpers")
7. **Check the filename input**:
   - Should show an input box with the entity name as default
   - User should be able to edit the filename (without extension)
   - Input validation should prevent empty or invalid filenames

8. **Check the save dialog**:
   - Should show a save dialog with the confirmed filename
   - User should be able to navigate to different directories
   - File type filter should show "Logtalk Files"
   - Default directory should be the same as the current file

## Expected Behavior

The new two-step process should:

- ✅ Show filename input with entity name as default
- ✅ Allow user to edit the filename (without extension)
- ✅ Validate filename for invalid characters
- ✅ Show save dialog with confirmed filename
- ✅ Allow user to navigate to different directories
- ✅ Have file type filters for Logtalk files
- ✅ Default to the same directory as the current file

## Debugging

If the filename is not editable:
1. Check the VS Code version (some older versions had issues)
2. Check the platform (Windows/Mac/Linux behavior might differ)
3. Check the extension logs for debug messages:
   - Open Command Palette (Ctrl/Cmd+Shift+P)
   - Run "Logtalk: Show Extension Logs"
   - Look for save dialog debug messages

## Platform-Specific Notes

- **Windows**: Save dialog should show with editable filename field
- **macOS**: Save dialog should show with editable filename field
- **Linux**: Save dialog behavior may vary by desktop environment

## Fallback Test

If save dialog doesn't work as expected, you can test the URI construction:
1. Check the debug logs for the constructed URI
2. Verify the path is correct for your platform
3. Test with different entity names and file locations
