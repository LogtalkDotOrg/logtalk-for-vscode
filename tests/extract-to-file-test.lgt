:- object(extract_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for extract to file functionality'
	]).

	% Select the following code block to test "Extract to new Logtalk file"
	% This should create a new file with just this code (no entity structure)
	% AND remove the selected code from this file

	utility_predicate(Input, Output) :-
		atom_codes(Input, Codes),
		reverse(Codes, ReversedCodes),
		atom_codes(Output, ReversedCodes).

	another_utility(List, Length) :-
		length(List, Length).

	% You can also select just a single predicate
	% (this will be removed from the original file after extraction)
	standalone_predicate(X) :-
		write('Processing: '), write(X), nl.

	% Or select multiple predicates with different indentation
	% (these will also be removed from the original file after extraction)
		deeply_indented(A, B) :-
			some_goal(A),
				very_deep_goal(B).

	normal_indented(C) :-
		regular_goal(C).

	% End of test code blocks

:- end_object.
