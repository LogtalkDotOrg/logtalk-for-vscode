# Test Files for "Wrap File Contents as an Object" Refactoring

This document lists the test files created to verify the "Wrap file contents as an object" refactoring feature.

## Test Files

### 1. Basic Functionality

**File**: `test_wrap.lgt`
- **Purpose**: Basic test with standard Logtalk file
- **Expected object name**: `test_wrap`
- **Tests**: Standard wrapping with `.lgt` extension

**File**: `test_wrap_pl.pl`
- **Purpose**: Test with Prolog `.pl` extension
- **Expected object name**: `test_wrap_pl`
- **Tests**: Extension removal works for non-Logtalk extensions

### 2. Filename Case Conversion

**File**: `TestUpperCase.lgt`
- **Purpose**: Test with uppercase filename
- **Expected object name**: `testuppercase`
- **Tests**: Uppercase letters are converted to lowercase

**File**: `Mixed_Case_File.pl`
- **Purpose**: Test with mixed case and underscores
- **Expected object name**: `mixed_case_file`
- **Tests**: Mixed case conversion with underscores preserved

### 3. Empty Line Trimming

**File**: `test_empty_lines_start.lgt`
- **Purpose**: Test with empty lines at the beginning
- **Expected behavior**: Empty lines at start are removed, exactly one empty line after opening directive
- **Tests**: Leading empty line trimming

**File**: `test_empty_lines_end.lgt`
- **Purpose**: Test with empty lines at the end
- **Expected behavior**: Empty lines at end are removed, exactly one empty line before closing directive
- **Tests**: Trailing empty line trimming

**File**: `test_empty_lines_both.lgt`
- **Purpose**: Test with empty lines at both beginning and end
- **Expected object name**: `test_empty_lines_both`
- **Expected behavior**: All leading and trailing empty lines removed, proper spacing maintained
- **Tests**: Complete empty line trimming at both ends

## Testing Procedure

For each test file:

1. Open the file in VS Code
2. Place cursor anywhere in the file (no selection needed)
3. Open the refactoring menu (right-click → "Refactor..." or Ctrl/Cmd+Shift+R)
4. Select "Wrap file contents as an object"
5. Verify the result matches the expected behavior

## Expected Results

All test files should result in:
- Object opening directive at the top: `:- object(name).`
- Exactly one empty line after the opening directive
- Original file content (trimmed of leading/trailing empty lines)
- Exactly one empty line before the closing directive
- Object closing directive at the bottom: `:- end_object.`

## Example Transformation

**Before** (`test_wrap.lgt`):
```logtalk
% Test file for wrap as object refactoring
% This file has no entity or module directives

:- public(foo/1).

foo(bar).
foo(baz).
```

**After**:
```logtalk
:- object(test_wrap).

% Test file for wrap as object refactoring
% This file has no entity or module directives

:- public(foo/1).

foo(bar).
foo(baz).

:- end_object.
```

## Notes

- All test files are located in the `tests/` directory
- Test files should not contain any entity opening/closing directives or module directives
- The refactoring should only appear when these conditions are met

