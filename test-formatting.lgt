% Test file for document formatting
% This file should be formatted by the DocumentFormattingEditProvider

:- object(test_formatting,
implements(some_protocol),
imports(some_category)).

:- info([
version is 1:0:0,
author is 'Test Author',
date is 2024-01-01,
comment is 'Test object for formatting'
]).

:- uses(list, [append/3, member/2, reverse/2]).

:- uses(complex_library, [
process(+input, -output),
transform(+data, ?result),
validate(+term)
]).

:- public([
test_predicate/1,
another_predicate/2
]).

test_predicate(X) :-
write('Testing: '), write(X), nl.

another_predicate(A, B) :-
append([A], [B], Result),
write(Result).

:- end_object.
