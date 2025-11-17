# PredicateUtils.findVariablesInRange Implementation

## Overview

A new static method `findVariablesInRange` has been added to the `PredicateUtils` class in `src/utils/predicateUtils.ts`. This method finds all variables used in a given range of text while properly ignoring variables that appear in quoted strings and comments.

## Method Signature

```typescript
static findVariablesInRange(document: TextDocument, range: Range): Set<string>
```

### Parameters
- `document`: The VS Code TextDocument to search in
- `range`: The Range within the document to search for variables

### Returns
- A `Set<string>` containing all unique variable names found in the range

## Implementation Details

### Variable Definition
In Logtalk/Prolog, variables are identifiers that start with:
- An uppercase letter (A-Z)
- An underscore (_)

### Ignored Contexts

The method correctly ignores variables that appear in:

1. **Single-quoted strings**: `'Variable'`
2. **Double-quoted strings**: `"Variable"`
3. **Line comments**: `% Comment with Variable`
4. **Block comments**: `/* Comment with Variable */`
5. **Character code notation**: `0'a`, `0'\n`

### Algorithm

The implementation uses a character-by-character parser that maintains state flags:
- `inQuotes`: Inside double-quoted string
- `inSingleQuotes`: Inside single-quoted string
- `inLineComment`: Inside line comment (%)
- `inBlockComment`: Inside block comment (/* */)
- `inCharCode`: Processing character code notation (0'x)
- `escapeNext`: Next character is escaped

The parser:
1. Tracks context (quotes, comments) while iterating through the text
2. Builds tokens from identifier characters when not in ignored contexts
3. Validates tokens as variables (must start with uppercase or underscore)
4. Adds valid variables to a Set for uniqueness

### Special Handling

**Character Code Notation**: The method properly handles Prolog's character code notation (e.g., `0'a`, `0'\n`) by detecting the `0'` pattern and skipping the following character(s), including escape sequences.

**Escape Sequences**: Backslash escapes are properly handled in both quoted strings and character codes.

**Newlines**: Line comments are automatically terminated at newlines.

**Block Comments**: The method tracks `/*` and `*/` pairs to properly handle block comments.

## Inspiration

The implementation takes ideas from:
- `LogtalkRefactorProvider.renumberVariables` method for the overall approach
- `ArgumentUtils.parseArguments` and `ArgumentUtils.findMatchingCloseParen` for handling quoted strings and escape sequences

## Test Coverage

Comprehensive tests have been added in `tests/predicateUtils.findVariablesInRange.test.ts` covering:
- Simple variables
- Variables with underscores
- Variables in single-quoted strings (ignored)
- Variables in double-quoted strings (ignored)
- Variables in line comments (ignored)
- Variables in block comments (ignored)
- Escaped quotes in strings
- Character code notation
- Lowercase identifiers (not variables)
- Multi-line content

## Demo File

A demonstration file `tests/findVariablesInRange-demo.lgt` has been created showing various test cases for the method.

## Usage Example

```typescript
import { PredicateUtils } from './utils/predicateUtils';
import * as vscode from 'vscode';

// Get variables in a specific range
const document = vscode.window.activeTextEditor?.document;
const range = new vscode.Range(0, 0, 10, 0); // First 10 lines

if (document) {
  const variables = PredicateUtils.findVariablesInRange(document, range);
  console.log('Variables found:', Array.from(variables));
  // Output: Variables found: ['X', 'Y', 'Z', 'Input', 'Output', ...]
}
```

## Benefits

This method provides a robust way to:
- Extract variables from code for refactoring operations
- Analyze variable usage in predicates
- Support variable renaming and transformation features
- Ensure accurate variable detection by ignoring quoted content and comments

