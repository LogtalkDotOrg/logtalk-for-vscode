:- object(simple_test).

    :- info([
        version is 1:0:0,
        author is 'Test Author',
        date is 2024-01-01,
        comment is 'Simple test object'
    ]).

    :- public(test_predicate/1).
    :- mode(test_predicate(+atom), one).
    :- info(test_predicate/1, [
        comment is 'A simple test predicate',
        argnames is ['Input']
    ]).

    test_predicate(Input) :-
        write('Testing: '), write(Input), nl.

:- end_object.
