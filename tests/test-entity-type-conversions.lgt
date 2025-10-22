% Test file for entity type conversion refactorings
% This file demonstrates various entity type conversion scenarios

% Test 1: Object to protocol conversion (single argument)
:- object(simple_object).
	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Simple object for testing conversion to protocol'
	]).

	:- public(test_predicate/1).
	:- mode(test_predicate(+atom), one).
:- end_object.

% Test 2: Object to category conversion (with imports)
:- object(object_with_imports,
	imports(some_category)).
	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Object with imports for testing conversion to category'
	]).

	:- public(another_predicate/2).
:- end_object.

% Test 3: Object that cannot be converted to protocol (multiple arguments)
:- object(complex_object,
	implements(some_protocol),
	imports(some_category)).
	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Complex object with multiple relations'
	]).
:- end_object.

% Test 4: Object that cannot be converted to category (has extends)
:- object(object_with_extends,
	extends(parent_object)).
	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Object with extends relation'
	]).
:- end_object.

% Test 5: Protocol to category conversion
:- protocol(simple_protocol).
	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Simple protocol for testing conversion to category'
	]).

	:- public(protocol_predicate/1).
:- end_protocol.

% Test 6: Protocol to object conversion
:- protocol(protocol_with_extends,
	extends(parent_protocol)).
	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Protocol with extends for testing conversion to object'
	]).

	:- public(extended_predicate/2).
:- end_protocol.

% Test 7: Category to protocol conversion (no extends)
:- category(simple_category).
	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Simple category for testing conversion to protocol'
	]).

	:- public(category_predicate/1).
:- end_category.

% Test 8: Category to object conversion
:- category(category_with_extends,
	extends(parent_category)).
	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Category with extends for testing conversion to object'
	]).

	:- public(extended_category_predicate/2).
:- end_category.

% Test 9: Category that cannot be converted to protocol (has extends)
:- category(category_with_implements,
	implements(some_protocol),
	extends(parent_category)).
	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Category with both implements and extends'
	]).
:- end_category.

% Test 10: Multi-line object to protocol conversion
:- object(multiline_object).

	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Multi-line object for testing conversion'
	]).

	:- public(multiline_predicate/1).
	:- mode(multiline_predicate(+atom), one).

:- end_object.

% Test 11: Multi-line protocol to category conversion
:- protocol(multiline_protocol,
	extends(parent_protocol)).

	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Multi-line protocol for testing conversion'
	]).

	:- public(multiline_protocol_predicate/1).

:- end_protocol.

% Test 12: Multi-line category to object conversion
:- category(multiline_category,
	implements(some_protocol),
	extends(parent_category)).

	:- info([
		version is 1:0:0,
		author is 'Test',
		date is 2025-01-01,
		comment is 'Multi-line category for testing conversion'
	]).

	:- public(multiline_category_predicate/1).

:- end_category.

