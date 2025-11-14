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
	% Select findall(N, between(1, 10, N), List) and unify with variable Numbers
	example4(X, Y) :-
		write(X),
		findall(N, between(1, 10, N), List),
		Y = List.

	:- public(valid_terms/0).
	:- mode(valid_terms, one).
	:- info(valid_terms/0, [
		comment is 'Examples of valid terms for unify refactoring.'
	]).

	% Test case 5: Valid terms that should enable the refactoring
	% - Atom: foo
	% - Integer: 42
	% - Float: 3.14
	% - Scientific notation: 1.5e10
	% - Binary: 0b1010
	% - Octal: 0o777
	% - Hex: 0xFF
	% - Character code: 0'a
	% - Single-quoted atom: 'Hello World'
	% - Double-quoted string: "Hello World"
	% - Bracketed list: [H| T]
	% - Curly brackets: {X, Y}
	% - Compound: atom_concat(foo, bar)
	% - Parenthesized: (X + Y)
	valid_terms :-
		write(foo),
		write(42),
		write(3.14),
		write(1.5e10),
		write(0b1010),
		write(0o777),
		write(0xFF),
		write(0'a),
		write('Hello World'),
		write("Hello World"),
		write([H| T]),
		write({X, Y}),
		write(atom_concat(foo, bar)),
		write((X + Y)).

	:- public(invalid_terms/0).
	:- mode(invalid_terms, one).
	:- info(invalid_terms/0, [
		comment is 'Examples of invalid/incomplete selections that should NOT enable the refactoring.'
	]).

	% Test case 6: Invalid selections that should NOT enable the refactoring
	% - Partial term: "atom_concat(foo," (missing closing paren)
	% - Just an operator: "+"
	% - Variable alone: "X" (variables should not be extracted)
	% - Unbalanced brackets: "[H| T"
	invalid_terms :-
		write(atom_concat(foo, bar)),
		write(X + Y),
		write(X),
		write([H| T]).

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

