import * as assert from 'assert';
import * as vscode from 'vscode';
import { LogtalkTestsExplorerProvider } from '../src/features/testsExplorerProvider';

suite('TestsExplorerProvider Tests', () => {
  let provider: LogtalkTestsExplorerProvider;
  let mockLinter: any;
  let mockTestsReporter: any;

  setup(() => {
    // Create mock objects for dependencies
    mockLinter = {};
    mockTestsReporter = {};
    
    // Create the provider instance
    provider = new LogtalkTestsExplorerProvider(mockLinter, mockTestsReporter);
  });

  teardown(() => {
    if (provider) {
      provider.dispose();
    }
  });

  suite('Flaky Test Decoration', () => {
    test('should add warning triangle to flaky test description', () => {
      // Create a test item
      const testItem = provider['controller'].createTestItem(
        'test-id',
        'test_name',
        vscode.Uri.file('/test/file.lgt')
      );

      // Test status with [flaky] indicator
      const flakyStatus = 'passed [flaky]';
      
      // Call the updateTestItemDecoration method
      provider['updateTestItemDecoration'](testItem, flakyStatus);

      // Verify that the warning triangle emoji is added to the description
      assert.strictEqual(testItem.description, '⚠️');
    });

    test('should preserve existing description when adding flaky indicator', () => {
      // Create a test item with existing description
      const testItem = provider['controller'].createTestItem(
        'test-id',
        'test_name',
        vscode.Uri.file('/test/file.lgt')
      );
      testItem.description = 'existing description';

      // Test status with [flaky] indicator
      const flakyStatus = 'failed [flaky]';
      
      // Call the updateTestItemDecoration method
      provider['updateTestItemDecoration'](testItem, flakyStatus);

      // Verify that the warning triangle is prepended to existing description
      assert.strictEqual(testItem.description, '⚠️ existing description');
    });

    test('should not duplicate warning triangle if already present', () => {
      // Create a test item with existing flaky description
      const testItem = provider['controller'].createTestItem(
        'test-id',
        'test_name',
        vscode.Uri.file('/test/file.lgt')
      );
      testItem.description = '⚠️ already flaky';

      // Test status with [flaky] indicator
      const flakyStatus = 'passed [flaky]';
      
      // Call the updateTestItemDecoration method
      provider['updateTestItemDecoration'](testItem, flakyStatus);

      // Verify that the warning triangle is not duplicated
      assert.strictEqual(testItem.description, '⚠️ already flaky');
    });

    test('should remove warning triangle when test is no longer flaky', () => {
      // Create a test item with flaky description
      const testItem = provider['controller'].createTestItem(
        'test-id',
        'test_name',
        vscode.Uri.file('/test/file.lgt')
      );
      testItem.description = '⚠️ some description';

      // Test status without [flaky] indicator
      const nonFlakyStatus = 'passed';
      
      // Call the updateTestItemDecoration method
      provider['updateTestItemDecoration'](testItem, nonFlakyStatus);

      // Verify that the warning triangle is removed
      assert.strictEqual(testItem.description, 'some description');
    });

    test('should set description to undefined when removing flaky indicator from empty description', () => {
      // Create a test item with only flaky indicator
      const testItem = provider['controller'].createTestItem(
        'test-id',
        'test_name',
        vscode.Uri.file('/test/file.lgt')
      );
      testItem.description = '⚠️';

      // Test status without [flaky] indicator
      const nonFlakyStatus = 'passed';
      
      // Call the updateTestItemDecoration method
      provider['updateTestItemDecoration'](testItem, nonFlakyStatus);

      // Verify that the description is set to undefined
      assert.strictEqual(testItem.description, undefined);
    });

    test('should detect flaky indicator case-insensitively', () => {
      // Create a test item
      const testItem = provider['controller'].createTestItem(
        'test-id',
        'test_name',
        vscode.Uri.file('/test/file.lgt')
      );

      // Test status with uppercase [FLAKY] indicator
      const flakyStatus = 'PASSED [FLAKY]';
      
      // Call the updateTestItemDecoration method
      provider['updateTestItemDecoration'](testItem, flakyStatus);

      // Verify that the warning triangle emoji is added
      assert.strictEqual(testItem.description, '⚠️');
    });

    test('should handle mixed case flaky indicator', () => {
      // Create a test item
      const testItem = provider['controller'].createTestItem(
        'test-id',
        'test_name',
        vscode.Uri.file('/test/file.lgt')
      );

      // Test status with mixed case [Flaky] indicator
      const flakyStatus = 'failed [Flaky]';
      
      // Call the updateTestItemDecoration method
      provider['updateTestItemDecoration'](testItem, flakyStatus);

      // Verify that the warning triangle emoji is added
      assert.strictEqual(testItem.description, '⚠️');
    });

    test('should not add flaky indicator for non-flaky tests', () => {
      // Create a test item
      const testItem = provider['controller'].createTestItem(
        'test-id',
        'test_name',
        vscode.Uri.file('/test/file.lgt')
      );

      // Test status without [flaky] indicator
      const normalStatus = 'passed';
      
      // Call the updateTestItemDecoration method
      provider['updateTestItemDecoration'](testItem, normalStatus);

      // Verify that no description is set
      assert.strictEqual(testItem.description, undefined);
    });
  });
});
