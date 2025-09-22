import * as assert from 'assert';
import * as vscode from 'vscode';
import { LogtalkRefactorProvider } from '../src/features/refactorProvider';

suite('Replace Magic Number Refactoring Test Suite', () => {
  let refactorProvider: LogtalkRefactorProvider;

  setup(() => {
    refactorProvider = new LogtalkRefactorProvider();
  });

  test('isNumericLiteral - should detect integers', () => {
    const isNumericLiteral = (refactorProvider as any).isNumericLiteral;
    
    assert.strictEqual(isNumericLiteral('42'), true);
    assert.strictEqual(isNumericLiteral('-42'), true);
    assert.strictEqual(isNumericLiteral('+42'), true);
    assert.strictEqual(isNumericLiteral('0'), true);
  });

  test('isNumericLiteral - should detect floats', () => {
    const isNumericLiteral = (refactorProvider as any).isNumericLiteral;
    
    assert.strictEqual(isNumericLiteral('3.14'), true);
    assert.strictEqual(isNumericLiteral('-3.14'), true);
    assert.strictEqual(isNumericLiteral('+3.14'), true);
    assert.strictEqual(isNumericLiteral('.5'), true);
    assert.strictEqual(isNumericLiteral('2.'), true);
  });

  test('isNumericLiteral - should detect scientific notation', () => {
    const isNumericLiteral = (refactorProvider as any).isNumericLiteral;
    
    assert.strictEqual(isNumericLiteral('1e10'), true);
    assert.strictEqual(isNumericLiteral('1E10'), true);
    assert.strictEqual(isNumericLiteral('1.5e-10'), true);
    assert.strictEqual(isNumericLiteral('1.5E+10'), true);
  });

  test('isNumericLiteral - should reject non-numeric strings', () => {
    const isNumericLiteral = (refactorProvider as any).isNumericLiteral;
    
    assert.strictEqual(isNumericLiteral('abc'), false);
    assert.strictEqual(isNumericLiteral('42abc'), false);
    assert.strictEqual(isNumericLiteral('abc42'), false);
    assert.strictEqual(isNumericLiteral(''), false);
    assert.strictEqual(isNumericLiteral('  '), false);
  });

  test('toCamelCase - should convert predicate names to camelCase variables', () => {
    const toCamelCase = (refactorProvider as any).toCamelCase;
    
    assert.strictEqual(toCamelCase('max_value'), 'MaxValue');
    assert.strictEqual(toCamelCase('timeout'), 'Timeout');
    assert.strictEqual(toCamelCase('default_port_number'), 'DefaultPortNumber');
    assert.strictEqual(toCamelCase('pi_value'), 'PiValue');
  });

  test('replaceMagicNumber - method exists', () => {
    // Test that the method exists and has the right signature
    assert.ok(typeof refactorProvider.replaceMagicNumber === 'function');
  });

  test('isInsideRuleBody - should detect position after :- on same line', () => {
    const isInsideRuleBody = (refactorProvider as any).isInsideRuleBody;

    // Mock document with a rule on one line
    const mockDocument = {
      lineAt: (line: number) => ({
        text: 'test_predicate(X) :- X > 100000.'
      }),
      lineCount: 1
    } as any;

    // Position after the :- operator (at the number 100000)
    const position = new vscode.Position(0, 25); // Position at "100000"

    const result = isInsideRuleBody(mockDocument, position);
    assert.strictEqual(result, true, "Should detect position after :- on same line");
  });

  test('isInsideRuleBody - should detect position before :- on same line', () => {
    const isInsideRuleBody = (refactorProvider as any).isInsideRuleBody;

    // Mock document with a rule on one line
    const mockDocument = {
      lineAt: (line: number) => ({
        text: 'test_predicate(X) :- X > 100000.'
      }),
      lineCount: 1
    } as any;

    // Position before the :- operator (at the predicate name)
    const position = new vscode.Position(0, 5); // Position at "predicate"

    const result = isInsideRuleBody(mockDocument, position);
    assert.strictEqual(result, false, "Should not detect position before :- on same line");
  });

  test('isInsideRuleBody - should handle predicate with no arguments before :-', () => {
    const isInsideRuleBody = (refactorProvider as any).isInsideRuleBody;

    // Mock document with predicate with no arguments
    const mockDocument = {
      lineAt: (line: number) => ({
        text: 'run :-'
      }),
      lineCount: 1
    } as any;

    // Position before the :- operator (at the predicate name)
    const position = new vscode.Position(0, 1); // Position at "run"

    const result = isInsideRuleBody(mockDocument, position);
    assert.strictEqual(result, false, "Should not detect position before :- for predicate with no arguments");
  });

  test('isInsideRuleBody - should detect position on line after :-', () => {
    const isInsideRuleBody = (refactorProvider as any).isInsideRuleBody;

    // Mock document with multi-line rule
    const mockDocument = {
      lineAt: (line: number) => {
        const lines = [
          'test_predicate(X) :-',
          '    X > 100000.'
        ];
        return { text: lines[line] };
      },
      lineCount: 2
    } as any;

    // Position on second line (in rule body)
    const position = new vscode.Position(1, 10); // Position at "100000"

    const result = isInsideRuleBody(mockDocument, position);
    assert.strictEqual(result, true, "Should detect position on line after :-");
  });

  test('isInsideRuleBody - should handle predicate with no arguments (benchmarks.lgt scenario)', () => {
    const isInsideRuleBody = (refactorProvider as any).isInsideRuleBody;

    // Mock document reproducing the benchmarks.lgt scenario
    const mockDocument = {
      lineAt: (line: number) => {
        const lines = [
          'run :-',
          '\t\trun(100000).'  // Indented with tabs like in the actual file
        ];
        return { text: lines[line] };
      },
      lineCount: 2
    } as any;

    // Position on line with 100000 (line 1, 0-indexed)
    const position = new vscode.Position(1, 10); // Position at "100000"

    const result = isInsideRuleBody(mockDocument, position);
    assert.strictEqual(result, true, "Should detect position in rule body for indented predicate call");
  });

  test('isInsideRuleBody - should not detect unindented clause head as rule body', () => {
    const isInsideRuleBody = (refactorProvider as any).isInsideRuleBody;

    // Mock document with unindented clause head (actual fact)
    const mockDocument = {
      lineAt: (line: number) => ({
        text: 'run(100000).'  // Not indented - this is a fact
      }),
      lineCount: 1
    } as any;

    // Position on the line with 100000
    const position = new vscode.Position(0, 6); // Position at "100000"

    const result = isInsideRuleBody(mockDocument, position);
    assert.strictEqual(result, false, "Should not detect unindented clause head as rule body");
  });

  test('provideCodeActions - should provide replace magic number action for numeric selection', async () => {
    // Create a mock document
    const mockDocument = {
      getText: (range?: vscode.Range) => {
        if (range) {
          // Mock selected text as a number
          return '100000';
        }
        return 'test_predicate(X) :- X > 100000.';
      },
      lineAt: (line: number) => ({
        text: 'test_predicate(X) :- X > 100000.'
      }),
      lineCount: 1
    } as any;

    // Create a mock selection that is not empty and contains a number
    const mockSelection = new vscode.Selection(0, 25, 0, 31); // Selecting "100000"
    mockSelection.isEmpty = false;

    const actions = await refactorProvider.provideCodeActions(
      mockDocument,
      mockSelection,
      { diagnostics: [] } as any,
      { isCancellationRequested: false } as any
    );

    // Should include the replace magic number action
    const replaceMagicNumberAction = actions.find(action =>
      action.title === "Replace magic number"
    );

    assert.ok(replaceMagicNumberAction, "Should provide replace magic number action");
    assert.strictEqual(replaceMagicNumberAction.kind, vscode.CodeActionKind.RefactorExtract);
  });
});
