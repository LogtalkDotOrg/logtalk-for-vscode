:- object(planets).

    :- info([
        version is 1:0:0,
        author is 'Test Author',
        date is 2024-01-01,
        comment is 'Test file for multi-line scope directive bug'
    ]).

    % Single line scope directive (this works)
    :- public(simple_predicate/1).

    % Multi-line scope directive (this is where the bug occurs)
    :- public([
        gravitational_acceleration/1,
        orbital_period/1,
        distance_from_sun/1
    ]).

    % Mode and info directives for the predicates
    :- mode(gravitational_acceleration(+atom), one).
    :- info(gravitational_acceleration/1, [
        comment is 'Calculates gravitational acceleration for a planet',
        argnames is ['Planet']
    ]).

    :- mode(orbital_period(+atom), one).
    :- info(orbital_period/1, [
        comment is 'Returns orbital period for a planet',
        argnames is ['Planet']
    ]).

    % Predicate implementations
    gravitational_acceleration(earth) :- !,
        write('9.81 m/s²').
    gravitational_acceleration(mars) :- !,
        write('3.71 m/s²').
    gravitational_acceleration(jupiter) :- !,
        write('24.79 m/s²').

    orbital_period(earth) :- !,
        write('365.25 days').
    orbital_period(mars) :- !,
        write('687 days').

    distance_from_sun(earth) :- !,
        write('149.6 million km').

:- end_object.
