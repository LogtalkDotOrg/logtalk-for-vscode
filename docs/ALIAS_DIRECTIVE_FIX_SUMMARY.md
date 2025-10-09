# Enhanced Fix for Directive Predicate Renaming Issue

## Problem Description
When renaming a predicate using the rename provider (F2), predicate indicators in `alias/2` directives were not being renamed. The same issue affected `uses/2` and `use_module/2` directives. Additionally, the fix needed to handle different predicate formats used by different directive types.

### Example
In this code:
```logtalk
:- uses(list, [append/3, member/2]).
:- alias(set, [member/2 as set_member/2]).
:- use_module(module, [append/3, member/2]).

test_member(Element, List) :-
    member(Element, List).
```

When renaming `member` to `element`, only the predicate call would be renamed:
```logtalk
:- uses(list, [append/3, member/2]).        % NOT RENAMED (BUG)
:- alias(set, [member/2 as set_member/2]).  % NOT RENAMED (BUG)
:- use_module(module, [append/3, member/2]). % NOT RENAMED (BUG)

test_member(Element, List) :-
    element(Element, List).                  % CORRECTLY RENAMED
```

## Root Cause Analysis
The issue was in how line-level reference locations are processed in the rename provider:

1. **Reference Provider Behavior**: The reference provider returns line-level locations (character position 0) for all references, including those in directives.

2. **Context Detection Problem**: The rename provider was using `findPredicateInClauseWithEndLine` for all line-level locations, which is designed for clause contexts where predicates appear as calls (`member(X, Y)`), not directive contexts where predicates appear as indicators (`member/2`).

3. **Arity Checking Issue**: The clause-context method uses `requireIndicatorFormat: false`, which means it rejects predicate indicators like `member/2` when looking for predicates with non-zero arity, because it expects callable format like `member(X, Y)`.

## Enhanced Solution
The fix involves detecting the context (directive vs clause), determining the directive type, and using the appropriate search strategy for each directive type:

### 1. Context Detection
Added logic to detect directive contexts by checking if the line starts with `:-`:

```typescript
const isDirectiveContext = lineText.trim().startsWith(':-');
```

### 2. Directive Type Detection
Enhanced the method to determine the specific directive type:
- `alias/2`: Only uses predicate indicators (`member/2`)
- `uses/2`: Can use both predicate indicators (`member/2`) AND callable forms (`member(+term, ?list)`)
- `use_module/2`: Can use both predicate indicators (`member/2`) AND callable forms (`member(+term, ?list)`)

### 3. Enhanced Directive-Specific Method
Enhanced `findPredicateInDirectiveWithEndLine` method that:
- Processes multi-line directives correctly
- Determines directive type (alias, uses, or use_module)
- Uses a two-step search strategy based on directive type
- Handles both predicate indicators and callable forms appropriately

### 4. Two-Step Search Strategy
For each directive line:
1. **Step 1**: Always search for predicate indicators using `findPredicateRangesInLineWithIndicatorFormat`
2. **Step 2**: If no indicators found AND directive is `uses/2` or `use_module/2`, search for callable forms using `findPredicateRangesInLineWithArity`

### 5. New Indicator Format Method
Created `findPredicateRangesInLineWithIndicatorFormat` method that:
- Uses `requireIndicatorFormat: true`
- Finds predicate names that are followed by `/arity` (indicator format)
- Properly validates arity in directive contexts

### 6. Updated Line-Level Processing
Modified the line-level location processing to:
- Detect context (directive vs clause)
- Use enhanced directive method for directive contexts
- Maintain existing clause method for clause contexts
- Handle both single-line and multi-line directives

## Code Changes

### Modified Files
1. `src/features/renameProvider.ts` - Main fix implementation
2. `tests/renameProvider.test.ts` - Added comprehensive tests

### New Methods Added
- `findPredicateInDirectiveWithEndLine()` - Handles directive contexts
- `findPredicateRangesInLineWithIndicatorFormat()` - Finds predicate indicators

### Modified Methods
- Line-level location processing in `provideRenameEdits()` - Added context detection

## Testing
Added comprehensive tests to verify:
1. Directive context detection works correctly
2. Predicate indicators are found in `alias/2` directives
3. Predicate indicators are found in `uses/2` directives
4. Clause context still works for predicate calls
5. The fix doesn't break existing functionality

## Result
After the fix, renaming `member` to `element` correctly updates all occurrences:

```logtalk
:- uses(list, [append/3, element/2]).        % ✅ CORRECTLY RENAMED
:- alias(set, [element/2 as set_member/2]).  % ✅ CORRECTLY RENAMED
:- use_module(module, [append/3, element/2]). % ✅ CORRECTLY RENAMED

test_member(Element, List) :-
    element(Element, List).                   % ✅ CORRECTLY RENAMED
```

## Directives Fixed
This fix ensures predicate indicators are correctly renamed in:
- `alias/2` directives
- `uses/2` directives  
- `use_module/2` directives
- Any other directive that uses predicate indicators

The fix maintains backward compatibility and doesn't affect clause-context renaming.
