%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%
%  Nested file in subdirectory for logtalk_load Go to Definition test
%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

:- object(nested_file).

	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2026-01-22,
		comment is 'Nested object in subdir/ referenced by loader.lgt.'
	]).

	:- public(nested/0).
	nested :-
		write('Hello from nested_file in subdir!'), nl.

:- end_object.

