:- object(include_replacement_comprehensive_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Comprehensive test file for include directive replacement functionality'
	]).

	% Test case 1: Basic include with single quotes
	% Place cursor on the line below and use "Replace include directive with file contents"
	:- include('helper_predicates.lgt').

	% Test case 2: Include with double quotes
	:- include("helper_predicates.lgt").

	% Test case 3: Include with relative path using ./
	:- include('./helper_predicates.lgt').

	% Test case 4: Indented include (2 spaces) - should preserve indentation
	  :- include('helper_predicates.lgt').

	% Test case 5: Indented include (4 spaces) - should preserve indentation
	    :- include('helper_predicates.lgt').

	% Test case 6: Tab-indented include - should preserve indentation
		:- include('helper_predicates.lgt').

	% Test case 7: Include with extra spaces
	:- include( 'helper_predicates.lgt' ).

	% Test case 8: Include with no space after :-
	:-include('helper_predicates.lgt').

	% Test case 9: Include that should fail (non-existent file)
	% This should show an error message when attempted
	:- include('non_existent_file.lgt').

	% Test case 10: Include with absolute path (will fail unless file exists)
	% :- include('/tmp/test_file.lgt').

	% Main predicate that would use the included helpers
	main_test :-
		% These calls would work after include replacement
		reverse_string('hello', Reversed),
		write('Reversed: '), write(Reversed), nl,
		factorial(5, Fact),
		write('5! = '), write(Fact), nl.

	% Another test predicate
	test_utilities :-
		list_sum([1, 2, 3, 4, 5], Sum),
		write('Sum: '), write(Sum), nl,
		square(7, Square),
		write('7^2 = '), write(Square), nl.

:- end_object.

% Instructions for testing:
% 1. Place cursor on any of the include directive lines above
% 2. Right-click or use Ctrl+Shift+P to open command palette
% 3. Look for "Replace include directive with file contents" action
% 4. The include directive should be replaced with the contents of helper_predicates.lgt
% 5. The indentation should be preserved based on the original include line's indentation
