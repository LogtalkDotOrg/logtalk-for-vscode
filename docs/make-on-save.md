# Make On Save Feature

## Overview

The `logtalk.make.onSave` setting enables automatic execution of the `logtalk.make.reload` command whenever a Logtalk source file is saved in the workspace.

## Configuration

### Setting Details

- **Setting Name**: `logtalk.make.onSave`
- **Type**: Boolean
- **Default Value**: `false`
- **Description**: Automatically call 'logtalk.make.reload' command when saving a Logtalk source file.

### How to Enable

1. Open VS Code Settings (File → Preferences → Settings or `Ctrl+,`/`Cmd+,`)
2. Search for "logtalk make onSave"
3. Check the checkbox to enable the feature

Alternatively, you can add this to your `settings.json`:

```json
{
  "logtalk.make.onSave": true
}
```

## Behavior

When enabled, the feature:

- Monitors save events for files with the `logtalk` language ID (`.lgt` and `.logtalk` files)
- Automatically calls the `logtalk.make.reload` command when such files are saved
- Only affects Logtalk files; other file types are ignored
- Respects the setting value and can be toggled on/off without restarting VS Code
- **Intelligently handles "Save All" command**: Uses a debounce mechanism (500ms delay) to ensure the make tool is called only once when multiple files are saved in quick succession, rather than once per file

## Use Cases

This feature is particularly useful for:

- **Development Workflow**: Automatically reload code changes without manual intervention
- **Rapid Prototyping**: Immediate feedback when making changes to Logtalk code
- **Testing**: Ensure the latest changes are always loaded when running tests
- **Continuous Development**: Streamline the edit-save-reload cycle

## Implementation Details

The feature is implemented as an `onDidSaveTextDocument` event handler that:

1. Checks if the saved document has `languageId === 'logtalk'`
2. Retrieves the `logtalk.make.onSave` configuration setting
3. If both conditions are true, tracks the saved file and starts/resets a debounce timer
4. After 500ms of no additional saves, executes the `logtalk.make.reload` command once

### Debounce Mechanism

To handle the "Save All" command efficiently, the implementation uses a debounce timer:

- When a Logtalk file is saved, a 500ms timer is started (or reset if already running)
- If another file is saved within 500ms, the timer is reset
- Only when 500ms passes without any new saves does the make command execute
- This ensures that "Save All" triggers only one make operation instead of one per file
- The debounce delay of 500ms is chosen to be imperceptible to users while reliably batching rapid save operations

## Related Commands

- `logtalk.make.reload`: The command that gets automatically executed
- Other make commands (`logtalk.make.debug`, `logtalk.make.optimal`, etc.) are not affected by this setting

## Troubleshooting

If the feature doesn't work as expected:

1. Verify the setting is enabled in VS Code settings
2. Ensure you're saving a file with `.lgt` or `.logtalk` extension
3. Check that the Logtalk extension is properly configured with required settings
4. Look for any error messages in the VS Code output panel
