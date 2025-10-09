% Test file to reproduce the clause finding bug with comments
:- object(test_clause_comments).

    :- public(next_state/3).

    % First clause
    next_state(State1, Move, State2) :-
        valid_move(State1, Move),
        apply_move(State1, Move, State2).

    % Comment between clauses - this should not stop consecutive clause detection
    % This is a comment that separates clauses

    % Second clause (after comment)
    next_state(State1, Move, State2) :-
        intermediate_state(State1, Intermediate),
        next_state(Intermediate, Move, State2).

    % Third clause with line comment after head
    next_state(State, _, State) :- % This is a line comment after the clause head
        goal_state(State).

    % Another comment block
    % Multiple lines of comments
    % Should not interfere with clause detection

    % Fourth clause
    next_state(State1, complex_move(X, Y), State2) :-
        complex_operation(State1, X, Y, State2).

    % Test case: clause head followed immediately by line comment
    next_state(special_case, special_move, special_result) :- % immediate comment
        special_operation.

    % Test case: Multi-line clause head with comment
    next_state(
        complex_state(X, Y, Z), % comment in multi-line head
        complex_move,
        result_state
    ) :-
        complex_processing(X, Y, Z).

    % Test case: Directive between clauses (might confuse parser)
    :- info(next_state/3, [comment is 'State transition predicate']).

    % Clause after directive
    next_state(after_directive, move, result) :-
        directive_test.

    /*
     * Block comment between clauses
     * This should also not interfere
     */
    next_state(after_block_comment, move, result) :-
        block_comment_test.

    % Test case: Clause with complex indentation
        next_state(indented_clause, move, result) :- % unusual indentation
            indented_body.

    % Different predicate to test boundary detection
    other_predicate(X) :-
        process(X).

:- end_object.
