% Test file for variable rename functionality

:- object(variable_rename_test).

    % Test 1: Simple clause with variable
    test_simple(X) :-
        write(X),
        nl,
        X = hello.

    % Test 2: Multiple occurrences of same variable
    test_multiple(Name) :-
        atom(Name),
        write('Hello, '),
        write(Name),
        write('!'),
        nl,
        atom_length(Name, Length),
        write('Name length: '),
        write(Length).

    % Test 3: Variable in clause head and body
    test_head_body(Input, Output) :-
        atom(Input),
        atom_concat(Input, '_processed', Output),
        write(Output).

    % Test 4: Variable with underscore
    test_underscore(_Ignored) :-
        write('Ignored parameter').

    % Test 5: Anonymous variable (should not be renamed)
    test_anonymous(_) :-
        write('Anonymous').

    % Test 6: Multiple variables
    test_multi_vars(X, Y, Z) :-
        X = 1,
        Y = 2,
        Z is X + Y,
        write(Z).

    % Test 7: Variable in list
    test_list([H|T]) :-
        write(H),
        nl,
        test_list(T).

    test_list([]).

    % Test 8: Variable in complex term
    test_complex(person(Name, Age)) :-
        write('Name: '), write(Name), nl,
        write('Age: '), write(Age).

    % Test 9: Grammar rule with variables
    sentence(S) --> noun(N), verb(V), { atom_concat(N, V, S) }.
    noun(dog) --> [dog].
    verb(runs) --> [runs].

    % Test 10: Directive with variable (should work in directive scope)
    :- initialization((
        X = test,
        write(X),
        nl
    )).

    % Test 11: Variable in if-then-else
    test_conditional(X) :-
        (   X > 0
        ->  write('Positive: '), write(X)
        ;   write('Non-positive: '), write(X)
        ).

    % Test 12: Variable in findall
    test_findall(Results) :-
        findall(X, between(1, 5, X), Results).

    % Test 13: Variable shadowing (different scopes)
    test_shadow(X) :-
        X = outer,
        write(X),
        nl,
        (   X = inner,
            write(X)
        ;   true
        ).

    % Test 14: Variable in string (should NOT be renamed)
    test_string(Name) :-
        write("The variable Name is used here"),
        write(Name).

    % Test 15: Variable in comment (SHOULD be renamed to keep comments accurate)
    test_comment(Value) :-
        % Value is a test variable
        write(Value). % Print Value

:- end_object.

