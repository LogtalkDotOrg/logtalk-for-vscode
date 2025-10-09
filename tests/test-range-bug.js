// Test script to simulate the exact range calculation issue
const lineText = ":- mode(next_state(+nonvar, -nonvar, -number), zero_or_more).";
const predicateName = "next_state";
const newName = "ns";

console.log(`Original text: "${lineText}"`);
console.log(`Renaming "${predicateName}" to "${newName}"`);

// Simulate the findPredicateRangesInLine logic
function findPredicateRangesInLine(lineText, predicateName, lineNumber) {
    const ranges = [];
    const pattern = new RegExp(`\\b${predicateName}\\b`, 'g');
    let match;
    
    while ((match = pattern.exec(lineText)) !== null) {
        const startChar = match.index;
        const endChar = startChar + match[0].length;
        const matchedText = match[0];
        
        console.log(`\nFound match "${matchedText}" at chars ${startChar}-${endChar}`);
        
        // Simulate isValidPredicateContext
        const beforeContext = lineText.substring(Math.max(0, startChar - 30), startChar);
        const before = startChar > 0 ? lineText[startChar - 1] : '';
        const after = endChar < lineText.length ? lineText[endChar] : '';
        
        console.log(`Before context: "${beforeContext}"`);
        console.log(`Before char: "${before}"`);
        console.log(`After char: "${after}"`);
        
        // Test the main scope directive pattern
        const inScopeDirective = /:-\s*(public|private|protected|meta_predicate|mode|info|dynamic|discontiguous|multifile)\s*\(\s*[^)]*$/.test(beforeContext);
        console.log(`In scope directive: ${inScopeDirective}`);
        
        const validBefore = /^[\s,\(\[\{:-]$/.test(before) || startChar === 0 ||
                           lineText.substring(0, startChar).trim() === '' ||
                           inScopeDirective;
        
        const validAfter = /^[\s,\)\]\}\.:/]$/.test(after) || after === '' ||
                          !!lineText.substring(endChar).match(/^\s*[\(\/:]/);
        
        console.log(`Valid before: ${validBefore}`);
        console.log(`Valid after: ${validAfter}`);
        
        const isValid = validBefore && validAfter;
        console.log(`Overall valid: ${isValid}`);
        
        if (isValid) {
            const range = {
                start: { line: lineNumber, character: startChar },
                end: { line: lineNumber, character: endChar }
            };
            ranges.push(range);
            console.log(`✅ Added range: ${startChar}-${endChar}`);
        } else {
            console.log(`❌ Skipped invalid range`);
        }
    }
    
    return ranges;
}

// Test the range calculation
const ranges = findPredicateRangesInLine(lineText, predicateName, 0);

console.log(`\n=== Range Results ===`);
console.log(`Found ${ranges.length} valid range(s):`);

ranges.forEach((range, index) => {
    console.log(`\nRange ${index + 1}:`);
    console.log(`  Position: ${range.start.character}-${range.end.character}`);
    
    const originalText = lineText.substring(range.start.character, range.end.character);
    console.log(`  Original text: "${originalText}"`);
    
    // Simulate the replacement
    const replacementText = newName; // Simplified
    const result = lineText.substring(0, range.start.character) + 
                   replacementText + 
                   lineText.substring(range.end.character);
    
    console.log(`  Replacement text: "${replacementText}"`);
    console.log(`  Result: "${result}"`);
    
    // Check if this matches the buggy behavior
    const expectedBuggyResult = ":- modense(+nonvar, -nonvar, -number), zero_or_more).";
    if (result === expectedBuggyResult) {
        console.log(`  🚨 This matches the buggy behavior!`);
    } else {
        console.log(`  ✅ This looks correct`);
    }
});

// Test what would happen with an off-by-one range
console.log(`\n=== Testing Off-by-One Scenario ===`);
const buggyRange = {
    start: { character: 7 }, // Opening parenthesis
    end: { character: 17 }   // After "(next_stat"
};

const buggyOriginalText = lineText.substring(buggyRange.start.character, buggyRange.end.character);
console.log(`Buggy range: ${buggyRange.start.character}-${buggyRange.end.character}`);
console.log(`Buggy original text: "${buggyOriginalText}"`);

const buggyResult = lineText.substring(0, buggyRange.start.character) + 
                   newName + 
                   lineText.substring(buggyRange.end.character);
console.log(`Buggy result: "${buggyResult}"`);

const expectedBuggyResult = ":- modense(+nonvar, -nonvar, -number), zero_or_more).";
if (buggyResult === expectedBuggyResult) {
    console.log(`🚨 This matches the reported buggy behavior!`);
} else {
    console.log(`This doesn't match the buggy behavior`);
}
