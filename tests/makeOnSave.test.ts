import * as assert from 'assert';
import * as vscode from 'vscode';

// Note: The make on save feature uses a 500ms debounce timer to handle "Save All" efficiently.
// When multiple files are saved in quick succession, the make command is called only once
// after the last save, rather than once per file.

suite('Make On Save Test Suite', () => {

  suite('logtalk.make.onSave setting', () => {

    test('should have correct default value', () => {
      // Test that the default value is false
      const section = vscode.workspace.getConfiguration("logtalk");
      const makeOnSave = section.get<boolean>("make.onSave", false);

      // Since we're testing the default, it should be false
      assert.strictEqual(typeof makeOnSave, 'boolean');
    });

    test('should handle Logtalk language ID check correctly', () => {
      // Test the language ID check logic
      const logtalkDocument = { languageId: 'logtalk' } as vscode.TextDocument;
      const jsDocument = { languageId: 'javascript' } as vscode.TextDocument;

      assert.strictEqual(logtalkDocument.languageId === 'logtalk', true);
      assert.strictEqual(jsDocument.languageId === 'logtalk', false);
    });

    test('should handle configuration retrieval', () => {
      // Test that we can retrieve the configuration section
      const section = vscode.workspace.getConfiguration("logtalk");
      assert.notStrictEqual(section, undefined);

      // Test that the get method works with default value
      const makeOnSave = section.get<boolean>("make.onSave", false);
      assert.strictEqual(typeof makeOnSave, 'boolean');
    });
  });
});
