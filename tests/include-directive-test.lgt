:- object(include_test).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test file for include directive handling in refactoring'
	]).

	% Test case 1: Selection with include directive should NOT show extract actions
	% Select the following lines (including the include directive):
	:- include('helper_predicates.lgt').
	
	helper_predicate(Input, Output) :-
		atom_codes(Input, Codes),
		reverse(Codes, ReversedCodes),
		atom_codes(Output, ReversedCodes).

	% Test case 2: Selection without include directive SHOULD show extract actions
	% Select the following lines (no include directive):
	another_helper(List, Length) :-
		length(List, Length).

	utility_function(X, Y) :-
		X > 0,
		Y is X * 2.

	% Test case 3: Selection with include directive in the middle should NOT show extract actions
	% Select from "process_data" to "end_processing":
	process_data(Data, Result) :-
		validate_data(Data),
		:- include('processing_rules.lgt').
		apply_rules(Data, Result).

	end_processing.

	% Test case 4: Selection with multiple include directives should NOT show extract actions
	% Select the following block:
	:- include('constants.lgt').
	:- include('utilities.lgt').
	
	complex_operation(Input, Output) :-
		preprocess(Input, Temp),
		transform(Temp, Output).

:- end_object.
