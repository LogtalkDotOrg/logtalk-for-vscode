% Test file that reproduces the exact scenario from planets.lgt
% This tests the multi-line scope directive bug fix

:- category(planet).

	:- public([
		gravitational_acceleration/1,
		weight/2
	]).

	weight(Object, Weight) :-
		Object::mass(Mass),
		::gravitational_acceleration(Acceleration),
		Weight is Mass * Acceleration.

:- end_category.

% planets, for example, Earth and Mars:

:- object(earth,
	imports(planet)).

	gravitational_acceleration(9.80).

:- end_object.


:- object(mars,
	imports(planet)).

	gravitational_acceleration(3.72).

:- end_object.


:- object(jupiter,
	imports(planet)).

	gravitational_acceleration(23.12).

:- end_object.
