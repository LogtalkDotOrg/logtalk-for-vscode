% Test file for multiple entity formatting
% This file demonstrates multiple entities in a single source file

:- protocol(shape_protocol).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		date is 2024-01-01,
		comment is 'Protocol for geometric shapes'
	]).

	:- public(area/1).
	:- mode(area(-float), one).
	:- info(area/1, [
		comment is 'Calculate the area of the shape',
		argnames is ['Area']
	]).

	:- public(perimeter/1).
	:- mode(perimeter(-float), one).

:- end_protocol.

:- category(shape_utilities).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		comment is 'Utility predicates for shapes'
	]).

	:- uses(math, [pi/1, sqrt/2]).

	:- public(circle_area/2).
	:- mode(circle_area(+float, -float), one).

	circle_area(Radius, Area) :-
		pi(Pi),
		Area is Pi * Radius * Radius.

:- end_category.

:- object(rectangle,
	implements(shape_protocol),
	imports(shape_utilities)).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		comment is 'Rectangle implementation'
	]).

	:- public([width/1, height/1]).

	:- private([width_/1, height_/1]).

	:- dynamic([width_/1, height_/1]).

	:- info(width/1, [
		comment is 'Get rectangle width',
		argnames is ['Width']
	]).

	:- alias(shape_utilities, [circle_area/2 as utility_circle_area/2]).

	width(Width) :-
		width_(Width).

	height(Height) :-
		height_(Height).

	area(Area) :-
		width(W),
		height(H),
		Area is W * H.

	perimeter(Perimeter) :-
		width(W),
		height(H),
		Perimeter is 2 * (W + H).

:- end_object.

:- object(circle,
	implements(shape_protocol)).

	:- info([
		version is 1:0:0,
		author is 'Test Author',
		comment is 'Circle implementation'
	]).

	:- public(radius/1).
	:- private(radius_/1).
	:- dynamic(radius_/1).

	:- uses(math, [pi/1]).

	radius(Radius) :-
		radius_(Radius).

	area(Area) :-
		radius(R),
		pi(Pi),
		Area is Pi * R * R.

	perimeter(Perimeter) :-
		radius(R),
		pi(Pi),
		Perimeter is 2 * Pi * R.

:- end_object.
