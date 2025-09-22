// Test script to check the specific regex issue
const testCases = [
    {
        name: "mode directive - no space after (",
        beforeContext: "\t:- mode(",
        expectedMatch: true
    },
    {
        name: "mode directive - space after (",
        beforeContext: "\t:- mode( ",
        expectedMatch: true
    },
    {
        name: "info directive - no space after (",
        beforeContext: "\t:- info(",
        expectedMatch: true
    },
    {
        name: "info directive - space after (",
        beforeContext: "\t:- info( ",
        expectedMatch: true
    }
];

console.log("Testing the current (potentially buggy) pattern:");
const currentPattern = /:-\s*(mode|info)\s*\(\s*$/;
console.log(`Pattern: ${currentPattern}`);

testCases.forEach(testCase => {
    const match = currentPattern.test(testCase.beforeContext);
    const status = match === testCase.expectedMatch ? "✅" : "❌";
    console.log(`${status} ${testCase.name}: "${testCase.beforeContext}" -> ${match} (expected: ${testCase.expectedMatch})`);
});

console.log("\nTesting the fixed pattern (without $ anchor):");
const fixedPattern = /:-\s*(mode|info)\s*\(/;
console.log(`Pattern: ${fixedPattern}`);

testCases.forEach(testCase => {
    const match = fixedPattern.test(testCase.beforeContext);
    const status = match === testCase.expectedMatch ? "✅" : "❌";
    console.log(`${status} ${testCase.name}: "${testCase.beforeContext}" -> ${match} (expected: ${testCase.expectedMatch})`);
});

console.log("\nTesting the main isValidPredicateContext pattern:");
const mainPattern = /:-\s*(public|private|protected|meta_predicate|mode|info|dynamic|discontiguous|multifile)\s*\(\s*[^)]*$/;
console.log(`Pattern: ${mainPattern}`);

const actualCases = [
    "\t:- mode(",
    "\t:- info(",
    "\t:- public("
];

actualCases.forEach(beforeContext => {
    const currentMatch = currentPattern.test(beforeContext);
    const fixedMatch = fixedPattern.test(beforeContext);
    const mainMatch = mainPattern.test(beforeContext);
    console.log(`"${beforeContext}": current=${currentMatch}, fixed=${fixedMatch}, main=${mainMatch}`);
});

console.log("\nTesting main pattern with different scenarios:");
const mainTestCases = [
    {
        name: "mode directive - ends with (",
        beforeContext: "\t:- mode(",
        expectedMatch: true
    },
    {
        name: "mode directive - with content after (",
        beforeContext: "\t:- mode(next_state",
        expectedMatch: false  // This should NOT match because it doesn't end with (
    },
    {
        name: "info directive - ends with (",
        beforeContext: "\t:- info(",
        expectedMatch: true
    },
    {
        name: "public directive - ends with (",
        beforeContext: "\t:- public(",
        expectedMatch: true
    }
];

mainTestCases.forEach(testCase => {
    const match = mainPattern.test(testCase.beforeContext);
    const status = match === testCase.expectedMatch ? "✅" : "❌";
    console.log(`${status} ${testCase.name}: "${testCase.beforeContext}" -> ${match} (expected: ${testCase.expectedMatch})`);
});
