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


% Test 7: Module with comments in export list
:- module(console_view, [
    % Input
    read_answer/2,
    read_term_line/1,
    read_domain_name/1,
    read_yes_no/1,

    % Output - prompts
    show_prompt/1,
    show_parameter_prompt/2,
    show_root_context_prompt/0,
    show_prompt1/1,
    show_prompt2/1,
    show_prompt3/1,

    % Output - context
    show_context_header/2,

    % Output - results
    show_results/1,
    show_hypothesis_list/1,
    show_goal_result/2,
    show_no_goal_message/0,

    % Output - messages
    show_message/1,
    show_error/1,
    show_newline/0,
    show_separator/0
]).

read_answer(Prompt, Answer) :-
    write(Prompt),
    read(Answer).

read_term_line(Term) :-
    read(Term).

read_domain_name(Name) :-
    read(Name).

read_yes_no(Answer) :-
    read(Answer).

show_prompt(Prompt) :-
    write(Prompt).

show_parameter_prompt(Name, Value) :-
    format('~w: ~w~n', [Name, Value]).

show_root_context_prompt :-
    write('> ').

show_prompt1(P) :- write(P).
show_prompt2(P) :- write(P).
show_prompt3(P) :- write(P).

show_context_header(Context, Level) :-
    format('~w [~w]~n', [Context, Level]).

show_results(Results) :-
    write(Results), nl.

show_hypothesis_list(List) :-
    write(List), nl.

show_goal_result(Goal, Result) :-
    format('~w: ~w~n', [Goal, Result]).

show_no_goal_message :-
    write('No goal'), nl.

show_message(Msg) :-
    write(Msg), nl.

show_error(Err) :-
    write('Error: '), write(Err), nl.

show_newline :-
    nl.

show_separator :-
    write('---'), nl.


% Test 8: Module with trailing comments on exports
:- module(trailing_comments_module, [
    predicate_a/1, % This is predicate A
    predicate_b/2, % This handles B
    predicate_c/0  % No arguments here
]).

predicate_a(X) :- X > 0.
predicate_b(X, Y) :- Y is X + 1.
predicate_c.

