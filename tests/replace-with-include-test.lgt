:- object(replace_with_include_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for "Replace with include/1 directive" refactoring'
	]).

	% ========================================================================
	% SECTION 1: Code to Extract (Same Directory)
	% These selections should create files in the same directory with relative paths
	% ========================================================================

	% Test 1a: Select lines 15-18 (simple predicates)
	% Expected: Creates "utility_predicates.lgt" and replaces with :- include('utility_predicates').
	utility_predicate_1(X) :-
		X > 0,
		write('Utility 1: '), write(X), nl.

	utility_predicate_2(Y) :-
		Y < 100,
		write('Utility 2: '), write(Y), nl.

	% Test 1b: Select lines 23-28 (mathematical operations)
	% Expected: Creates "math_operations.lgt" and replaces with :- include('math_operations').
	square(X, Y) :-
		Y is X * X.

	cube(X, Y) :-
		Y is X * X * X.

	factorial(0, 1) :- !.
	factorial(N, F) :-
		N > 0,
		N1 is N - 1,
		factorial(N1, F1),
		F is N * F1.

	% Test 1c: Select lines 35-40 (list operations)
	% Expected: Creates "list_utilities.lgt" and replaces with :- include('list_utilities').
	list_length([], 0).
	list_length([_|T], N) :-
		list_length(T, N1),
		N is N1 + 1.

	reverse_list(List, Reversed) :-
		reverse_list(List, [], Reversed).

	reverse_list([], Acc, Acc).
	reverse_list([H|T], Acc, Reversed) :-
		reverse_list(T, [H|Acc], Reversed).

	% ========================================================================
	% SECTION 2: Indented Code to Extract
	% These should preserve indentation in the include directive
	% ========================================================================

	% Test 2a: Select lines 50-54 (indented with 2 spaces)
	% Expected: Include directive should have 2-space indentation
	some_container_predicate :-
	  helper_pred_1(X) :-
	    X > 0,
	    write(X).
	  
	  helper_pred_2(Y) :-
	    Y < 10,
	    write(Y).

	% Test 2b: Select lines 59-63 (indented with 4 spaces)
	% Expected: Include directive should have 4-space indentation
	another_container :-
	    nested_pred_1 :-
	        write('nested 1').
	    
	    nested_pred_2 :-
	        write('nested 2').

	% Test 2c: Select lines 68-72 (tab-indented)
	% Expected: Include directive should have tab indentation
	tab_container :-
		tab_pred_1 :-
			write('tab 1').
		
		tab_pred_2 :-
			write('tab 2').

	% ========================================================================
	% SECTION 3: Complex Code Blocks
	% ========================================================================

	% Test 3a: Select lines 78-90 (complex predicate with multiple clauses)
	% Expected: Creates file with complete predicate definition
	complex_search([], _, []).
	complex_search([H|T], Target, [H|Result]) :-
		H = Target,
		!,
		complex_search(T, Target, Result).
	complex_search([H|T], Target, Result) :-
		H \= Target,
		complex_search(T, Target, Result).

	process_results([]).
	process_results([H|T]) :-
		write('Processing: '), write(H), nl,
		process_results(T).

	validate_input(Input) :-
		Input \= [],
		length(Input, Len),
		Len > 0.

	% Test 3b: Select lines 97-105 (mixed directives and predicates)
	% Expected: Creates file with directives and predicates
	:- public(exported_pred/2).
	:- mode(exported_pred(+atom, -integer), one).

	exported_pred(Atom, Length) :-
		atom_length(Atom, Length).

	:- private(internal_helper/1).
	internal_helper(X) :-
		X > 0,
		write('Internal: '), write(X), nl.

	% ========================================================================
	% SECTION 4: Single Line Extractions
	% ========================================================================

	% Test 4a: Select only line 113 (single predicate)
	single_line_pred :- write('Single line predicate').

	% ========================================================================
	% SECTION 5: Comments and Documentation
	% ========================================================================

	% Test 5a: Select lines 121-130 (code with comments)
	% Expected: Comments should be preserved in extracted file
	% This is a documented predicate
	documented_pred(X, Y) :-
		% Check if X is positive
		X > 0,
		% Calculate Y as double of X
		Y is X * 2,
		% Output the result
		write('Result: '), write(Y), nl.
	% End of documented predicate

	% Test 6: Select lines 135-138 (code with trailing empty lines)
	% Expected: Include directive + preserved trailing empty lines
	utility_with_spacing(X) :-
		X > 0,
		write('Utility with spacing').


	% This predicate should remain properly separated
	separated_predicate :-
		write('Should have proper spacing above').

	% Main test predicate
	test_replace_with_include :-
		write('Testing "Replace with include/1 directive" refactoring:'), nl,
		write('- Select code and choose "Replace with include/1 directive"'), nl,
		write('- Enter filename when prompted'), nl,
		write('- Code will be extracted to new file'), nl,
		write('- Selection replaced with include directive'), nl,
		write('- Trailing empty lines in selection are preserved'), nl,
		write('- Relative paths for same directory'), nl,
		write('- Absolute paths for different directories'), nl.

:- end_object.

% ========================================================================
% TESTING INSTRUCTIONS
% ========================================================================
%
% HOW TO TEST:
% 1. Select any code block from the sections above
% 2. Right-click or use Ctrl+Shift+P to open command palette
% 3. Choose "Replace with include/1 directive"
% 4. Enter a filename when prompted (without .lgt extension)
% 5. The selected code will be:
%    - Extracted to a new .lgt file
%    - Replaced with an include directive
%
% EXPECTED BEHAVIOR:
%
% SAME DIRECTORY (relative paths):
% - Selected code → new file in same directory
% - Include directive: :- include('filename').
%
% DIFFERENT DIRECTORY (absolute paths):
% - If you save to a different directory tree
% - Include directive: :- include('/absolute/path/to/filename').
%
% INDENTATION PRESERVATION:
% - Include directive inherits indentation from first line of selection
% - Example: 4-space indented selection → "    :- include('file')."
%
% TRAILING NEWLINE PRESERVATION:
% - Empty lines at end of selection are preserved after include directive
% - Example: Selection ending with "\n\n" → ":- include('file').\n\n"
%
% FILE NAMING:
% - Enter name without extension (e.g., "utilities")
% - System adds .lgt extension automatically
% - Include directive uses name without extension
%
% ERROR HANDLING:
% - Action only available for non-empty selections (no empty selection errors)
% - Invalid filenames → Validation error
% - Existing files → Overwrite confirmation
