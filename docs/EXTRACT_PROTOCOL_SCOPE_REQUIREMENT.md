# Extract Protocol Refactoring - Scope Directive Requirement

## Overview

The "Extract protocol" refactoring now requires that the entity contains at least one scope directive (public/1, protected/1, or private/1) before the refactoring action is offered.

## Rationale

Extracting a protocol only makes sense when there are predicate declarations to extract. If an entity has no scope directives, there are no predicate declarations to extract to a protocol, making the refactoring operation meaningless.

## Implementation

### Changes Made

#### 1. **New Helper Method: `entityContainsScopeDirective()`**

Added a new method in `src/features/refactorProvider.ts` (lines 9123-9160) that efficiently checks if an entity contains any scope directives:

```typescript
private entityContainsScopeDirective(document: TextDocument, entityStartLine: number): boolean {
  // Determine the entity type to know which closing directive to look for
  const entityOpeningLine = document.lineAt(entityStartLine).text.trim();
  const entityMatch = SymbolUtils.matchFirst(entityOpeningLine, PatternSets.entityOpening);
  if (!entityMatch) {
    return false;
  }

  const endRegex = entityMatch.type === SymbolTypes.OBJECT ? SymbolRegexes.endObject :
                  entityMatch.type === SymbolTypes.PROTOCOL ? SymbolRegexes.endProtocol :
                  SymbolRegexes.endCategory;

  // Search for scope directives or entity closing directive in a single pass
  let lineNum = entityStartLine + 1;
  while (lineNum < document.lineCount) {
    const lineText = document.lineAt(lineNum).text.trim();

    // Check if this line contains a scope directive
    if (/^:-\s*(public|protected|private)\(/.test(lineText)) {
      return true;
    }

    // Check if we've reached the entity closing directive
    if (endRegex.test(lineText)) {
      return false;
    }

    lineNum++;
  }

  return false;
}
```

**Performance Optimization**: Uses a single while loop that exits early when either a scope directive is found (returns `true`) or the entity closing directive is reached (returns `false`). This is more efficient than the initial approach which would scan all entity lines twice (once to find the closing directive, then again to search for scope directives).

#### 2. **Updated Code Action Provider**

Modified the code action provider in `src/features/refactorProvider.ts` (lines 183-196) to only offer the "Extract protocol" action when scope directives are present:

```typescript
// Extract protocol action - only if entity contains scope directives
const hasScopeDirective = this.entityContainsScopeDirective(document, entityInfo.line);
if (hasScopeDirective) {
  const extractProtocolAction = new CodeAction(
    "Extract protocol",
    CodeActionKind.RefactorExtract
  );
  extractProtocolAction.command = {
    command: "logtalk.refactor.extractProtocol",
    title: "Extract protocol",
    arguments: [document, range]
  };
  actions.push(extractProtocolAction);
}
```

#### 3. **Updated Documentation**

Updated `README.md` (line 332) to document the new requirement:

> An "Extract protocol" refactoring operation is available when the user right-clicks on an object or category name in their opening entity directive and uses the "Refactor" context menu item or the "Refactor" command palette item. **This refactoring is only available when the entity contains at least one scope directive (public/1, protected/1, or private/1).** The name of the protocol is derived from the name of the selected entity...

## Test Files

Created test files in the `tests/` directory to verify the behavior:

### `test_extract_protocol_with_scope.lgt`
- Object with public/1 and protected/1 directives
- "Extract protocol" refactoring **should be available**

### `test_extract_protocol_no_scope.lgt`
- Object without any scope directives
- "Extract protocol" refactoring **should NOT be available**

## Behavior

### Before This Change
- "Extract protocol" was offered for all objects and categories, regardless of whether they had scope directives
- Users could trigger the refactoring on entities with no predicate declarations, resulting in an empty or meaningless protocol

### After This Change
- "Extract protocol" is only offered when the entity contains at least one scope directive
- The refactoring is only available when there are actually predicate declarations to extract
- Provides better user experience by not offering meaningless refactoring operations

## Technical Details

### Scope Directives Detected
The implementation checks for the following scope directives:
- `public/1` - Public predicate declarations
- `protected/1` - Protected predicate declarations
- `private/1` - Private predicate declarations

### Detection Method
Uses regex pattern: `/^:-\s*(public|protected|private)\(/`

This pattern matches:
- `:- public([...]).`
- `:- protected([...]).`
- `:- private([...]).`

### Entity Types Supported
The "Extract protocol" refactoring is available for:
- Objects (`:- object(...)`)
- Categories (`:- category(...)`)

Not available for:
- Protocols (`:- protocol(...)`) - protocols cannot implement other protocols

## Verification

✅ TypeScript compilation: **0 errors**
✅ Helper method `entityContainsScopeDirective()` implemented
✅ Code action provider updated to check for scope directives
✅ Documentation updated in README.md
✅ Test files created for both scenarios

## Related Files

- `src/features/refactorProvider.ts` - Implementation
- `README.md` - User documentation
- `tests/test_extract_protocol_with_scope.lgt` - Test with scope directives
- `tests/test_extract_protocol_no_scope.lgt` - Test without scope directives

