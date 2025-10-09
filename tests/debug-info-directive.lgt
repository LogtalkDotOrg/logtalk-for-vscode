% Simple test case for debugging multi-line info directive
:- object(debug_test).

    :- public(test_pred/1).
    
    :- info(
        test_pred/1,
        [comment is 'test predicate']
    ).

    test_pred(X) :- write(X).

:- end_object.
