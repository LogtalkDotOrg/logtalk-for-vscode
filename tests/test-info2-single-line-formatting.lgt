% Test file for info/2 directive single-line formatting
% Tests that argnames and see_also use single-line format when they fit within ruler length

:- object(test_info2_single_line).

	:- public(short_args/3).
	:- info(short_args/3, [
		comment is 'Predicate with short argument names.',
		argnames is ['X','Y','Z']
	]).

	:- public(medium_args/4).
	:- info(medium_args/4, [
		comment is 'Predicate with medium length argument names.',
		argnames is ['Input','Output','Options','Result']
	]).

	:- public(long_args/5).
	:- info(long_args/5, [
		comment is 'Predicate with long argument names that should use multi-line format.',
		argnames is ['FirstParameter','SecondParameter','ThirdParameter','FourthParameter','FifthParameter']
	]).

	:- public(with_see_also_short/2).
	:- info(with_see_also_short/2, [
		comment is 'Predicate with short see_also list.',
		argnames is ['X','Y'],
		see_also is [foo/1,bar/2,baz/3]
	]).

	:- public(with_see_also_long/2).
	:- info(with_see_also_long/2, [
		comment is 'Predicate with long see_also list.',
		argnames is ['X','Y'],
		see_also is [very_long_predicate_name/3,another_long_predicate_name/4,yet_another_long_name/5,and_one_more/2]
	]).

	:- public(empty_lists/1).
	:- info(empty_lists/1, [
		comment is 'Predicate with empty argnames and see_also lists.',
		argnames is [],
		see_also is []
	]).

	:- public(single_element/1).
	:- info(single_element/1, [
		comment is 'Predicate with single element in lists.',
		argnames is ['X'],
		see_also is [helper/1]
	]).

:- end_object.

