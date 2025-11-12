% Test file with .pl extension
% This should create an object named 'test_wrap_pl'

:- public(helper/1).

helper(X) :- X > 0.

process(X, Y) :-
    helper(X),
    Y is X * 2.

