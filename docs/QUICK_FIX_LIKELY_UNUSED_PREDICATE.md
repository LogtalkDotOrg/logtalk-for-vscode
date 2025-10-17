# Quick Fix for "Likely unused predicate:" Warning

## Overview

This document describes the implementation of a quick fix for the Logtalk Dead Code Scanner warning "Likely unused predicate: <indicator>". The quick fix automatically removes the unused predicate indicator from the `uses/2` directive.

## Implementation Location

**File**: `src/features/logtalkDeadCodeScanner.ts`

## Warning Format

The warning message follows this format:

```text
Likely unused predicate: <qualified_predicate_indicator>
```

For example:

```text
Likely unused predicate: list::append/3
```

This warning is generated when a predicate is imported via a `uses/2` directive but is never actually used in the code.

**Important**: The indicator in the warning is **qualified** with the object name (e.g., `list::append/3`), but in the `uses/2` directive's second argument, it appears **unqualified** (e.g., `append/3`).

## Implementation Details

### 1. Updated `canFix` Method

Added detection for the "Likely unused predicate:" warning:

```typescript
private canFix(diagnostic: Diagnostic): boolean {
  // Only handle diagnostics from the dead code scanner
  if (diagnostic.source !== "Logtalk Dead Code Scanner") {
    return false;
  }

  const message = diagnostic.message;

  return message.includes('dead predicate') ||
         message.includes('dead non-terminal') ||
         message.includes('unused predicate') ||
         message.includes('unused non-terminal') ||
         message.includes('unreachable predicate') ||
         message.includes('unreachable non-terminal') ||
         message.includes('Likely unused predicate:') ||  // NEW
         /\b\w+\/\d+\b/.test(message) ||
         /\b\w+\/\/\d+\b/.test(message);
}
```

### 2. Updated `createDeleteAction` Method

Added routing to the new handler for "Likely unused predicate:" warnings:

```typescript
private async createDeleteAction(
  document: TextDocument,
  diagnostic: Diagnostic,
  _token: CancellationToken
): Promise<CodeAction | null> {
  try {
    // Check if this is a "Likely unused predicate:" warning in a uses/2 directive
    if (diagnostic.message.includes('Likely unused predicate:')) {
      return this.createRemoveFromUsesAction(document, diagnostic);
    }

    // ... existing code for other dead code warnings ...
  }
}
```

### 3. New `createRemoveFromUsesAction` Method

This method implements the quick fix logic:

#### Step 1: Extract and Parse the Qualified Predicate Indicator

```typescript
const indicatorMatch = diagnostic.message.match(/Likely unused predicate:\s*(.+)/);
if (!indicatorMatch) {
  return null;
}

const qualifiedIndicator = indicatorMatch[1].trim();

// Parse the qualified indicator to extract object and predicate parts
// Format: object::predicate/arity or object::predicate//arity
const qualifiedMatch = qualifiedIndicator.match(/^(.+)::(.+)$/);
if (!qualifiedMatch) {
  return null;
}

const expectedObjectName = qualifiedMatch[1].trim();
const unqualifiedIndicator = qualifiedMatch[2].trim();
```

The warning contains a **qualified** indicator (e.g., `list::append/3`), which we parse to extract:
- `expectedObjectName`: The object name (e.g., `list`)
- `unqualifiedIndicator`: The predicate indicator without qualification (e.g., `append/3`)

#### Step 2: Confirm Warning Line is a uses/2 Directive

```typescript
const warningLine = diagnostic.range.start.line;
const lineText = document.lineAt(warningLine).text.trim();
if (!lineText.match(/^\:-\s*uses\(/)) {
  return null;
}
```

#### Step 3: Get the Directive Range

Use `PredicateUtils.getDirectiveRange()` to handle multi-line directives:

```typescript
const directiveRange = PredicateUtils.getDirectiveRange(document, warningLine);
```

#### Step 4: Parse the uses/2 Directive and Verify Object Name

Extract the directive text and parse it:

```typescript
let directiveText = '';
for (let i = warningLine; i <= directiveRange.end; i++) {
  directiveText += document.lineAt(i).text.trim();
}

const match = directiveText.match(/^:-\s*uses\(\s*(.*)\)\s*\.$/);
const argumentsText = match[1].trim();
const args = ArgumentUtils.parseArguments(argumentsText);

const directiveObjectName = args[0].trim();
const listText = args[1].trim();

// Verify that the object name from the warning matches the first argument
if (directiveObjectName !== expectedObjectName) {
  return null;
}
```

This ensures we only provide the quick fix when the object name in the warning (e.g., `list`) matches the first argument of the `uses/2` directive.

#### Step 5: Extract List Elements

```typescript
const objectName = args[0].trim();
const listText = args[1].trim();

// Remove outer brackets
const listContent = listText.substring(1, listText.length - 1).trim();

// Parse list elements
const elements = ArgumentUtils.parseArguments(listContent);
```

#### Step 6: Find and Validate the Element to Remove

```typescript
let elementToRemove = -1;
for (let i = 0; i < elements.length; i++) {
  const element = elements[i].trim();

  if (element === unqualifiedIndicator) {
    // Simple case: element is exactly the indicator (no "as" operator)
    elementToRemove = i;
    break;
  } else if (element.includes(' as ')) {
    // Element uses the "as" operator (e.g., "append/3 as my_append/3" or "print_message(...) as dbg(Message)")
    const parts = element.split(' as ');
    if (parts.length === 2) {
      const original = parts[0].trim();
      const alias = parts[1].trim();

      // Check if alias matches the indicator (either exact match or callable form)
      if (alias === unqualifiedIndicator || this.matchesCallable(alias, unqualifiedIndicator)) {
        // Indicator is the alias (after "as") - can delete whole element
        elementToRemove = i;
        break;
      } else if (original === unqualifiedIndicator || this.matchesCallable(original, unqualifiedIndicator)) {
        // Indicator is the original (before "as") - cannot delete
        return null;
      }
    }
  }
}
```

**Handling the `as` Operator:**

The `as` operator is used for aliasing predicates in `uses/2` directives. The format is always:
- **Both indicator form:** `original_indicator as alias_indicator` (e.g., `append/3 as my_append/3`)
- **Both callable form:** `original_callable as alias_callable` (e.g., `print_message(debug, dcs, Message) as dbg(Message)`)

Note: Mixed forms (indicator with callable or vice versa) never occur.

**Matching Logic:**
- For indicators: exact string match (e.g., `append/3` matches `append/3`)
- For callables: extract functor and arity using `matchesCallable()`, then match (e.g., `dbg(Message)` matches `dbg/1`)

**Quick Fix Rules:**
- ✅ **Can delete** if the indicator matches the **alias** (part after `as`)
- ❌ **Cannot delete** if the indicator matches the **original** (part before `as`) - the alias might still be in use

**Examples:**

1. **Indicator aliasing:**
   ```logtalk
   :- uses(list, [append/3 as my_append/3]).
   ```
   - Warning: `Likely unused predicate: list::my_append/3` → ✅ Can delete
   - Warning: `Likely unused predicate: list::append/3` → ❌ Cannot delete

2. **Callable aliasing:**
   ```logtalk
   :- uses(logtalk, [print_message(debug, dcs, Message) as dbg(Message)]).
   ```
   - Warning: `Likely unused predicate: logtalk::dbg/1` → ✅ Can delete (callable `dbg(Message)` matches `dbg/1`)
   - Warning: `Likely unused predicate: logtalk::print_message/3` → ❌ Cannot delete

#### Step 7: Remove the Element and Update the Directive

```typescript
elements.splice(elementToRemove, 1);

// Get the full range of the directive (already computed in Step 3)
const directiveStartPos = new Position(warningLine, 0);
const directiveEndPos = new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length);
const directiveFullRange = new Range(directiveStartPos, directiveEndPos);

if (elements.length === 0) {
  // Delete the entire directive if list is now empty
  DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, directiveFullRange);
} else {
  // Format the directive with remaining elements using the same logic as the formatter
  const formattedContent = this.formatUses2DirectiveWithElements(
    document,
    directiveObjectName,
    elements
  );

  // Adjust indentation to match the original
  const originalLineText = document.lineAt(warningLine).text;
  const indent = originalLineText.match(/^(\s*)/)[1];

  const formattedLines = formattedContent.split('\n');
  const adjustedLines = formattedLines.map((line: string) => {
    // Replace leading tab with the original indent
    if (line.startsWith('\t')) {
      return indent + line.substring(1);
    }
    return line;
  });
  const adjustedFormattedContent = adjustedLines.join('\n');

  edit.replace(document.uri, directiveFullRange, adjustedFormattedContent);
}
```

**Note**: The `formatUses2DirectiveWithElements` helper method calls `LogtalkDocumentFormattingEditProvider.formatUses2DirectiveContent()` by creating a mock document that returns the temporary directive text with the modified elements list. This ensures we use the exact same formatting logic without code duplication, providing proper multi-line formatting based on ruler settings.

## Examples

### Example 1: Remove Single Unused Predicate

#### Before Quick Fix

```logtalk
:- object(my_object).

    :- uses(list, [append/3, member/2, reverse/2]).

    test(Element, List) :-
        member(Element, List).

:- end_object.
```

**Warning**: `Likely unused predicate: list::append/3`

#### After Quick Fix

```logtalk
:- object(my_object).

    :- uses(list, [member/2, reverse/2]).

    test(Element, List) :-
        member(Element, List).

:- end_object.
```

### Example 2: Remove Last Predicate (Delete Entire Directive)

#### Before Quick Fix

```logtalk
:- object(my_object).

    :- uses(list, [append/3]).
    :- uses(set, [member/2]).

    test(Element, Set) :-
        member(Element, Set).

:- end_object.
```

**Warning**: `Likely unused predicate: list::append/3`

#### After Quick Fix

```logtalk
:- object(my_object).

    :- uses(set, [member/2]).

    test(Element, Set) :-
        member(Element, Set).

:- end_object.
```

The entire `uses(list, [append/3])` directive is removed using smart delete to avoid leaving empty lines.

### Example 3: Multi-line uses/2 Directive

#### Before Quick Fix

```logtalk
:- object(my_object).

    :- uses(list, [
        append/3,
        member/2,
        reverse/2
    ]).

    test(List1, List2, Result) :-
        append(List1, List2, Result).

:- end_object.
```

**Warning**: `Likely unused predicate: list::member/2`

#### After Quick Fix

```logtalk
:- object(my_object).

    :- uses(list, [append/3, reverse/2]).

    test(List1, List2, Result) :-
        append(List1, List2, Result).

:- end_object.
```

**Note**: The directive is reformatted to a single line after removing the element.

### Example 4: Unused Alias (Can Remove Whole Element)

#### Before Quick Fix

```logtalk
:- object(my_object).

    :- uses(list, [append/3 as my_append/3, member/2]).

    test(Element, List) :-
        member(Element, List).

:- end_object.
```

**Warning**: `Likely unused predicate: list::my_append/3`

#### After Quick Fix

```logtalk
:- object(my_object).

    :- uses(list, [member/2]).

    test(Element, List) :-
        member(Element, List).

:- end_object.
```

The entire `append/3 as my_append/3` element is removed because the unqualified indicator `my_append/3` appears **after** the `as` operator (is the alias).

### Example 5: Original Predicate in Alias (No Quick Fix)

#### Before

```logtalk
:- object(my_object).

    :- uses(list, [append/3 as my_append/3, member/2]).

    test(List1, List2, Result) :-
        my_append(List1, List2, Result).

:- end_object.
```

**Warning**: `Likely unused predicate: list::append/3`

**Quick Fix**: **NOT PROVIDED** because the unqualified indicator `append/3` appears **before** the `as` operator (is the original being aliased). The alias `my_append/3` is still in use, so we cannot remove the import.

## Integration

The quick fix is automatically available in VS Code when:
1. A "Likely unused predicate:" warning is present in the PROBLEMS pane
2. The warning is on a `uses/2` directive line
3. The predicate can be safely removed (not using `as` operator)
4. The user triggers the quick fix action (e.g., Cmd+. on macOS, Ctrl+. on Windows/Linux)

The quick fix appears in the context menu as "Remove unused predicate <indicator> from uses/2 directive".

## Dependencies

- `PredicateUtils.getDirectiveRange()` - Computes the full range of multi-line directives
- `ArgumentUtils.parseArguments()` - Parses list elements handling nested structures
- `DiagnosticsUtils.addSmartDeleteOperation()` - Deletes ranges without leaving empty lines

## Technical Notes

### Quick Fix Logic for `as` Operator

When a predicate is imported with an alias using the `as` infix operator:
```logtalk
:- uses(list, [append/3 as my_append/3]).
```

The quick fix logic is:

**Case 1: Warning for the alias (after `as`)**
- Warning: `Likely unused predicate: my_append/3`
- Action: **Quick fix PROVIDED** - removes the entire `append/3 as my_append/3` element
- Reason: The alias is unused, so the whole aliased import can be safely removed

**Case 2: Warning for the original (before `as`)**
- Warning: `Likely unused predicate: append/3`
- Action: **Quick fix NOT PROVIDED**
- Reason: The original `append/3` appears before `as`, but the alias `my_append/3` might still be in use. Removing the element would break code that uses the alias.

This ensures we only remove imports when it's safe to do so.

### Smart Delete for Empty Directives

When removing the last element from a `uses/2` directive, the entire directive is deleted using `DiagnosticsUtils.addSmartDeleteOperation()`, which:
- Removes the directive line
- Removes any surrounding empty lines
- Prevents leaving orphaned whitespace

### Single-line Reformatting

After removing an element, the directive is always reformatted to a single line for simplicity. This is consistent with the behavior of other quick fixes and keeps the implementation straightforward.

## Conclusion

This quick fix provides an efficient way to clean up unused predicate imports from `uses/2` directives, helping maintain clean and minimal code. It intelligently handles various cases including multi-line directives, empty lists, and respects alias definitions using the `as` operator.

