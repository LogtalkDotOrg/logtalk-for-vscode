% Test file for Call Hierarchy functionality
% This file contains predicates that call each other to test the call hierarchy

:- object(call_hierarchy_test).

    :- public([
        main_predicate/0,
        helper_predicate/1,
        another_helper/2,
        leaf_predicate/0
    ]).

    % Main predicate that calls other predicates
    main_predicate :-
        helper_predicate(value),
        another_helper(a, b),
        leaf_predicate.

    % Helper predicate that calls leaf_predicate
    helper_predicate(X) :-
        write(X),
        leaf_predicate.

    % Another helper that calls leaf_predicate
    another_helper(X, Y) :-
        write(X),
        write(Y),
        leaf_predicate.

    % Leaf predicate that doesn't call anything
    leaf_predicate :-
        write('leaf').

:- end_object.
