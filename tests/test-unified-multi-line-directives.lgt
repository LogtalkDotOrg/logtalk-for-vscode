% Test file for unified multi-line directive handling
% This tests that all directive types work with the unified approach

:- object(test_unified).

    % Multi-line scope directive
    :- public([
        test_predicate/1,
        other_predicate/2
    ]).
    
    % Multi-line info directive
    :- info(test_predicate/1, [
        comment is 'A test predicate for unified directive handling',
        argnames is ['Input'],
        examples is [
            'test_predicate(hello) - Test with hello'
        ]
    ]).
    
    % Multi-line mode directive
    :- mode(
        test_predicate(+atom),
        one
    ).
    
    % Single-line directives (should still work)
    :- dynamic(test_predicate/1).
    :- meta_predicate(test_predicate(*)).

    test_predicate(Input) :-
        write('Testing unified approach with: '), write(Input), nl.

:- end_object.
