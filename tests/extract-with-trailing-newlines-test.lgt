:- object(extract_with_trailing_newlines_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for trailing newline preservation in "Replace with include/1 directive"'
	]).

	% ========================================================================
	% SECTION 1: Code Extraction with Trailing Newlines
	% These test cases verify that trailing empty lines are preserved
	% ========================================================================

	% Test 1a: Select lines 15-17 (code with one trailing newline)
	% Expected: :- include('test1').\n
	helper_pred_1(X) :-
		X > 0,
		write(X).

	% This predicate should remain separated by the preserved newline
	following_predicate_1 :-
		write('Should be separated from include directive').

	% Test 1b: Select lines 24-27 (code with multiple trailing newlines)
	% Expected: :- include('test2').\n\n
	helper_pred_2(Y) :-
		Y < 100,
		write(Y).


	% This predicate should remain separated by preserved empty lines
	following_predicate_2 :-
		write('Should have proper spacing above').

	% Test 1c: Select lines 34-38 (code with mixed trailing whitespace)
	% Expected: :- include('test3').\n  \n\t\n
	helper_pred_3(Z) :-
		Z =:= 0,
		write('Zero value').
	  
		
	% This predicate tests mixed whitespace preservation
	following_predicate_3 :-
		write('Mixed whitespace should be preserved above').

	% ========================================================================
	% SECTION 2: Indented Code Extraction
	% ========================================================================

	% Test 2a: Select lines 48-51 (indented code with trailing newlines)
	% Expected: "    :- include('test4').\n\n"
	container_predicate :-
		nested_helper(A) :-
			A > 10,
			write(A).


		% This should maintain indentation and spacing
		other_nested :-
			write('Properly spaced and indented').

	% Test 2b: Select lines 58-62 (deeply indented with trailing newlines)
	% Expected: "        :- include('test5').\n\n\n"
	deeply_nested_container :-
		some_condition ->
			(	deep_helper(B) :-
					B < 5,
					write(B)
			).



			% This should preserve deep indentation and multiple newlines
			deep_continuation :-
				write('Deep nesting preserved').

	% ========================================================================
	% SECTION 3: Edge Cases
	% ========================================================================

	% Test 3a: Select lines 74-76 (single line with trailing newlines)
	% Expected: :- include('test6').\n\n
	single_line_pred :- write('Single line with trailing newlines').


	% Following code should be properly separated
	edge_case_1 :-
		write('Edge case spacing').

	% Test 3b: Select lines 82-86 (multiple predicates with trailing newlines)
	% Expected: :- include('test7').\n\n\n
	multi_pred_1 :- write('First predicate').
	multi_pred_2 :- write('Second predicate').
	multi_pred_3 :- write('Third predicate').



	% This should have significant spacing above
	edge_case_2 :-
		write('Multiple newlines preserved').

	% Test 3c: Select lines 93-96 (comments and code with trailing newlines)
	% Expected: :- include('test8').\n\n
	% This is a commented predicate
	commented_pred(X) :-
		% Internal comment
		X > 0.


	% Following predicate should be properly separated
	edge_case_3 :-
		write('Comments and code extraction').

	% ========================================================================
	% SECTION 4: No Trailing Newlines
	% ========================================================================

	% Test 4a: Select lines 106-108 (code with no trailing newlines)
	% Expected: :- include('test9'). (no trailing newlines)
	no_trailing_pred(X) :-
		X =< 0,
		write('No trailing newlines').
	immediate_following :-
		write('Should be immediately after include directive').

	% ========================================================================
	% SECTION 5: Complex Scenarios
	% ========================================================================

	% Test 5a: Select lines 116-122 (complex code block with trailing newlines)
	% Expected: :- include('test10').\n\n\n
	complex_predicate(Input, Output) :-
		(	Input > 0 ->
			Output = positive
		;	Input < 0 ->
			Output = negative
		;	Output = zero
		).



	% This should be well-separated from the complex extraction
	final_predicate :-
		write('Complex extraction completed').

	% Main test predicate
	test_extract_with_trailing_newlines :-
		write('Testing trailing newline preservation in extraction:'), nl,
		write('- Select code blocks that end with empty lines'), nl,
		write('- Use "Replace with include/1 directive"'), nl,
		write('- Verify that empty lines are preserved after include directive'), nl,
		write('- Check that following code maintains proper separation'), nl.

:- end_object.

% ========================================================================
% TESTING INSTRUCTIONS
% ========================================================================
%
% HOW TO TEST:
% 1. Select any code block from the sections above that includes trailing newlines
% 2. Use "Replace with include/1 directive" refactoring
% 3. Enter a filename when prompted
% 4. Verify that the include directive preserves trailing newlines
%
% EXPECTED BEHAVIOR:
%
% BEFORE (selection includes trailing newlines):
% helper_pred(X) :-
%     X > 0,
%     write(X).
% 
% 
% following_predicate :- true.
%
% AFTER (include directive + preserved trailing newlines):
% :- include('helper').
% 
% 
% following_predicate :- true.
%
% KEY POINTS:
% ✅ Trailing newlines in selection are preserved after include directive
% ✅ Spacing between include directive and following code is maintained
% ✅ Indentation of include directive matches first line of selection
% ✅ Mixed whitespace patterns (spaces, tabs) are preserved exactly
% ✅ No trailing newlines in selection = no trailing newlines after include
%
% BENEFITS:
% - Maintains document formatting and readability
% - Prevents code from becoming improperly adjacent
% - Preserves intentional spacing between code sections
% - Consistent with user expectations for refactoring behavior
