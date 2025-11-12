# Infer Public Predicates Refactoring

## Overview

The "Infer public predicates" refactoring automatically analyzes an entity and adds a `public/1` directive with the list of predicates that should be declared as public based on the entity's implementation.

## When to Use

This refactoring is available when:

- The cursor is positioned on an entity name in an object or category opening directive (`:- object(...)` or `:- category(...)`)
- The entity does not already contain any `public/1` directives

Note: This refactoring is **not** available for protocols.

## How to Use

1. Open a Logtalk file containing an entity without a `public/1` directive
2. Right-click on the entity name in the entity opening directive
3. Select "Infer public predicates" from the refactoring menu
4. The extension will analyze the entity and add a `public/1` directive with the inferred public predicates

## Example

**Before** applying the refactoring:

```logtalk
:- object(example).

	:- info([
		version is 1:0:0,
		author is 'Example Author',
		date is 2025-11-12,
		comment is 'Example object.'
	]).

	foo(X) :-
		write(X), nl.

	bar(X, Y) :-
		Z is X + Y,
		write(Z), nl.

	baz :-
		write('Hello'), nl.

:- end_object.
```

**After** applying the refactoring:

```logtalk
:- object(example).

	:- info([
		version is 1:0:0,
		author is 'Example Author',
		date is 2025-11-12,
		comment is 'Example object.'
	]).

	:- public([
		foo/1,
		bar/2,
		baz/0
	]).

	foo(X) :-
		write(X), nl.

	bar(X, Y) :-
		Z is X + Y,
		write(Z), nl.

	baz :-
		write('Hello'), nl.

:- end_object.
```

## Implementation Details

### Logtalk Predicate

The refactoring calls the `vscode::infer_public_predicates/2` Logtalk predicate with:
- First argument: The first workspace folder path
- Second argument: The entity name

### Result Files

The Logtalk predicate uses:
- Marker file: `.vscode_infer_public_predicates_done` (signals completion)
- Result file: `.vscode_infer_public_predicates` (contains the list of predicate indicators)

### Formatting

The `public/1` directive is:
- Added after the `info/1` directive if one exists, otherwise after the entity opening directive
- Separated by a single empty line from the preceding directive
- Indented to match the entity's indentation level
- Formatted with one predicate indicator per line for readability

## Test Files

Test files are available in the `tests/` directory:

- `test_infer_public.lgt` - Object with info/1 directive but no public/1 directive (public/1 should be added after info/1)
- `test_infer_public_no_info.lgt` - Object without info/1 or public/1 directives (public/1 should be added after entity opening)
- `test_has_public.lgt` - Object with existing public/1 directive (refactoring should not be available)

## Notes

- The refactoring is available only for objects and categories (not for protocols)
- If the entity already has a `public/1` directive, the refactoring will not be offered
- The inferred predicates are based on the entity's implementation and may need manual adjustment
- Empty results (no public predicates to infer) will show an informational message

