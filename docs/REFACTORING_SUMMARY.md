# Refactoring: Use Existing getDirectiveRange Function

## Refactoring Rationale

The `findPredicateInDirectiveWithEndLine` method was implementing custom logic to find the end of a directive, but there was already an existing `getDirectiveRange` function in `PredicateUtils` that does exactly the same thing.

## Problem

**Code Duplication**: Multiple implementations of the same functionality:

1. **`PredicateUtils.getDirectiveRange()`** in `src/utils/predicateUtils.ts`
2. **`this.getDirectiveRange()`** in `src/features/renameProvider.ts` 
3. **Custom logic** in `findPredicateInDirectiveWithEndLine()`

All three were doing the same thing: finding the end of a directive by looking for `).` followed by optional whitespace and comments.

## Before Refactoring

### Custom Logic in findPredicateInDirectiveWithEndLine
```typescript
// Custom directive end-finding logic
let currentLine = startLine;
let directiveComplete = false;
let directiveText = '';

while (currentLine < document.lineCount && !directiveComplete) {
  const lineText = document.lineAt(currentLine).text;
  const trimmedLine = lineText.trim();
  directiveText += lineText + '\n';

  if (trimmedLine.endsWith('.')) {
    directiveComplete = true;
  }
  currentLine++;
}

const endLine = currentLine - 1;
```

### Duplicate getDirectiveRange Method
```typescript
private getDirectiveRange(doc: TextDocument, startLine: number): { start: number; end: number } {
  let endLine = startLine;
  
  for (let lineNum = startLine; lineNum < doc.lineCount; lineNum++) {
    const lineText = doc.lineAt(lineNum).text;
    if (/\)\.(\s*(%.*)?)?$/.test(lineText)) {
      endLine = lineNum;
      break;
    }
  }
  
  return { start: startLine, end: endLine };
}
```

## After Refactoring

### Using Existing PredicateUtils.getDirectiveRange
```typescript
// Use existing getDirectiveRange function to find the directive boundaries
const directiveRange = PredicateUtils.getDirectiveRange(document, startLine);
const endLine = directiveRange.end;

// Read the complete directive text to determine its type
let directiveText = '';
for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
  directiveText += document.lineAt(lineNum).text + '\n';
}
```

## Changes Made

1. **Added Import**: Added `PredicateUtils` import to `renameProvider.ts`
2. **Replaced Custom Logic**: Used `PredicateUtils.getDirectiveRange()` instead of custom directive end-finding logic
3. **Updated Other Usages**: Replaced `this.getDirectiveRange()` calls with `PredicateUtils.getDirectiveRange()`
4. **Removed Duplicate Method**: Deleted the duplicate `getDirectiveRange()` method from `renameProvider.ts`

## Benefits

1. **Code Reuse**: Eliminates code duplication by using existing, tested functionality
2. **Consistency**: All directive range finding now uses the same implementation
3. **Maintainability**: Only one place to maintain directive range logic
4. **Reliability**: Uses the proven `PredicateUtils.getDirectiveRange()` implementation
5. **Cleaner Code**: Removes unnecessary duplicate methods

## Technical Details

### PredicateUtils.getDirectiveRange() Features
- Properly handles multi-line directives
- Uses regex pattern `/\)\.(\s*(%.*)?)?$/` to find directive end
- Matches `).` followed by optional whitespace and optional line comments
- Returns `{ start: number; end: number }` object

### Files Modified
- **`src/features/renameProvider.ts`**:
  - Added `PredicateUtils` import
  - Replaced custom logic in `findPredicateInDirectiveWithEndLine()`
  - Updated two other `getDirectiveRange()` calls
  - Removed duplicate `getDirectiveRange()` method

## Impact

- **Performance**: Same performance, but cleaner implementation
- **Correctness**: Same results using proven, tested code
- **Maintainability**: Reduced code duplication and maintenance burden
- **Consistency**: All directive range operations now use the same implementation

The refactoring maintains all existing functionality while eliminating code duplication and improving code organization.
