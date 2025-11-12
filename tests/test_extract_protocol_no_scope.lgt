:- object(test_extract_protocol_no_scope).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2025-11-12,
		comment is 'Test object without scope directives - Extract protocol should NOT be available.'
	]).

	% No public/1, protected/1, or private/1 directives
	% All predicates are private by default

	foo(X) :-
		write(X), nl.

	bar(X, Y) :-
		Z is X + Y,
		write(Z), nl.

	baz :-
		write('Hello'), nl.

:- end_object.

