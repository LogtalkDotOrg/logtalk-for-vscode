// Test script to simulate findConsecutivePredicateClauses logic
const fs = require('fs');

// Read the test file
const fileContent = fs.readFileSync('test-clause-comments.lgt', 'utf8');
const lines = fileContent.split('\n');

const predicateName = 'next_state';
const startLine = 6; // Line with first next_state clause (0-based)

console.log(`Testing consecutive clause finding for "${predicateName}"`);
console.log(`Starting from line ${startLine + 1} (1-based)`);
console.log(`Total lines in file: ${lines.length}`);

// Helper functions (simplified versions of the actual code)
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isEntityBoundary(trimmedLine) {
    return trimmedLine.startsWith(':- object(') ||
           trimmedLine.startsWith(':- protocol(') ||
           trimmedLine.startsWith(':- category(') ||
           trimmedLine.startsWith(':- end_object') ||
           trimmedLine.startsWith(':- end_protocol') ||
           trimmedLine.startsWith(':- end_category');
}

function isDifferentPredicateClause(lineText, predicateName) {
    const trimmedLine = lineText.trim();

    // Skip comments, empty lines, and directives
    if (trimmedLine.startsWith('%') || trimmedLine === '' || trimmedLine.startsWith(':-')) {
        return false;
    }

    // Skip block comments (/* and */)
    if (trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.startsWith('*/')) {
        return false;
    }

    // Skip lines that are clearly clause body content
    if (trimmedLine.startsWith(',') || trimmedLine.startsWith(';')) {
        return false;
    }

    // Skip lines with significant indentation (likely clause body content)
    if (/^\s{8,}/.test(lineText)) {
        return false;
    }

    // Check if this starts a predicate clause
    const clausePattern = /^\s{0,4}([a-z][a-zA-Z0-9_]*|'[^']*')\s*[\(:-]/;
    const match = lineText.match(clausePattern);

    if (match) {
        const foundPredicateName = match[1];
        return foundPredicateName !== predicateName;
    }

    return false;
}

function isPredicateClause(lineText, predicateName) {
    const clausePattern = new RegExp(`^\\s*${escapeRegex(predicateName)}\\s*[\\(:-]`);
    return clausePattern.test(lineText);
}

// Simulate the consecutive clause finding logic (no backward search needed)
console.log(`\n=== Starting from first clause at line ${startLine + 1} (provided by Logtalk) ===`);

// Simulate searching forwards directly from the given start line
console.log(`\n=== Searching forwards from line ${startLine + 1} ===`);
const foundClauses = [];

for (let lineNum = startLine; lineNum < lines.length; lineNum++) {
    const lineText = lines[lineNum];
    const trimmedLine = lineText.trim();

    console.log(`Line ${lineNum + 1}: "${trimmedLine}"`);

    if (isEntityBoundary(trimmedLine)) {
        console.log(`  → Entity boundary, stopping`);
        break;
    }

    if (trimmedLine.startsWith('%') || trimmedLine === '') {
        console.log(`  → Comment/empty line, skipping`);
        continue;
    }

    if (isDifferentPredicateClause(lineText, predicateName)) {
        console.log(`  → Different predicate clause, stopping`);
        break;
    }

    if (isPredicateClause(lineText, predicateName)) {
        console.log(`  → ✅ Found clause for ${predicateName}`);
        foundClauses.push({
            lineNumber: lineNum + 1,
            text: trimmedLine
        });
    } else {
        console.log(`  → Not a clause for ${predicateName}`);
    }
}

console.log(`\n=== Results ===`);
console.log(`Found ${foundClauses.length} clauses for ${predicateName}:`);
foundClauses.forEach((clause, index) => {
    console.log(`${index + 1}. Line ${clause.lineNumber}: ${clause.text}`);
});

// Check if we missed any clauses by manually scanning the file
console.log(`\n=== Manual verification ===`);
const manualClauses = [];
for (let i = 0; i < lines.length; i++) {
    if (isPredicateClause(lines[i], predicateName)) {
        manualClauses.push({
            lineNumber: i + 1,
            text: lines[i].trim()
        });
    }
}

console.log(`Manual scan found ${manualClauses.length} clauses:`);
manualClauses.forEach((clause, index) => {
    console.log(`${index + 1}. Line ${clause.lineNumber}: ${clause.text}`);
});

if (foundClauses.length !== manualClauses.length) {
    console.log(`\n🚨 MISMATCH: Consecutive search found ${foundClauses.length} clauses, but manual scan found ${manualClauses.length}`);
    
    const missedClauses = manualClauses.filter(manual => 
        !foundClauses.some(found => found.lineNumber === manual.lineNumber)
    );
    
    if (missedClauses.length > 0) {
        console.log(`Missed clauses:`);
        missedClauses.forEach(clause => {
            console.log(`  Line ${clause.lineNumber}: ${clause.text}`);
        });
    }
} else {
    console.log(`\n✅ All clauses found correctly`);
}
