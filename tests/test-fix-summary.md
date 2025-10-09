# Multi-Line Scope Directive Bug Fix Summary

## Problem Description

The refactoring provider had a bug when adding/removing arguments to predicates declared in multi-line scope directives. The issue was in the scope directive detection and update logic.

### Example of the Problem

In the `/Users/pmoura/logtalk/examples/planets/planets.lgt` file:

```logtalk
:- public([
    gravitational_acceleration/1,  % Line 72
    weight/2
]).
```

When adding an argument to `gravitational_acceleration/1`, the refactoring would:
- ✅ Update the implementations at lines 90, 98, and 106
- ❌ **NOT** update the scope directive to change `gravitational_acceleration/1` to `gravitational_acceleration/2`

## Root Cause

The scope directive update logic in `refactorProvider.ts` checked if a line contained both:
1. A scope directive keyword (`public(`, `protected(`, or `private(`)
2. The current predicate indicator (e.g., `gravitational_acceleration/1`)

In multi-line directives:
- Line 71 contains `public([` but NOT `gravitational_acceleration/1`
- Line 72 contains `gravitational_acceleration/1` but NOT `public(`

So the condition failed and the scope directive was never updated.

## Fix Applied

### 1. Added Helper Functions

- `findMultiLineScopeDirectiveStart()`: Detects if a location is part of a multi-line scope directive
- `isPredicateInMultiLineScopeDirective()`: Checks if a predicate is within a multi-line directive
- `updateMultiLineScopeDirective()`: Updates indicators across multiple lines of a scope directive

### 2. Updated Scope Directive Detection

Modified the `isRelatedDirective` logic in all three refactoring functions (add, remove, reorder) to include:

```typescript
const isMultiLineScopeDirective = this.findMultiLineScopeDirectiveStart(doc, location.range.start.line, currentIndicator) !== null;

const isRelatedDirective = isDirective && (
  // ... existing conditions ...
  isMultiLineScopeDirective  // NEW: This location is part of a multi-line scope directive
);
```

### 3. Updated Scope Directive Update Logic

Enhanced the scope directive update logic to handle multi-line directives:

```typescript
// Handle both single-line and multi-line scope directives
const multiLineScopeStart = this.findMultiLineScopeDirectiveStart(doc, location.range.start.line, currentIndicator);
if (multiLineScopeStart !== null && multiLineScopeStart !== location.range.start.line) {
  // This is part of a multi-line scope directive, handle it separately
  const multiLineEdits = this.updateMultiLineScopeDirective(doc, multiLineScopeStart, currentIndicator, newIndicator);
  textEdits.push(...multiLineEdits);
} else if ((lineText.includes('public(') || lineText.includes('protected(') || lineText.includes('private(')) &&
    lineText.includes(currentIndicator)) {
  // Handle single-line scope directives as before
  updatedLine = updatedLine.replace(new RegExp(currentIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newIndicator);
}
```

### 4. Fixed Missing Scope Directive Update Logic

The remove argument function was missing scope directive update logic entirely. Added the same logic as the add argument function.

## Files Modified

- `src/features/refactorProvider.ts`: Added helper functions and updated all three refactoring operations

## Expected Behavior After Fix

When adding an argument to `gravitational_acceleration/1` in the planets.lgt file, the refactoring should now:

- ✅ Update the implementations at lines 90, 98, and 106
- ✅ **Update the multi-line scope directive** to change `gravitational_acceleration/1` to `gravitational_acceleration/2`
- ✅ Update any mode/info directives as before

## Testing

The fix can be tested by:

1. Opening `/Users/pmoura/logtalk/examples/planets/planets.lgt` in VS Code
2. Placing cursor on `gravitational_acceleration` on line 72 (in the multi-line scope directive)
3. Using "Add argument to predicate/non-terminal" refactoring
4. Verifying that the scope directive is updated from `gravitational_acceleration/1` to `gravitational_acceleration/2`
