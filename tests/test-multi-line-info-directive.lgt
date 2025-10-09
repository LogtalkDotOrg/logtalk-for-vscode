% Test file for multi-line info directive handling
% This tests the specific case where ":- info(" is on one line and the indicator is on the next

:- object(test_info).

    :- public(test_predicate/1).
    
    % Multi-line info directive - the problematic case
    :- info(
        test_predicate/1,
        [
            comment is 'A test predicate for multi-line info directive handling',
            argnames is ['Input'],
            examples is [
                'test_predicate(hello) - Test with hello'
            ]
        ]
    ).
    
    % Another multi-line info directive with different formatting
    :- info(another_predicate/1, [
        comment is 'Another test predicate',
        argnames is ['Value']
    ]).

    test_predicate(Input) :-
        write('Testing multi-line info directive with: '), write(Input), nl.
        
    another_predicate(Value) :-
        write('Another predicate with: '), write(Value), nl.

:- end_object.
