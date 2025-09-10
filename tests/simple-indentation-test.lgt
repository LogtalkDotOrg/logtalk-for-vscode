% COMPREHENSIVE INDENTATION TEST
% This file tests the corrected indentation behavior

% ===== FACTS =====
% Expected: After pressing Enter, cursor should maintain same indentation level

% Top-level facts (cursor should stay at column 0 after Enter)
fact1(a).
fact2(b).

% ===== ENTITY CONTEXT =====
:- object(test).

	% Entity facts (cursor should stay at tab level after Enter)
	entity_fact(value).
	another_fact(data).

	% Single-line rule (cursor should outdent to tab level after Enter)
	single_rule(X) :- entity_fact(X).

	% Multi-line rule
	multi_rule(X, Y) :-
		entity_fact(X),
		another_fact(Y).
	% After the period above, cursor should outdent to tab level

:- end_object.

% ===== TOP-LEVEL RULES =====
% Single-line rule (cursor should outdent to column 0 after Enter)
top_rule(X) :- fact1(X).

% Multi-line rule
complex_rule(X, Y, Z) :-
	fact1(X),
	fact2(Y),
	Z = [X, Y].
% After the period above, cursor should outdent to column 0

% ===== TAB TEST =====
% Place cursor on next line and press Tab - should add ONE indentation level only

% ===== BRACKET TEST =====
test_list([
	item1,
	item2
]).

test_compound(
	arg1,
	arg2
).
