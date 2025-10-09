% Test file for entity opening directive formatting
% This file demonstrates various entity opening directive patterns

% Simple object (should stay single line)
:- object(simple_object).
:- end_object.

% Object with single relation (should stay single line)
:- object(single_relation_object, implements(some_protocol)).
:- end_object.

% Object with multiple relations (should become multi-line)
:- object(multi_relation_object, implements(protocol1), imports(category1), extends(parent_object)).
:- end_object.

% Complex object with all relation types (should become multi-line)
:- object(complex_object, implements(protocol1), imports(category1), extends(parent_object), instantiates(metaclass)).
:- end_object.

% Parametric object with relations (should become multi-line)
:- object(parametric_object(Parameter, "String", 33.78), implements(protocol), imports(category), extends(parent(Parameter))).
:- end_object.

% Class with all class-specific relations (should become multi-line)
:- object(class_object, implements(protected::protocol), imports(private::category), instantiates(metaclass), specializes(superclass)).
:- end_object.

% Category with relations (should become multi-line)
:- category(test_category, implements(protocol), extends(other_category)).
:- end_category.

% Protocol with extension (should stay single line for single relation)
:- protocol(extended_protocol, extends(minimal_protocol)).
:- end_protocol.

% Protocol with multiple extensions (should become multi-line)
:- protocol(multi_extended_protocol, extends(protocol1), extends(protocol2)).
:- end_protocol.

% Already properly formatted multi-line object (should preserve formatting)
:- object(already_formatted,
	implements(protocol),
	imports(category),
	extends(parent)).
:- end_object.

% Unindented multi-line object (should fix indentation)
:- object(unindented_object,
implements(protocol),
imports(category),
extends(parent)).
:- end_object.

% Object with complex nested parameters in relations
:- object(complex_nested, implements(protocol(param1, param2)), imports(category(nested(deep))), extends(parent(complex, structure))).
:- end_object.

% Object with visibility modifiers in relations
:- object(visibility_object, implements(public::protocol1), implements(protected::protocol2), imports(private::category)).
:- end_object.

% Complex nested example from the user (should become multi-line)
:- object(speech(Season, Event), imports((dress(Season), speech(Event)))).
:- end_object.

% Another complex nested example with multiple relations
:- object(complex_nested_example(Param1, Param2), implements(protocol(nested(deep))), imports((module1(Param1), module2(Param2))), extends(parent(complex, structure))).
:- end_object.

% Complex parametric with deeply nested structures
:- object(deeply_nested(A, B, C), implements((protocol1(A), protocol2(B))), imports((category1(nested(A, B)), category2(deep(C)))), extends(parent(A, B, C))).
:- end_object.
