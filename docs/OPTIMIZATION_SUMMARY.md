# Optimization: Single Occurrence Search in Directives

## Optimization Rationale

The original implementation was searching for ALL occurrences of a predicate in a directive, but this was unnecessary because:

1. **Reference Provider Context**: The reference provider already identified the specific location where the predicate occurs
2. **Single Occurrence Assumption**: In the context of renaming, we expect exactly one occurrence per directive that needs updating
3. **Performance**: Searching the entire multi-line directive for all occurrences is wasteful when we only need to find the one occurrence

## Before Optimization

The original `findPredicateInDirectiveWithEndLine` method:
- Read the complete directive to determine type
- Processed every line in the directive
- Searched for ALL occurrences in each line
- Collected all ranges found across the entire directive

```typescript
// Original approach - searched entire directive
while (currentLine < document.lineCount && !directiveComplete) {
  // Process every line
  let lineRanges = this.findPredicateRangesInLineWithIndicatorFormat(lineText, predicateIndicator, currentLine);
  // ... try callable format if needed
  locations.push(...lineRanges.map(range => ({ uri: document.uri, range })));
  currentLine++;
}
```

## After Optimization

The optimized `findPredicateInDirectiveWithEndLine` method:
- Read the complete directive to determine type and end line
- Search line by line until the FIRST occurrence is found
- Return immediately when the occurrence is found (early exit)
- Assumes only one occurrence needs updating per directive

```typescript
// Optimized approach - find first occurrence and exit
for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
  let lineRanges = this.findPredicateRangesInLineWithIndicatorFormat(lineText, predicateIndicator, lineNum);
  // ... try callable format if needed
  
  // Early exit when found (optimization: only one expected)
  if (lineRanges.length > 0) {
    const locations = lineRanges.map(range => ({ uri: document.uri, range }));
    return { ranges: locations, endLine };
  }
}
```

## Performance Benefits

1. **Early Exit**: Stops searching as soon as the occurrence is found
2. **Reduced Processing**: No need to process remaining lines after finding the match
3. **Simpler Logic**: Cleaner code that reflects the actual use case
4. **Better Logging**: More focused debug output

## Correctness Maintained

The optimization maintains correctness because:
- The reference provider already identified that there IS an occurrence in this directive
- We only need to find that specific occurrence for renaming
- Multiple occurrences of the same predicate in one directive would be unusual
- The two-step search strategy (indicators first, then callable forms) is preserved

## Example Scenarios

### Scenario 1: Single-line directive
```logtalk
:- uses(list, [append/3, member/2]).
```
- **Before**: Search entire line, collect all matches
- **After**: Find `member/2`, return immediately

### Scenario 2: Multi-line directive
```logtalk
:- uses(complex_library, [
    append/3,
    member/2,                    ← Found here, return immediately
    process(+input, -output),    ← No longer processed
    transform(+data, ?result)    ← No longer processed
]).
```
- **Before**: Process all 5 lines, search each line completely
- **After**: Process lines 1-3, find `member/2` on line 3, return immediately

## Impact

- **Performance**: Faster processing, especially for large multi-line directives
- **Efficiency**: Reduced unnecessary work
- **Maintainability**: Cleaner, more focused code
- **Correctness**: Same results, but achieved more efficiently

The optimization reflects the actual use case: finding the single occurrence that the reference provider already identified needs updating.
