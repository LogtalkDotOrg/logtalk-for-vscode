:- object(extension_resolution_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for include directive extension resolution'
	]).

	% Test case 1: Include with explicit .lgt extension (should work directly)
	:- include('helper_predicates.lgt').

	% Test case 2: Include without extension - should find helper_no_extension file
	% The system should try .lgt, .logtalk, .pl, .prolog extensions
	:- include('helper_no_extension').

	% Test case 3: Include without extension - should find prolog_helper.pl
	% The system should try extensions and find the .pl file
	:- include('prolog_helper').

	% Test case 4: Include with relative path and no extension
	:- include('./helper_no_extension').

	% Test case 5: Include that should fail - no file with any extension
	% This should show an error message when attempted
	:- include('non_existent_helper').

	% Test case 6: Indented include without extension
		:- include('helper_no_extension').

	% Test case 7: Extension priority test - should find .lgt over .pl
	:- include('priority_test').

	% Main predicate that would use the included helpers
	test_all_helpers :-
		% From helper_predicates.lgt
		reverse_string('test', Reversed),
		write('Reversed: '), write(Reversed), nl,
		
		% From helper_no_extension (no extension)
		double(5, Double),
		write('Double of 5: '), write(Double), nl,
		
		% From prolog_helper.pl
		power(2, 3, Power),
		write('2^3 = '), write(Power), nl.

	test_extension_resolution :-
		% Test predicates from files found via extension resolution
		triple(4, Twelve),
		write('Triple of 4: '), write(Twelve), nl,
		
		is_even(6),
		write('6 is even'), nl,
		
		first_element([a, b, c], First),
		write('First element: '), write(First), nl.

:- end_object.

% Instructions for testing extension resolution:
% 1. Place cursor on any of the include directive lines above
% 2. Use "Replace include/1 directive with file contents" action
% 3. The system should:
%    - For 'helper_predicates.lgt': Use the file directly (has extension)
%    - For 'helper_no_extension': Find the file without extension
%    - For 'prolog_helper': Find prolog_helper.pl (trying .pl extension)
%    - For 'priority_test': Find priority_test.lgt (prefer .lgt over .pl)
%    - For 'non_existent_helper': Show error (no file found with any extension)
%
% Extension resolution priority order:
% 1. Exact file path (if extension provided and file exists)
% 2. File without extension (if no extension provided and file exists as-is)
% 3. File with .lgt extension
% 4. File with .logtalk extension
% 5. File with .pl extension
% 6. File with .prolog extension
