% Test file for alias/2 directive formatting
% This file demonstrates various alias/2 directive patterns

:- object(test_alias_formatting).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test object for alias/2 directive formatting'
	]).

	% Simple alias/2 directive - should be formatted properly
	:- alias(list, [member/2 as list_member/2]).

	% Multiple aliases - should become multi-line
	:- alias(set, [member/2 as set_member/2, append/3 as set_append/3]).

	% Complex alias/2 directive with multiple predicate indicators
	:- alias(collection, [member/2 as collection_member/2, append/3 as collection_append/3, reverse/2 as collection_reverse/2]).

	% Alias directive with non-terminal indicators
	:- alias(words, [singular//0 as peculiar//0, plural//1 as strange//1]).

	% Mixed predicate and non-terminal aliases
	:- alias(mixed_library, [predicate/1 as lib_predicate/1, non_terminal//2 as lib_non_terminal//2, another_pred/3 as lib_another_pred/3]).

	% Single alias (should stay single line or become multi-line based on implementation)
	:- alias(single_library, [only_predicate/1 as lib_only_predicate/1]).

	% Empty alias list
	:- alias(empty_library, []).

	% Unindented alias directive to test formatting
:- alias(unindented_library, [pred1/1 as lib_pred1/1, pred2/2 as lib_pred2/2]).

	% Already properly formatted multi-line alias (should preserve formatting)
	:- alias(already_formatted, [
		predicate1/1 as formatted_predicate1/1,
		predicate2/2 as formatted_predicate2/2
	]).

	% Complex alias with long predicate names
	:- alias(complex_names, [very_long_predicate_name/3 as extremely_long_aliased_predicate_name/3, another_very_long_name/2 as yet_another_extremely_long_alias/2]).

	% Complex compound term as first argument (the bug case)
	:- alias(rectangle(_, _), [width/1 as side/1]).

	% Another complex compound term example
	:- alias(shape(Type, Size), [area/1 as shape_area/1, perimeter/1 as shape_perimeter/1]).

	% Compound term with nested structures
	:- alias(complex_structure(nested(deep)), [process/2 as complex_process/2]).

:- end_object.
