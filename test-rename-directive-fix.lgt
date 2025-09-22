% Test file for rename provider directive fixes
% This tests the improved findRelatedDirectives function with proper distinction
% between indicator-based and callable-based directives

:- object(test_rename_directives).

    % Multi-line scope directive
    :- public([
        test_predicate/1,
        another_predicate/2,
        test_predicate/3
    ]).

    % === INDICATOR-BASED DIRECTIVES (use name/arity) ===

    % Info directive for test_predicate/1 (should be found and renamed)
    :- info(test_predicate/1, [
        comment is 'A test predicate with arity 1',
        argnames is ['Input']
    ]).

    % Dynamic directive for test_predicate/1 (should be found and renamed)
    :- dynamic(test_predicate/1).

    % Multifile directive for test_predicate/1 (should be found and renamed)
    :- multifile(test_predicate/1).

    % Discontiguous directive for test_predicate/1 (should be found and renamed)
    :- discontiguous(test_predicate/1).

    % === CALLABLE-BASED DIRECTIVES (use name(args)) ===

    % Mode directive for test_predicate/1 (should be found and renamed)
    :- mode(test_predicate(+atom), one).

    % Meta predicate directive for test_predicate/1 (should be found and renamed)
    :- meta_predicate(test_predicate(*)).

    % === DIRECTIVES FOR DIFFERENT PREDICATES (should NOT be renamed) ===

    % Info directive for another_predicate/2 (should NOT be renamed when renaming test_predicate/1)
    :- info(another_predicate/2, [
        comment is 'A different predicate with arity 2',
        argnames is ['Input1', 'Input2']
    ]).

    % Mode directive for another_predicate/2 (should NOT be renamed when renaming test_predicate/1)
    :- mode(another_predicate(+atom, -atom), one).

    % Info directive for test_predicate/3 (should NOT be renamed when renaming test_predicate/1)
    :- info(test_predicate/3, [
        comment is 'A test predicate with arity 3',
        argnames is ['Input1', 'Input2', 'Output']
    ]).

    % Mode directive for test_predicate/3 (should NOT be renamed when renaming test_predicate/1)
    :- mode(test_predicate(+atom, +atom, -atom), one).

    % Predicate clauses
    test_predicate(Input) :-
        write('Testing with: '), write(Input), nl.
        
    another_predicate(Input1, Output) :-
        atom_concat(Input1, '_processed', Output).
        
    test_predicate(Input1, Input2, Output) :-
        atom_concat(Input1, Input2, Output).

:- end_object.
