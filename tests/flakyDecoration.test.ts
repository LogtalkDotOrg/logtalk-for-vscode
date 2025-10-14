import * as assert from 'assert';

/**
 * Standalone test for flaky decoration logic
 * This tests the core logic without requiring VS Code environment
 */

// Mock TestItem interface for testing
interface MockTestItem {
  id: string;
  label: string;
  description?: string;
}

// Extract the flaky decoration logic for testing
function updateTestItemDecoration(testItem: MockTestItem, status: string): void {
  // Check if the status contains "[flaky]" indicator
  const isFlaky = status.toLowerCase().includes('[flaky]');
  
  if (isFlaky) {
    // Add warning triangle emoji (U+26A0) to indicate flakiness
    const warningTriangle = '⚠️';
    
    // Set or update the description to include the flaky indicator
    if (testItem.description) {
      // If description already exists, prepend the warning if not already present
      if (!testItem.description.includes(warningTriangle)) {
        testItem.description = `${warningTriangle} ${testItem.description}`;
      }
    } else {
      // Set description to just the warning triangle
      testItem.description = warningTriangle;
    }
  } else {
    // Remove flaky indicator if it exists and test is no longer flaky
    if (testItem.description && testItem.description.includes('⚠️')) {
      testItem.description = testItem.description.replace(/⚠️\s*/, '').trim();
      // If description becomes empty, set it to undefined
      if (testItem.description === '') {
        testItem.description = undefined;
      }
    }
  }
}

suite('Flaky Decoration Logic Tests', () => {
  
  test('should add warning triangle to flaky test description', () => {
    const testItem: MockTestItem = {
      id: 'test-id',
      label: 'test_name'
    };

    const flakyStatus = 'passed [flaky]';
    updateTestItemDecoration(testItem, flakyStatus);

    assert.strictEqual(testItem.description, '⚠️');
  });

  test('should preserve existing description when adding flaky indicator', () => {
    const testItem: MockTestItem = {
      id: 'test-id',
      label: 'test_name',
      description: 'existing description'
    };

    const flakyStatus = 'failed [flaky]';
    updateTestItemDecoration(testItem, flakyStatus);

    assert.strictEqual(testItem.description, '⚠️ existing description');
  });

  test('should not duplicate warning triangle if already present', () => {
    const testItem: MockTestItem = {
      id: 'test-id',
      label: 'test_name',
      description: '⚠️ already flaky'
    };

    const flakyStatus = 'passed [flaky]';
    updateTestItemDecoration(testItem, flakyStatus);

    assert.strictEqual(testItem.description, '⚠️ already flaky');
  });

  test('should remove warning triangle when test is no longer flaky', () => {
    const testItem: MockTestItem = {
      id: 'test-id',
      label: 'test_name',
      description: '⚠️ some description'
    };

    const nonFlakyStatus = 'passed';
    updateTestItemDecoration(testItem, nonFlakyStatus);

    assert.strictEqual(testItem.description, 'some description');
  });

  test('should set description to undefined when removing flaky indicator from empty description', () => {
    const testItem: MockTestItem = {
      id: 'test-id',
      label: 'test_name',
      description: '⚠️'
    };

    const nonFlakyStatus = 'passed';
    updateTestItemDecoration(testItem, nonFlakyStatus);

    assert.strictEqual(testItem.description, undefined);
  });

  test('should detect flaky indicator case-insensitively', () => {
    const testItem: MockTestItem = {
      id: 'test-id',
      label: 'test_name'
    };

    const flakyStatus = 'PASSED [FLAKY]';
    updateTestItemDecoration(testItem, flakyStatus);

    assert.strictEqual(testItem.description, '⚠️');
  });

  test('should handle mixed case flaky indicator', () => {
    const testItem: MockTestItem = {
      id: 'test-id',
      label: 'test_name'
    };

    const flakyStatus = 'failed [Flaky]';
    updateTestItemDecoration(testItem, flakyStatus);

    assert.strictEqual(testItem.description, '⚠️');
  });

  test('should not add flaky indicator for non-flaky tests', () => {
    const testItem: MockTestItem = {
      id: 'test-id',
      label: 'test_name'
    };

    const normalStatus = 'passed';
    updateTestItemDecoration(testItem, normalStatus);

    assert.strictEqual(testItem.description, undefined);
  });

  test('should handle flaky indicator in different positions', () => {
    const testItem: MockTestItem = {
      id: 'test-id',
      label: 'test_name'
    };

    // Test with flaky indicator at the end
    const flakyStatusEnd = 'test completed successfully [flaky]';
    updateTestItemDecoration(testItem, flakyStatusEnd);
    assert.strictEqual(testItem.description, '⚠️');

    // Reset for next test
    testItem.description = undefined;

    // Test with flaky indicator in the middle
    const flakyStatusMiddle = 'test [flaky] completed';
    updateTestItemDecoration(testItem, flakyStatusMiddle);
    assert.strictEqual(testItem.description, '⚠️');
  });

  test('should handle multiple flaky indicators in status', () => {
    const testItem: MockTestItem = {
      id: 'test-id',
      label: 'test_name'
    };

    const multipleFlaky = 'test [flaky] completed [flaky]';
    updateTestItemDecoration(testItem, multipleFlaky);

    assert.strictEqual(testItem.description, '⚠️');
  });
});
