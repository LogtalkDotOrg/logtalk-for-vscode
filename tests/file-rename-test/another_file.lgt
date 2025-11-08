:- object(another_file).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Another file for testing'
	]).

	:- public(test/0).
	test :-
		write('Test from another_file'), nl.

:- end_object.

