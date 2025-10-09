% Test file to demonstrate the complete fix for zero-arity predicate renaming
% When renaming start/0, ALL occurrences should be updated: directives, clauses, and calls

:- object(test_zero_arity_rename_complete).

    % Scope directive
    :- public([
        start/0,
        stop/0,
        restart/0,
        process/1,
        is_running/0
    ]).

    % === INDICATOR-BASED DIRECTIVES (should find start/0 but not standalone "start") ===

    % Info directive for start/0 - this should be found and renamed
    % Fixed: "start" in "start/0" should now be correctly identified and renamed
    :- info(start/0, [
        comment is 'Starts the process - zero arity with explicit /0'
    ]).

    % Dynamic directive for start/0 - this should be found and renamed
    :- dynamic(start/0).

    % Multifile directive for start/0 - this should be found and renamed
    :- multifile(start/0).

    % Info directive for stop/0 - this should NOT be renamed when renaming start/0
    :- info(stop/0, [
        comment is 'Stops the process - different zero arity predicate'
    ]).

    % Info directive for process/1 - this should NOT be renamed when renaming start/0
    :- info(process/1, [
        comment is 'Processes input - non-zero arity predicate',
        argnames is ['Input']
    ]).

    % === CALLABLE-BASED DIRECTIVES (should find standalone "start" for zero-arity) ===

    % Mode directive for start/0 - this should be found and renamed
    % This works because it uses callable form without /0
    :- mode(start, one).

    % Meta predicate directive for start/0 - this should be found and renamed
    :- meta_predicate(start).

    % Mode directive for stop/0 - this should NOT be renamed when renaming start/0
    :- mode(stop, one).

    % Mode directive for process/1 - this should NOT be renamed when renaming start/0
    :- mode(process(+atom), one).

    % === ZERO-ARITY PREDICATE CLAUSES (should be found and renamed) ===

    % Zero-arity fact - this should be found and renamed
    % Fixed: The pattern now includes \. to match zero-arity facts
    start.

    % Zero-arity rule - this should be found and renamed
    % Fixed: The pattern already handled this case with :-
    start :-
        write('Starting process'), nl.

    % Another zero-arity fact with different formatting
    start   .  % This should also be found and renamed

    % === NON-ZERO ARITY PREDICATE CLAUSES (should NOT be renamed) ===

    stop :-
        write('Stopping process'), nl.

    process(Input) :-
        write('Processing: '), write(Input), nl.

    % Zero-arity fact for different predicate
    is_running.

    % === PREDICATE CALLS IN CLAUSE BODIES (should be found and renamed) ===

    restart :-
        start,  % This should be renamed
        stop.

    test_sequence :-
        start,  % This should be renamed
        process(data),
        stop.

    % === COMPLEX SCENARIOS ===

    % Multi-line clause with zero-arity predicate calls
    complex_operation :-
        write('Beginning complex operation'), nl,
        start,  % This should be renamed
        (   is_running ->
            write('Process is running'), nl
        ;   write('Failed to start'), nl
        ),
        stop.

:- end_object.
