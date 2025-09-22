:- object(comment_handling_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for include directive comment handling'
	]).

	% Test case 1: Include directive with comments before it
	% This is a comment line
	% Another comment line
	:- include('helper_predicates.lgt').

	% Test case 2: Multi-line selection with comments and include
	% Select from this line down to the line after the include
	% Comment before include
	% :- include('commented_out.lgt').  % This should be ignored (commented)
	:- include('helper_no_extension').  % This should be found
	% Comment after include

	% Test case 3: Include directive with inline comment
	:- include('prolog_helper'). % This include should work

	% Test case 4: Multiple includes with comments
	% First include:
	:- include('helper_predicates.lgt').
	% Second include (commented out):
	% :- include('should_be_ignored.lgt').
	% Third include:
	:- include('priority_test').

	% Test case 5: Indented include with comments
		% Indented comment
		:- include('helper_no_extension').

	% Test case 6: Mixed content selection
	some_predicate(X) :-
		% Comment in predicate
		X > 0,
		% Include directive in the middle of selection
		:- include('helper_predicates.lgt'),
		write(X).

	% Main predicate
	test_comment_handling :-
		write('Testing comment handling in include directives'), nl.

:- end_object.

% Instructions for testing comment handling:
% 1. Select multiple lines that include comments and an include directive
% 2. The system should:
%    - Skip commented lines when looking for include directives
%    - Find the actual include directive even if comments are present
%    - Ignore commented-out include directives (lines starting with %)
% 3. Try selecting from line 11 to line 18 (includes comments and include)
% 4. Try selecting from line 20 to line 25 (includes commented include and real include)
