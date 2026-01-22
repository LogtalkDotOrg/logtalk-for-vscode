%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%
%  Another file for logtalk_load Go to Definition test
%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

:- object(another_file).

	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2026-01-22,
		comment is 'Another example object referenced by loader.lgt.'
	]).

	:- public(goodbye/0).
	goodbye :-
		write('Goodbye from another_file!'), nl.

:- end_object.

