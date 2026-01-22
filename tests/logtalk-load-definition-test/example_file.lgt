%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%
%  Example file for logtalk_load Go to Definition test
%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

:- object(example_file).

	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2026-01-22,
		comment is 'Example object referenced by loader.lgt.'
	]).

	:- public(hello/0).
	hello :-
		write('Hello from example_file!'), nl.

:- end_object.

