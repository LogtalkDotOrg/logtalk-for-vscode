:- object(test_unify).

	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-11-14,
		comment is 'Test file for unify with new variable refactoring.'
	]).

	:- public(example1/3).
	:- mode(example1(+list, +atom, -atom), one).
	:- info(example1/3, [
		comment is 'Example with selection in head.',
		argnames is ['List', 'Prefix', 'Result']
	]).

	% Test case 1: Selection in head
	% Select [H| T] and unify with variable Bar
	example1(A, [H| T], C) :-
		write(A),
		write(C).

	:- public(example2/2).
	:- mode(example2(+atom, -atom), one).
	:- info(example2/2, [
		comment is 'Example with selection in body.',
		argnames is ['Input', 'Output']
	]).

	% Test case 2: Selection in body
	% Select atom_concat(foo, bar) and unify with variable Result
	example2(Input, Output) :-
		write(Input),
		atom_concat(foo, bar, Temp),
		Output = Temp.

	:- public(example3/2).
	:- mode(example3(+list, -atom), one).
	:- info(example3/2, [
		comment is 'Example with complex term in head.',
		argnames is ['Data', 'Result']
	]).

	% Test case 3: Complex term in head
	% Select [a, b, c] and unify with variable Items
	example3([a, b, c], Result) :-
		Result = 'Processing items'.

	:- public(example4/2).
	:- mode(example4(+atom, -atom), one).
	:- info(example4/2, [
		comment is 'Example with nested term in body.',
		argnames is ['X', 'Y']
	]).

	% Test case 4: Nested term in body
	% Select findall(N, between(1, 10, N), _) and unify with variable Numbers
	example4(X, Y) :-
		write(X),
		findall(N, between(1, 10, N), List),
		Y = List.

	:- public(inline_example1/2).
	:- mode(inline_example1(+list, -atom), one).
	:- info(inline_example1/2, [
		comment is 'Example for inline variable refactoring.',
		argnames is ['Items', 'Result']
	]).

	% Test case 5: Inline variable refactoring
	% Select the line "Bar = [H| T]," and inline the variable Bar
	inline_example1(A, C) :-
		Bar = [H| T],
		write(A),
		process(Bar),
		length(Bar, Len),
		format('Processed ~w items~n', [Len]),
		C = Bar.

	:- public(inline_example2/2).
	:- mode(inline_example2(+atom, -atom), one).
	:- info(inline_example2/2, [
		comment is 'Another example for inline variable refactoring.',
		argnames is ['Input', 'Output']
	]).

	% Test case 6: Inline variable in body
	% Select the line "Result = atom_concat(foo, bar)," and inline Result
	inline_example2(Input, Output) :-
		write(Input),
		Result = atom_concat(foo, bar),
		atom_length(Result, Len),
		format('Result length: ~w~n', [Len]),
		Output = Result.

:- end_object.

