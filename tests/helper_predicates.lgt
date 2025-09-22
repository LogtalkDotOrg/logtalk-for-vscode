% Helper predicates to be included in other files

% String manipulation helpers
reverse_string(Input, Output) :-
	atom_codes(Input, Codes),
	reverse(Codes, ReversedCodes),
	atom_codes(Output, ReversedCodes).

uppercase_string(Input, Output) :-
	atom_codes(Input, Codes),
	maplist(to_upper, Codes, UpperCodes),
	atom_codes(Output, UpperCodes).

% List utilities
list_length(List, Length) :-
	length(List, Length).

list_sum([], 0).
list_sum([H|T], Sum) :-
	list_sum(T, TailSum),
	Sum is H + TailSum.

% Math utilities
square(X, Y) :-
	Y is X * X.

factorial(0, 1) :- !.
factorial(N, F) :-
	N > 0,
	N1 is N - 1,
	factorial(N1, F1),
	F is N * F1.
