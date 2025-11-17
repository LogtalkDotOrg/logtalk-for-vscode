%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%
%  Test file for "Sort files by dependencies" refactoring
%
%  This file demonstrates the new refactoring feature that sorts files
%  in logtalk_load/1-2 calls based on their dependencies.
%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

:- object(test_sort_files).

	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Test object for sort files by dependencies refactoring.'
	]).

	:- public(test_load/0).
	:- info(test_load/0, [
		comment is 'Test loading files with dependencies.'
	]).

	test_load :-
		% Right-click on the list below and select "Sort files by dependencies"
		% The list should contain 2 or more atoms (no compound terms)
		logtalk_load([
			file3,
			file1,
			file2
		]).

	:- public(test_load_with_options/0).
	:- info(test_load_with_options/0, [
		comment is 'Test loading files with options.'
	]).

	test_load_with_options :-
		% This also works with logtalk_load/2
		logtalk_load([
			file3,
			file1,
			file2
		], [optimize(on)]).

	:- public(test_invalid_compound/0).
	:- info(test_invalid_compound/0, [
		comment is 'This should NOT show the refactoring (contains compound term).'
	]).

	test_invalid_compound :-
		% This should NOT show the refactoring because it contains a compound term
		logtalk_load([
			file1,
			library(file2),
			file3
		]).

	:- public(test_single_file/0).
	:- info(test_single_file/0, [
		comment is 'This should NOT show the refactoring (only one file).'
	]).

	test_single_file :-
		% This should NOT show the refactoring because it has only one file
		logtalk_load([file1]).

:- end_object.

