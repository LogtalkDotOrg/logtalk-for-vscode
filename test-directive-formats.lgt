% Test file for different directive formats
% This tests both predicate indicators and callable forms in directives
:- object(test_directive_formats).

    % alias/2 directives - ONLY use predicate indicators
    :- alias(list, [member/2 as list_member/2]).
    :- alias(set, [member/2 as set_member/2]).
    :- alias(words, [singular//0 as peculiar//0]).
    
    % uses/2 directives - can use BOTH predicate indicators AND callable forms
    :- uses(list, [append/3, member/2]).                    % predicate indicators
    :- uses(queues, [new/1 as new_queue/1]).               % predicate indicators with alias
    :- uses(library, [member(+term, ?list)]).              % callable form
    :- uses(utilities, [process(+input, -output)]).        % callable form
      
    % Multi-line directives with mixed formats
    :- uses(complex_library, [
        append/3,                                           % predicate indicator
        member/2,                                           % predicate indicator
        process(+input, -output),                           % callable form
        transform(+data, ?result)                           % callable form
    ]).
    
    % Multi-line alias directive (only indicators)
    :- alias(collection, [
        member/2 as collection_member/2,
        append/3 as collection_append/3
    ]).
    
    % Public interface
    :- public([
        test_member/2,
        test_append/3,
        test_process/2
    ]).
    
    % Test predicates that use the imported predicates
    test_member(Element, List) :-
        member(Element, List).
        
    test_append(List1, List2, Result) :-
        append(List1, List2, Result).
        
    test_process(Input, Output) :-
        process(Input, Output).

:- end_object.
