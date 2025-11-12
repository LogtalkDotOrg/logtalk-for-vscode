:- object(test_infer_public_no_info).

	% This object has no info/1 directive and no public/1 directive
	% The refactoring should add the public/1 directive after the entity opening directive

	foo(X) :-
		write(X), nl.

	bar(X, Y) :-
		Z is X + Y,
		write(Z), nl.

	baz :-
		write('Hello'), nl.

:- end_object.

