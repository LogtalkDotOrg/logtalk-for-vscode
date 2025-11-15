%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%
%  Test file for parameter variable renaming
%  This file demonstrates renaming parameter variables (e.g., _Foo_) in
%  entity opening directives, which should rename throughout the entire entity
%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% Test 1: Simple parametric object with parameter variable
:- object(simple_parametric(_Value_)).

    :- info([
        version is 1:0:0,
        author is 'Test',
        date is 2025-01-15,
        comment is 'Test object for parameter variable renaming.',
        parnames is ['Value']
    ]).

    :- public(get_value/1).
    :- mode(get_value(-term), one).
    :- info(get_value/1, [
        comment is 'Get the parameter value.',
        argnames is ['Result']
    ]).

    % Clause using the parameter variable
    get_value(_Value_).

    :- public(process/1).
    :- mode(process(+term), one).
    :- info(process/1, [
        comment is 'Process using the parameter value.',
        argnames is ['Input']
    ]).

    % Clause using parameter variable in body
    process(Input) :-
        write('Processing: '),
        write(Input),
        write(' with value: '),
        write(_Value_).

:- end_object.


% Test 2: Parametric object with multiple parameters
:- object(multi_param(_First_, _Second_)).

    :- info([
        version is 1:0:0,
        author is 'Test',
        date is 2025-01-15,
        comment is 'Test object with multiple parameter variables.',
        parnames is ['First', 'Second']
    ]).

    :- public(combine/1).
    :- mode(combine(-term), one).
    :- info(combine/1, [
        comment is 'Combine both parameters.',
        argnames is ['Result']
    ]).

    % Using both parameter variables
    combine([_First_, _Second_]).

    :- public(swap/1).
    :- mode(swap(-term), one).
    :- info(swap/1, [
        comment is 'Swap the parameters.',
        argnames is ['Result']
    ]).

    % Using parameters in different order
    swap([_Second_, _First_]).

:- end_object.


% Test 3: Parametric category
:- category(monitoring(_Subject_)).

    :- info([
        version is 1:0:0,
        author is 'Test',
        date is 2025-01-15,
        comment is 'Test category for parameter variable renaming.',
        parnames is ['Subject']
    ]).

    :- public(monitor/0).
    :- mode(monitor, one).
    :- info(monitor/0, [
        comment is 'Monitor the subject.'
    ]).

    % Using parameter variable in clause
    monitor :-
        write('Monitoring: '),
        write(_Subject_).

    :- public(report/1).
    :- mode(report(-term), one).
    :- info(report/1, [
        comment is 'Report on the subject.',
        argnames is ['Status']
    ]).

    % Using parameter variable in complex term
    report(status(_Subject_, active)).

:- end_category.


% Test 4: Regular variable (not parameter variable) - should NOT rename across entity
:- object(regular_vars).

    :- public(test/1).
    :- mode(test(+term), one).
    :- info(test/1, [
        comment is 'Test with regular variable.',
        argnames is ['Input']
    ]).

    % Regular variable X should only rename within this clause
    test(X) :-
        write(X).

    :- public(another/1).
    :- mode(another(+term), one).
    :- info(another/1, [
        comment is 'Another test.',
        argnames is ['Input']
    ]).

    % This X is different from the X above
    another(X) :-
        process(X).

    process(X) :-
        write(X).

:- end_object.

