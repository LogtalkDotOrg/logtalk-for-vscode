% Test file for entity rename with multiple references in clauses
% This file demonstrates the issue where only the first entity reference
% in a clause is updated during renaming

:- object(test_entity).

    % Directive with single entity reference
    :- uses(test_entity, [predicate/1]).

    % Clause with multiple entity references - this is the problematic case
    test_predicate :-
        test_entity::method1,
        test_entity::method2,
        test_entity::method3.

    % Another clause with multiple references
    another_predicate(X) :-
        test_entity::get_value(X),
        test_entity::validate(X),
        test_entity::process(X).

    % Multi-line clause with entity references
    complex_predicate(Input, Output) :-
        test_entity::preprocess(Input, Temp1),
        test_entity::transform(Temp1, Temp2),
        test_entity::postprocess(Temp2, Output).

:- end_object.
