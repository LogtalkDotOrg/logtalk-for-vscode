// Test script to confirm the trim bug
const originalLineText = "\t:- mode(next_state(+nonvar, -nonvar, -number), zero_or_more).";
const trimmedLineText = originalLineText.trim();
const predicateName = "next_state";

console.log(`Original line: "${originalLineText}"`);
console.log(`Trimmed line:  "${trimmedLineText}"`);
console.log(`Original length: ${originalLineText.length}`);
console.log(`Trimmed length:  ${trimmedLineText.length}`);
console.log(`Difference: ${originalLineText.length - trimmedLineText.length}`);

// Find predicate position in original line
const originalPattern = new RegExp(`\\b${predicateName}\\b`, 'g');
const originalMatch = originalPattern.exec(originalLineText);

console.log(`\n=== Original Line ===`);
if (originalMatch) {
    console.log(`Found "${predicateName}" at position ${originalMatch.index}-${originalMatch.index + originalMatch[0].length}`);
    console.log(`Text at that position: "${originalLineText.substring(originalMatch.index, originalMatch.index + originalMatch[0].length)}"`);
} else {
    console.log(`Not found in original line`);
}

// Find predicate position in trimmed line
const trimmedPattern = new RegExp(`\\b${predicateName}\\b`, 'g');
const trimmedMatch = trimmedPattern.exec(trimmedLineText);

console.log(`\n=== Trimmed Line ===`);
if (trimmedMatch) {
    console.log(`Found "${predicateName}" at position ${trimmedMatch.index}-${trimmedMatch.index + trimmedMatch[0].length}`);
    console.log(`Text at that position: "${trimmedLineText.substring(trimmedMatch.index, trimmedMatch.index + trimmedMatch[0].length)}"`);
} else {
    console.log(`Not found in trimmed line`);
}

// Show the issue
if (originalMatch && trimmedMatch) {
    console.log(`\n=== The Bug ===`);
    console.log(`Position in original line: ${originalMatch.index}`);
    console.log(`Position in trimmed line:  ${trimmedMatch.index}`);
    console.log(`Difference: ${originalMatch.index - trimmedMatch.index}`);
    
    if (originalMatch.index !== trimmedMatch.index) {
        console.log(`🚨 BUG: Positions don't match!`);
        
        // Show what happens if we use the trimmed position on the original line
        const buggyStart = trimmedMatch.index;
        const buggyEnd = trimmedMatch.index + trimmedMatch[0].length;
        const buggyText = originalLineText.substring(buggyStart, buggyEnd);
        
        console.log(`\nIf we use trimmed position ${buggyStart}-${buggyEnd} on original line:`);
        console.log(`We get: "${buggyText}"`);
        console.log(`But we should get: "${originalLineText.substring(originalMatch.index, originalMatch.index + originalMatch[0].length)}"`);
        
        // Simulate the buggy replacement
        const newName = "ns";
        const buggyReplacement = originalLineText.substring(0, buggyStart) + 
                                newName + 
                                originalLineText.substring(buggyEnd);
        
        console.log(`\nBuggy replacement result: "${buggyReplacement}"`);
        
        // Check if this matches the reported bug
        const expectedBuggyResult = ":- modense(+nonvar, -nonvar, -number), zero_or_more).";
        if (buggyReplacement === expectedBuggyResult) {
            console.log(`🚨 This matches the reported buggy behavior!`);
        } else {
            console.log(`This doesn't match the reported buggy behavior`);
            console.log(`Expected: "${expectedBuggyResult}"`);
        }
    } else {
        console.log(`✅ Positions match - no bug here`);
    }
}
