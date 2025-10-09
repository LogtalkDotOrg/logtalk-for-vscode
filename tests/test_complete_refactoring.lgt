:- object(test_complete).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test complete magic number refactoring'
	]).

	:- public(test_method/1).

	% Test case: Select 100000 and refactor with predicate name "max_value"
	% Expected result:
	% 1. Add fact: max_value(100000). (after info directive)
	% 2. Add call: max_value(MaxValue), (before the line with 100000)
	% 3. Replace: X > MaxValue (100000 becomes MaxValue)
	test_method(X) :-
		X > 100000,
		write('Processing large value'), nl.

	% Test case for single-line rule
	single_line_test(Y) :- Y < 50000, write('Small value').

	% Test case for benchmarks.lgt scenario
	run :-
		run(100000).

	% Another test case with multiple magic numbers
	another_test(A, B) :-
		A > 50000,
		B is A * 3.14159,
		write('Result: '), write(B), nl.

:- end_object.
