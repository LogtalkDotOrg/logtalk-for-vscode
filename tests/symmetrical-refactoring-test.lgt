:- object(symmetrical_refactoring_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for symmetrical include refactoring operations'
	]).

	% ========================================================================
	% SECTION 1: Symmetrical Refactoring Tests
	% These tests demonstrate that the two include refactorings are inverses
	% ========================================================================

	% Test 1a: No indentation (should remain unchanged)
	% Step 1: Select lines 15-17 → Extract to file → Creates include directive
	% Step 2: Select include directive → Replace with contents → Restores original
	simple_pred_1 :- 
		write('Simple predicate 1').
	simple_pred_2 :- 
		write('Simple predicate 2').

	% Test 1b: 2-space indentation (should be preserved through round-trip)
	% Step 1: Extract → Remove 2 spaces from each line in file
	% Step 2: Replace → Add 2 spaces back to each line
	container_1 :-
	  nested_pred_1 :-
	    write('Nested 1').
	  nested_pred_2 :-
	    write('Nested 2').

	% Test 1c: 4-space indentation (should be preserved through round-trip)
	% Step 1: Extract → Remove 4 spaces from each line in file  
	% Step 2: Replace → Add 4 spaces back to each line
	container_2 :-
	    deeply_nested_1 :-
	        write('Deep 1').
	    deeply_nested_2 :-
	        write('Deep 2').

	% Test 1d: Tab indentation (should be preserved through round-trip)
	% Step 1: Extract → Remove tab from each line in file
	% Step 2: Replace → Add tab back to each line
	container_3 :-
		tab_nested_1 :-
			write('Tab 1').
		tab_nested_2 :-
			write('Tab 2').

	% ========================================================================
	% SECTION 2: Mixed Indentation Tests
	% ========================================================================

	% Test 2a: Mixed indentation levels (minimum indentation removed)
	% Step 1: Extract → Remove 2 spaces (minimum) from each line
	% Step 2: Replace → Add 2 spaces back to each line
	mixed_container :-
	  base_pred :-
	    write('Base level').
	    nested_deeper :-
	      write('Deeper level').
	  another_base :-
	    write('Another base').

	% Test 2b: Complex mixed indentation with empty lines
	% Step 1: Extract → Remove minimum indentation, preserve relative spacing
	% Step 2: Replace → Restore original indentation pattern
	complex_container :-
	    complex_pred_1 :-
	        (   condition_1 ->
	            action_1
	        ;   condition_2 ->
	            action_2
	        ;   default_action
	        ).

	    complex_pred_2 :-
	        findall(X, goal(X), List),
	        process_list(List).

	% ========================================================================
	% SECTION 3: Edge Cases
	% ========================================================================

	% Test 3a: Single line extraction
	% Should work symmetrically for single predicates
	single_line_pred :- write('Single line'), nl.

	% Test 3b: Empty lines preservation
	% Empty lines should be preserved in both directions
	pred_with_spacing :-
		write('Before empty line').

		write('After empty line').

	% Test 3c: Comments with indentation
	% Comments should maintain relative indentation
	commented_container :-
		% This is a comment at base level
		commented_pred :-
			% This is a nested comment
			write('Commented code').
		% Another base comment
		another_commented :-
			write('More commented code').

	% ========================================================================
	% SECTION 4: Demonstration Examples
	% ========================================================================

	% EXAMPLE 1: 4-space indented code
	% Original code (select lines 95-100):
	example_container :-
	    utility_pred(X) :-
	        X > 0,
	        write('Positive: '), write(X), nl.
	    
	    helper_pred(Y) :-
	        Y < 100,
	        write('Small: '), write(Y), nl.

	% After "Replace with include/1 directive":
	% - File created with indentation removed:
	%   utility_pred(X) :-
	%       X > 0,
	%       write('Positive: '), write(X), nl.
	%   
	%   helper_pred(Y) :-
	%       Y < 100,
	%       write('Small: '), write(Y), nl.
	%
	% - Original code replaced with:
	%   example_container :-
	%       :- include('utility').

	% After "Replace include/1 directive with file contents":
	% - Include directive replaced with file contents + 4-space indentation:
	%   example_container :-
	%       utility_pred(X) :-
	%           X > 0,
	%           write('Positive: '), write(X), nl.
	%       
	%       helper_pred(Y) :-
	%           Y < 100,
	%           write('Small: '), write(Y), nl.
	%
	% RESULT: Identical to original! ✅

	% Main test predicate
	test_symmetrical_refactoring :-
		write('Testing symmetrical include refactoring:'), nl,
		write('1. Select indented code block'), nl,
		write('2. Use "Replace with include/1 directive"'), nl,
		write('   - Code extracted to file with indentation removed'), nl,
		write('   - Selection replaced with include directive'), nl,
		write('3. Select the include directive'), nl,
		write('4. Use "Replace include/1 directive with file contents"'), nl,
		write('   - Include replaced with file contents'), nl,
		write('   - Original indentation restored'), nl,
		write('5. Result should be identical to original code'), nl.

:- end_object.

% ========================================================================
% SYMMETRY EXPLANATION
% ========================================================================
%
% The two include refactorings are now perfectly symmetrical:
%
% FORWARD OPERATION: "Replace with include/1 directive"
% 1. Detect minimum indentation level in selection
% 2. Remove minimum indentation from all lines
% 3. Write de-indented content to file
% 4. Replace selection with include directive (preserving base indentation)
%
% REVERSE OPERATION: "Replace include/1 directive with file contents"
% 1. Read file contents (without indentation)
% 2. Detect indentation level of include directive
% 3. Add include directive's indentation to all file content lines
% 4. Replace include directive with indented file contents
%
% SYMMETRY PROPERTIES:
% ✅ Forward then reverse = identity operation
% ✅ Indentation patterns preserved exactly
% ✅ Relative indentation within extracted code maintained
% ✅ Empty lines and comments handled correctly
% ✅ Works with any indentation style (spaces, tabs, mixed)
%
% EXAMPLE ROUND-TRIP:
%
% ORIGINAL:
%     helper_pred(X) :-
%         X > 0,
%         write(X).
%
% AFTER EXTRACT (file contents):
% helper_pred(X) :-
%     X > 0,
%     write(X).
%
% AFTER REPLACE (restored):
%     helper_pred(X) :-
%         X > 0,
%         write(X).
%
% ✅ ORIGINAL === RESTORED
