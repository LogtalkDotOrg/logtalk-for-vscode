% Demo file for testing termType function
% This file contains various Logtalk constructs to test term type detection

:- object(demo).

    % Entity directive: object opening

    :- info([
        version is 1:0:0,
        author is 'Demo Author',
        date is 2024-01-01,
        comment is 'Demonstration object for termType function'
    ]).
    % Entity directive: entity info/1 directive

    :- public([
        simple_fact/0,
        simple_rule/1,
        complex_rule/2
    ]).
    % Predicate directive: multi-line public declaration

    :- mode(simple_rule(+atom), one).
    % Predicate directive: mode declaration

    :- info(simple_rule/1, [
        comment is 'A simple rule for demonstration',
        argnames is ['Input']
    ]).
    % Predicate directive: predicate info/2 directive

    :- dynamic(runtime_fact/1).
    % Predicate directive: dynamic declaration

    simple_fact.
    % Predicate fact

    simple_rule(Input) :-
        write('Processing: '), write(Input), nl.
    % Predicate rule

    complex_rule(X, Y) :-
        simple_rule(X),
        (   Y = processed
        ->  true
        ;   Y = failed
        ).
    % Multi-line predicate rule

    % DCG rules for parsing
    sentence(S) -->
        noun_phrase(NP),
        verb_phrase(VP),
        { S = sentence(NP, VP) }.
    % Non-terminal rule

    noun_phrase(NP) -->
        determiner(Det),
        noun(N),
        { NP = np(Det, N) }.
    % Another non-terminal rule

    verb_phrase(VP) -->
        verb(V),
        { VP = vp(V) }.
    % Simple non-terminal rule

    % Simple DCG rule
    determiner(the) --> [the].
    noun(cat) --> [cat].
    verb(sleeps) --> [sleeps].

:- end_object.
% Entity directive: object closing

:- protocol(demo_protocol).
    % Entity directive: protocol opening
    
    :- public(interface_predicate/1).
    % Predicate directive in protocol

:- end_protocol.
% Entity directive: protocol closing

:- category(demo_category).
    % Entity directive: category opening

    :- public(category_predicate/0).
    % Predicate directive in category

    category_predicate :-
        write('From category'), nl.
    % Predicate rule in category

:- end_category.
% Entity directive: category closing
