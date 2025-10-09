% Test file for the "Add argument to predicate" refactoring operation
% This file demonstrates various scenarios similar to cascade.lgt

:- object(test_predicates).

    % Public predicate declaration (similar to process_image/2 in cascade.lgt)
    :- public(process_data/2).

    % Mode directive for the predicate (should be updated to process_data/3)
    :- mode(process_data(+atom, -list), one).

    % Info directive for the predicate (should be updated to process_data/3)
    :- info(process_data/2, [
        comment is 'Processes data and returns a result',
        argnames is ['Input', 'Output'],
        exceptions is [
            'Invalid input data' - invalid_data,
            'Processing failed' - processing_error
        ]
    ]).

    % Predicate definition (should get new argument added)
    process_data(Input, Output) :-
        validate_input(Input),
        transform_data(Input, Temp),
        finalize_output(Temp, Output).

    % Another predicate that calls process_data/2 (should be updated)
    test_processing :-
        process_data(sample_data, Result),
        write('Result: '), write(Result), nl.

    % Multiple calls in one predicate
    batch_process :-
        process_data(data1, Result1),
        process_data(data2, Result2),
        combine_results(Result1, Result2, Final),
        write(Final).

    % A local predicate without declaration
    helper(X, Y) :-
        length(X, Len),
        Y is Len * 2.

    % Another call to helper
    use_helper :-
        helper([1,2,3], Result),
        write(Result).

    % Predicate with complex arguments
    complex_call :-
        process_data(
            complex_structure(a, b, c),
            [result1, result2, result3]
        ).

    % Support predicates
    validate_input(_).
    transform_data(Input, Input).
    finalize_output(Input, Input).
    combine_results(A, B, [A, B]).

:- end_object.

% Non-terminal example
:- object(grammar_test).

    % Public non-terminal declaration
    :- public(sentence//1).

    % Mode directive for non-terminal
    :- mode(sentence(-compound), one).

    % Non-terminal definition
    sentence(s(NP, VP)) -->
        noun_phrase(NP),
        verb_phrase(VP).

    % Another non-terminal
    noun_phrase(np(Det, Noun)) -->
        determiner(Det),
        noun(Noun).

    % Support non-terminals
    verb_phrase(vp(V)) --> verb(V).
    determiner(det(the)) --> [the].
    noun(noun(cat)) --> [cat].
    verb(verb(runs)) --> [runs].

:- end_object.
