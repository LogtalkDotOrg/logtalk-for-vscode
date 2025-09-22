:- object(optimized_selection_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for optimized selection parsing (single parse per selection)'
	]).

	% ========================================================================
	% SECTION 1: Selections with Include Directives
	% These selections should show "Replace include/1 directive" action only
	% ========================================================================

	% Test 1a: Select lines 15-17 (should show replace action)
	some_predicate(X) :- X > 0.
	:- include('helper_predicates.lgt').
	another_predicate(Y) :- Y < 10.

	% Test 1b: Select lines 19-22 (should show replace action, skip comment)
	% Comment before include
	% :- include('commented_out.lgt').  % This is commented
	:- include('helper_no_extension').  % This should be found
	final_predicate :- true.

	% Test 1c: Select lines 24-27 (should show replace action for first include)
	first_predicate :- write('first').
	:- include('first_include.lgt').
	:- include('second_include.lgt').  % This won't be processed (first found wins)
	last_predicate :- write('last').

	% ========================================================================
	% SECTION 2: Selections without Include Directives  
	% These selections should show "Extract to entity" and "Extract to file" actions
	% ========================================================================

	% Test 2a: Select lines 33-36 (should show extract actions)
	utility_predicate(X, Y) :-
		X > 0,
		Y is X * 2,
		write(Y).

	% Test 2b: Select lines 38-42 (should show extract actions, all includes commented)
	% :- include('all_commented.lgt').  % Commented include
	helper_predicate(List, Length) :-
		% :- include('also_commented.lgt').  % Also commented
		length(List, Length),
		write(Length).

	% Test 2c: Select lines 44-48 (should show extract actions)
	math_predicate(N, Result) :-
		N > 0,
		factorial(N, Fact),
		Result is Fact * 2,
		write(Result).

	% ========================================================================
	% SECTION 3: Edge Cases
	% ========================================================================

	% Test 3a: Single line with include (cursor or single-line selection)
	:- include('single_line_test.lgt').

	% Test 3b: Single line without include (cursor or single-line selection)
	single_predicate :- write('single').

	% Test 3c: Mixed content with include in middle (select lines 58-63)
	start_predicate :- write('start').
	% Some comment
	:- include('middle_include.lgt').
	% Another comment
	end_predicate :- write('end').

	% ========================================================================
	% SECTION 4: Performance Test Cases
	% ========================================================================

	% Test 4a: Large selection with include at end (select lines 68-80)
	pred1 :- write('pred1').
	pred2 :- write('pred2').
	pred3 :- write('pred3').
	pred4 :- write('pred4').
	pred5 :- write('pred5').
	pred6 :- write('pred6').
	pred7 :- write('pred7').
	pred8 :- write('pred8').
	pred9 :- write('pred9').
	pred10 :- write('pred10').
	% Comment line
	:- include('end_include.lgt').  % Should be found efficiently

	% Test 4b: Large selection without includes (select lines 82-92)
	extract_pred1 :- write('extract1').
	extract_pred2 :- write('extract2').
	extract_pred3 :- write('extract3').
	extract_pred4 :- write('extract4').
	extract_pred5 :- write('extract5').
	extract_pred6 :- write('extract6').
	extract_pred7 :- write('extract7').
	extract_pred8 :- write('extract8').
	extract_pred9 :- write('extract9').
	extract_pred10 :- write('extract10').

	% Main test predicate
	test_optimized_parsing :-
		write('Testing optimized selection parsing:'), nl,
		write('- Single parse per selection'), nl,
		write('- Efficient include detection'), nl,
		write('- Proper action selection'), nl.

:- end_object.

% ========================================================================
% TESTING INSTRUCTIONS
% ========================================================================
%
% EXPECTED BEHAVIOR:
% 1. Each selection is parsed only ONCE for include directives
% 2. If include found -> Show "Replace include/1 directive" action
% 3. If no include found -> Show "Extract to entity" and "Extract to file" actions
% 4. Empty selections -> No refactoring actions
%
% TEST CASES:
%
% REPLACE ACTIONS (should show replace action):
% - Lines 15-17: Selection with include directive
% - Lines 19-22: Selection with commented and real include
% - Lines 24-27: Selection with multiple includes (first one wins)
% - Line 54: Single line with include
% - Lines 58-63: Mixed content with include in middle
% - Lines 68-80: Large selection with include at end
%
% EXTRACT ACTIONS (should show extract actions):
% - Lines 33-36: Pure predicate code
% - Lines 38-42: Code with only commented includes
% - Lines 44-48: Mathematical predicate
% - Line 57: Single line without include
% - Lines 82-92: Large selection without includes
%
% PERFORMANCE VERIFICATION:
% - Large selections should be processed efficiently
% - No double parsing of the same selection
% - Comment skipping should be fast
