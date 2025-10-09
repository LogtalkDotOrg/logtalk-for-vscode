// Test script to verify that alias/2 directive predicate indicators are renamed correctly
// This simulates the rename operation on a file with alias/2 directives

const fs = require('fs');
const path = require('path');

// Create a test file with alias/2 directives
const testContent = `% Test file for alias/2 directive predicate renaming
:- object(test_alias_rename).

    % Import predicates from other entities
    :- uses(list, [append/3, member/2]).
    
    % Create aliases for imported predicates
    :- alias(list, [member/2 as list_member/2]).
    :- alias(set, [member/2 as set_member/2]).
    :- alias(words, [singular//0 as peculiar//0]).
    
    % Public interface
    :- public([
        test_member/2,
        test_append/3
    ]).
    
    % Test predicate that uses the imported member/2
    test_member(Element, List) :-
        member(Element, List).
        
    % Test predicate that uses the imported append/3
    test_append(List1, List2, Result) :-
        append(List1, List2, Result).

:- end_object.`;

// Write test file
const testFilePath = path.join(__dirname, 'test-alias-rename-scenario.lgt');
fs.writeFileSync(testFilePath, testContent);

console.log('Test file created:', testFilePath);
console.log('Content:');
console.log(testContent);

console.log('\n=== EXPECTED BEHAVIOR ===');
console.log('When renaming predicate "member" to "element":');
console.log('1. Line 6: :- uses(list, [append/3, element/2]).');
console.log('2. Line 9: :- alias(list, [element/2 as list_member/2]).');
console.log('3. Line 10: :- alias(set, [element/2 as set_member/2]).');
console.log('5. Line 22: element(Element, List).');

console.log('\n=== BEFORE FIX ===');
console.log('The predicate indicators in alias/2 directives (lines 9-10) would NOT be renamed');
console.log('because "alias" was not included in the indicatorDirectives array.');

console.log('\n=== AFTER FIX ===');
console.log('All predicate indicators should be renamed correctly because:');
console.log('- "alias" is now included in indicatorDirectives array');
console.log('- "uses" is now included in indicatorDirectives array');

console.log('\n=== TO TEST MANUALLY ===');
console.log('1. Open the test file in VS Code');
console.log('2. Place cursor on "member" in any predicate indicator (e.g., line 6: member/2)');
console.log('3. Press F2 or right-click and select "Rename Symbol"');
console.log('4. Type "element" as the new name');
console.log('5. Verify that ALL occurrences of "member" are renamed, including:');
console.log('   - In uses/2 directive');
console.log('   - In alias/2 directives');
console.log('   - In predicate calls');
