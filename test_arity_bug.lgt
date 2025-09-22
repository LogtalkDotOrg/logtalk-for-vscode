% Test file to demonstrate the arity bug in addArgument refactoring
% The bug: addArgument was adding arguments to calls of different arity

:- object(arity_test).

    % Predicate with arity 2 that we want to add an argument to
    process_data(Input, Output) :-
        validate_input(Input),
        transform_data(Input, Output).

    % Different predicate with same name but different arity (should NOT be modified)
    process_data(Input, Output, Options, Result) :-
        validate_input(Input),
        transform_data_with_options(Input, Output, Options, Result).

    % Calls to the arity-2 predicate (should be modified)
    test_arity_2 :-
        process_data(sample_data, Result),
        write(Result).

    % Calls to the arity-4 predicate (should NOT be modified)
    test_arity_4 :-
        process_data(sample_data, temp_result, [option1, option2], Final),
        write(Final).

    % Mixed calls in one predicate
    mixed_calls :-
        process_data(data1, result1),                                    % arity 2 - should be modified
        process_data(data2, temp, [opt1], result2),                     % arity 4 - should NOT be modified
        process_data(data3, result3).                                   % arity 2 - should be modified

    % Support predicates
    validate_input(_).
    transform_data(Input, Input).
    transform_data_with_options(Input, Input, _, Input).

:- end_object.
