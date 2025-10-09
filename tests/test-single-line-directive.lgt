% Test file for single-line scope directive
% This should work correctly after our fix

:- object(test_single).

    :- public(simple_predicate/1).
    
    :- mode(simple_predicate(+atom), one).
    
    :- info(simple_predicate/1, [
        comment is 'A simple predicate for testing',
        argnames is ['Input']
    ]).

    simple_predicate(test) :-
        write('Testing single line directive').

:- end_object.
