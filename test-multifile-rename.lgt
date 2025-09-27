% Test file for multifile predicate renaming
% This tests the fix for renaming entities when multifile predicates are involved
% Including support for parametric entities

:- object(test_entity).

    % Regular predicate (not multifile)
    regular_predicate :-
        write('This is a regular predicate').

:- end_object.

% === NON-PARAMETRIC ENTITY (arity 0) ===
% Multifile predicate clauses for test_entity
% These should all be renamed when test_entity is renamed

test_entity::multifile_pred(first) :-
    write('First clause of multifile predicate').

test_entity::multifile_pred(second) :-
    write('Second clause of multifile predicate').

test_entity::multifile_pred(third) :-
    write('Third clause of multifile predicate').

% More test_entity multifile predicates after a gap
test_entity::another_multifile(X) :-
    test_entity::multifile_pred(X).

test_entity::another_multifile(special) :-
    write('Special case').

% === PARAMETRIC ENTITY (arity 1) ===
% Multifile predicate clauses for parametric_entity/1
% These should all be renamed when parametric_entity is renamed

parametric_entity(param1)::multifile_pred(first) :-
    write('First clause of parametric multifile predicate').

parametric_entity(param1)::multifile_pred(second) :-
    write('Second clause of parametric multifile predicate').

parametric_entity(param1)::another_pred(X) :-
    write('Another parametric multifile predicate').

% === PARAMETRIC ENTITY (arity 2) ===
% Multifile predicate clauses for complex_entity/2

complex_entity(param1, param2)::process(data) :-
    write('Processing data with complex entity').

complex_entity(param1, param2)::validate(input) :-
    write('Validating input with complex entity').

% === DIFFERENT ENTITIES (should NOT be renamed) ===
other_entity::multifile_pred(other) :-
    write('Other entity multifile predicate').

parametric_entity(different_param)::pred(X) :-
    write('Different parametric entity - wrong arity').

% === BOUNDARY CASES ===
% Regular predicate (should stop the consecutive search)
regular_predicate_after :-
    write('This should stop the multifile search').
