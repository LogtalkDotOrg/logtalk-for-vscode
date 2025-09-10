% Comprehensive test for fact vs rule indentation
% This file specifically tests the distinction between facts and rules

% ===== TOP-LEVEL FACTS =====
% These should maintain current indentation after pressing Enter
% Cursor should stay at same indentation level (column 0 for top-level facts)

fact1(a).
fact2(b, c).
complex_fact(arg1, arg2, [list, items]).

% ===== TAB INDENTATION TEST =====
% Pressing Tab on an empty line should add ONE indentation level only
% (Test by placing cursor on next line and pressing Tab)


% ===== SINGLE-LINE RULES =====
% These should outdent after pressing Enter (IndentAction.Outdent)
% Cursor should return to column 0 after pressing Enter

simple_rule(X) :- fact1(X).
complex_rule(X, Y) :- fact1(X), fact2(Y, _).

% ===== MULTI-LINE RULES =====
% Rule head should increase indentation
% Rule body lines should be indented
% Final period should outdent back to column 0

multi_line_rule(X, Y, Z) :-
	fact1(X),
	fact2(Y, Z),
	complex_fact(X, Y, [Z]).

another_multi_line_rule(Result) :-
	fact1(A),
	fact2(B, C),
	Result = [A, B, C].

% ===== ENTITY CONTEXT =====
:- object(test_object).

	% Facts inside entities should maintain indentation
	% After pressing Enter, cursor should stay at current indentation level (one tab)

	entity_fact(value1).
	another_entity_fact(value2).

	% Test: Place cursor at end of next line and press Enter
	% Expected: Next line should be indented at same level (one tab)
	test_entity_fact_indentation.
	
	% Rules inside entities should outdent relative to their context
	% Single-line rule should outdent to entity indentation level
	entity_single_rule(X) :- entity_fact(X).
	
	% Multi-line rule should work within entity context
	entity_multi_rule(X, Y) :-
		entity_fact(X),
		another_entity_fact(Y).

:- end_object.

% ===== DCG RULES =====
% DCG rules use --> instead of :-
% Should behave similarly to regular rules

sentence --> noun_phrase, verb_phrase.

complex_sentence -->
	determiner,
	noun,
	verb,
	object.

% ===== MIXED SCENARIOS =====
% Test edge cases and combinations

% Fact with complex structure
complex_structure([
	item1,
	item2
]).

% Rule with complex structure
rule_with_complex_args([H|T], Result) :-
	process_head(H, ProcessedH),
	rule_with_complex_args(T, ProcessedT),
	Result = [ProcessedH|ProcessedT].

% Empty rule body (should still outdent)
empty_rule(X) :- true.

% Rule with cut
rule_with_cut(X) :-
	fact1(X),
	!.
