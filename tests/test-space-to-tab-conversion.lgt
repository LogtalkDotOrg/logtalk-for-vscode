% Test file for space-to-tab conversion
% This file uses spaces for indentation that should be converted to tabs

:- object(test_space_conversion).

    :- info([
        version is 1:0:0,
        author is 'Test Author',
        comment is 'Test object with space indentation'
    ]).

    % This predicate uses 4 spaces for indentation
    :- public([test_predicate/1, another_predicate/2]).

    % This uses 8 spaces (should become 2 tabs)
        :- private([helper_predicate/1]).

    % Mixed indentation - some tabs, some spaces
	    :- dynamic([mixed_indentation/1]).

    % Tab followed by 4 spaces (should become 2 tabs with tabSize=4)
	    :- uses([library_with_tab_and_spaces]).

    % Tab followed by 8 spaces (should become 3 tabs with tabSize=4)
	        :- multifile([tab_plus_eight_spaces/1]).

    % Predicate with space indentation
    test_predicate(Value) :-
        % 8 spaces - should become 2 tabs
        Value > 0,
        % 12 spaces - should become 3 tabs  
            helper_predicate(Value).

    % Another predicate with different space levels
    another_predicate(Input, Output) :-
        % 4 spaces
        process_input(Input, Temp),
        % 8 spaces
        validate_temp(Temp),
        % 4 spaces
        Output = Temp.

    % Helper predicate with mixed indentation
    helper_predicate(X) :-
	% Tab + 4 spaces - should normalize
	    X > 0.

    % Predicate with inconsistent spacing
    process_input(In, Out) :-
      % 2 spaces - should become 1 tab (rounded down)
      Out = In.

    % Predicate with many spaces
    validate_temp(Temp) :-
                % 16 spaces - should become 4 tabs
                Temp \= [].

    % Comments with space indentation
    % This is a comment with 4 spaces
        % This comment has 8 spaces
            % This comment has 12 spaces

    % Directive with space indentation
    :- uses([
        library1,
        library2
    ]).

:- end_object.
