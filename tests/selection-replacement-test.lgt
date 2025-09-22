:- object(selection_replacement_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for whole selection replacement (not just include line)'
	]).

	% ========================================================================
	% SECTION 1: Single Line Replacements
	% ========================================================================

	% Test 1a: Select only line 15 (just the include directive)
	:- include('helper_predicates.lgt').

	% Test 1b: Select only line 17 (indented include directive)
		:- include('helper_no_extension').

	% ========================================================================
	% SECTION 2: Multi-line Replacements with Comments
	% ========================================================================

	% Test 2a: Select lines 23-25 (comment + include + comment)
	% This comment should be replaced
	:- include('prolog_helper').
	% This comment should also be replaced

	% Test 2b: Select lines 27-31 (multiple comments + include)
	% First comment to be replaced
	% Second comment to be replaced
	:- include('priority_test').
	% Third comment to be replaced
	% Fourth comment to be replaced

	% Test 2c: Select lines 33-37 (indented comments + include)
		% Indented comment before
		% Another indented comment
		:- include('helper_predicates.lgt').
		% Indented comment after
		% Final indented comment

	% ========================================================================
	% SECTION 3: Replacements with Empty Lines
	% ========================================================================

	% Test 3a: Select lines 42-46 (empty lines + comments + include)
	
	% Comment with empty lines
	:- include('helper_no_extension').
	% Another comment
	

	% Test 3b: Select lines 48-53 (mixed empty lines and comments)
	
	% First comment
	
	:- include('prolog_helper').
	
	% Last comment

	% ========================================================================
	% SECTION 4: Indentation Preservation Tests
	% ========================================================================

	% Test 4a: Select lines 58-60 (2-space indentation)
	  % Two-space indented comment
	  :- include('priority_test').
	  % Another two-space comment

	% Test 4b: Select lines 62-64 (4-space indentation)
	    % Four-space indented comment
	    :- include('helper_predicates.lgt').
	    % Another four-space comment

	% Test 4c: Select lines 66-68 (tab indentation)
		% Tab-indented comment
		:- include('helper_no_extension').
		% Another tab-indented comment

	% Test 4d: Select lines 70-72 (mixed indentation - include line determines base)
	  % Two spaces
		:- include('prolog_helper').  % Tab here - this determines indentation
	    % Four spaces

	% ========================================================================
	% SECTION 5: Edge Cases
	% ========================================================================

	% Test 5a: Select lines 78-82 (large comment block + include)
	% ========================================
	% This is a large comment block that
	% spans multiple lines and should be
	% completely replaced along with the include
	% ========================================
	:- include('priority_test').

	% Test 5b: Select lines 84-88 (include at start of selection)
	:- include('helper_predicates.lgt').
	% Comment after include
	% Another comment after
	% Yet another comment
	% Final comment in selection

	% Test 5c: Select lines 90-94 (include at end of selection)
	% Comment before include
	% Another comment before
	% Yet another comment before
	% Final comment before
	:- include('helper_no_extension').

	% Main test predicate
	test_selection_replacement :-
		write('Testing whole selection replacement:'), nl,
		write('- Entire selection replaced, not just include line'), nl,
		write('- Comments and empty lines in selection are removed'), nl,
		write('- Indentation preserved from include directive line'), nl,
		write('- File contents inherit the include line indentation'), nl.

:- end_object.

% ========================================================================
% EXPECTED BEHAVIOR AFTER REPLACEMENT
% ========================================================================
%
% When you select any of the test ranges above and use "Replace include/1 
% directive with file contents", the ENTIRE selection should be replaced
% with the contents of the included file, not just the line containing
% the include directive.
%
% EXAMPLES:
%
% Before (selecting lines 23-25):
%   % This comment should be replaced
%   :- include('prolog_helper').
%   % This comment should also be replaced
%
% After replacement:
%   power(_, 0, 1) :- !.
%   power(Base, Exp, Result) :-
%       Exp > 0,
%       [... rest of prolog_helper.pl contents ...]
%
% Before (selecting lines 58-60 with 2-space indentation):
%     % Two-space indented comment
%     :- include('priority_test').
%     % Another two-space comment
%
% After replacement (contents indented with 2 spaces):
%     priority_predicate_lgt :-
%         write('Found the .lgt version'), nl.
%
% KEY POINTS:
% 1. Whole selection is replaced (comments disappear)
% 2. File contents inherit indentation from include directive line
% 3. No trace of original comments or empty lines in selection
% 4. Clean replacement with properly indented file contents
