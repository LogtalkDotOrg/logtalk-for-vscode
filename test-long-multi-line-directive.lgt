% Test file for very long multi-line scope directive
% This tests that we search until the actual end, not just 15 lines

:- object(test_long_directive).

    :- public([
        predicate_1/1,
        predicate_2/1,
        predicate_3/1,
        predicate_4/1,
        predicate_5/1,
        predicate_6/1,
        predicate_7/1,
        predicate_8/1,
        predicate_9/1,
        predicate_10/1,
        predicate_11/1,
        predicate_12/1,
        predicate_13/1,
        predicate_14/1,
        predicate_15/1,
        predicate_16/1,
        predicate_17/1,
        predicate_18/1,
        predicate_19/1,
        target_predicate/1
    ]).

    % This predicate is on line 25+ (beyond the old 15-line limit)
    target_predicate(test) :-
        write('This predicate should be found even though it is beyond line 15').

:- end_object.
