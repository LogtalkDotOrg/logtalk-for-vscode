# Logtalk Extension Logging

The Logtalk VSCode extension includes configurable logging to help with debugging and troubleshooting, especially for the chat participant functionality.

## Configuration

### Setting the Log Level

You can control the verbosity of logging through the VSCode setting:

```json
{
  "logtalk.logging.level": "warn"
}
```

Available log levels (from least to most verbose):

- **`off`** - No logging output
- **`error`** - Only error messages  
- **`warn`** - Error and warning messages (default)
- **`info`** - Error, warning, and informational messages
- **`debug`** - All messages including detailed debug information

### Quick Commands

Use the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to access logging commands:

- **`Logtalk: Set Extension Logging Level`** - Interactive picker to change the log level
- **`Logtalk: Show Extension Log`** - Opens the Logtalk Extension output channel

## What Gets Logged

### Documentation Cache (`info` and `debug` levels)
- Version detection and cleaning
- Local file checking and loading
- Remote documentation downloading
- Cache operations (load, save, clear)
- Search operations and results

### Chat Participant (`debug` level)
- Documentation search queries and results
- Context7 MCP server integration attempts
- Tool resolution and parameter passing
- Language model interactions

### Error Handling (`error` and `warn` levels)
- File system errors
- Network errors during documentation download
- Search failures
- Language model errors

## Troubleshooting

### Chat Participant Issues

1. **Set logging to `debug` level**:
   ```
   Ctrl+Shift+P → "Logtalk: Set Extension Logging Level" → "debug"
   ```

2. **Show the log output**:
   ```
   Ctrl+Shift+P → "Logtalk: Show Extension Log"
   ```

3. **Try your chat participant command** and check the log for detailed information about:
   - Documentation search results
   - Context7 tool availability and errors
   - Language model invocation details

### Documentation Cache Issues

For documentation loading problems, check the logs for:
- Version detection issues
- Local file access problems  
- Network connectivity issues
- Cache corruption

## Performance Considerations

- **`debug` level** can be very verbose, especially for chat participant operations
- **`info` level** provides good balance of useful information without overwhelming detail
- **`warn` level** (default) only shows issues that need attention
- Consider using **`debug` level** only when actively troubleshooting

## Log Output Location

Logs are written to:
1. **VSCode Output Channel**: "Logtalk Extension" (accessible via `View → Output`)
2. **Developer Console**: For immediate visibility during development

The output channel provides a persistent log that you can scroll through and copy for bug reports.
