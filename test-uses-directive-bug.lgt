% Test file to reproduce the uses/2 directive formatting bug
% Based on the pattern mentioned at lines 39-42 of abnf_tools.lgt

:- object(test_uses_bug).

% First uses/2 directive - should format correctly (multi-line)
:- uses(list, [append/3, member/2]).

% Second uses/2 directive - should format correctly (multi-line)
:- uses(queues, [new/1 as new_queue/1]).

% Third uses/2 directive - this was the problematic one
% Single callable form with commas inside parentheses - should format as multi-line
:- uses(library, [member(+term, ?list)]).

% Fourth uses/2 directive - should format correctly (multi-line)
:- uses(complex_library, [
process(+input, -output),
transform(+data, ?result)
]).

% DEMONSTRATION OF THE BUG FIX:
% These directives are intentionally not indented to show the fix

% This single-element directive should get multi-line formatting:
:- uses(unindented_single, [predicate/1]).

% This multi-element directive should also get proper multi-line formatting:
:- uses(unindented_multi, [pred1/1, pred2/2]).

% Additional test cases:

% Uses directive with mixed content - should be multi-line
:- uses(mixed, [append/3, member(+term, ?list), reverse/2]).

% Uses directive with nested parentheses - should stay single line
:- uses(nested, [complex(+(list(term)), -result)]).

% Uses directive with quoted atoms - should be multi-line
:- uses(quoted, ['special predicate'/2, normal/1]).

% Uses directive with operators - should stay single line
:- uses(operators, [op(500, yfx, custom_op)]).

% Single element with complex structure - should stay single line
:- uses(complex_single, [very_complex_predicate(+input(nested(structure)), -output(result))]).

% Empty list - should stay single line
:- uses(empty, []).

:- end_object.
