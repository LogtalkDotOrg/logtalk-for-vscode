%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%
%  Test file for logtalk_load Go to Definition feature
%
%  Instructions:
%  1. Open this file in VS Code
%  2. Right-click on any file name in the logtalk_load calls below
%  3. Select "Go to Definition" (or press F12 / Ctrl+Click / Cmd+Click)
%  4. The extension should open the corresponding file
%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

:- object(loader_test).

	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2026-01-22,
		comment is 'Test object for logtalk_load Go to Definition feature.'
	]).

	:- public(test_patterns/0).
	test_patterns.

:- end_object.

% Pattern 1: Single unquoted atom
:- initialization((
	logtalk_load(example_file)
)).

% Pattern 2: Single quoted atom
:- initialization((
	logtalk_load('quoted_file')
)).

% Pattern 3: List of unquoted atoms
:- initialization((
	logtalk_load([
		example_file,
		another_file
	])
)).

% Pattern 4: List of quoted atoms
:- initialization((
	logtalk_load([
		'quoted_file',
		'another_file'
	])
)).

% Pattern 5: logtalk_load/2 with options
:- initialization((
	logtalk_load([example_file, another_file], [optimize(on)])
)).

% Pattern 6: Compound terms (should NOT trigger Go to Definition for file)
% Right-clicking on "library" or "lgtunit" should NOT try to open a file
:- initialization((
	logtalk_load(library(types))
)).

:- initialization((
	logtalk_load(lgtunit(loader))
)).

% Pattern 7: Mixed list with compound terms and atoms
% Only atoms should trigger Go to Definition, not compound terms
:- initialization((
	logtalk_load([
		library(types),
		example_file,
		lgtunit(loader),
		another_file
	])
)).

% Pattern 8: File with explicit extension
:- initialization((
	logtalk_load('example_file.lgt')
)).

% Pattern 9: File in subdirectory (relative path)
:- initialization((
	logtalk_load('subdir/nested_file')
)).

