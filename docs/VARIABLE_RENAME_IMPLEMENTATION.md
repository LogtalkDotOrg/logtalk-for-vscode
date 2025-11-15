# Variable Rename Implementation

## Overview

Added support for renaming variables in the Logtalk rename provider. When the cursor is positioned on a variable, all occurrences of that variable within the appropriate scope are renamed.

### Scope Rules

1. **Parameter Variables in Entity Opening Directives**: When renaming a parameter variable (e.g., `_Foo_` - starts with uppercase letter, has underscore prefix and suffix) that appears in an entity opening directive, the variable is renamed throughout the **entire entity** (all directives, clauses, and grammar rules).

2. **Regular Variables**: For all other variables, renaming is scoped to the containing clause, grammar rule, or directive only.

## Implementation Details

### New Methods

#### 1. `detectVariableContext(document: TextDocument, position: Position)`

- Detects if the cursor position is on a variable
- Returns object with variable name and range if detected, `null` otherwise
- Uses regex pattern `[A-Z_][A-Za-z0-9_]*` to match valid variable names
- Checks:
  - Not in a comment (line starting with `%`)
  - Not in a string literal (checks quote balance)

#### 2. `handleVariableRename(document, position, variableContext, newName): WorkspaceEdit`

- Main handler for variable renaming
- Determines the scope of the variable:
  - **Directive scope**: If line starts with `:-`, uses `PredicateUtils.getDirectiveRange()`
  - **Clause/rule scope**: Otherwise, uses `Utils.findTermStart()` and `PredicateUtils.getClauseRange()`
- Finds all occurrences of the variable within the scope using regex pattern
- Validates each occurrence is not in a comment or string
- Creates `TextEdit` for each valid occurrence
- Returns `WorkspaceEdit` with all edits

#### 3. `isValidVariableContextInLine(lineText, startPos, endPos): boolean`

- Validates that a variable occurrence is in a valid context
- Only checks if the variable is in a string literal (balanced quotes before the position)
- Note: Variables in comments ARE renamed to keep comments accurate with code changes

#### 4. `isParameterVariable(variableName: string): boolean`

- Checks if a variable name uses parameter variable syntax
- Parameter variables start with uppercase letter and have underscore prefix and suffix
- Pattern: `/^_[A-Z][A-Za-z0-9_]*_$/`
- Examples: `_Foo_`, `_Bar_`, `_Value_`

#### 5. `isInEntityOpeningDirective(document, lineNum): boolean`

- Checks if a line is part of an object or category opening directive
- Note: Only objects and categories can be parametric, not protocols
- Searches backwards to find entity opening (`:- object(...)` or `:- category(...)`)
- Uses `PredicateUtils.getDirectiveRange()` to check if the line is within the directive range

#### 6. `getEntityScopeRange(document, lineNum): { start: number; end: number }`

- Gets the range of the entire entity (from opening to closing directive)
- Note: Only handles objects and categories (protocols cannot be parametric)
- Searches backwards to find object or category opening directive
- Searches forwards to find entity closing directive (`:- end_object.` or `:- end_category.`)
- Returns the complete entity range for parameter variable renaming

### Integration Points

#### Modified `prepareRename()`
- Added variable context detection before entity and predicate checks
- Returns variable range if detected, allowing rename to proceed

#### Modified `provideRenameEdits()`

- Added variable context handling at the beginning
- Validates new variable name using `ArgumentUtils.isValidVariableName()`
- Calls `handleVariableRename()` if variable context detected
- Shows error message if new name is invalid

## Scope Determination

The implementation correctly determines the scope of a variable:

1. **Directive scope**: Variables in directives like `:- initialization(...)` are scoped to that directive
2. **Clause scope**: Variables in predicate clauses are scoped to that clause (from head to terminating period)
3. **Grammar rule scope**: Variables in DCG rules are scoped to that rule

## Validation

The implementation includes several validation checks:

1. **Variable name validation**: Ensures the variable name starts with uppercase or underscore
2. **Context validation**: Ensures we're not renaming variables in comments or strings
3. **Scope validation**: Only renames within the same clause/rule/directive

## Test Files

### `tests/variable-rename-test.lgt`

Created with 15 test cases covering:
- Simple variables
- Multiple occurrences
- Variables in head and body
- Underscore variables
- Anonymous variables
- Multiple variables in same clause
- Variables in lists
- Variables in complex terms
- Variables in grammar rules
- Variables in directives
- Variables in conditionals
- Variables in findall
- Variable shadowing
- Variables in strings (should NOT be renamed)
- Variables in comments (SHOULD be renamed to keep comments accurate)

### `tests/parameter-variable-rename-test.lgt`

Created with 4 test cases demonstrating parameter variable renaming:
- Simple parametric object with one parameter variable
- Parametric object with multiple parameter variables
- Parametric category with parameter variable
- Regular variables (non-parameter) that should NOT rename across entity

## Usage

1. Place cursor on a variable name
2. Press F2 (or right-click → Rename Symbol)
3. Enter new variable name (must start with uppercase or underscore)
4. Press Enter
5. All occurrences of the variable in the same scope will be renamed

## Limitations

- Only renames within the same clause/rule/directive scope
- Does not rename across different clauses (by design - variables are local to clauses)
- Anonymous variable `_` is detected but renaming it would be unusual
- Does not handle variable renaming in meta-predicates that might capture variables from outer scopes

