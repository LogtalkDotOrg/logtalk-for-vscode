:- object(trailing_newline_preservation_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for trailing newline preservation in include replacement'
	]).

	% ========================================================================
	% SECTION 1: Include Replacement with Trailing Newlines
	% These test cases demonstrate that trailing empty lines are preserved
	% ========================================================================

	% Test 1a: Select lines 15-17 (include + comment with trailing newline)
	% Expected: Trailing newline preserved after replacement
	% Comment before include
	:- include('helper_predicates.lgt').
	% Comment after include

	% This predicate should remain separated by the preserved newline
	predicate_after_include_1 :-
		write('This should be separated from replaced content').

	% Test 1b: Select lines 23-26 (include with multiple trailing newlines)
	% Expected: Both trailing newlines preserved
	% Multiple comments
	:- include('helper_no_extension').
	% End comment


	% This predicate should remain separated by preserved empty lines
	predicate_after_include_2 :-
		write('This should have proper spacing above').

	% Test 1c: Select lines 32-36 (include with mixed trailing whitespace)
	% Expected: All trailing whitespace patterns preserved
	% Mixed whitespace test
	:- include('prolog_helper').
	% Comment with spaces
	  
		
	% This predicate tests mixed whitespace preservation
	predicate_after_include_3 :-
		write('Spacing above should be preserved exactly').

	% ========================================================================
	% SECTION 2: Indented Include Replacements
	% ========================================================================

	% Test 2a: Select lines 46-49 (indented include with trailing newlines)
	% Expected: Indentation and trailing newlines both preserved
	container_predicate :-
		% Indented comment
		:- include('priority_test').
		% End of include

		% This should maintain proper indentation and spacing
		nested_predicate :-
			write('Proper spacing and indentation').

	% Test 2b: Select lines 56-60 (deeply indented with multiple newlines)
	% Expected: Deep indentation and multiple newlines preserved
	deeply_nested :-
		some_condition ->
			% Deep comment
			:- include('helper_predicates.lgt').
			% End deep comment


			% This should have preserved spacing
			deep_predicate :-
				write('Deep nesting with spacing').

	% ========================================================================
	% SECTION 3: Edge Cases
	% ========================================================================

	% Test 3a: Select lines 70-72 (include at end of selection with newlines)
	% Expected: Trailing newlines preserved even when include is last content
	% Start comment
	% Middle comment
	:- include('helper_no_extension').


	% This should be properly separated
	edge_case_predicate_1 :-
		write('Edge case spacing').

	% Test 3b: Select lines 80-84 (only include with surrounding newlines)
	% Expected: All surrounding newlines preserved

	:- include('prolog_helper').


	% This should maintain the exact spacing pattern
	edge_case_predicate_2 :-
		write('Exact spacing preservation').

	% Test 3c: Select lines 90-93 (include with tabs and spaces mix)
	% Expected: Exact whitespace pattern preserved
	% Tab and space mix
	:- include('priority_test').
		  	
	% Mixed tab/space preservation test
	edge_case_predicate_3 :-
		write('Mixed whitespace preserved').

	% ========================================================================
	% SECTION 4: Before/After Comparison Examples
	% ========================================================================

	% BEFORE REPLACEMENT (what user selects):
	% Lines 103-106:
	% % Helper utilities
	% :- include('utilities.lgt').
	% % End utilities
	% 
	%
	% AFTER REPLACEMENT (what should result):
	% utility_pred_1 :- true.
	% utility_pred_2 :- false.
	% 
	%
	% NOTE: The empty line and any trailing whitespace after the selection
	% should be preserved exactly as it was in the original selection.

	% Test 4: Select lines 103-106 to verify this behavior
	% Helper utilities
	:- include('utilities_example.lgt').
	% End utilities


	% This predicate should remain properly separated
	final_test_predicate :-
		write('Final spacing test'),
		write(' - should have proper separation above').

	% Main test predicate
	test_trailing_newline_preservation :-
		write('Testing trailing newline preservation:'), nl,
		write('- Select include blocks with trailing newlines'), nl,
		write('- Use "Replace include/1 directive with file contents"'), nl,
		write('- Verify that spacing after replacement is preserved'), nl,
		write('- Check that following code maintains proper separation'), nl.

:- end_object.

% ========================================================================
% EXPECTED BEHAVIOR
% ========================================================================
%
% PROBLEM SOLVED:
% Previously, when replacing an include directive selection that ended with
% empty lines, those empty lines were lost, causing the replaced content
% to be immediately adjacent to the following code.
%
% SOLUTION:
% The performIncludeReplacement function now:
% 1. Detects trailing newlines/whitespace in the original selection
% 2. Preserves this trailing whitespace pattern
% 3. Appends it to the replacement content
% 4. Maintains proper spacing between replaced content and following code
%
% EXAMPLES:
%
% BEFORE (selection with trailing newline):
% % Comment
% :- include('file.lgt').
% 
% next_predicate :- true.
%
% AFTER (trailing newline preserved):
% helper_pred :- write(hello).
% other_pred :- write(world).
% 
% next_predicate :- true.
%
% WITHOUT FIX (trailing newline lost):
% helper_pred :- write(hello).
% other_pred :- write(world).
% next_predicate :- true.  ← No separation!
%
% WITH FIX (trailing newline preserved):
% helper_pred :- write(hello).
% other_pred :- write(world).
% 
% next_predicate :- true.  ← Proper separation maintained!
