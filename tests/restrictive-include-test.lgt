:- object(restrictive_include_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for restrictive include directive selection (only include + comments allowed)'
	]).

	% ========================================================================
	% SECTION 1: Valid Selections (Should Show Replace Action)
	% These selections contain ONLY include directive + optional comments/empty lines
	% ========================================================================

	% Test 1a: Select only line 15 (pure include directive)
	:- include('helper_predicates.lgt').

	% Test 1b: Select lines 17-19 (include with comments)
	% Comment before include
	:- include('helper_no_extension').
	% Comment after include

	% Test 1c: Select lines 21-25 (include with empty lines and comments)
	
	% Comment before
	:- include('prolog_helper').
	% Comment after
	

	% Test 1d: Select lines 27-29 (indented include with comments)
		% Indented comment
		:- include('priority_test').
		% Another indented comment

	% ========================================================================
	% SECTION 2: Invalid Selections (Should Show Extract Actions)
	% These selections contain include directive + other code (not allowed)
	% ========================================================================

	% Test 2a: Select lines 36-38 (include + predicate - INVALID)
	:- include('helper_predicates.lgt').
	some_predicate :- true.
	another_predicate :- false.

	% Test 2b: Select lines 40-42 (predicate + include - INVALID)
	utility_predicate(X) :- X > 0.
	:- include('helper_no_extension').
	final_predicate :- write('done').

	% Test 2c: Select lines 44-46 (multiple includes - INVALID)
	:- include('first_include.lgt').
	:- include('second_include.lgt').
	:- include('third_include.lgt').

	% Test 2d: Select lines 48-52 (include + directive + predicate - INVALID)
	:- include('helper_predicates.lgt').
	:- public(test_pred/1).
	test_pred(X) :-
		X > 0,
		write(X).

	% Test 2e: Select lines 54-58 (mixed content with include - INVALID)
	% Comment
	some_complex_predicate(X, Y) :-
		:- include('embedded_include.lgt'),  % Include inside predicate
		X > Y,
		write('result').

	% ========================================================================
	% SECTION 3: Edge Cases
	% ========================================================================

	% Test 3a: Select only line 64 (commented include - INVALID)
	% :- include('commented_include.lgt').

	% Test 3b: Select lines 66-68 (only comments - INVALID)
	% Just a comment
	% Another comment
	% Final comment

	% Test 3c: Select lines 70-72 (empty lines only - INVALID)
	

	

	% Test 3d: Select lines 74-78 (include with other directive - INVALID)
	:- include('helper_predicates.lgt').
	:- public(exported_pred/1).
	exported_pred(X) :-
		X > 0.

	% ========================================================================
	% SECTION 4: Boundary Cases
	% ========================================================================

	% Test 4a: Select lines 83-87 (include at start of mixed selection - INVALID)
	:- include('boundary_test.lgt').
	% This looks like it might be valid, but...
	boundary_predicate(X) :-  % This makes it invalid
		X > 0,
		write(X).

	% Test 4b: Select lines 89-93 (include at end of mixed selection - INVALID)
	start_predicate :- write('start').
	% Comment in middle
	middle_predicate :- write('middle').
	% Comment before include
	:- include('end_include.lgt').

	% Test 4c: Select lines 95-99 (include surrounded by whitespace and comments - VALID)
	
	% Lots of whitespace and comments
	
	:- include('surrounded_include.lgt').
	
	% More comments and whitespace

	% Main test predicate
	test_restrictive_behavior :-
		write('Testing restrictive include directive selection:'), nl,
		write('- Replace action: Only for pure include + comments'), nl,
		write('- Extract actions: For any mixed content'), nl,
		write('- No actions: For empty or comment-only selections'), nl.

:- end_object.

% ========================================================================
% TESTING INSTRUCTIONS
% ========================================================================
%
% NEW RESTRICTIVE BEHAVIOR:
% - Replace action: ONLY when selection contains exactly one include directive + optional comments/empty lines
% - Extract actions: When selection contains any other code (predicates, multiple includes, other directives)
% - No actions: When selection is empty or contains only comments
%
% VALID REPLACE ACTION SELECTIONS:
% - Line 15: Pure include directive
% - Lines 17-19: Include with comments before/after
% - Lines 21-25: Include with empty lines and comments
% - Lines 27-29: Indented include with comments
% - Lines 95-99: Include surrounded by whitespace and comments
%
% INVALID SELECTIONS (should show extract actions):
% - Lines 36-38: Include + predicate code
% - Lines 40-42: Predicate + include code
% - Lines 44-46: Multiple include directives
% - Lines 48-52: Include + other directive + predicate
% - Lines 54-58: Mixed content with embedded include
% - Lines 74-78: Include + other directive
% - Lines 83-87: Include at start of mixed content
% - Lines 89-93: Include at end of mixed content
%
% NO ACTIONS (comment-only or empty):
% - Line 64: Only commented include
% - Lines 66-68: Only comments
% - Lines 70-72: Only empty lines
