:- object(test_object).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test object for magic number refactoring'
	]).

	:- public(test_predicate/2).
	:- public(another_test/1).

	test_predicate(X, Y) :-
		X > 42,
		Y is X + 3.14.

	another_test(Value) :-
		Value < 100,
		Result is Value * 2.5.

:- end_object.
