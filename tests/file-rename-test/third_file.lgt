:- object(third_file).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Third file for testing double-quoted references'
	]).

	:- public(greet/0).
	greet :-
		write('Greetings from third_file'), nl.

:- end_object.

