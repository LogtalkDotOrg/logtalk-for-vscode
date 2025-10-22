# Entity Type Conversion Refactoring Testing Guide

This guide describes how to test the six new entity type conversion refactorings.

## Overview

The extension now supports converting between entity types (object, protocol, category) by selecting the entity type keyword in the opening directive.

## How to Use

1. Open a Logtalk file containing an entity opening directive
2. **Select** (double-click or drag to select) the entity type keyword (`object`, `protocol`, or `category`) in the opening directive
3. Trigger the code action menu (Cmd+. on macOS, Ctrl+. on Windows/Linux)
4. Choose the appropriate conversion option from the menu

## Test Cases

### Test 1: Object to Protocol Conversion
**File:** `test-entity-type-conversions.lgt`, line 5
**Entity:** `simple_object`
**Action:** Select the word `object` on line 5, then choose "Convert object to protocol"
**Expected Result:**
- Opening directive changes from `:- object(simple_object).` to `:- protocol(simple_object).`
- Closing directive changes from `:- end_object.` to `:- end_protocol.`
**Condition:** Only available when the opening directive has a single argument (entity name only)

### Test 2: Object to Category Conversion
**File:** `test-entity-type-conversions.lgt`, line 18
**Entity:** `object_with_imports`
**Action:** Select the word `object` on line 18, then choose "Convert object to category"
**Expected Result:**
- Opening directive changes from `:- object(object_with_imports,` to `:- category(object_with_imports,`
- `imports(some_category)` changes to `extends(some_category)`
- Closing directive changes from `:- end_object.` to `:- end_category.`
**Condition:** Only available when the opening directive doesn't contain `instantiates`, `specializes`, or `extends` arguments

### Test 3: Object to Protocol - Should NOT Appear
**File:** `test-entity-type-conversions.lgt`, line 31
**Entity:** `complex_object`
**Action:** Select the word `object` on line 31
**Expected Result:** "Convert object to protocol" should NOT appear in the code action menu (because the directive has multiple arguments)

### Test 4: Object to Category - Should NOT Appear
**File:** `test-entity-type-conversions.lgt`, line 43
**Entity:** `object_with_extends`
**Action:** Select the word `object` on line 43
**Expected Result:** "Convert object to category" should NOT appear in the code action menu (because the directive contains `extends`)

### Test 5: Protocol to Category Conversion
**File:** `test-entity-type-conversions.lgt`, line 53
**Entity:** `simple_protocol`
**Action:** Select the word `protocol` on line 53, then choose "Convert protocol to category"
**Expected Result:**
- Opening directive changes from `:- protocol(simple_protocol).` to `:- category(simple_protocol).`
- Closing directive changes from `:- end_protocol.` to `:- end_category.`

### Test 6: Protocol to Object Conversion
**File:** `test-entity-type-conversions.lgt`, line 65
**Entity:** `protocol_with_extends`
**Action:** Select the word `protocol` on line 65, then choose "Convert protocol to object"
**Expected Result:**
- Opening directive changes from `:- protocol(protocol_with_extends,` to `:- object(protocol_with_extends,`
- `extends(parent_protocol)` changes to `implements(parent_protocol)`
- Closing directive changes from `:- end_protocol.` to `:- end_object.`

### Test 7: Category to Protocol Conversion
**File:** `test-entity-type-conversions.lgt`, line 77
**Entity:** `simple_category`
**Action:** Select the word `category` on line 77, then choose "Convert category to protocol"
**Expected Result:**
- Opening directive changes from `:- category(simple_category).` to `:- protocol(simple_category).`
- Closing directive changes from `:- end_category.` to `:- end_protocol.`
**Condition:** Only available when the opening directive doesn't contain `extends` argument

### Test 8: Category to Object Conversion
**File:** `test-entity-type-conversions.lgt`, line 89
**Entity:** `category_with_extends`
**Action:** Select the word `category` on line 89, then choose "Convert category to object"
**Expected Result:**
- Opening directive changes from `:- category(category_with_extends,` to `:- object(category_with_extends,`
- `extends(parent_category)` changes to `imports(parent_category)`
- Closing directive changes from `:- end_category.` to `:- end_object.`

### Test 9: Category to Protocol - Should NOT Appear
**File:** `test-entity-type-conversions.lgt`, line 101
**Entity:** `category_with_implements`
**Action:** Select the word `category` on line 101
**Expected Result:** "Convert category to protocol" should NOT appear in the code action menu (because the directive contains `extends`)

### Test 10: Multi-line Object to Protocol Conversion
**File:** `test-entity-type-conversions.lgt`, line 111
**Entity:** `multiline_object`
**Action:** Select the word `object` on line 111, then choose "Convert object to protocol"
**Expected Result:**
- Opening directive changes from `:- object(multiline_object).` to `:- protocol(multiline_object).`
- Closing directive changes from `:- end_object.` to `:- end_protocol.`
- Indentation is preserved

### Test 11: Multi-line Protocol to Category Conversion
**File:** `test-entity-type-conversions.lgt`, line 125
**Entity:** `multiline_protocol`
**Action:** Select the word `protocol` on line 125, then choose "Convert protocol to category"
**Expected Result:**
- Opening directive changes from `:- protocol(multiline_protocol,` to `:- category(multiline_protocol,`
- `extends(parent_protocol)` changes to `implements(parent_protocol)`
- Closing directive changes from `:- end_protocol.` to `:- end_category.`
- Multi-line indentation is preserved

### Test 12: Multi-line Category to Object Conversion
**File:** `test-entity-type-conversions.lgt`, line 139
**Entity:** `multiline_category`
**Action:** Select the word `category` on line 139, then choose "Convert category to object"
**Expected Result:**
- Opening directive changes from `:- category(multiline_category,` to `:- object(multiline_category,`
- `extends(parent_category)` changes to `imports(parent_category)`
- Closing directive changes from `:- end_category.` to `:- end_object.`
- Multi-line indentation is preserved

## Relation Renaming Rules

The following relation renames are applied during conversions:

### Object to Category
- `imports(X)` → `extends(X)`

### Protocol to Category
- `extends(X)` → `implements(X)`

### Protocol to Object
- `extends(X)` → `implements(X)`

### Category to Protocol
- `implements(X)` → `extends(X)`

### Category to Object
- `extends(X)` → `imports(X)`

## Notes

1. The refactoring requires **selecting** the entity type keyword, not just placing the cursor on it
2. The selection must be exactly the keyword (`object`, `protocol`, or `category`)
3. The refactoring preserves:
   - Multi-line directive formatting
   - Indentation of continuation lines
   - All other directive arguments
4. The refactoring updates both the opening and closing directives
5. Some conversions are conditional based on the presence/absence of specific relation arguments

## Success Criteria

- All applicable conversions should appear in the code action menu when the entity type keyword is selected
- Conversions that don't meet the conditions should NOT appear in the menu
- After applying a conversion:
  - The entity type keyword is changed in both opening and closing directives
  - Relation arguments are renamed according to the rules
  - Indentation and formatting are preserved
  - A success message is displayed

