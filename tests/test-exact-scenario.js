// Test script to simulate the exact scenario with beforeContext calculation
const lineText = "\t:- mode(next_state(+nonvar, -nonvar), zero_or_more).";
const predicateName = "next_state";

console.log(`Line text: "${lineText}"`);
console.log(`Looking for: "${predicateName}"`);

// Find the predicate name position (same as in the actual code)
const pattern = new RegExp(`\\b${predicateName}\\b`, 'g');
let match = pattern.exec(lineText);

if (!match) {
    console.log("❌ Predicate not found");
    process.exit(1);
}

const startChar = match.index;
const endChar = startChar + match[0].length;

console.log(`Found "${predicateName}" at position ${startChar}-${endChar}`);

// Calculate beforeContext exactly as in the actual code
const beforeContext = lineText.substring(Math.max(0, startChar - 30), startChar);
const after = endChar < lineText.length ? lineText[endChar] : '';

console.log(`Before context: "${beforeContext}"`);
console.log(`After: "${after}"`);

// Test the main pattern
const mainPattern = /:-\s*(public|private|protected|meta_predicate|mode|info|dynamic|discontiguous|multifile)\s*\(\s*[^)]*$/;
const mainMatch = mainPattern.test(beforeContext);

console.log(`Main pattern: ${mainPattern}`);
console.log(`Main pattern match: ${mainMatch}`);

// Test the mode/info specific pattern
const modeInfoPattern = /:-\s*(mode|info)\s*\(\s*$/;
const modeInfoMatch = modeInfoPattern.test(beforeContext);

console.log(`Mode/info pattern: ${modeInfoPattern}`);
console.log(`Mode/info pattern match: ${modeInfoMatch}`);

// Check validation conditions
const validAfter = after === '(' || after === '/';
console.log(`Valid after: ${validAfter} (after="${after}")`);

// Overall validation (simulating isValidPredicateContext)
const inScopeDirective = mainMatch;
const validBefore = inScopeDirective; // Simplified for this test
const isValid = validBefore && validAfter;

console.log(`In scope directive: ${inScopeDirective}`);
console.log(`Valid before: ${validBefore}`);
console.log(`Overall valid: ${isValid}`);

// Also test the isValidPredicateContextInText scenario
console.log(`\n--- Testing isValidPredicateContextInText scenario ---`);
const modeInfoInTextMatch = modeInfoMatch && validAfter;
console.log(`Mode/info in text validation: ${modeInfoInTextMatch}`);
