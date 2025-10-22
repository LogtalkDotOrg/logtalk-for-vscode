# Entity Type Conversion Refactorings - Implementation Summary

## Overview

This document summarizes the implementation of six new refactoring operations that allow converting between Logtalk entity types (object, protocol, category).

## Features Implemented

### 1. Entity Type Keyword Detection
- Added `detectEntityTypeKeywordSelection()` method to detect when the user has selected an entity type keyword
- The method validates that:
  - The selection is not empty
  - The selected text is exactly one of: `object`, `protocol`, or `category`
  - The selection is within an entity opening directive
  - The directive can be parsed to extract its arguments

### 2. Code Actions for Entity Type Conversions
Added conditional code actions in `provideCodeActions()` that appear when an entity type keyword is selected:

#### Object Conversions
- **Convert to Protocol**: Only available when the opening directive has a single argument (entity name only)
- **Convert to Category**: Only available when the directive doesn't contain `instantiates`, `specializes`, or `extends` arguments

#### Protocol Conversions
- **Convert to Category**: Always available
- **Convert to Object**: Always available

#### Category Conversions
- **Convert to Protocol**: Only available when the directive doesn't contain an `extends` argument
- **Convert to Object**: Always available

### 3. Conversion Implementation Methods

#### Core Conversion Method
`convertEntityType()` - A generic method that:
1. Extracts the full directive text (handling multi-line directives)
2. Applies relation renames if specified
3. Replaces the entity type keyword in the opening directive
4. Finds and updates the corresponding closing directive
5. Preserves indentation and formatting

#### Specific Conversion Methods
1. `convertObjectToProtocol()` - Converts object to protocol
2. `convertObjectToCategory()` - Converts object to category, renames `imports` → `extends`
3. `convertProtocolToCategory()` - Converts protocol to category, renames `extends` → `implements`
4. `convertProtocolToObject()` - Converts protocol to object, renames `extends` → `implements`
5. `convertCategoryToProtocol()` - Converts category to protocol, renames `implements` → `extends`
6. `convertCategoryToObject()` - Converts category to object, renames `extends` → `imports`

#### Helper Method
`findEntityClosingDirective()` - Finds the closing directive (`:- end_object.`, `:- end_protocol.`, or `:- end_category.`) for an entity

### 4. Command Registration
Registered six new commands in `extension.ts`:
- `logtalk.refactor.convertObjectToProtocol`
- `logtalk.refactor.convertObjectToCategory`
- `logtalk.refactor.convertProtocolToCategory`
- `logtalk.refactor.convertProtocolToObject`
- `logtalk.refactor.convertCategoryToProtocol`
- `logtalk.refactor.convertCategoryToObject`

## Relation Renaming Rules

The following relation renames are automatically applied during conversions:

| Conversion | Relation Rename |
|------------|----------------|
| Object → Category | `imports(X)` → `extends(X)` |
| Protocol → Category | `extends(X)` → `implements(X)` |
| Protocol → Object | `extends(X)` → `implements(X)` |
| Category → Protocol | `implements(X)` → `extends(X)` |
| Category → Object | `extends(X)` → `imports(X)` |

## Key Implementation Details

### Multi-line Directive Support
- The implementation correctly handles both single-line and multi-line opening directives
- Indentation of continuation lines is preserved
- The full directive range is extracted using `PredicateUtils.getDirectiveRange()`

### Conditional Availability
- Code actions only appear when the conversion is semantically valid
- For example, object to protocol conversion only appears for objects with a single argument
- This prevents invalid conversions that would break Logtalk semantics

### User Experience
- Users must **select** the entity type keyword (not just position the cursor)
- This makes the refactoring intentional and reduces accidental triggers
- Success/failure messages are displayed after the operation

## Files Modified

1. **src/features/refactorProvider.ts**
   - Added `detectEntityTypeKeywordSelection()` method
   - Added code actions for entity type conversions in `provideCodeActions()`
   - Added `convertEntityType()` core method
   - Added six specific conversion methods
   - Added `findEntityClosingDirective()` helper method

2. **src/extension.ts**
   - Registered six new refactoring commands

## Test Files Created

1. **tests/test-entity-type-conversions.lgt**
   - Contains 12 test cases covering all conversion scenarios
   - Includes single-line and multi-line directives
   - Includes cases where conversions should and should not be available

2. **tests/ENTITY_TYPE_CONVERSION_TESTING.md**
   - Comprehensive testing guide
   - Step-by-step instructions for each test case
   - Expected results for each conversion

## Compilation Status

✅ TypeScript compilation successful with 0 errors

## Usage Example

To convert an object to a protocol:

1. Open a Logtalk file with an object definition:
   ```logtalk
   :- object(my_object).
       :- public(test/1).
   :- end_object.
   ```

2. Select the word `object` in the opening directive

3. Press Cmd+. (macOS) or Ctrl+. (Windows/Linux) to open the code action menu

4. Choose "Convert object to protocol"

5. Result:
   ```logtalk
   :- protocol(my_object).
       :- public(test/1).
   :- end_protocol.
   ```

## Future Enhancements

Potential improvements for future versions:
- Add support for converting parametric entities
- Add undo/redo support with proper workspace edit history
- Add preview of changes before applying
- Add batch conversion for multiple entities in a file

