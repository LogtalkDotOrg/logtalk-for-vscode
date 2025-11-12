:- object(test_infer_public).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2025-11-12,
		comment is 'Test object for inferring public predicates.'
	]).

	% This object has no public/1 directive
	% The refactoring should infer public predicates from the code

	foo(X) :-
		write(X), nl.

	bar(X, Y) :-
		Z is X + Y,
		write(Z), nl.

	baz :-
		write('Hello'), nl.

:- end_object.

