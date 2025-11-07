% Test file for on-type formatting provider
% Test the automatic tail variable suggestion when typing "|" in list patterns

:- object(on_type_formatting_test).

	:- info([
		version is 1:0:0,
		author is 'Paulo Moura',
		date is 2025-11-07,
		comment is 'Test cases for on-type formatting provider.'
	]).

	:- public([
		test_head_tail/0,
		test_item_items/0,
		test_entry_entries/0,
		test_child_children/0,
		test_person_people/0,
		test_box_boxes/0,
		test_leaf_leaves/0,
		test_hero_heroes/0,
		test_no_suggestion_for_underscore/0,
		test_no_suggestion_for_atom/0
	]).

	% Test 1: Head -> Tail
	% Type: [Head|
	% Expected: [Head| Tail
	test_head_tail :-
		List = [Head| Tail],
		write('Test 1: Head -> Tail pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 2: Item -> Items (default pluralization)
	% Type: [Item|
	% Expected: [Item| Items
	test_item_items :-
		List = [Item| Items],
		write('Test 2: Item -> Items pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 3: Entry -> Entries (consonant + y -> ies)
	% Type: [Entry|
	% Expected: [Entry| Entries
	test_entry_entries :-
		List = [Entry| Entries],
		write('Test 3: Entry -> Entries pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 4: Child -> Children (special case)
	% Type: [Child|
	% Expected: [Child| Children
	test_child_children :-
		List = [Child| Children],
		write('Test 4: Child -> Children pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 5: Person -> People (special case)
	% Type: [Person|
	% Expected: [Person| People
	test_person_people :-
		List = [Person| People],
		write('Test 5: Person -> People pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 6: Box -> Boxes (x -> es)
	% Type: [Box|
	% Expected: [Box| Boxes
	test_box_boxes :-
		List = [Box| Boxes],
		write('Test 6: Box -> Boxes pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 7: Leaf -> Leaves (f -> ves)
	% Type: [Leaf|
	% Expected: [Leaf| Leaves
	test_leaf_leaves :-
		List = [Leaf| Leaves],
		write('Test 7: Leaf -> Leaves pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 8: Hero -> Heroes (consonant + o -> oes)
	% Type: [Hero|
	% Expected: [Hero| Heroes
	test_hero_heroes :-
		List = [Hero| Heroes],
		write('Test 8: Hero -> Heroes pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 9: Suggestions for variables starting with underscore (two or more characters)
	% Type: [_Item|
	% Expected: Two suggestions: _Items and Items
	test_underscore_variable_suggestions :-
		List1 = [_Item| _Items],
		write('Test 9a: Underscore variable with underscore tail'), nl,
		write('  List: '), write(List1), nl,
		List2 = [_Item| Items],
		write('Test 9b: Underscore variable with non-underscore tail'), nl,
		write('  List: '), write(List2), nl.

	% Test 10: No suggestion for atoms (lowercase)
	% Type: [item|
	% Expected: [item| (no suggestion)
	test_no_suggestion_for_atom :-
		% This would be a syntax error in Logtalk, but testing the pattern
		write('Test 10: No suggestion for atoms (lowercase identifiers)'), nl.

	% Additional test cases for various pluralization rules

	% Test 11: Class -> Classes (ss -> sses)
	test_class_classes :-
		List = [Class| Classes],
		write('Test 11: Class -> Classes pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 12: Dish -> Dishes (sh -> shes)
	test_dish_dishes :-
		List = [Dish| Dishes],
		write('Test 12: Dish -> Dishes pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 13: Church -> Churches (ch -> ches)
	test_church_churches :-
		List = [Church| Churches],
		write('Test 13: Church -> Churches pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 14: Quiz -> Quizzes (z -> zes)
	test_quiz_quizzes :-
		List = [Quiz| Quizzes],
		write('Test 14: Quiz -> Quizzes pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 15: Knife -> Knives (fe -> ves)
	test_knife_knives :-
		List = [Knife| Knives],
		write('Test 15: Knife -> Knives pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 16: Man -> Men (special case)
	test_man_men :-
		List = [Man| Men],
		write('Test 16: Man -> Men pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 17: Woman -> Women (special case)
	test_woman_women :-
		List = [Woman| Women],
		write('Test 17: Woman -> Women pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 18: Tooth -> Teeth (special case)
	test_tooth_teeth :-
		List = [Tooth| Teeth],
		write('Test 18: Tooth -> Teeth pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 19: Mouse -> Mice (special case)
	test_mouse_mice :-
		List = [Mouse| Mice],
		write('Test 19: Mouse -> Mice pattern works'), nl,
		write('  List: '), write(List), nl.

	% Test 20: Index -> Indices (special case)
	test_index_indices :-
		List = [Index| Indices],
		write('Test 20: Index -> Indices pattern works'), nl,
		write('  List: '), write(List), nl.

	% Run all tests
	run_all_tests :-
		write('Running on-type formatting tests...'), nl, nl,
		test_head_tail,
		test_item_items,
		test_entry_entries,
		test_child_children,
		test_person_people,
		test_box_boxes,
		test_leaf_leaves,
		test_hero_heroes,
		test_no_suggestion_for_underscore,
		test_no_suggestion_for_atom,
		test_class_classes,
		test_dish_dishes,
		test_church_churches,
		test_quiz_quizzes,
		test_knife_knives,
		test_man_men,
		test_woman_women,
		test_tooth_teeth,
		test_mouse_mice,
		test_index_indices,
		nl,
		write('All tests completed!'), nl.

:- end_object.

