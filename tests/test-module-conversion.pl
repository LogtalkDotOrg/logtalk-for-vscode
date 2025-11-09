% Test file for module to object conversion
% This file demonstrates various module conversion scenarios

% Test 1: Simple module/1 directive (no exports)
:- module(simple_module).

% Some predicates
helper(X) :- X > 0.

process(X, Y) :-
    helper(X),
    Y is X * 2.


% Test 2: module/2 directive with exported predicates
:- module(exported_module, [
    public_pred/1,
    another_pred/2
]).

% Public predicates
public_pred(X) :- X > 0.

another_pred(X, Y) :- Y is X + 1.

% Private helper
private_helper(X) :- X < 100.


% Test 3: Multi-line module/2 directive
:- module(multiline_module,
    [
        foo/1,
        bar/2,
        baz/3
    ]).

foo(a).
foo(b).

bar(X, Y) :- Y is X * 2.

baz(X, Y, Z) :- Z is X + Y.


% Test 4: Module with export/1 directives
:- module(export_directive_module).

:- export([
    exported_pred/1,
    another_export/2
]).

:- export(single_export/3).

exported_pred(X) :- X > 0.

another_export(X, Y) :- Y is X + 1.

single_export(X, Y, Z) :- Z is X + Y.

% Private predicate
private_pred(X) :- X < 100.


% Test 5: Module with both module/2 and export/1 directives
:- module(mixed_exports, [initial_export/1]).

:- export(additional_export/2).

initial_export(X) :- X > 0.

additional_export(X, Y) :- Y is X + 1.


% Test 6: Module with reexport/2 directives
:- module(reexport_module).

:- reexport(library(lists), [
    append/3,
    member/2
]).

:- reexport(library(sets), [
    intersection/3,
    union/3
]).

local_pred(X) :- X > 0.

