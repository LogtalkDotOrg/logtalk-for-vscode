# termType Function Usage Example

The `termType` function in `utils/utils.ts` determines the type of Logtalk term at a given position in a document.

## Function Signature

```typescript
public static async termType(uri: Uri, position: Position): Promise<string | null>
```

## Return Values

- `'predicate_rule'` - A predicate clause with a body (contains `:-`)
- `'predicate_fact'` - A predicate clause without a body (ends with `.`)
- `'non_terminal_rule'` - A DCG rule (contains `-->`)
- `'entity_directive'` - Entity-related directives (object, protocol, category, end_*)
- `'predicate_directive'` - Predicate-related directives (public, mode, info, etc.)
- `null` - Unable to determine term type

## Example Usage

```typescript
import { Utils } from './utils/utils';
import { Uri, Position } from 'vscode';

// Example: Determine term type at cursor position
async function analyzeTermAtCursor(uri: Uri, position: Position) {
    const termType = await Utils.termType(uri, position);
    
    switch (termType) {
        case 'predicate_rule':
            console.log('This is a predicate rule with a body');
            break;
        case 'predicate_fact':
            console.log('This is a predicate fact');
            break;
        case 'non_terminal_rule':
            console.log('This is a DCG non-terminal rule');
            break;
        case 'entity_directive':
            console.log('This is an entity directive');
            break;
        case 'predicate_directive':
            console.log('This is a predicate directive');
            break;
        default:
            console.log('Unable to determine term type');
    }
}
```

## Test Cases

Given this Logtalk code:

```logtalk
:- object(test).

:- info([
    version is 1:0:0,
    author is 'Test Author'
]).

:- public(foo/1).
:- mode(foo(+atom), one).
:- info(foo/1, [
    comment is 'Test predicate'
]).

foo(X) :-
    write(X).

bar(Y) -->
    [Y].

baz(Z).

:- end_object.
```

The function would return:

- Line 1 (`object` directive): `'entity_directive'`
- Line 3-6 (entity `info/1` directive): `'entity_directive'`
- Line 8 (`public` directive): `'predicate_directive'`
- Line 9 (`mode` directive): `'predicate_directive'`
- Line 10-12 (predicate `info/2` directive): `'predicate_directive'`
- Line 14-15 (predicate rule): `'predicate_rule'`
- Line 17-18 (DCG rule): `'non_terminal_rule'`
- Line 20 (predicate fact): `'predicate_fact'`
- Line 22 (`end_object` directive): `'entity_directive'`

## Implementation Details

The function handles both simple and complex cases:

1. **Simple cases**: Lines that clearly indicate their type (start with `:-`, contain `-->`, etc.)
2. **Complex cases**: Multi-line terms where the position is in the middle of a term

For multi-line terms, the function searches backwards to find the start of the term, then analyzes the complete term to determine its type.

### Special Cases

**Info Directives**: The function distinguishes between two types of `info` directives:

- **Entity info/1**: `info([...])` - Contains entity metadata (version, author, etc.) - classified as `'entity_directive'`
- **Predicate info/2**: `info(predicate/arity, [...])` - Contains predicate-specific documentation - classified as `'predicate_directive'`

The distinction is made by checking if the directive starts with `info([` (entity info) versus other `info(` patterns (predicate info).

## Integration with Refactor Provider

The `termType` function is integrated with the refactor provider to ensure that predicate/non-terminal argument refactoring operations (add, reorder, remove arguments) are only available when the cursor position is not within an entity directive.

**Performance Optimization**: The refactor provider uses an optimized approach where:

1. `termType` is checked before expensive predicate indicator retrieval
2. The indicator is returned directly from `isPredicateCall` to avoid duplicate Utils calls
3. The indicator is passed as a command argument to eliminate redundant validation in individual refactoring methods

**Refactoring Restrictions**:

- **Entity directives**: Argument refactoring is **disabled** - prevents accidental modification of entity metadata
- **Predicate directives**: Argument refactoring is **enabled** - allows modification of predicate-specific directives
- **Predicate clauses**: Argument refactoring is **enabled** - allows modification of predicate definitions
- **Non-terminal rules**: Argument refactoring is **enabled** - allows modification of DCG rules

This ensures that users cannot accidentally modify entity information when they intend to refactor predicate arguments.
