# Multi-Line Scope Directive Fix Test

## Problem Description
The rename provider had a bug when renaming predicates declared in multi-line scope directives. The `findPredicatePositionInDeclaration` function only looked at the single line where the directive started, but in multi-line directives like:

```logtalk
:- public([
    gravitational_acceleration/1,
    orbital_period/1,
    distance_from_sun/1
]).
```

The predicate `gravitational_acceleration/1` is not on the first line (where `:- public([` appears) but on a subsequent line.

## Fix Applied
Updated the `findPredicatePositionInDeclaration` function to:

1. First try to find the predicate on the declaration line itself (preserving existing behavior)
2. If not found, use the existing multi-line directive search logic (`findPredicateInMultiLineDirective`)
3. Filter the results to find the correct predicate indicator using a new helper method `isCorrectPredicateInDirective`

## Test Files
- `test-planets.lgt` - Contains a multi-line scope directive for testing
- `tests/multi-line-scope-test.lgt` - Existing test file with various multi-line directive patterns

## Manual Testing Steps
1. Open `test-planets.lgt` in VS Code
2. Navigate to line 15 where `gravitational_acceleration/1` is declared in the multi-line scope directive
3. Right-click on `gravitational_acceleration` and select "Rename Symbol"
4. Enter a new name (e.g., `gravity_acceleration`)
5. Verify that the rename operation:
   - Finds the declaration in the multi-line directive
   - Renames all occurrences including the implementation on line 31
   - Updates any related mode/info directives

## Expected Behavior
Before the fix: The rename would fail or only partially work because it couldn't find the predicate in the multi-line directive.

After the fix: The rename should work correctly, finding and renaming all occurrences of the predicate across the file.

## Code Changes
- Modified `findPredicatePositionInDeclaration` in `src/features/renameProvider.ts`
- Added `isCorrectPredicateInDirective` helper method
- Added unit tests for the new functionality

## Verification
The fix leverages existing multi-line directive handling code that was already working for other parts of the rename provider, ensuring consistency and reliability.
