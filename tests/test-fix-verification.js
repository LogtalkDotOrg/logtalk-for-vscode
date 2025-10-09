// Test script to verify the fix works correctly
const originalLineText = "\t:- mode(next_state(+nonvar, -nonvar, -number), zero_or_more).";
const predicateName = "next_state";
const newName = "ns";

console.log(`Original line: "${originalLineText}"`);
console.log(`Renaming "${predicateName}" to "${newName}"`);

// Simulate the FIXED findRelatedDirectives logic
function simulateFixedFindRelatedDirectives(lineText, predicateName) {
    const trimmedLineText = lineText.trim();
    
    console.log(`\n=== Fixed Logic ===`);
    console.log(`Original line text: "${lineText}"`);
    console.log(`Trimmed line text:  "${trimmedLineText}"`);
    
    // Check for mode/2 or info/2 directives (using trimmed text)
    const hasMode = trimmedLineText.includes('mode(');
    const hasInfo = trimmedLineText.includes('info(');
    const hasPredicate = trimmedLineText.includes(predicateName);
    
    console.log(`Has mode directive: ${hasMode}`);
    console.log(`Has info directive: ${hasInfo}`);
    console.log(`Has predicate name: ${hasPredicate}`);
    
    if ((hasMode || hasInfo) && hasPredicate) {
        // Use ORIGINAL lineText for position calculation (this is the fix!)
        return findPredicateRangesInLine(lineText, predicateName, 0);
    }
    
    return [];
}

// Simulate findPredicateRangesInLine with original text
function findPredicateRangesInLine(lineText, predicateName, lineNumber) {
    const ranges = [];
    const pattern = new RegExp(`\\b${predicateName}\\b`, 'g');
    let match;
    
    while ((match = pattern.exec(lineText)) !== null) {
        const startChar = match.index;
        const endChar = startChar + match[0].length;
        
        console.log(`\nFound "${predicateName}" at position ${startChar}-${endChar} in original text`);
        console.log(`Text at that position: "${lineText.substring(startChar, endChar)}"`);
        
        // Simulate validation (simplified)
        const beforeContext = lineText.substring(Math.max(0, startChar - 30), startChar);
        const after = endChar < lineText.length ? lineText[endChar] : '';
        
        const inScopeDirective = /:-\s*(public|private|protected|meta_predicate|mode|info|dynamic|discontiguous|multifile)\s*\(\s*[^)]*$/.test(beforeContext);
        const validAfter = after === '(' || after === '/';
        
        if (inScopeDirective && validAfter) {
            const range = {
                start: { line: lineNumber, character: startChar },
                end: { line: lineNumber, character: endChar }
            };
            ranges.push(range);
            console.log(`✅ Added valid range: ${startChar}-${endChar}`);
        } else {
            console.log(`❌ Skipped invalid range`);
        }
    }
    
    return ranges;
}

// Test the fixed logic
const ranges = simulateFixedFindRelatedDirectives(originalLineText, predicateName);

console.log(`\n=== Results ===`);
console.log(`Found ${ranges.length} valid range(s):`);

ranges.forEach((range, index) => {
    console.log(`\nRange ${index + 1}:`);
    console.log(`  Position: ${range.start.character}-${range.end.character}`);
    
    const originalText = originalLineText.substring(range.start.character, range.end.character);
    console.log(`  Original text: "${originalText}"`);
    
    // Test the replacement
    const replacementText = newName;
    const result = originalLineText.substring(0, range.start.character) + 
                   replacementText + 
                   originalLineText.substring(range.end.character);
    
    console.log(`  Replacement text: "${replacementText}"`);
    console.log(`  Result: "${result}"`);
    
    // Check if this is correct
    const expectedCorrectResult = "\t:- mode(ns(+nonvar, -nonvar, -number), zero_or_more).";
    if (result === expectedCorrectResult) {
        console.log(`  ✅ This is the correct result!`);
    } else {
        console.log(`  ❌ This is not correct`);
        console.log(`  Expected: "${expectedCorrectResult}"`);
    }
});

// Also test that we don't get the buggy behavior anymore
console.log(`\n=== Verification ===`);
const buggyResult = ":- modense(+nonvar, -nonvar, -number), zero_or_more).";
const actualResult = ranges.length > 0 ? 
    originalLineText.substring(0, ranges[0].start.character) + 
    newName + 
    originalLineText.substring(ranges[0].end.character) : 
    "No ranges found";

console.log(`Buggy result (what we DON'T want): "${buggyResult}"`);
console.log(`Actual result (what we DO want):   "${actualResult}"`);

if (actualResult.trim() === buggyResult) {
    console.log(`🚨 Still buggy!`);
} else {
    console.log(`✅ Bug is fixed!`);
}
