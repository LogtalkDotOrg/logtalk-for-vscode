# Testing the New Logging Commands

The new logging commands have been added to the extension. If they're not visible in the Command Palette, follow these steps:

## 1. Reload the Extension

### Option A: Reload Window (Recommended)
1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type: `Developer: Reload Window`
3. Press Enter

### Option B: Restart VSCode
1. Close VSCode completely
2. Reopen VSCode
3. Open your workspace

## 2. Verify Commands Are Available

After reloading, open the Command Palette and search for:

- **`Logtalk: Show Extension Log`** - Should open the output channel
- **`Logtalk: Set Extension Logging Level`** - Should show a picker with log levels

## 3. Test the Commands

### Test Show Extension Log:
1. `Ctrl+Shift+P` → `Logtalk: Show Extension Log`
2. Should open the "Logtalk Extension" output channel

### Test Set Logging Level:
1. `Ctrl+Shift+P` → `Logtalk: Set Extension Logging Level`
2. Should show a picker with options: off, error, warn, info, debug
3. Select "debug" to enable verbose logging
4. Should show confirmation message

### Test Logging Output:
1. Set logging to "debug" level
2. Try using the chat participant: `@logtalk handbook predicates`
3. Check the output channel for detailed debug logs

## 4. Troubleshooting

### Commands Still Not Visible:
1. Check that the extension compiled successfully:
   ```bash
   npx tsc
   ```
2. Look for any TypeScript errors
3. Try reloading the extension development host if running in development mode

### Commands Visible But Not Working:
1. Check the Developer Console for errors:
   - `Help` → `Toggle Developer Tools` → `Console` tab
2. Look for any JavaScript runtime errors

### Extension Not Activating:
The logging commands should be available immediately, but if the extension isn't activating:
1. Open a `.lgt` file to trigger activation
2. Or use any other Logtalk command to activate the extension

## 5. Expected Behavior

### Default State:
- Logging level: `warn` (shows warnings and errors only)
- Output channel: Created but not visible until first log message

### Debug State:
- Logging level: `debug` (shows all messages)
- Output channel: Shows detailed information about:
  - Documentation cache operations
  - Chat participant searches
  - Context7 MCP server attempts
  - Fuse.js search results

### Command Availability:
- Commands should be available globally (not just when Logtalk files are open)
- Commands should appear in Command Palette autocomplete
- Commands should work regardless of current file type

## 6. Verification Checklist

- [ ] Commands appear in Command Palette
- [ ] "Show Extension Log" opens output channel
- [ ] "Set Extension Logging Level" shows picker
- [ ] Log level changes are reflected in output
- [ ] Debug logging shows detailed information
- [ ] Settings are persisted across VSCode restarts
