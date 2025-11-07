% Test file for selection range provider

:- object(test_selection).

    :- info([
        version is 1:0:0,
        author is 'Test',
        date is 2025-01-07,
        comment is 'Test object for selection range provider.'
    ]).

    :- public(single_line_clause/0).
    single_line_clause.

    :- public(multi_line_clause/1).
    multi_line_clause(X) :-
        foo(X),
        bar(X),
        baz(X).

    :- public(complex_clause/2).
    complex_clause(X, Y) :-
        (   condition1(X) ->
            action1(Y)
        ;   condition2(X) ->
            action2(Y)
        ;   default_action(Y)
        ).

    /* Block comment
       spanning multiple
       lines */

    % This is a line comment
    % Another line comment

    :- public(after_comment/0).
    after_comment.

:- end_object.

