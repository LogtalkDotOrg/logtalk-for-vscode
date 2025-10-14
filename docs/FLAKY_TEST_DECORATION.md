# Flaky Test Decoration Feature

## Overview

The Logtalk VS Code extension now supports visual indication of flaky tests in the Test Explorer. Flaky tests are tests that sometimes pass and sometimes fail without any changes to the code, often due to timing issues, external dependencies, or non-deterministic behavior.

## Visual Indicator

When a test is marked as flaky, it will display a warning triangle emoji (⚠️) in the Test Explorer alongside the passed/failed state. This provides immediate visual feedback to developers about which tests may be unreliable.

## How It Works

### Detection

The extension automatically detects flaky tests by looking for the text `[flaky]` in the test status string from the `.vscode_test_results` file. The detection is case-insensitive, so it will recognize:

- `[flaky]`
- `[FLAKY]`
- `[Flaky]`
- `[FlAkY]`

### Visual Decoration

When a flaky test is detected:

1. **New Description**: If the test item has no description, the warning triangle emoji (⚠️) is added as the description
2. **Existing Description**: If the test item already has a description, the warning triangle is prepended to the existing description
3. **No Duplication**: If the warning triangle is already present, it won't be duplicated

### Status Examples

Here are examples of test statuses that would trigger the flaky decoration:

```
passed [flaky]
failed [flaky]
PASSED [FLAKY]
test completed successfully [flaky]
error occurred [Flaky] during execution
```

### Removal

The flaky indicator is automatically removed when:

1. The test status no longer contains `[flaky]`
2. The test is re-run and produces a non-flaky result
3. The warning triangle is removed from the description, and if the description becomes empty, it's set to undefined

## Implementation Details

### Code Location

The flaky decoration logic is implemented in:
- `src/features/testsExplorerProvider.ts`
- Method: `updateTestItemDecoration(testItem: TestItem, status: string)`

### Integration Points

The decoration is applied at two key points:

1. **Test Item Creation**: When test items are initially created from test results
2. **Test Result Updates**: When test results are updated during test runs

### Test Coverage

The feature includes comprehensive unit tests covering:

- Adding flaky indicators to new tests
- Preserving existing descriptions when adding flaky indicators
- Preventing duplication of warning triangles
- Removing flaky indicators when tests are no longer flaky
- Case-insensitive detection
- Handling multiple flaky indicators in status text

## Usage

### For Test Writers

To mark a test as flaky in your test results, include `[flaky]` in the status text:

```logtalk
% Example test that might be flaky
test_network_dependent :-
    % Test that depends on network connectivity
    % May fail intermittently due to network issues
    ...
```

### For Developers

When viewing tests in the Test Explorer:

1. Look for the ⚠️ symbol next to test names
2. Flaky tests should be investigated and fixed when possible
3. Consider adding retry logic or making tests more deterministic
4. Use the flaky indicator to prioritize test stability improvements

## Benefits

1. **Immediate Visual Feedback**: Developers can quickly identify unreliable tests
2. **Better Test Management**: Helps prioritize which tests need attention
3. **Improved CI/CD**: Makes it easier to distinguish between real failures and flaky test failures
4. **Test Quality Awareness**: Encourages developers to write more stable tests

## Future Enhancements

Potential future improvements could include:

- Configurable flaky test indicators (different emojis or text)
- Flaky test statistics and reporting
- Integration with test retry mechanisms
- Automatic flaky test detection based on historical results
