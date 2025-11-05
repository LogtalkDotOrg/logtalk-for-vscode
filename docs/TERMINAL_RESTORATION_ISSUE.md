# Terminal Restoration Issue and Solutions

## Problem Description

Despite setting `isTransient: true` when creating the Logtalk terminal, VS Code sometimes restores the terminal when reloading the window or restarting VS Code. This disrupts the user experience as the terminal may be in an inconsistent state.

## Root Cause

According to the VS Code API documentation, the `isTransient` property has a critical limitation:

> **isTransient?: boolean**
> 
> Opt-out of the default terminal persistence on restart and reload.
> **This will only take effect when terminal.integrated.enablePersistentSessions is enabled.**

This creates a catch-22 situation:
- If users have `terminal.integrated.enablePersistentSessions` disabled globally, the `isTransient` flag has no effect
- If users have it enabled, terminals may still be restored due to timing issues or edge cases in VS Code's terminal restoration logic
- The terminal restoration happens at the VS Code level, before extensions have a chance to prevent it

## Implemented Solutions

### 1. Enhanced Terminal Disposal (Implemented)

The `LogtalkTerminal.dispose()` method has been enhanced to:
- Explicitly hide the terminal before disposal (reduces restoration likelihood)
- Dispose of the terminal instance
- Clear the terminal reference
- Clear all loaded directories tracking

```typescript
public static dispose(): void {
  if (LogtalkTerminal._terminal) {
    try {
      // Hide the terminal before disposing to reduce chance of restoration
      LogtalkTerminal._terminal.hide();
      LogtalkTerminal._terminal.dispose();
    } catch (error) {
      // Ignore errors during disposal
    }
    LogtalkTerminal._terminal = null;
  }
  
  // Dispose of all other resources
  for (const disposable of LogtalkTerminal.disposables) {
    disposable.dispose();
  }
  LogtalkTerminal.disposables = [];
  
  // Clear loaded directories
  LogtalkTerminal._loadedDirectories.clear();
}
```

This is called during extension deactivation to ensure proper cleanup.

### 2. Recommended User Settings

Users experiencing terminal restoration issues can add the following to their VS Code settings:

```json
{
  // Disable terminal persistence globally
  "terminal.integrated.enablePersistentSessions": false
}
```

**Note:** This disables persistence for ALL terminals in VS Code, not just Logtalk terminals.

### 3. Alternative: Workspace-Specific Settings

For users who want terminal persistence for other extensions but not for Logtalk projects, they can add a `.vscode/settings.json` file to their Logtalk workspace:

```json
{
  "terminal.integrated.enablePersistentSessions": false
}
```

## Why Complete Prevention is Difficult

1. **VS Code Architecture**: Terminal restoration happens at the VS Code core level, before extensions are activated
2. **API Limitations**: The `isTransient` flag is advisory, not mandatory - VS Code may still restore terminals in certain edge cases
3. **Timing Issues**: Even with proper disposal, if VS Code crashes or is force-quit, the disposal code may not run
4. **Session State**: VS Code saves terminal state to disk periodically, and this state may be restored before the extension can intervene

## Additional Mitigation Strategies

### Strategy 1: Detect and Close Restored Terminals

We could add code to detect if a Logtalk terminal was restored on activation and close it:

```typescript
// In extension activation
const terminals = vscode.window.terminals;
for (const terminal of terminals) {
  if (terminal.name === 'Logtalk') {
    // This is a restored terminal, dispose it
    terminal.dispose();
  }
}
```

**Pros:**
- Cleans up restored terminals automatically
- No user configuration needed

**Cons:**
- Brief flash of the terminal before it's closed
- May interfere if user intentionally kept a Logtalk terminal open

### Strategy 2: Use a Unique Terminal Name with Timestamp

Create terminals with unique names to prevent restoration matching:

```typescript
const timestamp = Date.now();
LogtalkTerminal._terminal = window.createTerminal({
  name: `Logtalk-${timestamp}`,
  shellPath: executable,
  shellArgs: args,
  isTransient: true
});
```

**Pros:**
- Each session gets a unique terminal
- Restored terminals won't match the current session

**Cons:**
- Multiple "Logtalk-*" terminals may accumulate in the terminal list
- Doesn't prevent restoration, just makes it less likely to interfere

### Strategy 3: Document the Limitation

Add a note to the extension README and documentation explaining:
- The terminal may occasionally be restored
- How to disable terminal persistence if this is problematic
- That this is a VS Code limitation, not an extension bug

## Current Status

**Implemented:**
- ✅ Enhanced terminal disposal with hide() before dispose()
- ✅ Clear terminal reference and loaded directories on disposal
- ✅ Proper cleanup in extension deactivation

**Not Implemented (Potential Future Enhancements):**
- ❌ Auto-detection and cleanup of restored terminals on activation
- ❌ Unique terminal names with timestamps
- ❌ User-facing documentation about the limitation

## Recommendations

1. **For most users**: The current implementation should significantly reduce terminal restoration issues
2. **For users still experiencing issues**: Recommend disabling `terminal.integrated.enablePersistentSessions`
3. **For future consideration**: Implement Strategy 1 (detect and close restored terminals) if user reports continue

## Related VS Code Issues

- The `isTransient` property was added to address terminal persistence issues
- However, it only works when persistent sessions are enabled, creating the catch-22
- There are no open VS Code issues specifically about `isTransient` not working reliably

## Testing

To test the terminal restoration behavior:

1. Open a Logtalk project
2. Open the Logtalk terminal (via any command that creates it)
3. Reload the VS Code window (Cmd/Ctrl+R)
4. Check if the terminal is restored

Expected behavior: Terminal should NOT be restored
If terminal is restored: User should disable `terminal.integrated.enablePersistentSessions`

