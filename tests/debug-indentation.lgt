% SIMPLIFIED INDENTATION TEST - Based on working YAML example pattern
% Using simple onEnterRules only, no complex indentationRules

% Test 1: Entity opening directive (should indent next line)
:- object(test).

% Test 2: Facts (should maintain current indentation - no explicit rules)
fact(a).
another_fact(b).

% Test 3: Single-line rule (should outdent after period)
rule(X) :- fact(X).

% Test 4: Multi-line rule (should indent after :-, outdent after final period)
complex_rule(X, Y) :-
	fact(X),
	another_fact(Y).

:- end_object.

% Test 5: Top-level facts (should maintain column 0)
top_fact(value).
another_top_fact(data).

% Test 6: Top-level rule (should outdent to column 0 after period)
top_rule(X) :- top_fact(X).

% Test 7: Brackets (should indent after opening bracket)
test_list([
	item1,
	item2
]).

% Test 8: DCG rules (should indent after -->)
sentence -->
	noun_phrase,
	verb_phrase.

% Test 9: If-then-else (should indent after ->)
conditional(X) :-
	(	test(X) ->
		write('yes')
	;	write('no')
	).
