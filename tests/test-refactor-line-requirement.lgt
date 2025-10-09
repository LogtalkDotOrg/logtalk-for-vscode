:- object(test_refactor_line_requirement).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for verifying refactor line requirement functionality'
	]).

	% ========================================================================
	% TEST CASE 1: Empty selection (cursor position only)
	% This selection should NOT show refactor actions
	% ========================================================================

	% Place cursor here and check - no refactor actions should appear

	% ========================================================================
	% TEST CASE 2: Partial line selection (single word or phrase)
	% This selection should NOT show refactor actions
	% ========================================================================

	test_predicate(X) :- write(X).  % Select just "test_predicate" or "write(X)"

	% ========================================================================
	% TEST CASE 3: Full line selection
	% This selection SHOULD show refactor actions
	% ========================================================================

	full_line_predicate(X) :- write(X).  % Select this entire line including newline

	% ========================================================================
	% TEST CASE 4: Multi-line selection
	% This selection SHOULD show refactor actions
	% ========================================================================

	test_predicate(X) :-
		X > 0,
		write('Test: '), write(X), nl.

	another_predicate(Y) :-
		Y < 100,
		write('Another: '), write(Y), nl.

	% ========================================================================
	% TEST CASE 5: Full line comment selection
	% This selection SHOULD show refactor actions (if full line selected)
	% ========================================================================

	% This is a comment - select the entire line including newline

	% ========================================================================
	% TEST CASE 6: Multi-line mixed selection
	% This selection SHOULD show refactor actions
	% ========================================================================

	% This is a comment before the code
	mixed_test_predicate(Z) :-
		Z =:= 42,
		write('Mixed test: '), write(Z), nl.
	% This is a comment after the code

	% ========================================================================
	% TESTING INSTRUCTIONS
	% ========================================================================
	%
	% HOW TO TEST:
	% 1. Try different types of selections above
	% 2. Right-click or use Ctrl+Shift+P to open command palette
	% 3. Check if refactor actions are available:
	%    - "Extract to new Logtalk entity"
	%    - "Extract to new Logtalk file"
	%    - "Replace with include/1 directive"
	%
	% EXPECTED BEHAVIOR:
	% - Empty selections (cursor only): NO refactor actions
	% - Partial line selections (single word/phrase): NO refactor actions
	% - Full line selections: ALL refactor actions available
	% - Multi-line selections: ALL refactor actions available
	%
	% This ensures refactoring requires at least one complete line to be meaningful.

:- end_object.
