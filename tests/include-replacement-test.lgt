:- object(include_replacement_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for include directive replacement functionality'
	]).

	% Test case 1: Simple include directive (place cursor on this line and use refactor action)
	:- include('helper_predicates.lgt').

	% Test case 2: Include with different quote styles
	:- include("helper_predicates.lgt").

	% Test case 3: Indented include directive (should preserve indentation)
		:- include('helper_predicates.lgt').

	% Test case 4: Include with relative path
	:- include('./helper_predicates.lgt').

	% Main predicate that uses the included helpers
	main_predicate(Input, Result) :-
		reverse_string(Input, Reversed),
		uppercase_string(Reversed, Result).

	test_math(N, SquareFactorial) :-
		square(N, Square),
		factorial(Square, SquareFactorial).

:- end_object.
