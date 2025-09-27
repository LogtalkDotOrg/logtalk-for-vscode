import * as assert from 'assert';
import * as vscode from 'vscode';
import { LogtalkDocumentFormattingEditProvider } from '../src/features/documentFormattingEditProvider';

suite('DocumentFormattingEditProvider Tests', () => {
  let provider: LogtalkDocumentFormattingEditProvider;
  let testDocument: vscode.TextDocument;

  const unformattedContent = `% Test file for document formatting
:- object(test_formatting,
implements(some_protocol),
imports(some_category)).

:- info([
version is 1:0:0,
author is 'Test Author',
date is 2024-01-01,
comment is 'Test object for formatting'
]).

:- uses(list, [append/3, member/2, reverse/2]).

:- uses(complex_library, [
process(+input, -output),
transform(+data, ?result),
validate(+term)
]).

:- public([
test_predicate/1,
another_predicate/2
]).

test_predicate(X) :-
write('Testing: '), write(X), nl.

another_predicate(A, B) :-
append([A], [B], Result),
write(Result).

:- end_object.`;

  setup(async () => {
    provider = new LogtalkDocumentFormattingEditProvider();
    testDocument = await vscode.workspace.openTextDocument({
      content: unformattedContent,
      language: 'logtalk'
    });
  });

  test('should provide formatting edits for Logtalk document', async () => {
    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      testDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    assert.ok(edits.length > 0, 'Should provide formatting edits');
  });

  test('should format entity opening directive', async () => {
    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      testDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find edit that affects the entity opening directive
    const entityOpeningEdit = edits.find(edit =>
      edit.range.start.line <= 1 && edit.range.end.line >= 3
    );

    assert.ok(entityOpeningEdit, 'Should have edit for entity opening directive');
    
    // The formatted directive should start at column 0
    const formattedText = entityOpeningEdit.newText;
    assert.ok(formattedText.startsWith(':- object('), 'Should start with entity directive');
  });

  test('should format info directive with proper indentation', async () => {
    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      testDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find edit that affects the info directive
    const infoEdit = edits.find(edit => {
      const text = testDocument.getText(edit.range);
      return text.includes(':- info([');
    });

    assert.ok(infoEdit, 'Should have edit for info directive');
    
    // The formatted info directive should have proper indentation
    const formattedText = infoEdit.newText;
    assert.ok(formattedText.includes('\t:- info(['), 'Should be indented with tab');
    assert.ok(formattedText.includes('\t\tversion is'), 'List elements should be indented');
  });

  test('should format uses directive with proper list indentation', async () => {
    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      testDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find edit that affects a multi-line uses directive
    const usesEdit = edits.find(edit => {
      const text = testDocument.getText(edit.range);
      return text.includes('complex_library') && text.includes('process(');
    });

    assert.ok(usesEdit, 'Should have edit for multi-line uses directive');
    
    // The formatted uses directive should have proper indentation
    const formattedText = usesEdit.newText;
    assert.ok(formattedText.includes('\t:- uses('), 'Should be indented with tab');
    assert.ok(formattedText.includes('\t\tprocess('), 'List elements should be indented');
  });

  test('should indent entity content', async () => {
    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      testDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find edits that affect predicate definitions
    const predicateEdits = edits.filter(edit => {
      const text = testDocument.getText(edit.range);
      return text.includes('test_predicate') || text.includes('another_predicate');
    });

    assert.ok(predicateEdits.length > 0, 'Should have edits for predicate definitions');
    
    // Check that predicates are properly indented
    predicateEdits.forEach(edit => {
      assert.ok(edit.newText.startsWith('\t'), 'Predicate should be indented with tab');
    });
  });

  test('should handle documents without entity directives', async () => {
    const simpleContent = `% Simple Logtalk file without entity
test_fact(value).
test_rule(X) :- test_fact(X).`;

    const simpleDocument = await vscode.workspace.openTextDocument({
      content: simpleContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      simpleDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Should return empty array for documents without entity directives
    assert.strictEqual(edits.length, 0, 'Should not provide edits for non-entity documents');
  });

  test('should format single-element uses directive as multi-line', async () => {
    const bugContent = `:- object(test_bug).

:- uses(library, [member(+term, ?list)]).

:- end_object.`;

    const bugDocument = await vscode.workspace.openTextDocument({
      content: bugContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      bugDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the uses directive edit
    const usesEdit = edits.find(edit => {
      const text = bugDocument.getText(edit.range);
      return text.includes('member(+term, ?list)');
    });

    assert.ok(usesEdit, 'Should have edit for uses directive');

    // Should format single element as multi-line
    const formattedText = usesEdit.newText;
    const expectedFormat = '\t:- uses(library, [\n\t\tmember(+term, ?list)\n\t]).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format single element as multi-line with proper indentation');
  });

  test('should format unindented single-element uses directive as multi-line', async () => {
    const unindentedContent = `:- object(test_unindented).

:- uses(library, [single_predicate/1]).

:- end_object.`;

    const unindentedDocument = await vscode.workspace.openTextDocument({
      content: unindentedContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      unindentedDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the uses directive edit
    const usesEdit = edits.find(edit => {
      const text = unindentedDocument.getText(edit.range);
      return text.includes('single_predicate/1');
    });

    assert.ok(usesEdit, 'Should have edit for unindented uses directive');

    // Should format as multi-line even for single element
    const formattedText = usesEdit.newText;
    const expectedFormat = '\t:- uses(library, [\n\t\tsingle_predicate/1\n\t]).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format single element as multi-line with proper indentation');
  });

  test('should format info/2 directive with proper indentation', async () => {
    const info2Content = `:- object(test_info2).

:- info(test_predicate/2, [
comment is 'A test predicate',
argnames is ['Input', 'Output']
]).

:- end_object.`;

    const info2Document = await vscode.workspace.openTextDocument({
      content: info2Content,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      info2Document,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the info/2 directive edit
    const info2Edit = edits.find(edit => {
      const text = info2Document.getText(edit.range);
      return text.includes('test_predicate/2') && text.includes('comment is');
    });

    assert.ok(info2Edit, 'Should have edit for info/2 directive');

    // Should format as multi-line with proper indentation
    const formattedText = info2Edit.newText;
    const expectedFormat = '\t:- info(test_predicate/2, [\n\t\tcomment is \'A test predicate\',\n\t\targnames is [\'Input\', \'Output\']\n\t]).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format info/2 directive as multi-line with proper indentation');
  });

  test('should format info/2 directive with arguments list', async () => {
    const argumentsContent = `:- object(test_arguments).

:- info(complex_predicate/3, [
comment is 'Complex predicate',
arguments is ['Input'-'The input', 'Options'-'Processing options', 'Result'-'The result']
]).

:- end_object.`;

    const argumentsDocument = await vscode.workspace.openTextDocument({
      content: argumentsContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      argumentsDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the info/2 directive edit with arguments
    const argumentsEdit = edits.find(edit => {
      const text = argumentsDocument.getText(edit.range);
      return text.includes('arguments is') && text.includes('Input');
    });

    assert.ok(argumentsEdit, 'Should have edit for info/2 directive with arguments');

    // Should format arguments list with proper indentation
    const formattedText = argumentsEdit.newText;
    assert.ok(formattedText.includes('arguments is [\n\t\t\t'),
      'Should format arguments list as multi-line');
    assert.ok(formattedText.includes('\'Input\'-\'The input\''),
      'Should preserve argument descriptions');
  });

  test('should format info/2 directive with examples list', async () => {
    const examplesContent = `:- object(test_examples).

:- info(example_predicate/1, [
comment is 'Predicate with examples',
examples is ['example_predicate(test) - Basic usage', 'example_predicate([]) - Empty case']
]).

:- end_object.`;

    const examplesDocument = await vscode.workspace.openTextDocument({
      content: examplesContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      examplesDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the info/2 directive edit with examples
    const examplesEdit = edits.find(edit => {
      const text = examplesDocument.getText(edit.range);
      return text.includes('examples is') && text.includes('Basic usage');
    });

    assert.ok(examplesEdit, 'Should have edit for info/2 directive with examples');

    // Should format examples list with proper indentation
    const formattedText = examplesEdit.newText;
    assert.ok(formattedText.includes('examples is [\n\t\t\t'),
      'Should format examples list as multi-line');
    assert.ok(formattedText.includes('Basic usage'),
      'Should preserve example descriptions');
  });

  test('should format entity opening directive with multiple relations', async () => {
    const entityContent = `:- object(multi_relation_object, implements(protocol1), imports(category1), extends(parent_object)).

:- end_object.`;

    const entityDocument = await vscode.workspace.openTextDocument({
      content: entityContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      entityDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the entity opening directive edit
    const entityEdit = edits.find(edit => {
      const text = entityDocument.getText(edit.range);
      return text.includes('multi_relation_object') && text.includes('implements');
    });

    assert.ok(entityEdit, 'Should have edit for entity opening directive');

    // Should format as multi-line with proper indentation
    const formattedText = entityEdit.newText;
    const expectedFormat = ':- object(multi_relation_object,\n\timplements(protocol1),\n\timports(category1),\n\textends(parent_object)).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format entity opening directive as multi-line with proper indentation');
  });

  test('should keep single relation entity directive on one line', async () => {
    const singleRelationContent = `:- object(single_relation_object, implements(some_protocol)).

:- end_object.`;

    const singleRelationDocument = await vscode.workspace.openTextDocument({
      content: singleRelationContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      singleRelationDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the entity opening directive edit
    const entityEdit = edits.find(edit => {
      const text = singleRelationDocument.getText(edit.range);
      return text.includes('single_relation_object');
    });

    assert.ok(entityEdit, 'Should have edit for single relation entity directive');

    // Should stay single line
    const formattedText = entityEdit.newText;
    assert.ok(!formattedText.includes('\n\t'),
      'Should keep single relation on one line');
    assert.ok(formattedText.includes('implements(some_protocol)'),
      'Should preserve the relation');
  });

  test('should format parametric entity with relations', async () => {
    const parametricContent = `:- object(parametric_object(Parameter, "String", 33.78), implements(protocol), imports(category), extends(parent(Parameter))).

:- end_object.`;

    const parametricDocument = await vscode.workspace.openTextDocument({
      content: parametricContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      parametricDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the entity opening directive edit
    const entityEdit = edits.find(edit => {
      const text = parametricDocument.getText(edit.range);
      return text.includes('parametric_object') && text.includes('Parameter');
    });

    assert.ok(entityEdit, 'Should have edit for parametric entity directive');

    // Should format as multi-line with proper indentation
    const formattedText = entityEdit.newText;
    assert.ok(formattedText.includes('parametric_object(Parameter, "String", 33.78),\n\t'),
      'Should format parametric entity as multi-line');
    assert.ok(formattedText.includes('implements(protocol)'),
      'Should preserve relations');
  });

  test('should format category opening directive', async () => {
    const categoryContent = `:- category(test_category, implements(protocol), extends(other_category)).

:- end_category.`;

    const categoryDocument = await vscode.workspace.openTextDocument({
      content: categoryContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      categoryDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the category opening directive edit
    const categoryEdit = edits.find(edit => {
      const text = categoryDocument.getText(edit.range);
      return text.includes('test_category') && text.includes('category');
    });

    assert.ok(categoryEdit, 'Should have edit for category opening directive');

    // Should format as multi-line with proper indentation
    const formattedText = categoryEdit.newText;
    const expectedFormat = ':- category(test_category,\n\timplements(protocol),\n\textends(other_category)).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format category opening directive as multi-line with proper indentation');
  });

  test('should format complex nested entity directive with compound terms', async () => {
    const complexContent = `:- object(speech(Season, Event), imports((dress(Season), speech(Event)))).

:- end_object.`;

    const complexDocument = await vscode.workspace.openTextDocument({
      content: complexContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      complexDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the complex entity opening directive edit
    const complexEdit = edits.find(edit => {
      const text = complexDocument.getText(edit.range);
      return text.includes('speech(Season, Event)') && text.includes('imports');
    });

    assert.ok(complexEdit, 'Should have edit for complex entity opening directive');

    // Should format as multi-line with proper indentation
    const formattedText = complexEdit.newText;
    const expectedFormat = ':- object(speech(Season, Event),\n\timports((dress(Season), speech(Event)))).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format complex nested entity directive as multi-line with proper indentation');
  });

  test('should format entity directive with multiple complex relations', async () => {
    const multiComplexContent = `:- object(complex_nested_example(Param1, Param2), implements(protocol(nested(deep))), imports((module1(Param1), module2(Param2))), extends(parent(complex, structure))).

:- end_object.`;

    const multiComplexDocument = await vscode.workspace.openTextDocument({
      content: multiComplexContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      multiComplexDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the multi-complex entity opening directive edit
    const multiComplexEdit = edits.find(edit => {
      const text = multiComplexDocument.getText(edit.range);
      return text.includes('complex_nested_example') && text.includes('implements');
    });

    assert.ok(multiComplexEdit, 'Should have edit for multi-complex entity opening directive');

    // Should format as multi-line with proper indentation
    const formattedText = multiComplexEdit.newText;
    assert.ok(formattedText.includes('complex_nested_example(Param1, Param2),\n\t'),
      'Should format entity name on first line');
    assert.ok(formattedText.includes('implements(protocol(nested(deep))),\n\t'),
      'Should format first relation on second line');
    assert.ok(formattedText.includes('imports((module1(Param1), module2(Param2))),\n\t'),
      'Should format second relation on third line');
    assert.ok(formattedText.includes('extends(parent(complex, structure))'),
      'Should format third relation on fourth line');
  });

  test('should format alias/2 directive with proper indentation', async () => {
    const aliasContent = `:- object(test_alias).

:- alias(collection, [member/2 as collection_member/2, append/3 as collection_append/3]).

:- end_object.`;

    const aliasDocument = await vscode.workspace.openTextDocument({
      content: aliasContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      aliasDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the alias/2 directive edit
    const aliasEdit = edits.find(edit => {
      const text = aliasDocument.getText(edit.range);
      return text.includes('alias') && text.includes('collection');
    });

    assert.ok(aliasEdit, 'Should have edit for alias/2 directive');

    // Should format as multi-line with proper indentation
    const formattedText = aliasEdit.newText;
    const expectedFormat = '\t:- alias(collection, [\n\t\tmember/2 as collection_member/2,\n\t\tappend/3 as collection_append/3\n\t]).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format alias/2 directive as multi-line with proper indentation');
  });

  test('should format single alias directive', async () => {
    const singleAliasContent = `:- object(test_single_alias).

:- alias(single_library, [only_predicate/1 as lib_only_predicate/1]).

:- end_object.`;

    const singleAliasDocument = await vscode.workspace.openTextDocument({
      content: singleAliasContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      singleAliasDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the single alias directive edit
    const singleAliasEdit = edits.find(edit => {
      const text = singleAliasDocument.getText(edit.range);
      return text.includes('single_library') && text.includes('only_predicate');
    });

    assert.ok(singleAliasEdit, 'Should have edit for single alias directive');

    // Should format as multi-line (consistent with uses/2 behavior)
    const formattedText = singleAliasEdit.newText;
    const expectedFormat = '\t:- alias(single_library, [\n\t\tonly_predicate/1 as lib_only_predicate/1\n\t]).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format single alias as multi-line with proper indentation');
  });

  test('should format alias/2 directive with non-terminal indicators', async () => {
    const nonTerminalContent = `:- object(test_non_terminal_alias).

:- alias(words, [singular//0 as peculiar//0, plural//1 as strange//1]).

:- end_object.`;

    const nonTerminalDocument = await vscode.workspace.openTextDocument({
      content: nonTerminalContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      nonTerminalDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the non-terminal alias directive edit
    const nonTerminalEdit = edits.find(edit => {
      const text = nonTerminalDocument.getText(edit.range);
      return text.includes('words') && text.includes('singular//0');
    });

    assert.ok(nonTerminalEdit, 'Should have edit for non-terminal alias directive');

    // Should format as multi-line with proper indentation
    const formattedText = nonTerminalEdit.newText;
    assert.ok(formattedText.includes('singular//0 as peculiar//0'),
      'Should preserve non-terminal indicators');
    assert.ok(formattedText.includes('\t:- alias(words, [\n\t\t'),
      'Should format as multi-line with proper indentation');
  });

  test('should format alias/2 directive with compound term as first argument', async () => {
    const compoundTermContent = `:- object(test_compound_alias).

:- alias(rectangle(_, _), [width/1 as side/1]).

:- end_object.`;

    const compoundTermDocument = await vscode.workspace.openTextDocument({
      content: compoundTermContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      compoundTermDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the compound term alias directive edit
    const compoundEdit = edits.find(edit => {
      const text = compoundTermDocument.getText(edit.range);
      return text.includes('rectangle(_, _)') && text.includes('width/1');
    });

    assert.ok(compoundEdit, 'Should have edit for compound term alias directive');

    // Should format as multi-line with proper indentation
    const formattedText = compoundEdit.newText;
    const expectedFormat = '\t:- alias(rectangle(_, _), [\n\t\twidth/1 as side/1\n\t]).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format compound term alias directive correctly');
  });

  test('should format alias/2 directive with complex compound term and multiple aliases', async () => {
    const complexCompoundContent = `:- object(test_complex_compound).

:- alias(shape(Type, Size), [area/1 as shape_area/1, perimeter/1 as shape_perimeter/1]).

:- end_object.`;

    const complexCompoundDocument = await vscode.workspace.openTextDocument({
      content: complexCompoundContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      complexCompoundDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the complex compound term alias directive edit
    const complexEdit = edits.find(edit => {
      const text = complexCompoundDocument.getText(edit.range);
      return text.includes('shape(Type, Size)') && text.includes('area/1');
    });

    assert.ok(complexEdit, 'Should have edit for complex compound term alias directive');

    // Should format as multi-line with proper indentation
    const formattedText = complexEdit.newText;
    assert.ok(formattedText.includes('shape(Type, Size)'),
      'Should preserve compound term structure');
    assert.ok(formattedText.includes('area/1 as shape_area/1'),
      'Should format first alias correctly');
    assert.ok(formattedText.includes('perimeter/1 as shape_perimeter/1'),
      'Should format second alias correctly');
    assert.ok(formattedText.includes('\t:- alias(shape(Type, Size), [\n\t\t'),
      'Should format as multi-line with proper indentation');
  });

  test('should format info/2 directive with compound term predicate indicator', async () => {
    const compoundInfo2Content = `:- object(test_compound_info2).

:- info(process(+Data, -Result), [comment is 'Processes data and returns result', arguments is [Data-'Input data', Result-'Processed result']]).

:- end_object.`;

    const compoundInfo2Document = await vscode.workspace.openTextDocument({
      content: compoundInfo2Content,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      compoundInfo2Document,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the compound term info/2 directive edit
    const compoundInfo2Edit = edits.find(edit => {
      const text = compoundInfo2Document.getText(edit.range);
      return text.includes('process(+Data, -Result)') && text.includes('comment is');
    });

    assert.ok(compoundInfo2Edit, 'Should have edit for compound term info/2 directive');

    // Should format as multi-line with proper indentation
    const formattedText = compoundInfo2Edit.newText;
    assert.ok(formattedText.includes('process(+Data, -Result)'),
      'Should preserve compound term predicate indicator');
    assert.ok(formattedText.includes('\t:- info(process(+Data, -Result), [\n\t\t'),
      'Should format as multi-line with proper indentation');
  });

  test('should format uses/2 directive with compound term object name', async () => {
    const compoundUsesContent = `:- object(test_compound_uses).

:- uses(library(lists), [member/2, append/3]).

:- end_object.`;

    const compoundUsesDocument = await vscode.workspace.openTextDocument({
      content: compoundUsesContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      compoundUsesDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the compound term uses/2 directive edit
    const compoundUsesEdit = edits.find(edit => {
      const text = compoundUsesDocument.getText(edit.range);
      return text.includes('library(lists)') && text.includes('member/2');
    });

    assert.ok(compoundUsesEdit, 'Should have edit for compound term uses/2 directive');

    // Should format as multi-line with proper indentation
    const formattedText = compoundUsesEdit.newText;
    const expectedFormat = '\t:- uses(library(lists), [\n\t\tmember/2,\n\t\tappend/3\n\t]).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format compound term uses directive correctly');
  });

  test('should format multiple entities in a single file', async () => {
    const multipleEntitiesContent = `:- protocol(test_protocol).
:- info([version is 1:0:0]).
:- end_protocol.

:- object(test_object).
:- info([version is 1:0:0]).
:- end_object.

:- category(test_category).
:- info([version is 1:0:0]).
:- end_category.`;

    const multipleEntitiesDocument = await vscode.workspace.openTextDocument({
      content: multipleEntitiesContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      multipleEntitiesDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Should have edits for all three entities
    const protocolEdits = edits.filter(edit => {
      const text = multipleEntitiesDocument.getText(edit.range);
      return text.includes('protocol') || text.includes('end_protocol');
    });

    const objectEdits = edits.filter(edit => {
      const text = multipleEntitiesDocument.getText(edit.range);
      return text.includes('object') || text.includes('end_object');
    });

    const categoryEdits = edits.filter(edit => {
      const text = multipleEntitiesDocument.getText(edit.range);
      return text.includes('category') || text.includes('end_category');
    });

    assert.ok(protocolEdits.length > 0, 'Should have edits for protocol entity');
    assert.ok(objectEdits.length > 0, 'Should have edits for object entity');
    assert.ok(categoryEdits.length > 0, 'Should have edits for category entity');

    // Check that info directives in all entities are formatted
    const infoEdits = edits.filter(edit => {
      const text = edit.newText;
      return text.includes(':- info([') && text.includes('\n\t\t');
    });

    assert.strictEqual(infoEdits.length, 3, 'Should format info directives in all three entities');
  });

  test('should format nested entities correctly', async () => {
    const nestedEntitiesContent = `:- object(outer_object).

:- info([comment is 'Outer object']).

:- uses(list, [member/2]).

:- end_object.

:- object(inner_object, extends(outer_object)).

:- info([comment is 'Inner object', version is 2:0:0]).

:- alias(list, [append/3 as list_append/3]).

:- end_object.`;

    const nestedEntitiesDocument = await vscode.workspace.openTextDocument({
      content: nestedEntitiesContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      nestedEntitiesDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Should format both objects
    const outerObjectEdits = edits.filter(edit => {
      const text = nestedEntitiesDocument.getText(edit.range);
      return text.includes('outer_object');
    });

    const innerObjectEdits = edits.filter(edit => {
      const text = nestedEntitiesDocument.getText(edit.range);
      return text.includes('inner_object');
    });

    assert.ok(outerObjectEdits.length > 0, 'Should have edits for outer object');
    assert.ok(innerObjectEdits.length > 0, 'Should have edits for inner object');

    // Check that uses and alias directives are formatted in their respective objects
    const usesEdit = edits.find(edit => edit.newText.includes('uses(list, ['));
    const aliasEdit = edits.find(edit => edit.newText.includes('alias(list, ['));

    assert.ok(usesEdit, 'Should format uses directive in outer object');
    assert.ok(aliasEdit, 'Should format alias directive in inner object');
  });

  test('should format uses/1 directive with proper indentation', async () => {
    const uses1Content = `:- object(test_uses1).

:- uses([list, set, queue]).

:- end_object.`;

    const uses1Document = await vscode.workspace.openTextDocument({
      content: uses1Content,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      uses1Document,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the uses/1 directive edit
    const uses1Edit = edits.find(edit => {
      const text = uses1Document.getText(edit.range);
      return text.includes('uses([') && text.includes('list');
    });

    assert.ok(uses1Edit, 'Should have edit for uses/1 directive');

    // Should format as multi-line with proper indentation
    const formattedText = uses1Edit.newText;
    const expectedFormat = '\t:- uses([\n\t\tlist,\n\t\tset,\n\t\tqueue\n\t]).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format uses/1 directive as multi-line with proper indentation');
  });

  test('should format use_module/1 directive with proper indentation', async () => {
    const useModuleContent = `:- object(test_use_module).

:- use_module([library(lists), library(apply)]).

:- end_object.`;

    const useModuleDocument = await vscode.workspace.openTextDocument({
      content: useModuleContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      useModuleDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the use_module/1 directive edit
    const useModuleEdit = edits.find(edit => {
      const text = useModuleDocument.getText(edit.range);
      return text.includes('use_module([') && text.includes('library');
    });

    assert.ok(useModuleEdit, 'Should have edit for use_module/1 directive');

    // Should format as multi-line with proper indentation
    const formattedText = useModuleEdit.newText;
    assert.ok(formattedText.includes('library(lists)'),
      'Should preserve library structure');
    assert.ok(formattedText.includes('\t:- use_module([\n\t\t'),
      'Should format as multi-line with proper indentation');
  });

  test('should format scope directives (public/1, protected/1, private/1)', async () => {
    const scopeContent = `:- object(test_scope).

:- public([member/2, append/3]).
:- protected([helper/1]).
:- private([internal/0, cache/1]).

:- end_object.`;

    const scopeDocument = await vscode.workspace.openTextDocument({
      content: scopeContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      scopeDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find scope directive edits
    const publicEdit = edits.find(edit => {
      const text = scopeDocument.getText(edit.range);
      return text.includes('public([') && text.includes('member/2');
    });

    const protectedEdit = edits.find(edit => {
      const text = scopeDocument.getText(edit.range);
      return text.includes('protected([') && text.includes('helper/1');
    });

    const privateEdit = edits.find(edit => {
      const text = scopeDocument.getText(edit.range);
      return text.includes('private([') && text.includes('internal/0');
    });

    assert.ok(publicEdit, 'Should have edit for public/1 directive');
    assert.ok(protectedEdit, 'Should have edit for protected/1 directive');
    assert.ok(privateEdit, 'Should have edit for private/1 directive');

    // Check public directive formatting
    const publicFormatted = publicEdit.newText;
    const expectedPublicFormat = '\t:- public([\n\t\tmember/2,\n\t\tappend/3\n\t]).';
    assert.strictEqual(publicFormatted, expectedPublicFormat,
      'Should format public/1 directive correctly');
  });

  test('should format predicate property directives (dynamic/1, discontiguous/1, etc.)', async () => {
    const propertyContent = `:- object(test_properties).

:- dynamic([counter/1, cache/2]).
:- discontiguous([process/2, validate/1]).
:- multifile([hook/2, extension/1]).
:- synchronized([thread_safe/1]).
:- coinductive([infinite/1]).

:- end_object.`;

    const propertyDocument = await vscode.workspace.openTextDocument({
      content: propertyContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      propertyDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find property directive edits
    const dynamicEdit = edits.find(edit => {
      const text = propertyDocument.getText(edit.range);
      return text.includes('dynamic([') && text.includes('counter/1');
    });

    const discontiguousEdit = edits.find(edit => {
      const text = propertyDocument.getText(edit.range);
      return text.includes('discontiguous([') && text.includes('process/2');
    });

    const multifileEdit = edits.find(edit => {
      const text = propertyDocument.getText(edit.range);
      return text.includes('multifile([') && text.includes('hook/2');
    });

    const synchronizedEdit = edits.find(edit => {
      const text = propertyDocument.getText(edit.range);
      return text.includes('synchronized([') && text.includes('thread_safe/1');
    });

    const coinductiveEdit = edits.find(edit => {
      const text = propertyDocument.getText(edit.range);
      return text.includes('coinductive([') && text.includes('infinite/1');
    });

    assert.ok(dynamicEdit, 'Should have edit for dynamic/1 directive');
    assert.ok(discontiguousEdit, 'Should have edit for discontiguous/1 directive');
    assert.ok(multifileEdit, 'Should have edit for multifile/1 directive');
    assert.ok(synchronizedEdit, 'Should have edit for synchronized/1 directive');
    assert.ok(coinductiveEdit, 'Should have edit for coinductive/1 directive');

    // Check dynamic directive formatting
    const dynamicFormatted = dynamicEdit.newText;
    const expectedDynamicFormat = '\t:- dynamic([\n\t\tcounter/1,\n\t\tcache/2\n\t]).';
    assert.strictEqual(dynamicFormatted, expectedDynamicFormat,
      'Should format dynamic/1 directive correctly');

    // Check discontiguous directive formatting
    const discontiguousFormatted = discontiguousEdit.newText;
    assert.ok(discontiguousFormatted.includes('\t:- discontiguous([\n\t\t'),
      'Should format discontiguous/1 directive as multi-line');
  });

  test('should format single element list directives', async () => {
    const singleElementContent = `:- object(test_single_elements).

:- uses([single_library]).
:- public([single_predicate/1]).
:- dynamic([single_fact/1]).

:- end_object.`;

    const singleElementDocument = await vscode.workspace.openTextDocument({
      content: singleElementContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      singleElementDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find single element directive edits
    const singleUsesEdit = edits.find(edit => {
      const text = singleElementDocument.getText(edit.range);
      return text.includes('uses([') && text.includes('single_library');
    });

    const singlePublicEdit = edits.find(edit => {
      const text = singleElementDocument.getText(edit.range);
      return text.includes('public([') && text.includes('single_predicate/1');
    });

    assert.ok(singleUsesEdit, 'Should have edit for single element uses/1 directive');
    assert.ok(singlePublicEdit, 'Should have edit for single element public/1 directive');

    // Should format as multi-line even for single elements (consistency)
    const singleUsesFormatted = singleUsesEdit.newText;
    const expectedSingleUsesFormat = '\t:- uses([\n\t\tsingle_library\n\t]).';
    assert.strictEqual(singleUsesFormatted, expectedSingleUsesFormat,
      'Should format single element uses/1 directive as multi-line');
  });

  test('should format use_module/2 directive with proper indentation', async () => {
    const useModule2Content = `:- object(test_use_module2).

:- use_module(library(lists), [member/2, append/3, reverse/2]).

:- end_object.`;

    const useModule2Document = await vscode.workspace.openTextDocument({
      content: useModule2Content,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      useModule2Document,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the use_module/2 directive edit
    const useModule2Edit = edits.find(edit => {
      const text = useModule2Document.getText(edit.range);
      return text.includes('use_module(library(lists)') && text.includes('member/2');
    });

    assert.ok(useModule2Edit, 'Should have edit for use_module/2 directive');

    // Should format as multi-line with proper indentation
    const formattedText = useModule2Edit.newText;
    const expectedFormat = '\t:- use_module(library(lists), [\n\t\tmember/2,\n\t\tappend/3,\n\t\treverse/2\n\t]).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format use_module/2 directive as multi-line with proper indentation');
  });

  test('should format use_module/2 directive with complex module name', async () => {
    const complexUseModule2Content = `:- object(test_complex_use_module2).

:- use_module(library(clpfd), [ins/2, label/1, #=/2]).

:- end_object.`;

    const complexUseModule2Document = await vscode.workspace.openTextDocument({
      content: complexUseModule2Content,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      complexUseModule2Document,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the complex use_module/2 directive edit
    const complexUseModule2Edit = edits.find(edit => {
      const text = complexUseModule2Document.getText(edit.range);
      return text.includes('use_module(library(clpfd)') && text.includes('ins/2');
    });

    assert.ok(complexUseModule2Edit, 'Should have edit for complex use_module/2 directive');

    // Should format as multi-line with proper indentation
    const formattedText = complexUseModule2Edit.newText;
    assert.ok(formattedText.includes('library(clpfd)'),
      'Should preserve complex module name structure');
    assert.ok(formattedText.includes('#=/2'),
      'Should preserve operator predicate names');
    assert.ok(formattedText.includes('\t:- use_module(library(clpfd), [\n\t\t'),
      'Should format as multi-line with proper indentation');
  });

  test('should format single element use_module/2 directive', async () => {
    const singleUseModule2Content = `:- object(test_single_use_module2).

:- use_module(library(debug), [debug/2]).

:- end_object.`;

    const singleUseModule2Document = await vscode.workspace.openTextDocument({
      content: singleUseModule2Content,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      singleUseModule2Document,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find the single element use_module/2 directive edit
    const singleUseModule2Edit = edits.find(edit => {
      const text = singleUseModule2Document.getText(edit.range);
      return text.includes('use_module(library(debug)') && text.includes('debug/2');
    });

    assert.ok(singleUseModule2Edit, 'Should have edit for single element use_module/2 directive');

    // Should format as multi-line even for single elements (consistency)
    const formattedText = singleUseModule2Edit.newText;
    const expectedFormat = '\t:- use_module(library(debug), [\n\t\tdebug/2\n\t]).';
    assert.strictEqual(formattedText, expectedFormat,
      'Should format single element use_module/2 directive as multi-line');
  });

  test('should convert spaces to tabs based on tab size setting', async () => {
    const spaceIndentedContent = `:- object(test_space_conversion).

    :- info([version is 1:0:0]).

    test_predicate(Value) :-
        Value > 0.

:- end_object.`;

    const spaceIndentedDocument = await vscode.workspace.openTextDocument({
      content: spaceIndentedContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      spaceIndentedDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find edits that convert spaces to tabs
    const spaceToTabEdits = edits.filter(edit => {
      const originalText = spaceIndentedDocument.getText(edit.range);
      return originalText.startsWith('    ') && edit.newText.startsWith('\t');
    });

    assert.ok(spaceToTabEdits.length > 0, 'Should have edits that convert spaces to tabs');

    // Check specific conversion: 4 spaces should become 1 tab
    const infoEdit = edits.find(edit => {
      const originalText = spaceIndentedDocument.getText(edit.range);
      return originalText.includes('info([version');
    });

    assert.ok(infoEdit, 'Should have edit for info directive');
    assert.ok(infoEdit.newText.startsWith('\t'), 'Should convert 4 spaces to 1 tab');

    // Check predicate body: 8 spaces should become 2 tabs
    const predicateBodyEdit = edits.find(edit => {
      const originalText = spaceIndentedDocument.getText(edit.range);
      return originalText.includes('Value > 0');
    });

    assert.ok(predicateBodyEdit, 'Should have edit for predicate body');
    assert.ok(predicateBodyEdit.newText.startsWith('\t\t'), 'Should convert 8 spaces to 2 tabs');
  });

  test('should handle mixed tab and space indentation', async () => {
    const mixedIndentContent = `:- object(test_mixed_indent).

	    :- info([version is 1:0:0]).

    test_predicate(X) :-
	    X > 0.

:- end_object.`;

    const mixedIndentDocument = await vscode.workspace.openTextDocument({
      content: mixedIndentContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      mixedIndentDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find edit for mixed indentation line (tab + 4 spaces)
    const mixedIndentEdit = edits.find(edit => {
      const originalText = mixedIndentDocument.getText(edit.range);
      return originalText.includes('info([version') && originalText.startsWith('\t    ');
    });

    assert.ok(mixedIndentEdit, 'Should have edit for mixed indentation line');
    // Tab + 4 spaces should become 2 tabs (1 existing tab + 1 tab from 4 spaces)
    assert.ok(mixedIndentEdit.newText.startsWith('\t\t'), 'Should normalize mixed indentation to tabs');

    // Verify the exact conversion: tab + 4 spaces → 2 tabs
    assert.strictEqual(mixedIndentEdit.newText.match(/^\t*/)?.[0].length, 2,
      'Should convert tab + 4 spaces to exactly 2 tabs');
  });

  test('should handle different tab size settings', async () => {
    const spaceContent = `:- object(test_tab_size).

  :- info([version is 1:0:0]).

      test_predicate(X) :-
        X > 0.

:- end_object.`;

    const spaceDocument = await vscode.workspace.openTextDocument({
      content: spaceContent,
      language: 'logtalk'
    });

    // Test with tab size 2
    const optionsTabSize2: vscode.FormattingOptions = {
      tabSize: 2,
      insertSpaces: false
    };

    const editsTabSize2 = provider.provideDocumentFormattingEdits(
      spaceDocument,
      optionsTabSize2,
      new vscode.CancellationTokenSource().token
    );

    // With tab size 2: 2 spaces should become 1 tab, 6 spaces should become 3 tabs
    const infoEditTabSize2 = editsTabSize2.find(edit => {
      const originalText = spaceDocument.getText(edit.range);
      return originalText.includes('info([version') && originalText.startsWith('  ');
    });

    assert.ok(infoEditTabSize2, 'Should have edit for info directive with tab size 2');
    assert.ok(infoEditTabSize2.newText.startsWith('\t'), 'Should convert 2 spaces to 1 tab with tab size 2');

    // Test with tab size 8
    const optionsTabSize8: vscode.FormattingOptions = {
      tabSize: 8,
      insertSpaces: false
    };

    const editsTabSize8 = provider.provideDocumentFormattingEdits(
      spaceDocument,
      optionsTabSize8,
      new vscode.CancellationTokenSource().token
    );

    // With tab size 8: 2 spaces should stay as minimum 1 tab, 6 spaces should stay as 1 tab
    const infoEditTabSize8 = editsTabSize8.find(edit => {
      const originalText = spaceDocument.getText(edit.range);
      return originalText.includes('info([version') && originalText.startsWith('  ');
    });

    assert.ok(infoEditTabSize8, 'Should have edit for info directive with tab size 8');
    assert.ok(infoEditTabSize8.newText.startsWith('\t'), 'Should ensure minimum 1 tab indentation with tab size 8');
  });

  test('should correctly handle tab followed by spaces combinations', async () => {
    const tabPlusSpacesContent = `:- object(test_tab_plus_spaces).

	    :- info([version is 1:0:0]).
	        test_predicate(X) :-
	            X > 0.

:- end_object.`;

    const tabPlusSpacesDocument = await vscode.workspace.openTextDocument({
      content: tabPlusSpacesContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      tabPlusSpacesDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Test tab + 4 spaces → 2 tabs
    const infoEdit = edits.find(edit => {
      const originalText = tabPlusSpacesDocument.getText(edit.range);
      return originalText.includes('info([version') && originalText.startsWith('\t    ');
    });

    assert.ok(infoEdit, 'Should have edit for tab + 4 spaces line');
    const infoTabCount = infoEdit.newText.match(/^\t*/)?.[0].length || 0;
    assert.strictEqual(infoTabCount, 2, 'Should convert tab + 4 spaces to 2 tabs');

    // Test tab + 8 spaces → 3 tabs
    const predicateEdit = edits.find(edit => {
      const originalText = tabPlusSpacesDocument.getText(edit.range);
      return originalText.includes('test_predicate(X)') && originalText.startsWith('\t        ');
    });

    assert.ok(predicateEdit, 'Should have edit for tab + 8 spaces line');
    const predicateTabCount = predicateEdit.newText.match(/^\t*/)?.[0].length || 0;
    assert.strictEqual(predicateTabCount, 3, 'Should convert tab + 8 spaces to 3 tabs');

    // Test tab + 12 spaces → 4 tabs
    const bodyEdit = edits.find(edit => {
      const originalText = tabPlusSpacesDocument.getText(edit.range);
      return originalText.includes('X > 0') && originalText.startsWith('\t            ');
    });

    assert.ok(bodyEdit, 'Should have edit for tab + 12 spaces line');
    const bodyTabCount = bodyEdit.newText.match(/^\t*/)?.[0].length || 0;
    assert.strictEqual(bodyTabCount, 4, 'Should convert tab + 12 spaces to 4 tabs');
  });

  test('should indent content inside object that is not already indented', async () => {
    const unindentedObjectContent = `:- object(simple(_HeapType_)).

% allow consistently using the same object parametrization
% for all message-sending calls by simply defining an alias
:- uses([
	heap(_HeapType_) as h
]).

:- public(insert_top/2).
insert_top(List, Key-Value) :-
	h::as_heap(List, Heap),
	h::top(Heap, Key, Value).

:- end_object.`;

    const unindentedObjectDocument = await vscode.workspace.openTextDocument({
      content: unindentedObjectContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      unindentedObjectDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Find edits that add indentation to content inside the object
    const indentationEdits = edits.filter(edit => {
      const originalText = unindentedObjectDocument.getText(edit.range);
      return originalText.trim() !== '' && !originalText.startsWith('\t') && edit.newText.startsWith('\t');
    });

    assert.ok(indentationEdits.length > 0, 'Should have edits that add indentation to unindented content');

    // Check specific lines that should be indented
    const commentEdit = edits.find(edit => {
      const originalText = unindentedObjectDocument.getText(edit.range);
      return originalText.includes('% allow consistently using');
    });

    assert.ok(commentEdit, 'Should have edit for comment line');
    assert.ok(commentEdit.newText.startsWith('\t'), 'Comment should be indented with tab');

    const usesEdit = edits.find(edit => {
      const originalText = unindentedObjectDocument.getText(edit.range);
      return originalText.includes(':- uses([') && !originalText.startsWith('\t');
    });

    assert.ok(usesEdit, 'Should have edit for uses directive');
    assert.ok(usesEdit.newText.startsWith('\t'), 'Uses directive should be indented with tab');

    const publicEdit = edits.find(edit => {
      const originalText = unindentedObjectDocument.getText(edit.range);
      return originalText.includes(':- public(insert_top/2)');
    });

    assert.ok(publicEdit, 'Should have edit for public directive');
    assert.ok(publicEdit.newText.startsWith('\t'), 'Public directive should be indented with tab');

    const predicateEdit = edits.find(edit => {
      const originalText = unindentedObjectDocument.getText(edit.range);
      return originalText.includes('insert_top(List, Key-Value)');
    });

    assert.ok(predicateEdit, 'Should have edit for predicate head');
    assert.ok(predicateEdit.newText.startsWith('\t'), 'Predicate head should be indented with tab');
  });

  test('should detect parameterized object entity', async () => {
    const parameterizedObjectContent = `:- object(simple(_HeapType_)).

% allow consistently using the same object parametrization
% for all message-sending calls by simply defining an alias
:- uses([
	heap(_HeapType_) as h
]).

:- public(insert_top/2).
insert_top(List, Key-Value) :-
	h::as_heap(List, Heap),
	h::top(Heap, Key, Value).

:- end_object.`;

    const parameterizedObjectDocument = await vscode.workspace.openTextDocument({
      content: parameterizedObjectContent,
      language: 'logtalk'
    });

    const options: vscode.FormattingOptions = {
      tabSize: 4,
      insertSpaces: false
    };

    const edits = provider.provideDocumentFormattingEdits(
      parameterizedObjectDocument,
      options,
      new vscode.CancellationTokenSource().token
    );

    // Should have edits if the entity is detected
    assert.ok(edits.length > 0, 'Should provide formatting edits for parameterized object');

    // Check that content inside the object gets indented
    const indentationEdits = edits.filter(edit => {
      const originalText = parameterizedObjectDocument.getText(edit.range);
      return originalText.trim() !== '' && !originalText.startsWith('\t') && edit.newText.startsWith('\t');
    });

    assert.ok(indentationEdits.length > 0, 'Should have indentation edits for content inside parameterized object');

    // Check specific lines that should be indented
    const commentEdit = edits.find(edit => {
      const originalText = parameterizedObjectDocument.getText(edit.range);
      return originalText.includes('% allow consistently using');
    });

    assert.ok(commentEdit, 'Should have edit for comment line');
    assert.ok(commentEdit.newText.startsWith('\t'), 'Comment should be indented with tab');

    const usesEdit = edits.find(edit => {
      const originalText = parameterizedObjectDocument.getText(edit.range);
      return originalText.includes(':- uses([') && !originalText.startsWith('\t');
    });

    assert.ok(usesEdit, 'Should have edit for uses directive');
    assert.ok(usesEdit.newText.startsWith('\t'), 'Uses directive should be indented with tab');
  });
});
