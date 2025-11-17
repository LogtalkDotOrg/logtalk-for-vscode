# Sort Files by Dependencies Refactoring - Implementation Summary

## Overview
This document describes the implementation of the "Sort files by dependencies" refactoring feature for the Logtalk VS Code extension.

## Feature Description
The refactoring allows users to automatically sort the file list in `logtalk_load/1` and `logtalk_load/2` predicate calls based on their dependencies. This ensures that files are loaded in the correct order, with dependencies loaded before the files that depend on them.

## Requirements
The refactoring is available when:
1. The cursor is positioned on a call to `logtalk_load/1` or `logtalk_load/2`
2. The first argument is a list containing **2 or more atoms**
3. The list does **not** contain any compound terms (e.g., `library(file)` is not allowed)

## Implementation Details

### 1. Detection Logic (`src/features/refactorProvider.ts`)

#### Method: `detectLogtalkLoadCall`
- **Location**: Lines 1642-1784
- **Purpose**: Detects if the cursor is on a valid `logtalk_load/1-2` call
- **Returns**: Object containing:
  - `line`: Line number of the call
  - `callRange`: Start and end lines of the complete call
  - `listRange`: Range of the file list in the document
  - `files`: Array of file names (atoms)
- **Validation**:
  - Checks for `logtalk_load(` pattern
  - Extracts and parses the first argument
  - Verifies it's a list with at least 2 elements
  - Ensures all elements are atoms (no compound terms with parentheses)
  - Removes quotes from atoms if present

#### Integration in `provideCodeActions`
- **Location**: Lines 521-538
- **Code**:
```typescript
// Sort files by dependencies - for logtalk_load/1-2 predicates with list of atoms
const logtalkLoadInfo = this.detectLogtalkLoadCall(document, position);
if (logtalkLoadInfo) {
  const sortFilesAction = new CodeAction(
    "Sort files by dependencies",
    CodeActionKind.RefactorRewrite
  );
  sortFilesAction.command = {
    command: "logtalk.refactor.sortFilesByDependencies",
    title: "Sort files by dependencies",
    arguments: [document, position, logtalkLoadInfo]
  };
  actions.push(sortFilesAction);
}
```

### 2. Refactoring Implementation (`src/features/refactorProvider.ts`)

#### Method: `sortFilesByDependencies`
- **Location**: Lines 10719-10791
- **Purpose**: Executes the refactoring by calling Logtalk and replacing the list
- **Process**:
  1. Gets workspace directory
  2. Gets the directory of the file containing the `logtalk_load` call
  3. Calls `LogtalkTerminal.sortFilesByDependencies()` with workspace dir, loader dir, and files list
  4. Waits for Logtalk to write results to `.vscode_files_topological_sort` file
  5. Reads and parses the sorted file list
  6. Replaces the original list in the document with the sorted list
  7. Shows success/error messages

### 3. Terminal Integration (`src/features/terminal.ts`)

#### Method: `sortFilesByDependencies`
- **Location**: Lines 1534-1542
- **Purpose**: Communicates with Logtalk runtime to perform the sorting
- **Process**:
  1. Creates Logtalk terminal
  2. Constructs Logtalk list from files array
  3. Sends goal: `vscode::files_topological_sort('${workspaceDir}', '${loaderDir}', ${filesListStr}).`
  4. Waits for marker file `.vscode_files_topological_sort_done`
  5. Cleans up marker file

### 4. Command Registration (`src/extension.ts`)

- **Location**: Lines 667-673
- **Command**: `logtalk.refactor.sortFilesByDependencies`
- **Code**:
```typescript
context.subscriptions.push(
  commands.registerCommand('logtalk.refactor.sortFilesByDependencies', async (document, position, logtalkLoadInfo) => {
    if (refactorProvider) {
      await refactorProvider.sortFilesByDependencies(document, position, logtalkLoadInfo);
    }
  })
);
```

## Logtalk Side Implementation

The feature relies on the `vscode::files_topological_sort/3` predicate in the Logtalk `vscode` object:

```logtalk
vscode::files_topological_sort(WorkspaceDirectory, LoaderDirectory, Files)
```

**Arguments**:
1. `WorkspaceDirectory`: The workspace root directory
2. `LoaderDirectory`: The directory containing the file with the `logtalk_load` call
3. `Files`: List of file atoms to sort

**Output**:
- Writes sorted list to `.vscode_files_topological_sort` file
- Creates marker file `.vscode_files_topological_sort_done` when complete

## Usage Example

See `tests/test_sort_files_by_dependencies.lgt` for examples.

**Valid case** (refactoring available):
```logtalk
logtalk_load([file3, file1, file2]).
```

**Invalid cases** (refactoring NOT available):
```logtalk
% Contains compound term
logtalk_load([file1, library(file2), file3]).

% Only one file
logtalk_load([file1]).

% Not a list
logtalk_load(file1).
```

## Testing
To test the feature:
1. Open a Logtalk file with a `logtalk_load/1-2` call containing a list of 2+ atoms
2. Right-click on the list
3. Select "Sort files by dependencies" from the refactoring menu
4. The list should be replaced with the sorted version

## Files Modified
1. `src/features/refactorProvider.ts` - Detection and refactoring logic
2. `src/features/terminal.ts` - Logtalk communication
3. `src/extension.ts` - Command registration
4. `tests/test_sort_files_by_dependencies.lgt` - Test file (new)

