/**
 * Test script to verify the multi-line scope directive fix
 * This script tests the findPredicatePositionInDeclaration function
 * with multi-line scope directives
 */

const vscode = require('vscode');
const { LogtalkRenameProvider } = require('./out/src/features/renameProvider');

async function testMultiLineDirectiveFix() {
    console.log('Testing multi-line scope directive fix...');
    
    // Create a test document with multi-line scope directive
    const testContent = `:- object(test_object).

    % Multi-line scope directive (this is where the bug was)
    :- public([
        gravitational_acceleration/1,
        orbital_period/1,
        distance_from_sun/1
    ]).

    % Predicate implementation
    gravitational_acceleration(earth) :- !,
        write('9.81 m/s²').

:- end_object.`;

    try {
        // Create a temporary document
        const doc = await vscode.workspace.openTextDocument({
            content: testContent,
            language: 'logtalk'
        });

        const renameProvider = new LogtalkRenameProvider();
        
        // Test finding the position of gravitational_acceleration/1 in the multi-line directive
        // The directive starts at line 3 (0-based), but the predicate is on line 4
        const position = renameProvider.findPredicatePositionInDeclaration(
            doc, 
            3, // Line where :- public([ starts
            'gravitational_acceleration/1'
        );

        console.log(`Found predicate position: line ${position.line}, character ${position.character}`);
        
        // The predicate should be found on line 4 (0-based), not line 3
        if (position.line === 4) {
            console.log('✅ SUCCESS: Multi-line directive fix is working!');
            console.log(`   Predicate found at correct line ${position.line + 1} (1-based)`);
            
            // Verify the character position is correct
            const lineText = doc.lineAt(position.line).text;
            const predicateName = lineText.substring(position.character, position.character + 'gravitational_acceleration'.length);
            
            if (predicateName === 'gravitational_acceleration') {
                console.log(`✅ Character position is correct: "${predicateName}"`);
            } else {
                console.log(`❌ Character position is wrong: expected "gravitational_acceleration", got "${predicateName}"`);
            }
        } else if (position.line === 3) {
            console.log('❌ FAILURE: Still using old single-line logic');
            console.log(`   Predicate incorrectly found at line ${position.line + 1} (should be line 5)`);
        } else {
            console.log(`❌ UNEXPECTED: Predicate found at line ${position.line + 1}, expected line 5`);
        }

    } catch (error) {
        console.error('Error during test:', error);
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    testMultiLineDirectiveFix().catch(console.error);
}

module.exports = { testMultiLineDirectiveFix };
