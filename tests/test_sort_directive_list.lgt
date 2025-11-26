% Test file for "Sort predicates/non-terminals" refactoring operation
% This file contains examples of uses/2, use_module/2, and alias/2 directives
% that can be sorted using the new refactoring operation

:- object(test_sort_directive_list).

	% Example 1: Single-line uses/2 directive (unsorted)
	:- uses(list, [reverse/2, member/2, append/3, length/2]).

	% Example 2: Multi-line uses/2 directive (unsorted)
	:- uses(logtalk, [
		print_message/3,
		ask_question/5,
		message_hook/4,
		print_message/2
	]).

	% Example 3: Single-line use_module/2 directive (unsorted)
	:- use_module(library(lists), [reverse/2, member/2, append/3, length/2]).

	% Example 4: Multi-line use_module/2 directive (unsorted)
	:- use_module(library(system), [
		shell/1,
		file_exists/1,
		delete_file/1,
		copy_file/2
	]).

	% Example 5: Single-line alias/2 directive (unsorted)
	:- alias(list, [reverse/2 as list_reverse/2, member/2 as list_member/2, append/3 as list_append/3]).

	% Example 6: Multi-line alias/2 directive (unsorted)
	:- alias(logtalk, [
		print_message/3 as log_message/3,
		ask_question/5 as log_question/5,
		message_hook/4 as log_hook/4,
		print_message/2 as log_msg/2
	]).

	% Example 7: uses/2 with callable forms (mode annotations)
	:- uses(list, [
		reverse(+list, ?list),
		member(?term, ?list),
		append(?list, ?list, ?list),
		length(?list, ?integer)
	]).

	% Example 8: uses/2 with non-terminals (DCG rules)
	:- uses(parser, [
		whitespace//0,
		identifier//1,
		expression//1,
		digit//1
	]).

	% Example 9: Mixed predicates and non-terminals
	:- uses(utilities, [
		write_term//2,
		read_term/2,
		parse//1,
		format/2
	]).

	% Example 10: uses/2 with aliases (unsorted)
	:- uses(list, [
		reverse/2 as rev/2,
		member/2 as elem/2,
		append/3 as concat/3,
		length/2 as size/2
	]).

	% Example 11: use_module/2 with aliases (single-line, unsorted)
	:- use_module(library(lists), [reverse/2 as rev/2, member/2 as elem/2, append/3 as concat/3]).

	% Example 12: use_module/2 with aliases (multi-line, unsorted)
	:- use_module(library(system), [
		shell/1 as exec/1,
		file_exists/1 as exists/1,
		delete_file/1 as remove/1,
		copy_file/2 as cp/2
	]).

	% Example 13: use_module/2 with mixed aliases and non-aliases (unsorted)
	:- use_module(library(lists), [
		reverse/2,
		member/2 as elem/2,
		append/3,
		length/2 as size/2
	]).

	% Example 14: Single-line public/1 directive (unsorted)
	:- public([reverse/2, member/2, append/3, length/2]).

	% Example 15: Multi-line public/1 directive (unsorted)
	:- public([
		reverse/2,
		member/2,
		append/3,
		length/2
	]).

	% Example 16: Single-line protected/1 directive (unsorted)
	:- protected([validate/1, process/2, cleanup/0, initialize/1]).

	% Example 17: Multi-line private/1 directive (unsorted)
	:- private([
		internal_state/1,
		helper_predicate/2,
		cache_data/3,
		auxiliary_check/1
	]).

	% Example 18: Single-line dynamic/1 directive (unsorted)
	:- dynamic([counter/1, state/2, flag/1, cache/3]).

	% Example 19: Multi-line discontiguous/1 directive (unsorted)
	:- discontiguous([
		rule/2,
		fact/1,
		clause/3,
		axiom/2
	]).

	% Example 20: Single-line multifile/1 directive (unsorted)
	:- multifile([hook/2, extension/1, callback/3, handler/2]).

	% Example 21: Multi-line synchronized/1 directive (unsorted)
	:- synchronized([
		write_data/2,
		read_data/1,
		update_state/2,
		access_resource/1
	]).

	% Example 22: Single-line coinductive/1 directive (unsorted)
	:- coinductive([stream/1, infinite_list/1, lazy_eval/2, codata/1]).

	% Example 23: public/1 with non-terminals (unsorted)
	:- public([
		parse//1,
		expression//2,
		digit//0,
		whitespace//0
	]).

	% Example 24: dynamic/1 with mixed predicates and non-terminals (unsorted)
	:- dynamic([
		state/1,
		buffer//1,
		counter/2,
		stream//0
	]).

:- end_object.

