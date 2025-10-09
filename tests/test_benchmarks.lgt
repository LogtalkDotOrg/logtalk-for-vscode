:- object(benchmarks).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test benchmarks object'
	]).

	:- public(run/0).

	run :-
		write('Starting benchmarks...'), nl,
		test_loop(100000),
		write('Benchmarks completed.'), nl.

	test_loop(0) :- !.
	test_loop(N) :-
		N > 0,
		N1 is N - 1,
		test_loop(N1).

	% Another test with magic numbers
	performance_test :-
		Max = 100000,
		test_performance(Max).

	test_performance(0) :- !.
	test_performance(N) :-
		N > 0,
		% Some computation here
		Result is N * 2.5,
		write(Result), nl,
		N1 is N - 1,
		test_performance(N1).

	% Test with different contexts
	another_test :-
		X = 100000,
		process_data(X).

	process_data(Value) :-
		Value > 50000,
		write('Processing large value: '), write(Value), nl.

	% Test in a rule body - this should work now
	complex_rule(X, Y) :-
		X > 100000,
		Y is X + 42,
		Z is Y * 3.14,
		write('Result: '), write(Z), nl.

	% Single line rule - this should also work
	simple_test(X) :- X > 100000.

	% Test in different positions
	fact_test(100000).

	rule_with_multiple_numbers :-
		A = 100000,
		B = 50000,
		C is A + B,
		write(C), nl.

:- end_object.
