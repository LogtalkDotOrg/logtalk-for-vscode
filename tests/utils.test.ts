import * as assert from 'assert';
import * as vscode from 'vscode';
import { Utils } from '../src/utils/utils';

suite('Utils Test Suite', () => {
  
  suite('termType function', () => {
    let testDocument: vscode.TextDocument;
    
    const testContent = `% This is a comment
:- object(test).

:- info([
    version is 1:0:0,
    author is 'Test Author'
]).

:- public(foo/1).
:- mode(foo(+atom), one).
:- info(foo/1, [
    comment is 'Test predicate'
]).

foo(X) :-
    write(X).

bar(Y) -->
    [Y].

baz(Z).

:- end_object.
`;

    setup(async () => {
      testDocument = await vscode.workspace.openTextDocument({
        content: testContent,
        language: 'logtalk'
      });
    });

    test('should identify entity directive - object', async () => {
      const position = new vscode.Position(1, 0); // :- object(test).
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'entity_directive');
    });

    test('should identify entity directive - entity info', async () => {
      const position = new vscode.Position(3, 0); // :- info([
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'entity_directive');
    });

    test('should identify entity directive - middle of entity info', async () => {
      const position = new vscode.Position(4, 4); // version is 1:0:0,
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'entity_directive');
    });

    test('should identify entity directive - end_object', async () => {
      const position = new vscode.Position(21, 0); // :- end_object.
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'entity_directive');
    });

    test('should identify predicate directive - public', async () => {
      const position = new vscode.Position(7, 0); // :- public(foo/1).
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'predicate_directive');
    });

    test('should identify predicate directive - mode', async () => {
      const position = new vscode.Position(8, 0); // :- mode(foo(+atom), one).
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'predicate_directive');
    });

    test('should identify predicate directive - predicate info', async () => {
      const position = new vscode.Position(9, 0); // :- info(foo/1, [
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'predicate_directive');
    });

    test('should identify predicate directive - middle of predicate info', async () => {
      const position = new vscode.Position(10, 4); // comment is 'Test predicate'
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'predicate_directive');
    });

    test('should identify predicate rule', async () => {
      const position = new vscode.Position(13, 0); // foo(X) :-
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'predicate_rule');
    });

    test('should identify predicate rule - body line', async () => {
      const position = new vscode.Position(14, 4); // write(X).
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'predicate_rule');
    });

    test('should identify non-terminal rule', async () => {
      const position = new vscode.Position(16, 0); // bar(Y) -->
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'non_terminal_rule');
    });

    test('should identify non-terminal rule - body line', async () => {
      const position = new vscode.Position(17, 4); // [Y].
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'non_terminal_rule');
    });

    test('should identify predicate fact', async () => {
      const position = new vscode.Position(19, 0); // baz(Z).
      const result = await Utils.termType(testDocument.uri, position);
      assert.strictEqual(result, 'predicate_fact');
    });

    test('should handle comment lines', async () => {
      const position = new vscode.Position(0, 0); // % This is a comment
      const result = await Utils.termType(testDocument.uri, position);
      // Comments should return null or be handled gracefully
      assert.ok(result === null || typeof result === 'string');
    });

    test('should handle empty lines', async () => {
      const position = new vscode.Position(2, 0); // empty line
      const result = await Utils.termType(testDocument.uri, position);
      // Empty lines should return null or be handled gracefully
      assert.ok(result === null || typeof result === 'string');
    });
  });

  suite('termType function - edge cases', () => {
    
    test('should handle single line directive', async () => {
      const singleLineContent = ':- dynamic(test/1).';
      const doc = await vscode.workspace.openTextDocument({
        content: singleLineContent,
        language: 'logtalk'
      });
      
      const position = new vscode.Position(0, 0);
      const result = await Utils.termType(doc.uri, position);
      assert.strictEqual(result, 'predicate_directive');
    });

    test('should handle single line fact', async () => {
      const factContent = 'simple_fact.';
      const doc = await vscode.workspace.openTextDocument({
        content: factContent,
        language: 'logtalk'
      });
      
      const position = new vscode.Position(0, 0);
      const result = await Utils.termType(doc.uri, position);
      assert.strictEqual(result, 'predicate_fact');
    });

    test('should handle single line rule', async () => {
      const ruleContent = 'simple_rule :- true.';
      const doc = await vscode.workspace.openTextDocument({
        content: ruleContent,
        language: 'logtalk'
      });
      
      const position = new vscode.Position(0, 0);
      const result = await Utils.termType(doc.uri, position);
      assert.strictEqual(result, 'predicate_rule');
    });

    test('should handle single line DCG rule', async () => {
      const dcgContent = 'simple_dcg --> [word].';
      const doc = await vscode.workspace.openTextDocument({
        content: dcgContent,
        language: 'logtalk'
      });
      
      const position = new vscode.Position(0, 0);
      const result = await Utils.termType(doc.uri, position);
      assert.strictEqual(result, 'non_terminal_rule');
    });
  });

  suite('termType function - refactor provider integration', () => {

    test('should prevent argument refactoring in entity info directive', async () => {
      const entityInfoContent = `:- object(test).

:- info([
    version is 1:0:0,
    author is 'Test Author'
]).

:- public(foo/1).

foo(X) :- write(X).

:- end_object.`;

      const doc = await vscode.workspace.openTextDocument({
        content: entityInfoContent,
        language: 'logtalk'
      });

      // Test position in entity info directive
      const entityInfoPosition = new vscode.Position(3, 10); // inside version is 1:0:0
      const entityInfoResult = await Utils.termType(doc.uri, entityInfoPosition);
      assert.strictEqual(entityInfoResult, 'entity_directive');

      // Test position in predicate directive (should allow refactoring)
      const predicateDirectivePosition = new vscode.Position(7, 5); // :- public(foo/1)
      const predicateDirectiveResult = await Utils.termType(doc.uri, predicateDirectivePosition);
      assert.strictEqual(predicateDirectiveResult, 'predicate_directive');

      // Test position in predicate clause (should allow refactoring)
      const predicateClausePosition = new vscode.Position(9, 0); // foo(X) :- write(X)
      const predicateClauseResult = await Utils.termType(doc.uri, predicateClausePosition);
      assert.strictEqual(predicateClauseResult, 'predicate_rule');
    });

    test('should distinguish between entity and predicate info directives', async () => {
      const mixedInfoContent = `:- object(test).

:- info([
    version is 1:0:0
]).

:- info(foo/1, [
    comment is 'Test predicate'
]).

foo(X).

:- end_object.`;

      const doc = await vscode.workspace.openTextDocument({
        content: mixedInfoContent,
        language: 'logtalk'
      });

      // Entity info directive
      const entityInfoPos = new vscode.Position(2, 0); // :- info([
      const entityResult = await Utils.termType(doc.uri, entityInfoPos);
      assert.strictEqual(entityResult, 'entity_directive');

      // Predicate info directive
      const predicateInfoPos = new vscode.Position(6, 0); // :- info(foo/1, [
      const predicateResult = await Utils.termType(doc.uri, predicateInfoPos);
      assert.strictEqual(predicateResult, 'predicate_directive');
    });

    test('should identify multi-line entity directive with specializes relation - bug fix', async () => {
      const multiLineEntityContent = `:- object(heuristic_search(_Threshold_),
	instantiates(class),
	specializes(search_strategy)).

:- info([
    version is 1:1:0,
    author is 'Paulo Moura'
]).

:- end_object.`;

      const doc = await vscode.workspace.openTextDocument({
        content: multiLineEntityContent,
        language: 'logtalk'
      });

      // Test the exact bug case: position on "specializes" word on line ending with period
      // This was failing because findTermStart was treating the period as end of previous term
      const specializesPos = new vscode.Position(2, 1); // specializes(search_strategy)).
      const result = await Utils.termType(doc.uri, specializesPos);
      assert.strictEqual(result, 'entity_directive', 'Should identify specializes as part of entity directive (bug fix)');

      // Test position on "instantiates" word (line 1)
      const instantiatesPos = new vscode.Position(1, 1); // instantiates(class),
      const instantiatesResult = await Utils.termType(doc.uri, instantiatesPos);
      assert.strictEqual(instantiatesResult, 'entity_directive', 'Should identify instantiates as part of entity directive');

      // Test position on the opening line
      const openingPos = new vscode.Position(0, 0); // :- object(heuristic_search(_Threshold_),
      const openingResult = await Utils.termType(doc.uri, openingPos);
      assert.strictEqual(openingResult, 'entity_directive', 'Should identify opening line as entity directive');

      // Test position specifically on the word "specializes" to match the original bug report
      const specializesWordPos = new vscode.Position(2, 2); // Inside "specializes"
      const specializesWordResult = await Utils.termType(doc.uri, specializesWordPos);
      assert.strictEqual(specializesWordResult, 'entity_directive', 'Should identify word "specializes" as part of entity directive');
    });
  });
});

import { ArgumentUtils } from '../src/utils/argumentUtils';

suite('ArgumentUtils Test Suite', () => {

  suite('parseArguments function', () => {

    test('should parse simple arguments', () => {
      const result = ArgumentUtils.parseArguments('a, b, c');
      assert.deepStrictEqual(result, ['a', 'b', 'c']);
    });

    test('should handle arguments with parentheses', () => {
      const result = ArgumentUtils.parseArguments('foo(a, b), bar(c), d');
      assert.deepStrictEqual(result, ['foo(a, b)', 'bar(c)', 'd']);
    });

    test('should handle arguments with square brackets', () => {
      const result = ArgumentUtils.parseArguments('[a, b, c], d, [e, f]');
      assert.deepStrictEqual(result, ['[a, b, c]', 'd', '[e, f]']);
    });

    test('should handle arguments with curly braces', () => {
      const result = ArgumentUtils.parseArguments('{a, b, c}, d, {e, f}');
      assert.deepStrictEqual(result, ['{a, b, c}', 'd', '{e, f}']);
    });

    test('should handle nested structures', () => {
      const result = ArgumentUtils.parseArguments('foo([a, b]), bar({c, d}), baz((e, f))');
      assert.deepStrictEqual(result, ['foo([a, b])', 'bar({c, d})', 'baz((e, f))']);
    });

    test('should handle complex nested curly braces', () => {
      const result = ArgumentUtils.parseArguments('X, {a, b, {c, d}}, Y');
      assert.deepStrictEqual(result, ['X', '{a, b, {c, d}}', 'Y']);
    });

    test('should handle quoted strings with commas', () => {
      const result = ArgumentUtils.parseArguments("'hello, world', foo, \"test, data\"");
      assert.deepStrictEqual(result, ["'hello, world'", 'foo', '"test, data"']);
    });

    test('should handle empty argument list', () => {
      const result = ArgumentUtils.parseArguments('');
      assert.deepStrictEqual(result, []);
    });

    test('should handle single argument', () => {
      const result = ArgumentUtils.parseArguments('foo');
      assert.deepStrictEqual(result, ['foo']);
    });

    test('should handle mixed grouping constructs', () => {
      const result = ArgumentUtils.parseArguments('foo([a, {b, c}]), {d, [e, f]}, (g, h)');
      assert.deepStrictEqual(result, ['foo([a, {b, c}])', '{d, [e, f]}', '(g, h)']);
    });

    test('should handle quoted atoms ending with 0', () => {
      const result = ArgumentUtils.parseArguments("'1900', '2000', 'test'");
      assert.deepStrictEqual(result, ["'1900'", "'2000'", "'test'"]);
    });

    test('should handle character code notation', () => {
      const result = ArgumentUtils.parseArguments("0'a, 0'b, 0'0");
      assert.deepStrictEqual(result, ["0'a", "0'b", "0'0"]);
    });

    test('should handle complex example from iso8601.lgt', () => {
      const result = ArgumentUtils.parseArguments(
        "'Date, reduced, year (section 5.2.1.2 b)' - date_string('YYYY',Day,'1900') - {Day = [1900]}, " +
        "'Date, reduced, century (section 5.2.1.2 c)' - date_string('YY',2456557,Str) - {Str = '20'}"
      );
      assert.strictEqual(result.length, 2, 'Should parse as 2 arguments');
      assert.ok(result[0].includes("'Date, reduced, year"), 'First argument should contain year example');
      assert.ok(result[1].includes("'Date, reduced, century"), 'Second argument should contain century example');
    });

    test('should handle quoted atoms with commas inside predicate calls', () => {
      const result = ArgumentUtils.parseArguments("foo('a, b, c'), bar('d, e'), baz");
      assert.deepStrictEqual(result, ["foo('a, b, c')", "bar('d, e')", "baz"]);
    });
  });
});
