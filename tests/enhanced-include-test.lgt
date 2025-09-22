:- object(enhanced_include_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Comprehensive test for enhanced include directive handling'
	]).

	% ========================================================================
	% SECTION 1: Comment Handling Tests
	% ========================================================================

	% Test 1a: Include with comments before (select lines 15-18)
	% This is a comment
	% Another comment
	:- include('helper_predicates.lgt').

	% Test 1b: Commented include should be ignored (select lines 20-23)
	% Comment line
	% :- include('should_be_ignored.lgt').  % This is commented out
	:- include('helper_no_extension').     % This should be found

	% Test 1c: Multiple comments and includes (select lines 25-30)
	% First comment
	% :- include('ignored1.lgt').  % Commented include
	% Second comment  
	:- include('prolog_helper').  % Real include
	% Final comment

	% ========================================================================
	% SECTION 2: Multi-line Selection Tests
	% ========================================================================

	% Test 2a: Multi-line selection with mixed content (select lines 35-42)
	some_predicate(X, Y) :-
		% Comment inside predicate
		X > 0,
		% Include directive in middle of predicate
		:- include('helper_predicates.lgt'),
		Y is X * 2,
		write(Y).

	% Test 2b: Multiple includes in selection (select lines 44-50)
	% First include:
	:- include('helper_no_extension').
	
	some_other_predicate :-
		write('Between includes').
	
	% Second include:
	:- include('priority_test').

	% ========================================================================
	% SECTION 3: Extension Resolution Tests
	% ========================================================================

	% Test 3a: File without extension (should find helper_no_extension)
	:- include('helper_no_extension').

	% Test 3b: File with .pl extension (should find prolog_helper.pl)
	:- include('prolog_helper').

	% Test 3c: Priority test (should find .lgt over .pl)
	:- include('priority_test').

	% Test 3d: Explicit extension (should use directly)
	:- include('helper_predicates.lgt').

	% ========================================================================
	% SECTION 4: Indentation Tests
	% ========================================================================

	% Test 4a: Various indentation levels
		:- include('helper_no_extension').      % 1 tab
	    :- include('prolog_helper').            % 4 spaces
	  :- include('priority_test').              % 2 spaces

	% Test 4b: Deeply indented
			:- include('helper_predicates.lgt').    % 3 tabs

	% ========================================================================
	% SECTION 5: Error Handling Tests
	% ========================================================================

	% Test 5a: Non-existent file (should show error)
	:- include('non_existent_file').

	% Test 5b: Invalid syntax (should show parse error)
	% :- include(unquoted_file).  % This would be invalid if uncommented

	% ========================================================================
	% SECTION 6: Edge Cases
	% ========================================================================

	% Test 6a: Include with extra spaces
	:- include(  'helper_predicates.lgt'  ).

	% Test 6b: Include with no space after :-
	:-include('helper_no_extension').

	% Test 6c: Include with mixed quotes (if both files exist)
	:- include("helper_predicates.lgt").

	% Main test predicate
	test_all_functionality :-
		write('Testing enhanced include directive functionality'), nl,
		write('- Comment handling: Skip commented lines'), nl,
		write('- Multi-line selection: Find includes in selections'), nl,
		write('- Extension resolution: Try .lgt, .logtalk, .pl, .prolog'), nl,
		write('- Indentation preservation: Maintain original indentation'), nl,
		write('- Error handling: Report missing files and parse errors'), nl.

:- end_object.

% ========================================================================
% TESTING INSTRUCTIONS
% ========================================================================
%
% 1. COMMENT HANDLING:
%    - Select lines 15-18: Should find include, skip comments
%    - Select lines 20-23: Should find real include, ignore commented one
%    - Select lines 25-30: Should find real include among comments
%
% 2. MULTI-LINE SELECTIONS:
%    - Select lines 35-42: Should find include in middle of predicate
%    - Select lines 44-50: Should find first include in selection
%
% 3. EXTENSION RESOLUTION:
%    - Place cursor on line 55: Should find helper_no_extension (no ext)
%    - Place cursor on line 58: Should find prolog_helper.pl
%    - Place cursor on line 61: Should find priority_test.lgt (not .pl)
%    - Place cursor on line 64: Should use helper_predicates.lgt directly
%
% 4. INDENTATION:
%    - Test various indentation levels (lines 69-75)
%    - Verify indentation is preserved in replaced content
%
% 5. ERROR HANDLING:
%    - Place cursor on line 80: Should show "file not found" error
%
% 6. EDGE CASES:
%    - Test various spacing and quote styles (lines 87-93)
