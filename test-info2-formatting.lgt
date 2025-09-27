% Test file for info/2 directive formatting
% This file demonstrates the formatting of predicate-specific info directives

:- object(test_info2_formatting).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Test object for info/2 directive formatting'
	]).

	:- public([
		simple_predicate/1,
		complex_predicate/3,
		predicate_with_examples/2
	]).

	% Simple info/2 directive - should be formatted properly
	:- info(simple_predicate/1, [
		comment is 'A simple predicate for testing',
		argnames is ['Input']
	]).

	% Complex info/2 directive with arguments, exceptions, and examples
	:- info(complex_predicate/3, [
comment is 'A complex predicate with detailed documentation',
argnames is ['Input', 'Options', 'Result'],
arguments is ['Input'-'The input data to process', 'Options'-'Processing options', 'Result'-'The processed result'],
exceptions is [type_error(atom, Input), domain_error(positive_integer, Options)],
examples is ['complex_predicate(data, [option1], result) - Basic usage', 'complex_predicate([], [], []) - Empty case']
]).

	% Another info/2 directive with single-element lists
	:- info(predicate_with_examples/2, [
		comment is 'Predicate with example usage',
		argnames is ['Data', 'Output'],
		arguments is ['Data'-'Input data'],
		examples is ['predicate_with_examples(test, result) - Simple test case']
	]).

	% Unindented info/2 directive to test formatting
:- info(unindented_predicate/0, [
comment is 'This directive is not properly indented',
argnames is []
]).

	simple_predicate(Input) :-
		write('Processing: '), write(Input), nl.

	complex_predicate(Input, Options, Result) :-
		% Complex processing logic here
		Result = processed(Input, Options).

	predicate_with_examples(Data, Output) :-
		Output = processed(Data).

	unindented_predicate :-
		write('This predicate was unindented').

:- end_object.
