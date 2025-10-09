% Test file for zero-arity predicate handling in rename provider
% This tests that callable-based directives properly handle zero-arity predicates

:- object(test_zero_arity).

    % Scope directive with zero-arity predicates
    :- public([
        start/0,
        stop/0,
        reset/0,
        process/1,
        cleanup/0
    ]).
    
    % === INDICATOR-BASED DIRECTIVES (use name/arity) ===
    
    % Info directive for start/0 (should be found and renamed)
    :- info(start/0, [
        comment is 'Starts the process - zero arity predicate'
    ]).
    
    % Dynamic directive for start/0 (should be found and renamed)
    :- dynamic(start/0).
    
    % === CALLABLE-BASED DIRECTIVES (use name(args) or just name for zero-arity) ===
    
    % Mode directive for start/0 (should be found and renamed)
    % Note: zero-arity predicates appear without parentheses in mode directives
    :- mode(start, one).
    
    % Meta predicate directive for start/0 (should be found and renamed)
    % Note: zero-arity predicates appear without parentheses in meta_predicate directives
    :- meta_predicate(start).
    
    % Mode directive for process/1 (should NOT be renamed when renaming start/0)
    :- mode(process(+atom), one).
    
    % Info directive for process/1 (should NOT be renamed when renaming start/0)
    :- info(process/1, [
        comment is 'Processes input - non-zero arity predicate',
        argnames is ['Input']
    ]).
    
    % Mode directive for stop/0 (should NOT be renamed when renaming start/0)
    :- mode(stop, one).
    
    % Info directive for stop/0 (should NOT be renamed when renaming start/0)
    :- info(stop/0, [
        comment is 'Stops the process - different zero arity predicate'
    ]).

    % Predicate clauses
    start :-
        write('Starting process'), nl.
        
    stop :-
        write('Stopping process'), nl.
        
    reset :-
        write('Resetting process'), nl.
        
    process(Input) :-
        write('Processing: '), write(Input), nl.
        
    cleanup :-
        write('Cleaning up'), nl.

:- end_object.
