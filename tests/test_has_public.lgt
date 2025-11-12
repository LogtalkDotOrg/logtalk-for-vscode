:- object(test_has_public).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2025-11-12,
		comment is 'Test object that already has a public/1 directive.'
	]).

	:- public([
		foo/1,
		bar/2
	]).

	foo(X) :-
		write(X), nl.

	bar(X, Y) :-
		Z is X + Y,
		write(Z), nl.

	baz :-
		write('Hello'), nl.

:- end_object.

