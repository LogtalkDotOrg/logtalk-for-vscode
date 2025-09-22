// Test script to simulate isValidPredicateContext for mode directives
const lineText = ":- mode(next_state(+nonvar, -nonvar, -number), zero_or_more).";
const predicateName = "next_state";

console.log(`Line text: "${lineText}"`);
console.log(`Looking for: "${predicateName}"`);

// Find ALL occurrences of the predicate name
const pattern = new RegExp(`\\b${predicateName}\\b`, 'g');
let match;
let occurrences = [];

while ((match = pattern.exec(lineText)) !== null) {
    occurrences.push({
        startChar: match.index,
        endChar: match.index + match[0].length,
        text: match[0]
    });
}

console.log(`\nFound ${occurrences.length} occurrence(s):`);

// Test each occurrence with isValidPredicateContext logic
occurrences.forEach((occurrence, index) => {
    console.log(`\n=== Occurrence ${index + 1} ===`);
    const { startChar, endChar, text } = occurrence;
    
    console.log(`Position: ${startChar}-${endChar}`);
    console.log(`Text: "${text}"`);
    
    // Calculate beforeContext and after (same as in actual code)
    const beforeContext = lineText.substring(Math.max(0, startChar - 30), startChar);
    const afterContext = lineText.substring(endChar, Math.min(lineText.length, endChar + 10));
    const before = startChar > 0 ? lineText[startChar - 1] : '';
    const after = endChar < lineText.length ? lineText[endChar] : '';
    
    console.log(`Before context: "${beforeContext}"`);
    console.log(`After context: "${afterContext}"`);
    console.log(`Before char: "${before}"`);
    console.log(`After char: "${after}"`);
    
    // Test the main scope directive pattern
    const inScopeDirective = /:-\s*(public|private|protected|meta_predicate|mode|info|dynamic|discontiguous|multifile)\s*\(\s*[^)]*$/.test(beforeContext);
    console.log(`In scope directive: ${inScopeDirective}`);
    
    // Test standard validation
    const validBefore = /^[\s,\(\[\{:-]$/.test(before) || startChar === 0 ||
                       lineText.substring(0, startChar).trim() === '' ||
                       inScopeDirective;
    
    const validAfter = /^[\s,\)\]\}\.:/]$/.test(after) || after === '' ||
                      !!lineText.substring(endChar).match(/^\s*[\(\/:]/);
    
    console.log(`Valid before: ${validBefore}`);
    console.log(`Valid after: ${validAfter}`);
    
    const isValid = validBefore && validAfter;
    console.log(`Overall valid: ${isValid}`);
    
    // Show what would be replaced
    if (isValid) {
        console.log(`✅ This occurrence would be included in rename`);
        console.log(`Range to replace: "${lineText.substring(startChar, endChar)}"`);
    } else {
        console.log(`❌ This occurrence would be skipped`);
    }
});

// Test if there might be a different match that's causing the issue
console.log(`\n=== Testing potential off-by-one scenarios ===`);

// Test what happens if we check position 7 (the opening parenthesis)
const offByOneStart = 7;
const offByOneEnd = 7 + predicateName.length; // This would be wrong

console.log(`Testing off-by-one position: ${offByOneStart}-${offByOneEnd}`);
console.log(`Text at off-by-one position: "${lineText.substring(offByOneStart, offByOneEnd)}"`);

const offByOneBeforeContext = lineText.substring(Math.max(0, offByOneStart - 30), offByOneStart);
const offByOneAfter = offByOneEnd < lineText.length ? lineText[offByOneEnd] : '';

console.log(`Off-by-one before context: "${offByOneBeforeContext}"`);
console.log(`Off-by-one after: "${offByOneAfter}"`);

// This would be the wrong validation
const offByOneInScope = /:-\s*(public|private|protected|meta_predicate|mode|info|dynamic|discontiguous|multifile)\s*\(\s*[^)]*$/.test(offByOneBeforeContext);
console.log(`Off-by-one in scope: ${offByOneInScope}`);
