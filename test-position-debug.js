// Test script to debug character position calculation
const lineTextSpaces = "    :- public(next_state/3).";
const lineTextTab = "\t:- public(next_state/3).";
const lineTextDebugFile = "    :- public(next_state/3)."; // From debug-position-test.lgt
const predicateName = "next_state";

console.log("=== Testing with spaces ===");
testLine(lineTextSpaces);

console.log("\n=== Testing with tab ===");
testLine(lineTextTab);

console.log("\n=== Testing debug file format ===");
testLine(lineTextDebugFile);

function testLine(lineText) {

    console.log("Line text:", JSON.stringify(lineText));
    console.log("Line length:", lineText.length);

    // Test the regex pattern
    const pattern = new RegExp(`\\b${predicateName}\\b`, 'g');
    let match;
    while ((match = pattern.exec(lineText)) !== null) {
        const startChar = match.index;
        const endChar = startChar + match[0].length;
        console.log(`Found "${match[0]}" at position ${startChar}-${endChar}`);

        // Test context validation like the actual code does
        const before = startChar > 0 ? lineText[startChar - 1] : '';
        const after = endChar < lineText.length ? lineText[endChar] : '';
        const beforeContext = lineText.substring(Math.max(0, startChar - 30), startChar);
        const afterContext = lineText.substring(endChar, Math.min(lineText.length, endChar + 10));

        console.log(`Context: before="${beforeContext.slice(-15)}", after="${afterContext.slice(0, 5)}"`);
        console.log(`Immediate: before="${before}", after="${after}"`);

        // Test the scope directive regex
        const inScopeDirective = /:-\s*(public|private|protected|meta_predicate|mode|info|dynamic|discontiguous|multifile)\s*\(\s*[^)]*$/.test(beforeContext);
        console.log(`inScopeDirective: ${inScopeDirective}`);

        // Show character by character breakdown around the match
        const start = Math.max(0, startChar - 5);
        const end = Math.min(lineText.length, endChar + 5);
        console.log("Character breakdown around match:");
        for (let i = start; i < end; i++) {
            const char = lineText[i];
            const display = char === ' ' ? '·' : char === '\t' ? '→' : char;
            const marker = (i >= startChar && i < endChar) ? ' <<<' : '';
            console.log(`Position ${i}: "${display}" (${char.charCodeAt(0)})${marker}`);
        }
        break;
    }
}
