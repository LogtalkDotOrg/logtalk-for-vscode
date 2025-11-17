import * as assert from 'assert';
import * as vscode from 'vscode';
import { PredicateUtils } from '../src/utils/predicateUtils';

suite('PredicateUtils.findVariablesInRange Tests', () => {

  // Helper function to create a test document
  async function createTestDocument(content: string): Promise<vscode.TextDocument> {
    return await vscode.workspace.openTextDocument({
      content,
      language: 'logtalk'
    });
  }

  test('should find simple variables', async () => {
    const content = 'foo(X, Y, Z).';
    const doc = await createTestDocument(content);
    const range = new vscode.Range(0, 0, 0, content.length);

    const variables = PredicateUtils.findVariablesInRange(doc, range);

    assert.strictEqual(variables.size, 3);
    assert.ok(variables.has('X'));
    assert.ok(variables.has('Y'));
    assert.ok(variables.has('Z'));
  });

  test('should find variables with underscores', async () => {
    const content = 'foo(Var1, Var_2, _Var3, _).';
    const doc = await createTestDocument(content);
    const range = new vscode.Range(0, 0, 0, content.length);

    const variables = PredicateUtils.findVariablesInRange(doc, range);

    assert.strictEqual(variables.size, 4);
    assert.ok(variables.has('Var1'));
    assert.ok(variables.has('Var_2'));
    assert.ok(variables.has('_Var3'));
    assert.ok(variables.has('_'));
  });

  test('should ignore variables in single-quoted strings', async () => {
    const content = "foo(X, 'Variable', Y).";
    const doc = await createTestDocument(content);
    const range = new vscode.Range(0, 0, 0, content.length);

    const variables = PredicateUtils.findVariablesInRange(doc, range);

    assert.strictEqual(variables.size, 2);
    assert.ok(variables.has('X'));
    assert.ok(variables.has('Y'));
    assert.ok(!variables.has('Variable'));
  });

  test('should ignore variables in double-quoted strings', async () => {
    const content = 'foo(X, "Variable", Y).';
    const doc = await createTestDocument(content);
    const range = new vscode.Range(0, 0, 0, content.length);

    const variables = PredicateUtils.findVariablesInRange(doc, range);

    assert.strictEqual(variables.size, 2);
    assert.ok(variables.has('X'));
    assert.ok(variables.has('Y'));
    assert.ok(!variables.has('Variable'));
  });

  test('should ignore variables in line comments', async () => {
    const content = 'foo(X, Y). % Comment with Variable';
    const doc = await createTestDocument(content);
    const range = new vscode.Range(0, 0, 0, content.length);

    const variables = PredicateUtils.findVariablesInRange(doc, range);

    assert.strictEqual(variables.size, 2);
    assert.ok(variables.has('X'));
    assert.ok(variables.has('Y'));
    assert.ok(!variables.has('Comment'));
    assert.ok(!variables.has('Variable'));
  });

  test('should ignore variables in block comments', async () => {
    const content = 'foo(X, /* Comment with Variable */ Y).';
    const doc = await createTestDocument(content);
    const range = new vscode.Range(0, 0, 0, content.length);

    const variables = PredicateUtils.findVariablesInRange(doc, range);

    assert.strictEqual(variables.size, 2);
    assert.ok(variables.has('X'));
    assert.ok(variables.has('Y'));
    assert.ok(!variables.has('Comment'));
    assert.ok(!variables.has('Variable'));
  });

  test('should handle escaped quotes in strings', async () => {
    const content = "foo(X, 'It\\'s a Variable', Y).";
    const doc = await createTestDocument(content);
    const range = new vscode.Range(0, 0, 0, content.length);

    const variables = PredicateUtils.findVariablesInRange(doc, range);

    assert.strictEqual(variables.size, 2);
    assert.ok(variables.has('X'));
    assert.ok(variables.has('Y'));
    assert.ok(!variables.has('It'));
    assert.ok(!variables.has('Variable'));
  });

  test('should handle character code notation', async () => {
    const content = "foo(X, 0'a, 0'\\n, Y).";
    const doc = await createTestDocument(content);
    const range = new vscode.Range(0, 0, 0, content.length);

    const variables = PredicateUtils.findVariablesInRange(doc, range);

    assert.strictEqual(variables.size, 2);
    assert.ok(variables.has('X'));
    assert.ok(variables.has('Y'));
  });

  test('should not include lowercase identifiers', async () => {
    const content = 'foo(X, atom, Y, another_atom).';
    const doc = await createTestDocument(content);
    const range = new vscode.Range(0, 0, 0, content.length);

    const variables = PredicateUtils.findVariablesInRange(doc, range);

    assert.strictEqual(variables.size, 2);
    assert.ok(variables.has('X'));
    assert.ok(variables.has('Y'));
    assert.ok(!variables.has('foo'));
    assert.ok(!variables.has('atom'));
    assert.ok(!variables.has('another_atom'));
  });

  test('should handle multi-line content', async () => {
    const content = `foo(X, Y) :-
    bar(X, Z),
    baz(Z, Y).`;
    const doc = await createTestDocument(content);
    const range = new vscode.Range(0, 0, 2, 14);

    const variables = PredicateUtils.findVariablesInRange(doc, range);

    assert.strictEqual(variables.size, 3);
    assert.ok(variables.has('X'));
    assert.ok(variables.has('Y'));
    assert.ok(variables.has('Z'));
  });
});

