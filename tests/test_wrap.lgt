% Test file for wrap as object refactoring
% This file has no entity or module directives

:- public(foo/1).

foo(bar).
foo(baz).

:- public(test/0).

test :-
    foo(X),
    write(X), nl.

