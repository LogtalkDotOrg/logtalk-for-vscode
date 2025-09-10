% Test file for indentation improvements
% This file tests various indentation scenarios

% Test 1: Entity opening and closing directives
:- object(test_object).

	% Content inside object should be indented
	:- public(test_predicate/1).

	test_fact(value).

	test_rule(X) :-
		test_fact(X).

:- end_object.

% Test 2: Protocol with proper indentation
:- protocol(test_protocol).

	:- public(interface_predicate/2).

:- end_protocol.

% Test 3: Category with proper indentation
:- category(test_category).

	:- public(category_predicate/0).

	category_predicate :-
		write('Hello from category').

:- end_category.

% Test 4: Facts vs Rules indentation
% FACTS: After typing Enter after these facts, cursor should stay at same indentation level (no outdent)
simple_fact(a).
another_fact(b).
third_fact(c).

% SINGLE-LINE RULE: After typing Enter, cursor should be de-indented to column 0
single_line_rule(X) :- simple_fact(X).

% MULTI-LINE RULE: After typing Enter after the final period, cursor should be de-indented to column 0
multi_line_rule(X, Y, Z) :-
	simple_fact(X),
	another_fact(Y),
	third_fact(Z).

% INDENTED FACTS (inside entity): After Enter, should maintain current indentation
	indented_fact(inside_entity).
	another_indented_fact(value).

% Test 6: Bracket and parenthesis indentation
% When typing Enter between [], the closing ] should align with opening [
test_list([
	item1,
	item2,
	item3
]).

% When typing Enter between (), the closing ) should align with opening (
test_compound(
	arg1,
	arg2,
	arg3
).

% Test 7: Nested structures
complex_rule(X, Y) :-
	test_list([
		X,
		Y
	]),
	test_compound(
		X,
		Y,
		result
	).

% Test 8: DCG rules
sentence -->
	noun_phrase,
	verb_phrase.

% Test 9: If-then-else constructs
conditional_rule(X) :-
	(	test_fact(X) ->
		write('found')
	;	write('not found')
	).

% Test 10: Empty brackets (should align properly)
empty_list([
]).

empty_compound(
).
