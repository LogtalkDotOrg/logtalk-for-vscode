# Quick Fix: Missing Reference to Built-in Protocol

## Overview

This document describes the implementation of a quick fix for the warning "Missing reference to the built-in protocol: <ProtocolName>". The fix automatically adds an `implements(Protocol)` argument to the entity opening directive.

## Implementation Details

### Location
File: `src/features/logtalkLinter.ts`

### Components

#### 1. Detection (`canFix` method)
Added check for the warning message pattern:
```typescript
} else if (diagnostic.message.includes('Missing reference to the built-in protocol: ')) {
  return true;
}
```

#### 2. Quick Fix Creation (`createQuickFix` method)
Extracts the protocol name from the diagnostic message and creates a code action:
```typescript
} else if (diagnostic.message.includes('Missing reference to the built-in protocol: ')) {
  const protocolMatch = diagnostic.message.match(/Missing reference to the built-in protocol: (.+)/);
  if (!protocolMatch) {
    return null;
  }
  const protocolName = protocolMatch[1];
  action = new CodeAction(
    `Add implements(${protocolName}) to entity opening directive`,
    CodeActionKind.QuickFix
  );
  
  // Find the entity opening directive from the warning location
  const entityLine = this.findEntityOpeningDirective(document, diagnostic.range.start.line);
  if (entityLine === null) {
    return null;
  }
  
  // Add implements(Protocol) to the entity opening directive
  const success = this.addImplementsToEntityDirective(document, entityLine, protocolName, edit);
  if (!success) {
    return null;
  }
}
```

#### 3. Helper Methods

##### `findEntityOpeningDirective(document, startLine)`
Searches backwards from the warning location to find the entity opening directive (`:- object(...)`, `:- protocol(...)`, or `:- category(...)`).

##### `addImplementsToEntityDirective(document, entityLine, protocolName, edit)`
Main dispatcher that determines if the directive is single-line or multi-line and calls the appropriate handler.

##### `addImplementsToSingleLineDirective(...)`
Handles single-line entity opening directives. Supports three cases:
1. **One argument (entity name only)**: Adds `implements(Protocol)` as second argument
2. **Multiple arguments with existing `implements/1`**: Adds protocol to existing implements as a conjunction
3. **Multiple arguments without `implements/1`**: Inserts `implements(Protocol)` between first and second argument

##### `addImplementsToMultiLineDirective(...)`
Handles multi-line entity opening directives with the same three cases as single-line.

##### `addProtocolToExistingImplements(...)`
Adds a protocol to an existing `implements/1` argument in a single-line directive by converting it to a conjunction: `implements((existing, new))`.

##### `insertImplementsBetweenArguments(...)`
Inserts `implements(Protocol)` between the first and second argument in a single-line directive.

##### `addProtocolToExistingImplementsMultiLine(...)`
Adds a protocol to an existing `implements/1` argument in a multi-line directive.

## Examples

### Example 1: Entity with no arguments
**Before:**
```logtalk
:- object(my_object).
```

**After:**
```logtalk
:- object(my_object,
	implements(protocol_name)).
```

### Example 2: Entity with one argument (entity name)
**Before:**
```logtalk
:- object(my_object(Param)).
```

**After:**
```logtalk
:- object(my_object(Param),
	implements(protocol_name)).
```

### Example 3: Entity with multiple arguments, no implements
**Before:**
```logtalk
:- object(my_object, imports(category)).
```

**After:**
```logtalk
:- object(my_object,
	implements(protocol_name),
	imports(category)).
```

### Example 4: Entity with existing implements
**Before:**
```logtalk
:- object(my_object, implements(other_protocol)).
```

**After:**
```logtalk
:- object(my_object, implements((other_protocol, protocol_name))).
```

### Example 5: Multi-line entity with no implements
**Before:**
```logtalk
:- object(my_object,
	imports(category),
	extends(parent)).
```

**After:**
```logtalk
:- object(my_object,
	implements(protocol_name),
	imports(category),
	extends(parent)).
```

### Example 6: Multi-line entity with existing implements
**Before:**
```logtalk
:- object(my_object,
	implements(other_protocol),
	imports(category)).
```

**After:**
```logtalk
:- object(my_object,
	implements((other_protocol, protocol_name)),
	imports(category)).
```

## Algorithm

1. **Detect warning**: Check if diagnostic message contains "Missing reference to the built-in protocol: "
2. **Extract protocol name**: Parse the protocol name from the diagnostic message
3. **Find entity opening directive**: Search backwards from warning location using entity opening regexes from `utils/symbols.ts`
4. **Get directive range**: Use `PredicateUtils.getDirectiveRange()` to find the complete directive (handles multi-line)
5. **Parse directive arguments**: Use `ArgumentUtils.parseArguments()` to extract all arguments
6. **Determine insertion strategy**:
   - If only entity name: Add `implements(Protocol)` as second argument
   - If `implements/1` exists: Add protocol to it as conjunction
   - Otherwise: Insert `implements(Protocol)` between first and second argument
7. **Apply edit**: Create appropriate `WorkspaceEdit` based on single-line vs multi-line directive

## Dependencies

- `PredicateUtils.getDirectiveRange()`: Gets the full range of a directive
- `ArgumentUtils.parseArguments()`: Parses comma-separated arguments
- `ArgumentUtils.findMatchingCloseParen()`: Finds matching closing parenthesis
- `SymbolRegexes` from `utils/symbols.ts`: Regexes for entity opening/ending directives

## Testing Considerations

The implementation should be tested with:
- Objects, protocols, and categories
- Parametric entities
- Single-line and multi-line directives
- Entities with no relations
- Entities with one relation
- Entities with multiple relations
- Entities with existing `implements/1` directive
- Entities with visibility modifiers (e.g., `implements(public::protocol)`)

