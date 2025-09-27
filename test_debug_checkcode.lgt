% Test file to debug checkCodeLoadedFromDirectory function

:- object(test_object).

    :- public(test_predicate/1).
    
    test_predicate(X) :-
        write(X).
        
    :- public(another_predicate/2).
    
    another_predicate(X, Y) :-
        test_predicate(X),
        write(Y).

:- end_object.
