:- object(test_object).

    :- info([
        version is 1:0:0,
        author is 'Test Author',
        date is 2024-01-01,
        comment is 'Test object for extract protocol refactoring'
    ]).

    % Public predicates
    :- public([
        process_data/2,
        validate_input/1,
        format_output/2
    ]).

    % Mode directives
    :- mode(process_data(+list, -list), one).
    :- mode(validate_input(+term), zero_or_one).
    :- mode(format_output(+term, -atom), one).

    % Info directives for predicates
    :- info(process_data/2, [
        comment is 'Processes input data and returns processed result',
        argnames is ['InputData', 'ProcessedData']
    ]).

    :- info(validate_input/1, [
        comment is 'Validates the input data format',
        argnames is ['Input']
    ]).

    :- info(format_output/2, [
        comment is 'Formats the output data as an atom',
        argnames is ['Data', 'FormattedAtom']
    ]).

    % Protected predicates
    :- protected(helper_predicate/1).
    :- mode(helper_predicate(+term), one).
    :- info(helper_predicate/1, [
        comment is 'Helper predicate for internal processing',
        argnames is ['Term']
    ]).

    % Private predicates
    :- private(internal_state/1).
    :- mode(internal_state(?term), zero_or_more).

    % Implementation
    process_data(Input, Output) :-
        validate_input(Input),
        helper_predicate(Input),
        format_output(Input, Output).

    validate_input(Input) :-
        compound(Input).

    format_output(Data, Atom) :-
        term_to_atom(Data, Atom).

    helper_predicate(Term) :-
        internal_state(Term).

    internal_state(data).

:- end_object.
