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
  });
});
