% Test file for rename functionality

:- object(test_object).

    % Directive declarations (predicate names should be renamed here)
    % These are the DECLARATION locations that should be included in rename
    :- public(hello_world/0).
    :- mode(hello_world, one).
    :- info(hello_world/0, [comment is 'A test predicate']).

    :- public(hello_world/1).
    :- mode(hello_world(+atom), one).
    :- info(hello_world/1, [
        comment is 'A test predicate with argument',
        argnames is ['Name']
    ]).

    % Multi-line directive example
    :- public([
        hello_world/2,
        another_predicate/1
    ]).
    :- mode(hello_world(+atom, +integer), one).
    :- info(hello_world/2, [comment is 'Multi-arg predicate']).

    :- private(hello_world/3).
    :- meta_predicate(hello_world).
    :- public('special name'/0).

    % A simple predicate to test renaming
    hello_world :-
        write('Hello, World!').

    % Another clause for the same predicate
    hello_world :-
        write('Greetings!').

    % A predicate that calls hello_world
    greet :-
        hello_world.

    % A predicate with arguments (multiple clauses)
    hello_world(Name) :-
        write('Hello, '), write(Name), write('!').

    % Additional clause for hello_world/1
    hello_world(stranger) :-
        write('Hello, stranger!').

    % Another clause for hello_world/1
    hello_world(friend) :-
        write('Hello, my friend!').

    % Comment separating clauses - should not stop consecutive clause detection
    % This is just a comment between clauses

    % Yet another clause for hello_world/1 (after comments)
    hello_world(colleague) :-
        write('Hello, colleague!').

    % Test case similar to bridge.lgt next_state/2 predicate
    % This should test the recursive case that's being missed
    :- public(next_state/2).
    :- mode(next_state(+nonvar, -nonvar), zero_or_more).  % ← Test mode directive renaming
    :- info(next_state/2, [comment is 'State transition predicate']).  % ← Test info directive renaming

    next_state(State1, State2) :-
        valid_move(State1, Move),
        apply_move(State1, Move, State2).

    next_state(State1, State2) :-
        intermediate_state(State1, Intermediate),
        next_state(Intermediate, State2).  % ← Recursive call (third clause)

    next_state(State, State) :-
        goal_state(State).

    % A rule that uses hello_world/1
    greet_person(Person) :-
        hello_world(Person).

    % Complex calls with hello_world
    test_complex :-
        (hello_world -> true ; fail),
        hello_world,
        call(hello_world).

    % Recursive predicate (predicate calls itself in body)
    hello_world(0) :-
        write('Base case').

    hello_world(N) :-
        N > 0,
        write('Counting: '), write(N), nl,
        N1 is N - 1,
        hello_world(N1).  % ← Recursive call in body (should be renamed)

    % Mutually recursive predicates
    hello_world(even, N) :-
        N mod 2 =:= 0,
        hello_world(odd, N).  % ← Call in body (should be renamed)

    hello_world(odd, N) :-
        N mod 2 =:= 1,
        hello_world(even, N). % ← Call in body (should be renamed)

    % A quoted atom predicate
    'special name' :-
        write('This is a special predicate').

    % Using the quoted predicate
    test_special :-
        'special name'.

    % Test with quoted predicate in complex expressions
    test_quoted_complex :-
        ('special name' -> true ; fail),
        call('special name').

    % Test predicate in comments (should NOT be renamed)
    test_comments :-
        write('This mentions hello_world in a comment'), % hello_world here
        hello_world. % but this hello_world should be renamed

    % Test predicate in strings (should NOT be renamed)
    test_strings :-
        write("This string contains hello_world"),
        hello_world. % but this should be renamed

:- end_object.
