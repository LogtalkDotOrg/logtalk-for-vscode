% Test file for alias/2 directive predicate renaming
% This tests that predicate indicators in alias/2 directives are properly renamed

:- object(test_alias_rename).

    % Import predicates from other entities
    :- uses(list, [append/3, member/2]).
    
    % Create aliases for imported predicates
    :- alias(list, [member/2 as list_member/2]).
    :- alias(set, [member/2 as set_member/2]).
    :- alias(words, [singular//0 as peculiar//0]).
    
    % Public interface
    :- public([
        test_member/2,
        test_append/3
    ]).
    
    % Test predicate that uses the imported member/2
    test_member(Element, List) :-
        member(Element, List).
        
    % Test predicate that uses the imported append/3
    test_append(List1, List2, Result) :-
        append(List1, List2, Result).

:- end_object.
