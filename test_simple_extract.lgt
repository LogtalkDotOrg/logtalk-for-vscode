:- object(simple_test).

    :- info([
        version is 1:0:0,
        author is 'Test Author',
        date is 2024-01-01,
        comment is 'Test object for extract protocol'
    ]).

    :- public(test/1).
    :- mode(test(+atom), one).
    :- info(test/1, [
        comment is 'A test predicate',
        argnames is ['Input']
    ]).

    :- protected(helper/1).
    :- mode(helper(+atom), one).

    test(X) :-
        helper(X),
        write('Test: '), write(X), nl.

    helper(X) :-
        write('Helper: '), write(X), nl.

:- end_object.
