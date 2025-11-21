:- object(test_increment_decrement_numbered_variables).

  :- info([
    version is 1:0:0,
    author is 'Paulo Moura',
    date is 2025-11-15,
    comment is 'Test cases for the "Increment numbered variables" and "Decrement numbered variables" refactorings.'
  ]).

  :- public(example1/2).
  :- mode(example1(+term, -term), one).
  :- info(example1/2, [
    comment is 'Example from user request.',
    argnames is ['State0', 'State']
  ]).

  % Test case 1: Example from user request
  % Select "State1" in the first goal
  % Expected result: State1 -> State2, State2 -> State3
  % Result:
  % process(State0, State) :-
  %     foo(State0, State2),
  %     bar(State3, State2),
  %     baz(State3, State).
  example1(State0, State) :-
    foo(State0, State1),
    bar(State2, State1),
    baz(State2, State).

  :- public(example2/2).
  :- mode(example2(+list, -list), one).
  :- info(example2/2, [
    comment is 'Test with different variable prefix.',
    argnames is ['List0', 'List']
  ]).

  % Test case 2: Different variable prefix
  % Select "List1" in the first goal
  % Expected result: List1 -> List2, List2 -> List3, List3 -> List4
  example2(List0, List) :-
    append(List0, [a], List1),
    append(List1, [b], List2),
    append(List2, [c], List3),
    append(List3, [d], List).

  :- public(example3/2).
  :- mode(example3(+term, -term), one).
  :- info(example3/2, [
    comment is 'Test with mixed variable names.',
    argnames is ['Input', 'Output']
  ]).

  % Test case 3: Mixed variable names (should only renumber X-prefixed)
  % Select "X1" in the first goal
  % Expected result: X1 -> X2, X2 -> X3 (Y1, Y2 unchanged)
  example3(Input, Output) :-
    transform(Input, X1, Y1),
    process(X1, X2, Y2),
    combine(X2, Y1, Y2, Output).

  :- public(example4/1).
  :- mode(example4(-term), one).
  :- info(example4/1, [
    comment is 'Test with grammar rule.',
    argnames is ['Result']
  ]).

  % Test case 4: Grammar rule
  % Select "S1" in the first goal
  % Expected result: S1 -> S2, S2 -> S3
  example4(Result) -->
    word(S1),
    separator(S2, S1),
    word(S2, Result).

  :- public(example5/2).
  :- mode(example5(+term, -term), one).
  :- info(example5/2, [
    comment is 'Test selecting a variable in the middle.',
    argnames is ['A', 'D']
  ]).

  % Test case 5: Select middle variable
  % Select "B2" in the second goal
  % Expected result: B2 -> B3, B3 -> B4 (B0, B1 unchanged)
  example5(A, D) :-
    step1(A, B0, B1),
    step2(B1, B2),
    step3(B2, B3),
    step4(B3, D).

  :- public(example6/1).
  :- mode(example6(-term), one).
  :- info(example6/1, [
    comment is 'Test with single-digit and multi-digit numbers.',
    argnames is ['Result']
  ]).

  % Test case 6: Multi-digit numbers
  % Select "Val9" in the first goal
  % Expected result: Val9 -> Val10, Val10 -> Val11
  example6(Result) :-
    init(Val9),
    process(Val9, Val10),
    finalize(Val10, Result).

:- end_object.

