# Output Parsing for Diagnostics

## Overview

This document describes the implementation of output parsing for creating diagnostics from the `logtalk_tester` and `logtalk_doclet` scripts when run via the "Run Project Testers" and "Run Project Doclets" commands.

## Problem

When users run the "Logtalk: Run Project Testers" or "Logtalk: Run Project Doclets" commands, these start shell processes that write output to the "Logtalk Testers & Doclets" output channel. Previously, this output was only displayed to the user but not parsed to create diagnostics in the Problems pane.

## Solution

The solution duplicates the output to a temporary file that is then parsed to create diagnostics. This approach:

1. **Preserves existing behavior** - Output still appears in the output channel
2. **Adds diagnostic creation** - Compiler errors, warnings, and test failures now appear in the Problems pane
3. **Cleans up automatically** - Temporary output files are deleted after parsing

## Implementation Details

### Modified Files

#### `src/features/terminal.ts`

1. **Enhanced `spawnScript` method** (lines 1556-1620):
   - Added optional `outputFile` parameter to specify where to write output
   - Added optional `onComplete` callback to process the output file after the process completes
   - Accumulates both stdout and stderr in a buffer when `outputFile` is specified
   - Writes the buffer to the file and calls the callback on process close

2. **Enhanced `spawnScriptWorkspace` method** (lines 1622-1634):
   - Updated to pass through the new `outputFile` and `onComplete` parameters

3. **Added `parseTesterOutput` method** (lines 1210-1247):
   - Parses the tester output file line by line
   - Distinguishes between compiler messages and test messages
   - Creates diagnostics using the existing `linter.lint()` and `testsReporter.lint()` methods
   - Cleans up the temporary output file after parsing

4. **Updated `runTesters` method** (lines 1249-1268):
   - Added optional `linter` and `testsReporter` parameters
   - Creates a temporary output file (`.vscode_tester_output`) when linters are provided
   - Passes the parsing callback to process the output

5. **Added `parseDocletOutput` method** (lines 1273-1303):
   - Similar to `parseTesterOutput` but for doclet output
   - Parses both linter and documentation linter messages

6. **Updated `runDoclets` method** (lines 1305-1322):
   - Added optional `linter` and `documentationLinter` parameters
   - Creates a temporary output file (`.vscode_doclet_output`) when linters are provided
   - Passes the parsing callback to process the output

#### `src/extension.ts`

Updated command registrations (lines 330-331):
- `logtalk.run.testers` now passes `linter` and `testsReporter` instances
- `logtalk.run.doclets` now passes `linter` and `documentationLinter` instances

## Output File Format

The temporary output files follow the same format as the existing `.messages` scratch file:

```
% [ compiling /path/to/file.lgt ... ]
*     Error message line 1
*       Error message line 2
*       in file /path/to/file.lgt at line 42
*     
```

- Lines starting with `% [ compiling` trigger clearing of diagnostics for that file
- Lines between message start and `*     ` or `!     ` are accumulated
- The accumulated message is parsed to extract file paths, line numbers, and error text

## Temporary Files

The implementation creates temporary files in the workspace directory:

- `.vscode_tester_output` - Created when running testers
- `.vscode_doclet_output` - Created when running doclets

These files are automatically deleted after parsing.

## Backward Compatibility

The changes are fully backward compatible:

1. The `linter` and `testsReporter`/`documentationLinter` parameters are **optional**
2. If not provided, the commands work exactly as before (output to channel only)
3. When provided, diagnostics are created in addition to the existing behavior

## Usage

Users don't need to do anything different. When they run:

- **"Logtalk: Run Project Testers"** - Compiler errors/warnings and test failures now appear in the Problems pane
- **"Logtalk: Run Project Doclets"** - Compiler errors/warnings and documentation issues now appear in the Problems pane

## Benefits

1. **Better visibility** - Errors and warnings appear in the Problems pane alongside other diagnostics
2. **Quick navigation** - Users can click on diagnostics to jump to the problem location
3. **Consistent UX** - Same diagnostic experience as other Logtalk commands
4. **No performance impact** - Output is buffered in memory and written once at the end

