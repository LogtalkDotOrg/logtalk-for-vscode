// Test script to simulate the exact scenario from the bug report
const lineText = "\t:- public(next_state/3).";
const predicateName = "next_state";
const declarationLine = 32; // 0-based line number from debug logs

console.log("=== Simulating findPredicatePositionInDeclaration ===");
console.log(`Line text: ${JSON.stringify(lineText)}`);
console.log(`Predicate name: ${predicateName}`);
console.log(`Declaration line: ${declarationLine}`);

// Simulate findPredicateRangesInLine
function findPredicateRangesInLine(lineText, predicateName, lineNumber) {
    const ranges = [];
    
    // Create regex pattern (same as in the actual code)
    const pattern = new RegExp(`\\b${escapeRegex(predicateName)}\\b`, 'g');
    
    let match;
    while ((match = pattern.exec(lineText)) !== null) {
        const startChar = match.index;
        const endChar = startChar + match[0].length;
        const matchedText = match[0];
        
        console.log(`Found match "${matchedText}" at position ${startChar}-${endChar}`);
        
        // Simulate isValidPredicateContext
        if (isValidPredicateContext(lineText, startChar, endChar)) {
            const range = {
                start: { line: lineNumber, character: startChar },
                end: { line: lineNumber, character: endChar }
            };
            ranges.push(range);
            console.log(`✅ Valid range: line ${lineNumber + 1}, chars ${startChar}-${endChar}`);
        } else {
            console.log(`❌ Invalid context: line ${lineNumber + 1}, chars ${startChar}-${endChar}`);
        }
    }
    
    return ranges;
}

// Simulate isValidPredicateContext (simplified version)
function isValidPredicateContext(lineText, startChar, endChar) {
    // Check what comes before and after the match
    const before = startChar > 0 ? lineText[startChar - 1] : '';
    const after = endChar < lineText.length ? lineText[endChar] : '';
    const beforeContext = lineText.substring(Math.max(0, startChar - 30), startChar);
    
    console.log(`Context: before="${beforeContext.slice(-15)}", after="${after}"`);
    
    // Check for scope directive context
    const inScopeDirective = /:-\s*(public|private|protected|meta_predicate|mode|info|dynamic|discontiguous|multifile)\s*\(\s*[^)]*$/.test(beforeContext);
    
    // Standard validation
    const validBefore = /^[\s,\(\[\{:-]$/.test(before) || startChar === 0 ||
                       lineText.substring(0, startChar).trim() === '' ||
                       inScopeDirective;
    
    const validAfter = /^[\s,\)\]\}\.:/]$/.test(after) || after === '' ||
                      !!lineText.substring(endChar).match(/^\s*[\(\/:]/);
    
    console.log(`Validation: before=${validBefore}, after=${validAfter}, inScopeDirective=${inScopeDirective}`);
    
    return validBefore && validAfter;
}

// Escape regex special characters
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Simulate findPredicatePositionInDeclaration
function findPredicatePositionInDeclaration(lineText, declarationLine, predicateName) {
    console.log("\n--- findPredicatePositionInDeclaration ---");
    
    const ranges = findPredicateRangesInLine(lineText, predicateName, declarationLine);
    
    if (ranges.length > 0) {
        const position = ranges[0].start;
        console.log(`Returning position: ${position.line}:${position.character}`);
        return position;
    }
    
    // Fallback: return start of line if not found
    const fallbackPosition = { line: declarationLine, character: 0 };
    console.log(`Fallback position: ${fallbackPosition.line}:${fallbackPosition.character}`);
    return fallbackPosition;
}

// Run the test
const result = findPredicatePositionInDeclaration(lineText, declarationLine, predicateName);
console.log(`\nFinal result: ${result.line}:${result.character}`);
console.log(`Expected from debug logs: 32:11`);
console.log(`Match: ${result.line === 32 && result.character === 11 ? '✅' : '❌'}`);
