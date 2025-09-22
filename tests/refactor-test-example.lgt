:- object(example_object).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Example object for testing refactoring'
	]).

	:- public(main_predicate/1).
	main_predicate(X) :-
		helper_predicate(X, Y),
		write(Y).

	% This code could be extracted to a new entity
	% Select from the next line to the line before "another_helper"

	helper_predicate(Input, Output) :-
		atom_codes(Input, Codes),
		reverse(Codes, ReversedCodes),
		atom_codes(Output, ReversedCodes).

	string_length_helper(String, Length) :-
		atom_codes(String, Codes),
		length(Codes, Length).

	% End of extractable code section

	another_helper(X, Y) :-
		length(X, Len),
		Y is Len * 2.

:- end_object.
