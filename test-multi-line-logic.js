/**
 * Simple test to verify the multi-line scope directive logic
 * This tests the core logic without VS Code dependencies
 */

// Mock TextDocument for testing
class MockTextDocument {
    constructor(lines) {
        this.lines = lines;
        this.lineCount = lines.length;
    }
    
    lineAt(lineNumber) {
        return {
            text: this.lines[lineNumber] || ''
        };
    }
}

// Mock logger
const mockLogger = {
    debug: (msg) => console.log(`DEBUG: ${msg}`),
    info: (msg) => console.log(`INFO: ${msg}`),
    error: (msg) => console.log(`ERROR: ${msg}`)
};

// Simplified version of the helper functions for testing
function findMultiLineScopeDirectiveStart(doc, lineNum, currentIndicator) {
    console.log(`Checking if line ${lineNum + 1} is part of a multi-line scope directive for ${currentIndicator}`);

    // Check if the current line contains the scope directive keyword
    const currentLineText = doc.lineAt(lineNum).text;
    if (currentLineText.includes('public(') || currentLineText.includes('protected(') || currentLineText.includes('private(')) {
        // Check if this is a single-line directive (contains both keyword and closing parenthesis)
        if (currentLineText.includes(').')) {
            // This is a single-line directive, not multi-line
            console.log(`Line ${lineNum + 1} is a single-line directive, not multi-line`);
            return null;
        }
        // This line contains scope directive keyword but no closing - could be multi-line
        // Check if our predicate is in this multi-line directive by searching for it
        if (containsPredicateInMultiLineDirective(doc, lineNum, currentIndicator)) {
            return lineNum;
        }
        return null;
    }
    
    // Search backwards for a scope directive that might contain this predicate
    const maxLinesToSearch = 10; // Reasonable limit for multi-line directives
    for (let searchLine = lineNum - 1; searchLine >= Math.max(0, lineNum - maxLinesToSearch); searchLine--) {
        const searchLineText = doc.lineAt(searchLine).text.trim();
        
        // Check if this line starts a scope directive
        if (searchLineText.startsWith(':- public([') || 
            searchLineText.startsWith(':- protected([') || 
            searchLineText.startsWith(':- private([')) {
            
            // Found a potential multi-line scope directive start
            // Now check if our predicate indicator is within this directive
            if (isPredicateInMultiLineScopeDirective(doc, searchLine, lineNum, currentIndicator)) {
                console.log(`Found multi-line scope directive starting at line ${searchLine + 1} containing ${currentIndicator}`);
                return searchLine;
            }
        }
        
        // If we hit another directive or non-directive code, stop searching
        if (searchLineText.startsWith(':-') && 
            !(searchLineText.includes('public(') || searchLineText.includes('protected(') || searchLineText.includes('private('))) {
            break;
        }
    }
    
    return null;
}

function containsPredicateInMultiLineDirective(doc, directiveStartLine, currentIndicator) {
    // Search from directive start until we find the closing bracket
    for (let lineNum = directiveStartLine; lineNum < doc.lineCount; lineNum++) {
        const lineText = doc.lineAt(lineNum).text;

        // Check if we've reached the end of the directive
        if (lineText.includes(').') || lineText.includes('].)')) {
            // We've reached the end without finding the predicate
            return false;
        }

        // Check if this line contains our predicate indicator
        if (lineText.includes(currentIndicator)) {
            return true;
        }
    }

    // If we reach the end of the document without finding a closing bracket,
    // this is likely a malformed directive, so return false
    return false;
}

function isPredicateInMultiLineScopeDirective(doc, directiveStartLine, predicateLine, currentIndicator) {
    // Search from directive start until we find the closing bracket
    let foundPredicate = false;

    for (let lineNum = directiveStartLine; lineNum < doc.lineCount; lineNum++) {
        const lineText = doc.lineAt(lineNum).text;

        // If this is the predicate line, check if it contains our indicator
        if (lineNum === predicateLine && lineText.includes(currentIndicator)) {
            foundPredicate = true;
        }

        // Check if we've reached the end of the directive
        if (lineText.includes(').') || lineText.includes('].)')) {
            // Return true if we found the predicate before reaching the end
            return foundPredicate;
        }
    }

    // If we reach the end of the document without finding a closing bracket,
    // this is likely a malformed directive, so return false
    return false;
}

// Test function
function testMultiLineScopeDirectiveLogic() {
    console.log('=== Testing Multi-Line Scope Directive Logic ===\n');
    
    // Test case 1: Multi-line scope directive
    const testLines1 = [
        ':- object(test_object).',
        '',
        '    % Multi-line scope directive',
        '    :- public([',
        '        gravitational_acceleration/1,',
        '        orbital_period/1,',
        '        distance_from_sun/1',
        '    ]).',
        '',
        '    gravitational_acceleration(earth) :- !,'
    ];
    
    const doc1 = new MockTextDocument(testLines1);
    
    console.log('Test 1: Multi-line scope directive');
    console.log('Lines:');
    testLines1.forEach((line, i) => console.log(`  ${i + 1}: ${line}`));
    console.log();
    
    // Test finding scope directive start for line 4 (gravitational_acceleration/1)
    const result1 = findMultiLineScopeDirectiveStart(doc1, 4, 'gravitational_acceleration/1');
    console.log(`Result: ${result1 !== null ? `Line ${result1 + 1}` : 'null'}`);
    console.log(`Expected: Line 4 (where :- public([ starts)`);
    console.log(`✅ ${result1 === 3 ? 'PASS' : 'FAIL'}\n`);
    
    // Test case 2: Single-line scope directive
    const testLines2 = [
        ':- object(test_object).',
        '',
        '    :- public(simple_predicate/1).',
        '',
        '    simple_predicate(X) :- write(X).'
    ];

    const doc2 = new MockTextDocument(testLines2);

    console.log('Test 2: Single-line scope directive');
    console.log('Lines:');
    testLines2.forEach((line, i) => console.log(`  ${i + 1}: ${line}`));
    console.log();

    // Test finding scope directive start for line 2 (simple_predicate/1)
    const result2 = findMultiLineScopeDirectiveStart(doc2, 2, 'simple_predicate/1');
    console.log(`Result: ${result2 !== null ? `Line ${result2 + 1}` : 'null'}`);
    console.log(`Expected: null (single-line directive should return null)`);
    console.log(`✅ ${result2 === null ? 'PASS' : 'FAIL'}\n`);
    
    // Test case 3: Not in scope directive
    const testLines3 = [
        ':- object(test_object).',
        '',
        '    some_predicate(X) :- write(X).'
    ];
    
    const doc3 = new MockTextDocument(testLines3);
    
    console.log('Test 3: Not in scope directive');
    console.log('Lines:');
    testLines3.forEach((line, i) => console.log(`  ${i + 1}: ${line}`));
    console.log();
    
    // Test finding scope directive start for line 2 (some_predicate/1)
    const result3 = findMultiLineScopeDirectiveStart(doc3, 2, 'some_predicate/1');
    console.log(`Result: ${result3 !== null ? `Line ${result3 + 1}` : 'null'}`);
    console.log(`Expected: null (not in scope directive)`);
    console.log(`✅ ${result3 === null ? 'PASS' : 'FAIL'}\n`);
    
    console.log('=== Test Summary ===');
    const allPassed = result1 === 3 && result2 === null && result3 === null;
    console.log(`Overall result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
}

// Run the test
testMultiLineScopeDirectiveLogic();
