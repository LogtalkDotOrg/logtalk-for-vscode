:- object(debug_extract).

    :- info([
        version is 1:0:0,
        author is 'Test Author',
        date is 2024-01-01,
        comment is 'Debug test for extract protocol'
    ]).

    :- public(simple_test/1).
    :- mode(simple_test(+atom), one).
    :- info(simple_test/1, [
        comment is 'A simple test predicate',
        argnames is ['Input']
    ]).

    simple_test(Input) :-
        write('Testing: '), write(Input), nl.

:- end_object.
