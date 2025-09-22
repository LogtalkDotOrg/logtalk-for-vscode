% Prolog-style helper predicates

% Mathematical predicates
power(_, 0, 1) :- !.
power(Base, Exp, Result) :-
	Exp > 0,
	Exp1 is Exp - 1,
	power(Base, Exp1, TempResult),
	Result is Base * TempResult.

% List predicates
append_lists([], L, L).
append_lists([H|T], L, [H|Result]) :-
	append_lists(T, L, Result).

% Arithmetic predicates
is_even(N) :-
	0 is N mod 2.

is_odd(N) :-
	1 is N mod 2.
