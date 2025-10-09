// Test script to reproduce the exact rename bug
const lineText = ":- mode(next_state(+nonvar, -nonvar, -number), zero_or_more).";
const predicateName = "next_state";
const newName = "ns";

console.log(`Original text: "${lineText}"`);
console.log(`Renaming "${predicateName}" to "${newName}"`);

// Find the predicate name position
const pattern = new RegExp(`\\b${predicateName}\\b`, 'g');
let match = pattern.exec(lineText);

if (!match) {
    console.log("❌ Predicate not found");
    process.exit(1);
}

const startChar = match.index;
const endChar = startChar + match[0].length;

console.log(`\nFound "${predicateName}" at position ${startChar}-${endChar}`);
console.log(`Character breakdown around match:`);

// Show character breakdown around the match
for (let i = Math.max(0, startChar - 3); i < Math.min(lineText.length, endChar + 3); i++) {
    const char = lineText[i];
    const marker = (i >= startChar && i < endChar) ? ' <<<' : '';
    console.log(`Position ${i}: "${char}"${marker}`);
}

// Test what the correct replacement should be
const correctReplacement = lineText.substring(0, startChar) + newName + lineText.substring(endChar);
console.log(`\nCorrect replacement: "${correctReplacement}"`);

// Test what happens if we're off by one (starting at position startChar - 1)
const buggyStartChar = startChar - 1;
const buggyEndChar = startChar + newName.length - 1; // This would be wrong logic
const buggyReplacement = lineText.substring(0, buggyStartChar) + newName + lineText.substring(buggyEndChar + 1);
console.log(`Buggy replacement (off by one): "${buggyReplacement}"`);

// Test what happens if we replace the wrong range
const wrongRange = lineText.substring(buggyStartChar, startChar + newName.length);
console.log(`\nWrong range being replaced: "${wrongRange}"`);
console.log(`Should be replacing: "${lineText.substring(startChar, endChar)}"`);

// Simulate the buggy behavior described in the issue
const buggyResult = ":- modense(+nonvar, -nonvar, -number), zero_or_more).";
console.log(`\nExpected buggy result: "${buggyResult}"`);

// Analyze what's being replaced in the buggy case
const originalPart = ":- mode(next_stat";
const replacementPart = ":- modense";
console.log(`\nBuggy replacement analysis:`);
console.log(`Original part: "${originalPart}"`);
console.log(`Replacement part: "${replacementPart}"`);
console.log(`This suggests replacing "(next_stat" with "ns"`);

// Find where "(next_stat" starts
const buggyPattern = "(next_stat";
const buggyIndex = lineText.indexOf(buggyPattern);
console.log(`\n"(next_stat" starts at position: ${buggyIndex}`);
console.log(`"next_state" starts at position: ${startChar}`);
console.log(`Difference: ${startChar - buggyIndex} (this should be 1, confirming off-by-one error)`);
