:- object(test_extract_protocol_with_scope).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2025-11-12,
		comment is 'Test object with scope directives - Extract protocol should be available.'
	]).

	:- public([
		foo/1,
		bar/2
	]).

	:- protected([
		helper/1
	]).

	foo(X) :-
		write(X), nl.

	bar(X, Y) :-
		Z is X + Y,
		write(Z), nl.

	helper(X) :-
		write('Helper: '), write(X), nl.

:- end_object.

