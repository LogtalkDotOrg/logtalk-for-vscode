:- object(verbatim_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for verbatim code copying'
	]).

	% Select the following code block to test verbatim copying
	% The indentation should be preserved exactly as is
	
		deeply_indented_predicate(X) :-
			some_goal(X),
				even_deeper_goal(X),
			back_to_normal(X).

	normal_predicate(Y) :-
		regular_goal(Y).

			another_deeply_indented(Z) :-
				very_deep_goal(Z),
					extremely_deep(Z).

	% End of test code block

:- end_object.
