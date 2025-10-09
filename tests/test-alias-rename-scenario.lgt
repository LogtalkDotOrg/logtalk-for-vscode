% Test file for alias/2 directive predicate renaming
% This tests the fix for predicate indicators in directive contexts
:- object(test_alias_rename).

    % Import predicates from other entities
    :- uses(list, [append/3, member/2]).

    % Create aliases for imported predicates (these should be renamed)
    :- alias(list, [member/2 as list_member/2]).
    :- alias(set, [member/2 as set_member/2]).
    :- alias(words, [singular//0 as peculiar//0]).

    % Multi-line directive test (these should be renamed)
    :- alias(collection, [
        member/2 as collection_member/2,
        append/3 as collection_append/3
    ]).

    % Public interface
    :- public([
        test_member/2,
        test_append/3
    ]).

    % Test predicate that uses the imported member/2 (this should be renamed)
    test_member(Element, List) :-
        member(Element, List).

    % Test predicate that uses the imported append/3
    test_append(List1, List2, Result) :-
        append(List1, List2, Result).

:- end_object.