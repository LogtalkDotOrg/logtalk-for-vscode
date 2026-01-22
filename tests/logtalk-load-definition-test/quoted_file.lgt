%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%
%  Quoted file for logtalk_load Go to Definition test
%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

:- object(quoted_file).

	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2026-01-22,
		comment is 'Example object with quoted name referenced by loader.lgt.'
	]).

	:- public(greet/0).
	greet :-
		write('Hello from quoted_file!'), nl.

:- end_object.

