// Test script to demonstrate the mode/info directive bug
const testCases = [
    {
        name: "mode directive",
        lineText: "\t:- mode(next_state(+nonvar, -nonvar), zero_or_more).",
        predicateName: "next_state"
    },
    {
        name: "info directive",
        lineText: "\t:- info(next_state/2, [comment is 'Description']).",
        predicateName: "next_state"
    },
    {
        name: "info directive with multiple occurrences",
        lineText: "\t:- info(next_state/2, [comment is 'next_state is important']).",
        predicateName: "next_state"
    },
    {
        name: "public directive (should work)",
        lineText: "\t:- public(next_state/2).",
        predicateName: "next_state"
    }
];

function testModeInfoPattern(lineText, predicateName) {
    console.log(`\n=== Testing: ${lineText} ===`);

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

    console.log(`Found ${occurrences.length} occurrence(s) of "${predicateName}"`);

    // Test each occurrence
    occurrences.forEach((occurrence, index) => {
        console.log(`\n--- Occurrence ${index + 1} ---`);
        const { startChar, endChar } = occurrence;
        const beforeContext = lineText.substring(Math.max(0, startChar - 30), startChar);
        const after = endChar < lineText.length ? lineText[endChar] : '';

        console.log(`Position: ${startChar}-${endChar}`);
        console.log(`Before context: "${beforeContext}"`);
        console.log(`After: "${after}"`);

        // Test the main isValidPredicateContext pattern
        const mainPattern = /:-\s*(public|private|protected|meta_predicate|mode|info|dynamic|discontiguous|multifile)\s*\(\s*[^)]*$/;
        const mainMatch = mainPattern.test(beforeContext);
        console.log(`Main pattern match: ${mainMatch}`);

        // Test the mode/info specific pattern
        const modeInfoPattern = /:-\s*(mode|info)\s*\(\s*$/;
        const modeInfoMatch = modeInfoPattern.test(beforeContext);
        console.log(`Mode/info pattern match: ${modeInfoMatch}`);

        // Check validation conditions
        const validAfter = after === '(' || after === '/';
        const isValid = (mainMatch || modeInfoMatch) && validAfter;
        console.log(`Valid after: ${validAfter}`);
        console.log(`Overall valid: ${isValid}`);

        if (index === 0) {
            // Check what's at the opening parenthesis position
            const openParenPos = lineText.indexOf('(');
            console.log(`Opening parenthesis at position: ${openParenPos}`);
            console.log(`Predicate starts at position: ${startChar}`);
            console.log(`Difference: ${startChar - openParenPos} (should be 1 for correct positioning)`);
        }
    });
}

// Run tests
testCases.forEach(testCase => {
    testModeInfoPattern(testCase.lineText, testCase.predicateName);
});
