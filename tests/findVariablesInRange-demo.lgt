% Demo file for testing PredicateUtils.findVariablesInRange method
% This file contains various test cases for variable detection

:- object(demo).

    % Simple predicate with variables
    simple_predicate(X, Y, Z) :-
        X = Y,
        Y = Z.

    % Predicate with variables in quoted strings (should be ignored)
    quoted_test(X, Y) :-
        atom_string('Variable', X),
        atom_string("AnotherVariable", Y).

    % Predicate with variables in comments (should be ignored)
    comment_test(X, Y) :-
        X = Y, % This comment has Variable in it
        /* This block comment has Variable too */
        Y = X.

    % Predicate with character code notation
    char_code_test(X, Y) :-
        X = 0'a,
        Y = 0'\n.

    % Predicate with underscore variables
    underscore_test(Var1, Var_2, _Var3, _) :-
        Var1 = Var_2,
        Var_2 = _Var3.

    % Complex predicate with mixed content
    complex_test(Input, Output, Options) :-
        % Process input with Variable in comment
        process(Input, Temp1),
        'quoted atom with Variable'(Temp1, Temp2),
        "double quoted with Variable"(Temp2, Temp3),
        /* Block comment with Variable */ transform(Temp3, Output, Options).

:- end_object.

