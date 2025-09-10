% Test file for multi-line scope directive parsing
% This file contains various forms of scope directives to test the symbol providers

:- object(multi_line_scope_test).

    % Single predicate scope directives (should work as before)
    :- public(single_predicate/1).
    :- protected(single_protected/2).
    :- private(single_private/0).

    % Single non-terminal scope directives (should work as before)
    :- public(single_nt//1).
    :- protected(single_protected_nt//2).
    :- private(single_private_nt//0).

    % List syntax - single line
    :- public([list_pred1/1, list_pred2/2, list_pred3/0]).

    % List syntax - multi-line
    :- public([
        multi_line_pred1/1,
        multi_line_pred2/2,
        multi_line_pred3/3
    ]).

    % List syntax with non-terminals
    :- protected([
        mixed_pred/1,
        mixed_nt//2,
        another_pred/0
    ]).

    % Conjunction syntax - single line
    :- private((conj_pred1/1, conj_pred2/2, conj_pred3/0)).

    % Conjunction syntax - multi-line
    :- private((
        multi_conj_pred1/1,
        multi_conj_pred2/2,
        multi_conj_nt//1
    )).

    % Mixed predicates and non-terminals in list
    :- public([
        mixed_list_pred/1,
        mixed_list_nt//2,
        another_mixed_pred/3,
        another_mixed_nt//0
    ]).

    % Test predicate implementations
    single_predicate(_).
    single_protected(_, _).
    single_private.

    list_pred1(_).
    list_pred2(_, _).
    list_pred3.

    multi_line_pred1(_).
    multi_line_pred2(_, _).
    multi_line_pred3(_, _, _).

    mixed_pred(_).
    another_pred.

    conj_pred1(_).
    conj_pred2(_, _).
    conj_pred3.

    multi_conj_pred1(_).
    multi_conj_pred2(_, _).

    mixed_list_pred(_).
    another_mixed_pred(_, _, _).

    % Non-terminal implementations
    single_nt(_) --> [].
    single_protected_nt(_, _) --> [].
    single_private_nt --> [].

    mixed_nt(_, _) --> [].
    multi_conj_nt(_) --> [].
    mixed_list_nt(_, _) --> [].
    another_mixed_nt --> [].

:- end_object.
