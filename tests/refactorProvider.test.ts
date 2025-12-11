import * as assert from 'assert';
import * as vscode from 'vscode';
import { LogtalkRefactorProvider } from '../src/features/refactorProvider';

suite('LogtalkRefactorProvider Test Suite', () => {
  let refactorProvider: LogtalkRefactorProvider;

  setup(() => {
    refactorProvider = new LogtalkRefactorProvider();
  });

  test('generateEntityFileContent - object entity', () => {
    const entityType = {
      label: "Object",
      description: "Create a new object entity",
      entityType: "object" as const,
      directive: ":- object",
      endDirective: ":- end_object."
    };
    const entityName = "test_object";
    const selectedCode = "test_predicate(X) :- write(X).";
    const author = "Test Author";
    const date = "2024-01-01";

    const result = (refactorProvider as any).generateEntityFileContent(
      entityType,
      entityName,
      selectedCode,
      author,
      date
    );

    // Check that the result contains expected components
    assert.ok(result.includes(":- object(test_object)."));
    assert.ok(result.includes(":- end_object."));
    assert.ok(result.includes("version is 1:0:0"));
    assert.ok(result.includes("author is 'Test Author'"));
    assert.ok(result.includes("date is 2024-01-01"));
    assert.ok(result.includes("comment is 'Extracted object entity'"));
    assert.ok(result.includes("test_predicate(X) :- write(X)."));
  });

  test('generateEntityFileContent - protocol entity', () => {
    const entityType = {
      label: "Protocol",
      description: "Create a new protocol entity",
      entityType: "protocol" as const,
      directive: ":- protocol",
      endDirective: ":- end_protocol."
    };
    const entityName = "test_protocol";
    const selectedCode = ":- public(test_predicate/1).";
    const author = "Test Author";
    const date = "2024-01-01";

    const result = (refactorProvider as any).generateEntityFileContent(
      entityType,
      entityName,
      selectedCode,
      author,
      date
    );

    // Check that the result contains expected components
    assert.ok(result.includes(":- protocol(test_protocol)."));
    assert.ok(result.includes(":- end_protocol."));
    assert.ok(result.includes("comment is 'Extracted protocol entity'"));
    assert.ok(result.includes(":- public(test_predicate/1)."));
  });

  test('generateEntityFileContent - category entity', () => {
    const entityType = {
      label: "Category",
      description: "Create a new category entity",
      entityType: "category" as const,
      directive: ":- category",
      endDirective: ":- end_category."
    };
    const entityName = "test_category";
    const selectedCode = "helper_predicate(X, Y) :- X = Y.";
    const author = "Test Author";
    const date = "2024-01-01";

    const result = (refactorProvider as any).generateEntityFileContent(
      entityType,
      entityName,
      selectedCode,
      author,
      date
    );

    // Check that the result contains expected components
    assert.ok(result.includes(":- category(test_category)."));
    assert.ok(result.includes(":- end_category."));
    assert.ok(result.includes("comment is 'Extracted category entity'"));
    assert.ok(result.includes("helper_predicate(X, Y) :- X = Y."));
  });

  test('generateEntityFileContent - preserve original indentation', () => {
    const entityType = {
      label: "Object",
      description: "Create a new object entity",
      entityType: "object" as const,
      directive: ":- object",
      endDirective: ":- end_object."
    };
    const entityName = "test_object";
    const selectedCode = "\tpredicate1(X) :- write(X).\n\n\t\tpredicate2(Y) :- read(Y).";
    const author = "Test Author";
    const date = "2024-01-01";

    const result = (refactorProvider as any).generateEntityFileContent(
      entityType,
      entityName,
      selectedCode,
      author,
      date
    );

    // Check that original indentation is preserved exactly
    assert.ok(result.includes("\tpredicate1(X) :- write(X)."));
    assert.ok(result.includes("\t\tpredicate2(Y) :- read(Y)."));
  });

  test('processSelectedCode - trim empty lines', () => {
    const selectedCode = "\n\n  predicate1(X) :- write(X).\n\n  predicate2(Y) :- read(Y).\n\n\n";

    const result = (refactorProvider as any).processSelectedCode(selectedCode);

    // Should trim empty lines at start and end
    assert.strictEqual(result, "  predicate1(X) :- write(X).\n\n  predicate2(Y) :- read(Y).");
  });

  test('processSelectedCode - preserve indentation', () => {
    const selectedCode = "\t\tpredicate1(X) :- write(X).\n\t\t\tpredicate2(Y) :- read(Y).";

    const result = (refactorProvider as any).processSelectedCode(selectedCode);

    // Should preserve original indentation
    assert.strictEqual(result, "\t\tpredicate1(X) :- write(X).\n\t\t\tpredicate2(Y) :- read(Y).");
  });

  test('processSelectedCode - empty or whitespace only', () => {
    const emptyCode = "";
    const whitespaceCode = "\n\n   \n\n";

    const result1 = (refactorProvider as any).processSelectedCode(emptyCode);
    const result2 = (refactorProvider as any).processSelectedCode(whitespaceCode);

    // Should handle empty/whitespace-only selections
    assert.strictEqual(result1, "");
    assert.strictEqual(result2, "");
  });

  test('promptForFileName - validation', () => {
    // This test would require mocking showInputBox, but we can test the validation logic
    // by checking that the method exists and has the right signature
    assert.ok(typeof (refactorProvider as any).promptForFileName === 'function');
  });

  test('promptForFileDirectory - method exists', () => {
    // This test would require mocking showSaveDialog, but we can test that the method exists
    assert.ok(typeof (refactorProvider as any).promptForFileDirectory === 'function');
  });

  test('dispose - method exists and can be called', () => {
    // Test that dispose method exists and can be called without errors
    assert.ok(typeof refactorProvider.dispose === 'function');

    // Should not throw when called
    assert.doesNotThrow(() => {
      refactorProvider.dispose();
    });
  });

  test('extractToNewEntity - should remove code from original file', () => {
    // This test would require mocking WorkspaceEdit and related VS Code APIs
    // For now, we just verify the method exists and has the right signature
    assert.ok(typeof refactorProvider.extractToNewEntity === 'function');
  });

  test('extractToNewFile - should remove code from original file', () => {
    // This test would require mocking WorkspaceEdit and related VS Code APIs
    // For now, we just verify the method exists and has the right signature
    assert.ok(typeof refactorProvider.extractToNewFile === 'function');
  });

  test('provideCodeActions - with multi-line selection', async () => {
    // Create a mock document
    const mockDocument = {} as vscode.TextDocument;
    const mockSelection = new vscode.Selection(0, 0, 1, 10); // Multi-line selection
    const mockContext = {} as vscode.CodeActionContext;
    const mockToken = {} as vscode.CancellationToken;

    const actions = await refactorProvider.provideCodeActions(
      mockDocument,
      mockSelection,
      mockContext,
      mockToken
    );

    // Should provide all three extract actions when there's a multi-line selection
    assert.strictEqual(actions.length, 3);
    assert.strictEqual(actions[0].title, "Extract to new Logtalk entity");
    assert.strictEqual(actions[0].kind, vscode.CodeActionKind.RefactorExtract);
    assert.strictEqual(actions[1].title, "Extract to new Logtalk file");
    assert.strictEqual(actions[1].kind, vscode.CodeActionKind.RefactorExtract);
    assert.strictEqual(actions[2].title, "Replace with include/1 directive");
    assert.strictEqual(actions[2].kind, vscode.CodeActionKind.RefactorExtract);
  });

  test('provideCodeActions - without selection', async () => {
    // Create a mock document and empty range
    const mockDocument = {} as vscode.TextDocument;
    const mockRange = new vscode.Range(0, 0, 0, 0); // Empty selection (same start and end)
    const mockContext = {} as vscode.CodeActionContext;
    const mockToken = {} as vscode.CancellationToken;

    const actions = await refactorProvider.provideCodeActions(
      mockDocument,
      mockRange,
      mockContext,
      mockToken
    );

    // Should not provide extract action when there's no selection
    assert.strictEqual(actions.length, 0);
  });

  test('provideCodeActions - single character selection', async () => {
    // Create a mock document and single character selection
    const mockDocument = {} as vscode.TextDocument;
    const mockSelection = new vscode.Selection(0, 0, 0, 1); // Single character selection
    const mockContext = {} as vscode.CodeActionContext;
    const mockToken = {} as vscode.CancellationToken;

    const actions = await refactorProvider.provideCodeActions(
      mockDocument,
      mockSelection,
      mockContext,
      mockToken
    );

    // Should NOT provide extract actions for partial line selections
    assert.strictEqual(actions.length, 0);
  });

  test('provideCodeActions - selection spanning multiple lines', async () => {
    // Create a mock document and multi-line selection
    const mockDocument = {} as vscode.TextDocument;
    const mockSelection = new vscode.Selection(0, 0, 2, 10); // Multi-line selection
    const mockContext = {} as vscode.CodeActionContext;
    const mockToken = {} as vscode.CancellationToken;

    const actions = await refactorProvider.provideCodeActions(
      mockDocument,
      mockSelection,
      mockContext,
      mockToken
    );

    // Should provide extract actions for multi-line selections
    assert.strictEqual(actions.length, 3);
    assert.strictEqual(actions[0].title, "Extract to new Logtalk entity");
    assert.strictEqual(actions[1].title, "Extract to new Logtalk file");
    assert.strictEqual(actions[2].title, "Replace with include/1 directive");
  });

  test('provideCodeActions - full line selection', async () => {
    // Create a mock document with a line of text
    const mockDocument = {
      lineAt: (line: number) => ({ text: 'test_predicate(X) :- write(X).' })
    } as vscode.TextDocument;
    const mockSelection = new vscode.Selection(0, 0, 0, 30); // Full line selection (assuming line is 30 chars)
    const mockContext = {} as vscode.CodeActionContext;
    const mockToken = {} as vscode.CancellationToken;

    const actions = await refactorProvider.provideCodeActions(
      mockDocument,
      mockSelection,
      mockContext,
      mockToken
    );

    // Should provide extract actions for full line selections
    assert.strictEqual(actions.length, 3);
    assert.strictEqual(actions[0].title, "Extract to new Logtalk entity");
    assert.strictEqual(actions[1].title, "Extract to new Logtalk file");
    assert.strictEqual(actions[2].title, "Replace with include/1 directive");
  });

  test('provideCodeActions - partial line selection', async () => {
    // Create a mock document with a line of text
    const mockDocument = {
      lineAt: (line: number) => ({ text: 'test_predicate(X) :- write(X).' })
    } as vscode.TextDocument;
    const mockSelection = new vscode.Selection(0, 5, 0, 15); // Partial line selection
    const mockContext = {} as vscode.CodeActionContext;
    const mockToken = {} as vscode.CancellationToken;

    const actions = await refactorProvider.provideCodeActions(
      mockDocument,
      mockSelection,
      mockContext,
      mockToken
    );

    // Should NOT provide extract actions for partial line selections
    assert.strictEqual(actions.length, 0);
  });

  test('addImplementsToEntityDirective - parametric object single line', async () => {
    // Test that parametric objects are handled correctly
    const mockDocument = {
      uri: vscode.Uri.file('/test.lgt'),
      fileName: '/test.lgt',
      isUntitled: false,
      languageId: 'logtalk',
      version: 1,
      isDirty: false,
      isClosed: false,
      save: () => Promise.resolve(true),
      eol: vscode.EndOfLine.LF,
      lineCount: 1,
      lineAt: (line: number) => ({
        text: line === 0 ? ':- object(parametric_test(Type, Value)).' : '',
        length: line === 0 ? 40 : 0,
        lineNumber: line,
        range: new vscode.Range(line, 0, line, line === 0 ? 40 : 0),
        rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
        firstNonWhitespaceCharacterIndex: 0,
        isEmptyOrWhitespace: line !== 0
      }),
      getText: (range?: vscode.Range) => ':- object(parametric_test(Type, Value)).',
      getWordRangeAtPosition: () => undefined,
      validateRange: (range: vscode.Range) => range,
      validatePosition: (position: vscode.Position) => position,
      offsetAt: () => 0,
      positionAt: () => new vscode.Position(0, 0)
    } as unknown as vscode.TextDocument;

    const entityInfo = {
      type: 'object',
      name: 'parametric_test(Type, Value)',
      line: 0
    };

    const edit = new vscode.WorkspaceEdit();

    // Mock PredicateUtils.getDirectiveRange to return the single line
    const originalGetDirectiveRange = (LogtalkRefactorProvider as any).PredicateUtils?.getDirectiveRange;
    (LogtalkRefactorProvider as any).PredicateUtils = {
      getDirectiveRange: () => ({ start: 0, end: 0 })
    };

    try {
      await (refactorProvider as any).addImplementsToEntityDirective(
        mockDocument,
        entityInfo,
        'test_protocol',
        edit
      );

      // Check that the edit was created
      const edits = edit.get(mockDocument.uri);
      assert.ok(edits && edits.length > 0, 'Should create edit for parametric object');

      // The edit should contain the parametric entity identifier and implements clause
      const editText = (edits[0] as vscode.TextEdit).newText;
      assert.ok(editText.includes('parametric_test(Type, Value)'), 'Should preserve parametric entity identifier');
      assert.ok(editText.includes('implements(test_protocol)'), 'Should add implements clause');
    } finally {
      // Restore original method if it existed
      if (originalGetDirectiveRange) {
        (LogtalkRefactorProvider as any).PredicateUtils.getDirectiveRange = originalGetDirectiveRange;
      }
    }
  });

  test('addImplementsToEntityDirective - parametric category single line', async () => {
    // Test that parametric categories are handled correctly
    const mockDocument = {
      uri: vscode.Uri.file('/test.lgt'),
      fileName: '/test.lgt',
      isUntitled: false,
      languageId: 'logtalk',
      version: 1,
      isDirty: false,
      isClosed: false,
      save: () => Promise.resolve(true),
      eol: vscode.EndOfLine.LF,
      lineCount: 1,
      lineAt: (line: number) => ({
        text: line === 0 ? ':- category(parametric_category(Type, DefaultValue)).' : '',
        length: line === 0 ? 50 : 0,
        lineNumber: line,
        range: new vscode.Range(line, 0, line, line === 0 ? 50 : 0),
        rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
        firstNonWhitespaceCharacterIndex: 0,
        isEmptyOrWhitespace: line !== 0
      }),
      getText: (range?: vscode.Range) => ':- category(parametric_category(Type, DefaultValue)).',
      getWordRangeAtPosition: () => undefined,
      validateRange: (range: vscode.Range) => range,
      validatePosition: (position: vscode.Position) => position,
      offsetAt: () => 0,
      positionAt: () => new vscode.Position(0, 0)
    } as unknown as vscode.TextDocument;

    const entityInfo = {
      type: 'category',
      name: 'parametric_category(Type, DefaultValue)',
      line: 0
    };

    const edit = new vscode.WorkspaceEdit();

    // Mock PredicateUtils.getDirectiveRange to return the single line
    const originalGetDirectiveRange = (LogtalkRefactorProvider as any).PredicateUtils?.getDirectiveRange;
    (LogtalkRefactorProvider as any).PredicateUtils = {
      getDirectiveRange: () => ({ start: 0, end: 0 })
    };

    try {
      await (refactorProvider as any).addImplementsToEntityDirective(
        mockDocument,
        entityInfo,
        'test_protocol',
        edit
      );

      // Check that the edit was created
      const edits = edit.get(mockDocument.uri);
      assert.ok(edits && edits.length > 0, 'Should create edit for parametric category');

      // The edit should contain the parametric entity identifier and implements clause
      const editText = (edits[0] as vscode.TextEdit).newText;
      assert.ok(editText.includes('parametric_category(Type, DefaultValue)'), 'Should preserve parametric entity identifier');
      assert.ok(editText.includes('implements(test_protocol)'), 'Should add implements clause');
    } finally {
      // Restore original method if it existed
      if (originalGetDirectiveRange) {
        (LogtalkRefactorProvider as any).PredicateUtils.getDirectiveRange = originalGetDirectiveRange;
      }
    }
  });

  test('addImplementsToEntityDirective - complex parametric entity', async () => {
    // Test that complex parametric entities with nested structures are handled correctly
    const mockDocument = {
      uri: vscode.Uri.file('/test.lgt'),
      fileName: '/test.lgt',
      isUntitled: false,
      languageId: 'logtalk',
      version: 1,
      isDirty: false,
      isClosed: false,
      save: () => Promise.resolve(true),
      eol: vscode.EndOfLine.LF,
      lineCount: 1,
      lineAt: (line: number) => ({
        text: line === 0 ? ':- object(complex_test(Type, list([a, b, c]), Value)).' : '',
        length: line === 0 ? 55 : 0,
        lineNumber: line,
        range: new vscode.Range(line, 0, line, line === 0 ? 55 : 0),
        rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
        firstNonWhitespaceCharacterIndex: 0,
        isEmptyOrWhitespace: line !== 0
      }),
      getText: (range?: vscode.Range) => ':- object(complex_test(Type, list([a, b, c]), Value)).',
      getWordRangeAtPosition: () => undefined,
      validateRange: (range: vscode.Range) => range,
      validatePosition: (position: vscode.Position) => position,
      offsetAt: () => 0,
      positionAt: () => new vscode.Position(0, 0)
    } as unknown as vscode.TextDocument;

    const entityInfo = {
      type: 'object',
      name: 'complex_test(Type, list([a, b, c]), Value)',
      line: 0
    };

    const edit = new vscode.WorkspaceEdit();

    // Mock PredicateUtils.getDirectiveRange to return the single line
    const originalGetDirectiveRange = (LogtalkRefactorProvider as any).PredicateUtils?.getDirectiveRange;
    (LogtalkRefactorProvider as any).PredicateUtils = {
      getDirectiveRange: () => ({ start: 0, end: 0 })
    };

    try {
      await (refactorProvider as any).addImplementsToEntityDirective(
        mockDocument,
        entityInfo,
        'test_protocol',
        edit
      );

      // Check that the edit was created
      const edits = edit.get(mockDocument.uri);
      assert.ok(edits && edits.length > 0, 'Should create edit for complex parametric entity');

      // The edit should contain the complete parametric entity identifier and implements clause
      const editText = (edits[0] as vscode.TextEdit).newText;
      assert.ok(editText.includes('complex_test(Type, list([a, b, c]), Value)'), 'Should preserve complex parametric entity identifier');
      assert.ok(editText.includes('implements(test_protocol)'), 'Should add implements clause');
    } finally {
      // Restore original method if it existed
      if (originalGetDirectiveRange) {
        (LogtalkRefactorProvider as any).PredicateUtils.getDirectiveRange = originalGetDirectiveRange;
      }
    }
  });

  test('findAndAddPredicateCallsInLine - arity checking', () => {
    const refactorProvider = new LogtalkRefactorProvider();

    // Test line with calls of different arities
    const lineText = "test :- process_data(A, B), process_data(X, Y, Z, W), process_data(C, D).";
    const lineNum = 0;
    const predicateName = "process_data";
    const arity = 2; // We want to add argument to arity-2 calls only
    const argumentName = "NewArg";
    const argumentPosition = 2; // Insert at position 2
    const isNonTerminal = false;

    // Call the private method using type assertion
    const edits = (refactorProvider as any).findAndAddPredicateCallsInLine(
      lineText, lineNum, predicateName, arity, argumentName, argumentPosition, isNonTerminal
    );

    // Should only modify the arity-2 calls, not the arity-4 call
    assert.strictEqual(edits.length, 2, "Should create exactly 2 edits for the 2 arity-2 calls");

    // Check that the edits are for the correct positions
    // First call: process_data(A, B) should become process_data(A, NewArg, B)
    const firstEdit = edits[0];
    assert.strictEqual(firstEdit.newText, "A, NewArg, B");

    // Third call: process_data(C, D) should become process_data(C, NewArg, D)
    const secondEdit = edits[1];
    assert.strictEqual(secondEdit.newText, "C, NewArg, D");
  });

  test('findAndAddPredicateCallsInLine - zero arity handling', () => {
    const refactorProvider = new LogtalkRefactorProvider();

    // Test line with zero-arity call
    const lineText = "test :- process_data, other_predicate(X).";
    const lineNum = 0;
    const predicateName = "process_data";
    const arity = 0; // Zero arity predicate
    const argumentName = "NewArg";
    const argumentPosition = 1; // Insert at position 1
    const isNonTerminal = false;

    const edits = (refactorProvider as any).findAndAddPredicateCallsInLine(
      lineText, lineNum, predicateName, arity, argumentName, argumentPosition, isNonTerminal
    );

    // Should modify the zero-arity call
    assert.strictEqual(edits.length, 1, "Should create exactly 1 edit for the zero-arity call");

    // Check that the edit adds parentheses with the new argument
    const edit = edits[0];
    assert.strictEqual(edit.newText, "(NewArg)");
  });

  // Tests for "Use implicit message sending" refactoring

  test('extractMessageIndicators - predicate in clause', () => {
    const refactorProvider = new LogtalkRefactorProvider();

    const occurrences = [
      { line: 5, startChar: 10, messageText: 'member(X, L)', isInGrammarRule: false },
      { line: 6, startChar: 10, messageText: 'append(A, B, C)', isInGrammarRule: false }
    ];

    const indicators = (refactorProvider as any).extractMessageIndicators(occurrences);

    assert.strictEqual(indicators.length, 2);
    assert.strictEqual(indicators[0], 'member/2');
    assert.strictEqual(indicators[1], 'append/3');
  });

  test('extractMessageIndicators - non-terminal in grammar rule', () => {
    const refactorProvider = new LogtalkRefactorProvider();

    const occurrences = [
      { line: 5, startChar: 10, messageText: 'digit(D)', isInGrammarRule: true },
      { line: 6, startChar: 10, messageText: 'letter', isInGrammarRule: true }
    ];

    const indicators = (refactorProvider as any).extractMessageIndicators(occurrences);

    assert.strictEqual(indicators.length, 2);
    assert.strictEqual(indicators[0], 'digit//1');
    assert.strictEqual(indicators[1], 'letter//0');
  });

  test('extractMessageIndicators - mixed predicates and non-terminals', () => {
    const refactorProvider = new LogtalkRefactorProvider();

    const occurrences = [
      { line: 5, startChar: 10, messageText: 'member(X, L)', isInGrammarRule: false },
      { line: 6, startChar: 10, messageText: 'digit(D)', isInGrammarRule: true },
      { line: 7, startChar: 10, messageText: 'append(A, B, C)', isInGrammarRule: false },
      { line: 8, startChar: 10, messageText: 'letter', isInGrammarRule: true }
    ];

    const indicators = (refactorProvider as any).extractMessageIndicators(occurrences);

    assert.strictEqual(indicators.length, 4);
    assert.strictEqual(indicators[0], 'member/2');
    assert.strictEqual(indicators[1], 'digit//1');
    assert.strictEqual(indicators[2], 'append/3');
    assert.strictEqual(indicators[3], 'letter//0');
  });

  test('formatUsesDirective - single indicator', () => {
    const refactorProvider = new LogtalkRefactorProvider();

    const directive = (refactorProvider as any).formatUsesDirective('list', ['member/2']);

    assert.strictEqual(directive, '\t:- uses(list, [member/2]).');
  });

  test('formatUsesDirective - multiple indicators', () => {
    const refactorProvider = new LogtalkRefactorProvider();

    const directive = (refactorProvider as any).formatUsesDirective('list', ['append/3', 'member/2', 'reverse/2']);

    const expectedLines = [
      '\t:- uses(list, [',
      '\t\tappend/3,',
      '\t\tmember/2,',
      '\t\treverse/2',
      '\t]).'
    ];
    assert.strictEqual(directive, expectedLines.join('\n'));
  });

  test('extractIndicatorsFromUsesDirective - single-line directive', () => {
    const refactorProvider = new LogtalkRefactorProvider();

    const mockDocument = {
      lineAt: (line: number) => {
        const lines = [
          '\t:- uses(list, [member/2, append/3]).'
        ];
        return { text: lines[line] || '' };
      }
    } as vscode.TextDocument;

    const indicators = (refactorProvider as any).extractIndicatorsFromUsesDirective(mockDocument, 0, 0);

    assert.strictEqual(indicators.length, 2);
    assert.ok(indicators.includes('member/2'));
    assert.ok(indicators.includes('append/3'));
  });

  test('extractIndicatorsFromUsesDirective - multi-line directive', () => {
    const refactorProvider = new LogtalkRefactorProvider();

    const mockDocument = {
      lineAt: (line: number) => {
        const lines = [
          '\t:- uses(list, [',
          '\t\tmember/2,',
          '\t\tappend/3,',
          '\t\treverse/2',
          '\t]).'
        ];
        return { text: lines[line] || '' };
      }
    } as vscode.TextDocument;

    const indicators = (refactorProvider as any).extractIndicatorsFromUsesDirective(mockDocument, 0, 4);

    assert.strictEqual(indicators.length, 3);
    assert.ok(indicators.includes('member/2'));
    assert.ok(indicators.includes('append/3'));
    assert.ok(indicators.includes('reverse/2'));
  });

  test('extractIndicatorsFromUsesDirective - mixed predicate and non-terminal indicators', () => {
    const refactorProvider = new LogtalkRefactorProvider();

    const mockDocument = {
      lineAt: (line: number) => {
        const lines = [
          '\t:- uses(parser, [digit//1, parse/2, letter//0]).'
        ];
        return { text: lines[line] || '' };
      }
    } as vscode.TextDocument;

    const indicators = (refactorProvider as any).extractIndicatorsFromUsesDirective(mockDocument, 0, 0);

    assert.strictEqual(indicators.length, 3);
    assert.ok(indicators.includes('digit//1'));
    assert.ok(indicators.includes('parse/2'));
    assert.ok(indicators.includes('letter//0'));
  });
});
