# List Pattern Completion Implementation

## Overview

The `LogtalkListCompletionProvider` provides automatic tail variable suggestions when typing the pipe character (`|`) in list patterns. This feature helps developers quickly complete list pattern syntax with appropriate variable names.

## Features

### Pipe Character (`|`) - List Pattern Completion

When typing `|` in a list pattern, the provider automatically suggests an appropriate tail variable name based on the head variable.

#### Behavior

1. **Head Variable Detection**: The provider looks for a valid Logtalk variable before the `|` character in a list pattern:
   - Variables starting with an uppercase letter (e.g., `Item`, `Entry`)
   - Variables starting with underscore followed by at least one more character (e.g., `_Item`, `_Entry`)
   - Does NOT match just `_` (anonymous variable)

2. **Tail Variable Suggestion**:
   - If the head variable is `Head`, suggests `Tail`
   - For variables starting with `_` (but not just `_`), offers **two suggestions**:
     - Pluralized form with underscore (e.g., `_Item` → `_Items`)
     - Pluralized form without underscore (e.g., `_Item` → `Items`)
   - For other variables, suggests the plural form of the variable name

3. **Pluralization Rules**: The provider uses English pluralization rules:
   - Special cases: `Child` → `Children`, `Person` → `People`, etc.
   - Words ending in consonant + `y`: `Entry` → `Entries`
   - Words ending in `s`, `ss`, `sh`, `ch`, `x`, `z`: `Box` → `Boxes`
   - Words ending in `f` or `fe`: `Leaf` → `Leaves`
   - Words ending in consonant + `o`: `Hero` → `Heroes`
   - Default: add `s` (e.g., `Item` → `Items`)

#### Examples

```logtalk
% Typing: [Head|
% Suggestion appears:  Tail
% Result after accepting: [Head| Tail

% Typing: [Item|
% Suggestion appears: Items
% Result after accepting: [Item| Items

% Typing: [Entry|
% Suggestion appears: Entries
% Result after accepting: [Entry| Entries

% Typing: [Child|
% Suggestion appears: Children
% Result after accepting: [Child| Children

% Typing: [Box|
% Suggestion appears: Boxes
% Result after accepting: [Box| Boxes

% Typing: [Person|
% Suggestion appears: People
% Result after accepting: [Person| People

% Typing: [_Item|
% Two suggestions appear:
%   1. _Items (with underscore)
%   2. Items (without underscore)
% Result after accepting first: [_Item| _Items
% Result after accepting second: [_Item| Items

% Typing: [_Entry|
% Two suggestions appear:
%   1. _Entries (with underscore)
%   2. Entries (without underscore)
% Result after accepting first: [_Entry| _Entries
% Result after accepting second: [_Entry| Entries

% Typing: [item|
% Result: [item|
% (No suggestion for atoms/lowercase identifiers)
```

## Implementation Details

### File Structure

- **Provider**: `src/features/onTypeFormattingEditProvider.ts`
- **Registration**: `src/extension.ts`

### Key Components

#### 1. Provider Class

```typescript
export class LogtalkListCompletionProvider implements CompletionItemProvider {
  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList>
}
```

#### 2. Pattern Matching

The provider uses a regular expression to detect valid list patterns:

```typescript
const variableMatch = textBeforePipe.match(/\[([A-Z_][A-Za-z0-9_]*)\s*\|$/);
```

This matches:

- `[Variable|` - List pattern with variable before pipe
- `[Variable |` - List pattern with space before pipe
- `[_Variable|` - List pattern with underscore-prefixed variable
- Variables starting with uppercase letter or underscore

#### 3. Pluralization Logic

The `pluralize()` method implements English pluralization rules:

1. **Special Cases Dictionary**: Handles irregular plurals
2. **Rule-Based Transformations**: Applies standard English pluralization rules
3. **Default Behavior**: Adds `s` for regular nouns

### Registration

The provider is registered in `src/extension.ts`:

```typescript
const listCompletionProvider = new LogtalkListCompletionProvider();
context.subscriptions.push(
  languages.registerCompletionItemProvider(
    { language: "logtalk" }, 
    listCompletionProvider, 
    '|'
  )
);
```

## Usage

To use the feature:

1. Open a Logtalk file (`.lgt` or `.logtalk`)
2. Type a list pattern with a variable: `[Head|`
3. The autocomplete menu will appear with the suggested tail variable
4. Press Tab or Enter to accept the suggestion
5. The tail variable will be inserted with a leading space: `[Head| Tail`

## Configuration

No configuration is required. The feature is automatically enabled for all Logtalk files.

## Logging

The provider uses the extension's logging system to log debug information:

- Completion trigger events
- Pattern matching results
- Variable detection
- Suggested tail variable names
- Errors during processing

To enable debug logging, use the "Logtalk: Set Extension Logging Level" command and select "debug".

## Limitations

1. **Single Variable Only**: Only detects a single variable before the pipe. Complex patterns like `[H1, H2|` are not supported.

2. **Simple Pluralization**: The pluralization logic uses basic English rules and may not handle all edge cases correctly.

3. **No Context Awareness**: The provider doesn't check if the suggested variable name already exists in the current scope.

4. **List Patterns Only**: Only works within list patterns (starting with `[`). Does not work with other uses of the pipe character.

## Future Enhancements

Potential improvements for future versions:

1. **Multiple Variables**: Support patterns like `[H1, H2|` → suggest `Tails` or similar
2. **Context-Aware Naming**: Check existing variables in scope to avoid conflicts
3. **Custom Pluralization**: Allow users to define custom pluralization rules via settings
4. **Configurable Behavior**: Add settings to enable/disable the feature or customize suggestions
5. **Smart Naming**: Use more sophisticated naming strategies based on variable semantics
6. **Snippet Integration**: Provide snippet-style completions with tab stops for more complex patterns

## Testing

To test the feature:

1. Open a Logtalk file (`.lgt` or `.logtalk`)
2. Type a list pattern with a variable: `[Head|`
3. Observe that the autocomplete menu appears with ` Tail` as a suggestion
4. Accept the suggestion and verify it inserts correctly
5. Try with different variable names to see pluralization in action

## Related Features

- **Document Formatting**: `LogtalkDocumentFormattingEditProvider`
- **Range Formatting**: `LogtalkDocumentRangeFormattingEditProvider`
- **Edit Helpers**: Auto-indentation rules in `src/features/editHelpers.ts`
- **Completion Providers**: Other completion providers for Logtalk syntax

## Technical Notes

### Why CompletionItemProvider Instead of OnTypeFormattingEditProvider?

Initially, this feature was implemented using `OnTypeFormattingEditProvider`, but it was changed to `CompletionItemProvider` for the following reasons:

1. **Better UX**: Completion providers show suggestions in the autocomplete menu, giving users the choice to accept or ignore them
2. **No Settings Required**: Doesn't require `editor.formatOnType` to be enabled
3. **More Appropriate**: `OnTypeFormattingEditProvider` is designed for formatting existing code (like auto-indentation), not for inserting new text
4. **Standard Pattern**: Completion providers are the standard way to suggest text insertions in VS Code

### Trigger Character

The provider is registered with `|` as the trigger character, which means it will be invoked whenever the user types `|` in a Logtalk file. The provider then checks if the context is appropriate (i.e., inside a list pattern with a valid variable) before providing suggestions.

