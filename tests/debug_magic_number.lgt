:- object(debug_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Debug test for magic number refactoring'
	]).

	:- uses(integer, [between/3]).
	:- uses(os, [cpu_time/1]).

	:- public(test_single_line/1).
	:- public(test_multi_line/1).
	:- public(run/0).

	% Test case 1: Single line rule with magic number
	test_single_line(X) :- X > 100000.

	% Test case 2: Multi-line rule with magic number
	test_multi_line(X) :-
		X > 100000,
		write('Large value'), nl.

	% Test case 3: Fact (should NOT work)
	fact_test(100000).

	% Test case 4: Complex single line
	complex_test(X, Y) :- X > 100000, Y is X + 42.

	% Test case 5: Reproducing the benchmarks.lgt scenario
	% This should work - 100000 is in rule body, predicate has no arguments
	run :-
		run(100000).

	% Test case 6: Another predicate with no arguments
	start :-
		initialize(42).

	% Test case 7: Fact (should NOT work - not indented)
	fact_predicate(100000).

:- end_object.
