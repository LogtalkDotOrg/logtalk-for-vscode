# Multifile Predicate Entity Rename Fix

## Problem Description

When renaming an entity, the references provider may return locations that are clauses for multifile predicates. Previously, only the first clause was updated. The head of a clause for a multifile predicate has the format `Entity::Head`. The bug was in the `createEntityRenameEdits` method where only the first clause was processed.

## Root Cause

The reference provider only returns the location of the first clause for multifile predicates. When the clause is for a multifile predicate, we need to look for other consecutive clauses, but this wasn't happening.

## Solution

### Changes Made

1. **Modified `createEntityRenameEdits` method signature** to include origin information:
   ```typescript
   private async createEntityRenameEdits(
     locations: { uri: Uri; range: Range; origin: 'declaration' | 'definition' | 'implementation' | 'reference' }[],
     currentName: string,
     newName: string,
     entityIndicator: string
   ): Promise<WorkspaceEdit>
   ```

2. **Added multifile predicate detection logic** before line 704:
   - When `location.origin === 'reference'`, check if the clause is a multifile predicate clause
   - Use enhanced regex pattern to detect both `Entity::Head` and `Entity(args)::Head` formats
   - If the entity matches the current entity being renamed with correct arity, find all consecutive multifile clauses

3. **Implemented `findConsecutiveMultifileClausesForEntity` method**:
   - Accepts `entityIndicator` parameter to validate arity for parametric entities
   - Searches forward from the starting line to find all consecutive multifile clauses for the entity
   - Stops at entity boundaries, different entity clauses, or regular predicate clauses
   - Returns an array of ranges covering all consecutive multifile clauses

4. **Implemented `parseMultifileEntityClause` helper method**:
   - Parses multifile clause lines to extract entity name and arity
   - Handles both parametric (`entity(arg1, arg2)::pred`) and non-parametric (`entity::pred`) formats
   - Validates argument count for parametric entities
   - Returns structured parsing results for accurate matching

### Key Features

- **Parametric Entity Support**: Handles both parametric (`entity(args)::pred`) and non-parametric (`entity::pred`) entities
- **Arity Validation**: Validates entity arity to ensure correct matching for parametric entities
- **Accurate Detection**: Uses enhanced regex pattern to detect multifile predicate clauses
- **Consecutive Search**: Finds all consecutive clauses for the same entity with correct arity
- **Boundary Awareness**: Stops at entity boundaries and different entity clauses
- **Origin-Based Processing**: Only applies multifile logic when origin is 'reference'
- **Fallback Handling**: Falls back to regular clause processing for non-multifile cases

### Code Flow

1. When processing a location with origin 'reference':
   - Get the clause range using `PredicateUtils.getClauseRange()`
   - Check if the clause head matches `EntityName::` pattern
   - If it matches the entity being renamed:
     - Call `findConsecutiveMultifileClausesForEntity()` to find all consecutive clauses
     - Process all found clauses for entity references
   - If it doesn't match, use regular clause processing

2. For other origins ('declaration', 'definition', 'implementation'):
   - Use regular clause processing as before

### Test Cases

The fix handles both non-parametric and parametric entities:

**Non-parametric entities (arity 0):**

```logtalk
test_entity::multifile_pred(first) :-
    write('First clause of multifile predicate').

test_entity::multifile_pred(second) :-
    write('Second clause of multifile predicate').
```

**Parametric entities (arity > 0):**

```logtalk
parametric_entity(param1)::multifile_pred(first) :-
    write('Parametric multifile predicate').

complex_entity(param1, param2)::process(data) :-
    write('Complex parametric entity').
```

When renaming entities, ALL consecutive clauses with matching entity name AND arity will be properly updated.

## Files Modified

- `src/features/renameProvider.ts`: Main implementation
- `test-multifile-rename.lgt`: Test file for verification

## Verification

The code compiles successfully with TypeScript and maintains backward compatibility with existing functionality.
