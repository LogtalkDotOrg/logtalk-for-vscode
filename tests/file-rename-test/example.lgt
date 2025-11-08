:- object(example).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Example file for testing file rename propagation'
	]).

	:- public(hello/0).
	hello :-
		write('Hello from example!'), nl.

:- end_object.

