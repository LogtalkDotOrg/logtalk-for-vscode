% Test file for list directive formatting
% This file demonstrates various list-based directive patterns

:- object(test_list_directives).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test object for list directive formatting'
	]).

	% uses/1 directive - should be formatted with multi-line list
	:- uses([list, set, queue]).

	% use_module/1 directive - should be formatted with multi-line list
	:- use_module([library(lists), library(apply), library(option)]).

	% use_module/2 directive - should be formatted with multi-line list like uses/2
	:- use_module(library(lists), [member/2, append/3, reverse/2]).

	% use_module/2 directive with complex module name
	:- use_module(library(clpfd), [ins/2, label/1, #=/2, #>/2]).

	% use_module/2 directive with single predicate
	:- use_module(library(debug), [debug/2]).

	% public/1 directive with list - should be formatted with multi-line list
	:- public([member/2, append/3, reverse/2]).

	% protected/1 directive with list - should be formatted with multi-line list
	:- protected([helper_predicate/1, utility_function/2]).

	% private/1 directive with list - should be formatted with multi-line list
	:- private([internal_state/1, cache_data/2, cleanup/0]).

	% discontiguous/1 directive with list - should be formatted with multi-line list
	:- discontiguous([process/2, validate/1, transform/3]).

	% dynamic/1 directive with list - should be formatted with multi-line list
	:- dynamic([counter/1, cache/2, temporary_data/3]).

	% coinductive/1 directive with list - should be formatted with multi-line list
	:- coinductive([infinite_stream/1, lazy_list/2]).

	% multifile/1 directive with list - should be formatted with multi-line list
	:- multifile([hook_predicate/2, extension_point/1, callback/3]).

	% synchronized/1 directive with list - should be formatted with multi-line list
	:- synchronized([thread_safe_counter/1, shared_resource/2]).

	% Single element lists - should still become multi-line for consistency
	:- uses([single_library]).
	:- public([single_predicate/1]).
	:- dynamic([single_fact/1]).

	% Empty lists - should stay single line
	:- uses([]).
	:- public([]).
	:- private([]).

	% Complex predicate indicators with modes
	:- public([complex_predicate(+Type, -Result, ?Optional)]).
	:- protected([mode_predicate(++Input, --Output)]).

	% Mixed predicate and non-terminal indicators
	:- public([predicate/2, non_terminal//1, another_pred/3]).

	% Long predicate names that might wrap
	:- public([very_long_predicate_name_that_might_cause_wrapping/3, another_very_long_name/2]).

	% Unindented directives to test formatting
:- uses([unindented_library]).
:- public([unindented_predicate/1]).

	% Already properly formatted multi-line directive (should preserve formatting)
	:- dynamic([
		already_formatted_predicate/1,
		another_formatted_predicate/2
	]).

:- end_object.
