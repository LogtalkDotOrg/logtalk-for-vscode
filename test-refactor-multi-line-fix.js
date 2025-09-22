/**
 * Test script to verify the multi-line scope directive fix for refactoring
 * This script tests the findMultiLineScopeDirectiveStart function
 * and updateMultiLineScopeDirective function
 */

const vscode = require('vscode');
const { LogtalkRefactorProvider } = require('./out/src/features/refactorProvider');

async function testRefactorMultiLineDirectiveFix() {
    console.log('Testing multi-line scope directive fix for refactoring...');
    
    // Create a test document with multi-line scope directive
    const testContent = `:- object(test_object).

    % Multi-line scope directive (this is where the bug was)
    :- public([
        gravitational_acceleration/1,
        orbital_period/1,
        distance_from_sun/1
    ]).

    % Mode directive for the predicate (should be updated to gravitational_acceleration/2)
    :- mode(gravitational_acceleration(+atom), one).

    % Info directive for the predicate (should be updated to gravitational_acceleration/2)
    :- info(gravitational_acceleration/1, [
        comment is 'Calculates gravitational acceleration for a planet',
        argnames is ['Planet']
    ]).

    % Predicate implementation (should get new argument added)
    gravitational_acceleration(earth) :- !,
        write('9.81 m/s²').

:- end_object.`;

    try {
        // Create a temporary document
        const doc = await vscode.workspace.openTextDocument({
            content: testContent,
            language: 'logtalk'
        });

        const refactorProvider = new LogtalkRefactorProvider();
        
        // Test finding the multi-line scope directive start
        // The predicate gravitational_acceleration/1 is on line 4 (0-based)
        const scopeStart = refactorProvider.findMultiLineScopeDirectiveStart(
            doc, 
            4, // Line where gravitational_acceleration/1 appears
            'gravitational_acceleration/1'
        );

        console.log(`Found multi-line scope directive start: line ${scopeStart !== null ? scopeStart + 1 : 'null'} (1-based)`);
        
        if (scopeStart === 3) { // Line 4 in 1-based indexing is line 3 in 0-based
            console.log('✅ SUCCESS: Multi-line scope directive detection is working!');
            console.log(`   Scope directive starts at correct line ${scopeStart + 1} (1-based)`);
            
            // Test updating the multi-line scope directive
            const edits = refactorProvider.updateMultiLineScopeDirective(
                doc,
                scopeStart,
                'gravitational_acceleration/1',
                'gravitational_acceleration/2'
            );
            
            console.log(`Generated ${edits.length} edits for scope directive update`);
            
            if (edits.length > 0) {
                console.log('✅ SUCCESS: Multi-line scope directive update is working!');
                for (let i = 0; i < edits.length; i++) {
                    const edit = edits[i];
                    console.log(`   Edit ${i + 1}: Line ${edit.range.start.line + 1} -> "${edit.newText.trim()}"`);
                }
            } else {
                console.log('❌ FAILURE: No edits generated for scope directive update');
            }
        } else {
            console.log(`❌ FAILURE: Expected scope directive start at line 4, got ${scopeStart !== null ? scopeStart + 1 : 'null'}`);
        }

    } catch (error) {
        console.error('❌ ERROR:', error);
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    testRefactorMultiLineDirectiveFix().catch(console.error);
}

module.exports = { testRefactorMultiLineDirectiveFix };
