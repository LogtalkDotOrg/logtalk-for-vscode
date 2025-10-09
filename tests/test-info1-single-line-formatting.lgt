% Test file for info/1 directive single-line formatting
% Tests that parnames and see_also use single-line format when they fit within ruler length

:- object(test_info1_single_line).

	:- info([
		version is 1:0:0,
		author is 'Paulo Moura',
		date is 2024-10-09,
		comment is 'Test object for info/1 single-line formatting.',
		parnames is ['X','Y','Z'],
		see_also is [foo/1,bar/2]
	]).

	:- public(short_params/3).
	:- info(short_params/3, [
		comment is 'Predicate with short parameter names that should fit on one line.',
		argnames is ['A','B','C']
	]).

	:- public(longer_params/5).
	:- info(longer_params/5, [
		comment is 'Predicate with more parameters that might need multi-line format.',
		argnames is ['FirstParameter','SecondParameter','ThirdParameter','FourthParameter','FifthParameter']
	]).

	:- public(medium_params/4).
	:- info(medium_params/4, [
		comment is 'Predicate with medium length parameter names.',
		argnames is ['Input','Output','Options','Result']
	]).

	:- public(see_also_short/1).
	:- info(see_also_short/1, [
		comment is 'Predicate with short see_also list.',
		argnames is ['X'],
		see_also is [foo/1,bar/2,baz/3]
	]).

	:- public(see_also_long/1).
	:- info(see_also_long/1, [
		comment is 'Predicate with long see_also list that should use multi-line format.',
		argnames is ['X'],
		see_also is [very_long_predicate_name/3,another_long_predicate_name/4,yet_another_long_name/5,and_one_more/2]
	]).

:- end_object.

