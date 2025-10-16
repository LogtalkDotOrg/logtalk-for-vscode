# Fix: PredicateUtils.getPredicateDefinitionRange Matching Wrong Predicates

## The Bug

When finding the range for the predicate `dead_predicate/0` defined with a single fact at line 4 in the file `/Users/pmoura/logtalk/tools/dead_code_scanner/test_entities.lgt`, the method returned a range of 4-12 instead of just line 4.

### Test File Content

```logtalk
:- object(instance).

	dead_predicate.

	dead_predicate_1 :-
		dead_predicate_2.

	dead_predicate_2 :-
		dead_predicate_3.

	dead_predicate_3.

:- end_object.
```

### Expected Behavior

When searching for `dead_predicate/0` starting at line 4:
- Should find only line 4: `dead_predicate.`
- Should return range: 4-4

### Actual Behavior

- Found lines 4-12 (all predicates!)
- Incorrectly matched `dead_predicate_1`, `dead_predicate_2`, `dead_predicate_3`

## Root Cause

The bug was in the `matchesPredicateWithArity` method (lines 769-794 in `src/utils/predicateUtils.ts`).

### Original Code

```typescript
private static matchesPredicateWithArity(
  text: string,
  escapedPredicateName: string,
  expectedArity: number,
  isNonTerminal: boolean
): boolean {
  // Match: name(...) or name
  const match = text.match(new RegExp(`^\\s*${escapedPredicateName}\\s*(\\()?`));
  if (!match) {
    return false;
  }

  const hasArgs = match[1] === '(';
  if (!hasArgs) {
    return expectedArity === 0;
  }

  // Count arguments
  const openParenPos = match[0].length - 1;
  const arity = this.countArityAtPosition(text, openParenPos);
  return arity === expectedArity;
}
```

### The Problem

The regex pattern `^\\s*${escapedPredicateName}\\s*(\\()?` matches the predicate name at the start of the line, but **does not check what comes after the name**.

For example, when looking for `dead_predicate`:
- Pattern: `^\\s*dead_predicate\\s*(\\()?`
- Text: `dead_predicate_1 :-`
- **Matches!** Because `dead_predicate` appears at the start, followed by `_1`

The pattern doesn't ensure that the predicate name is followed by:
- An opening parenthesis `(`
- Whitespace
- A period `.`
- End of string

So it incorrectly matches:
- `dead_predicate` ✅ (correct)
- `dead_predicate_1` ❌ (wrong - should not match)
- `dead_predicate_2` ❌ (wrong - should not match)
- `dead_predicate_3` ❌ (wrong - should not match)

## The Solution

Add a **lookahead assertion** to ensure the predicate name is followed by valid characters only.

### Fixed Code

```typescript
private static matchesPredicateWithArity(
  text: string,
  escapedPredicateName: string,
  expectedArity: number,
  isNonTerminal: boolean
): boolean {
  // Match: name(...) or name followed by whitespace/period/end
  // Use lookahead to prevent matching dead_predicate when looking for dead_predicate_1
  const match = text.match(new RegExp(`^\\s*${escapedPredicateName}(?=\\s*\\(|\\s*$|\\s+|\\s*\\.)`));
  if (!match) {
    return false;
  }

  // Check if there's an opening parenthesis after the predicate name
  const afterName = text.substring(match[0].length).trimStart();
  const hasArgs = afterName.startsWith('(');
  
  if (!hasArgs) {
    return expectedArity === 0;
  }

  // Count arguments
  const openParenPos = text.indexOf('(', match[0].length);
  const arity = this.countArityAtPosition(text, openParenPos);
  return arity === expectedArity;
}
```

### Key Changes

1. **Added lookahead assertion**: `(?=\\s*\\(|\\s*$|\\s+|\\s*\\.)`
   - `\\s*\\(` - followed by optional whitespace and opening parenthesis
   - `\\s*$` - followed by optional whitespace and end of string
   - `\\s+` - followed by whitespace
   - `\\s*\\.` - followed by optional whitespace and period

2. **Changed argument detection**:
   - Instead of relying on capture group `(\\()?`, we now check what comes after the matched name
   - Use `text.substring(match[0].length).trimStart()` to get text after the name
   - Check if it starts with `(`

3. **Fixed position calculation**:
   - Use `text.indexOf('(', match[0].length)` to find the opening parenthesis
   - This is more robust than calculating from match length

## Why This Works

The lookahead `(?=...)` ensures that after matching the predicate name, the next characters must be one of:
- `\s*\(` - whitespace followed by `(` → predicate with arguments
- `\s*$` - whitespace followed by end of string → zero-arity predicate at end of line
- `\s+` - whitespace → zero-arity predicate followed by space
- `\s*\.` - whitespace followed by `.` → zero-arity predicate fact

This prevents matching:
- `dead_predicate_1` when looking for `dead_predicate` (because `_` doesn't match the lookahead)
- `foo_bar` when looking for `foo` (because `_` doesn't match the lookahead)

## Testing

With the fix, when searching for `dead_predicate/0` in the test file:

1. Line 4: `dead_predicate.`
   - Pattern matches: `dead_predicate` followed by `.` ✅
   - Arity check: no `(`, expected arity 0 ✅
   - **Match!**

2. Line 6: `dead_predicate_1 :-`
   - Pattern matches: `dead_predicate` followed by `_` ❌
   - Lookahead fails (not `(`, `$`, whitespace, or `.`)
   - **No match!** ✅

3. Line 9: `dead_predicate_2 :-`
   - Pattern matches: `dead_predicate` followed by `_` ❌
   - Lookahead fails
   - **No match!** ✅

4. Line 12: `dead_predicate_3.`
   - Pattern matches: `dead_predicate` followed by `_` ❌
   - Lookahead fails
   - **No match!** ✅

Result: Only line 4 is matched, range is 4-4 ✅

## Impact

This fix affects:
- `PredicateUtils.getPredicateDefinitionRange()` - used by dead code scanner
- `PredicateUtils.findConsecutivePredicateClauseRanges()` - used for finding all clauses of a predicate
- Any feature that needs to identify predicate clauses by name and arity

The fix ensures that predicate names are matched exactly, preventing false matches with predicates that have the same prefix.

## Edge Cases Handled

1. **Zero-arity predicates**: `foo.` or `foo :-` ✅
2. **Predicates with arguments**: `foo(X, Y)` ✅
3. **Predicates with similar names**: `foo` vs `foo_bar` ✅
4. **Whitespace variations**: `foo (X)` vs `foo(X)` ✅
5. **Multi-line clauses**: Handled by the clause head reading logic ✅

## Conclusion

The fix adds proper word boundary checking using a lookahead assertion to ensure predicate names are matched exactly, preventing false matches with predicates that share a common prefix. This resolves the issue where `getPredicateDefinitionRange` was returning ranges that included multiple different predicates.

