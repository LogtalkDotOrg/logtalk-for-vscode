%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%
%  Comprehensive loader file showing various logtalk_load patterns
%  This file demonstrates all the different ways files can be referenced
%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% Pattern 1: Single file without quotes in a list
:- initialization((
	logtalk_load([example])
)).

% Pattern 2: Single file with single quotes
:- initialization((
	logtalk_load(['another_file'])
)).

% Pattern 3: Single file with double quotes
:- initialization((
	logtalk_load(["third_file"])
)).

% Pattern 4: Multiple files in a list with mixed quote styles
:- initialization((
	logtalk_load([
		example,
		'another_file',
		"third_file"
	])
)).

% Pattern 5: Files with explicit .lgt extension
:- initialization((
	logtalk_load([
		'example.lgt',
		"another_file.lgt"
	])
)).

% Pattern 6: Single file as direct argument (not in a list)
:- initialization((
	logtalk_load(example)
)).

% Pattern 7: Single file with quotes as direct argument
:- initialization((
	logtalk_load('example')
)).

% Pattern 8: logtalk_load/2 with compiler flags
:- initialization((
	logtalk_load([example, 'another_file'], [optimize(on)])
)).

% Pattern 9: Library notation (should NOT be affected by rename)
:- initialization((
	logtalk_load(lgtunit(loader))
)).

% Pattern 10: Mixed library and local files
:- initialization((
	logtalk_load([
		lgtunit(loader),
		example,
		'another_file'
	])
)).

