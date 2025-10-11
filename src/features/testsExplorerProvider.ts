"use strict";

/**
 * Logtalk Tests Explorer Provider
 *
 * This provider integrates Logtalk test results with VS Code's native Testing API.
 * It discovers and displays tests in the Tests Explorer pane by parsing .vscode_test_results files.
 *
 * Features:
 * - Automatically discovers .vscode_test_results files in the workspace
 * - Creates a hierarchical test structure: File > Object > Test
 * - Updates test states (passed, failed, skipped) based on test results
 * - Watches for changes to test result files and updates the UI accordingly
 * - Integrates with logtalk.run.tests, logtalk.run.file.tests, logtalk.run.object.tests, and logtalk.run.test commands
 * - Supports running individual tests from the Tests Explorer
 * - Supports running all tests in an object (test suite) from the Tests Explorer
 * - Supports running all tests in a file from the Tests Explorer
 * - Supports running all tests via tester file from the Tests Explorer root
 *
 * Test Result File Format:
 * - Individual tests: File:<path>;Line:<line>;Object:<object>;Test:<test>;Status:<status>
 * - Test summaries: File:<path>;Line:<line>;Status:<status>
 *
 * Running Tests:
 * - Root (all tests): Executes logtalk.run.tests with (workspaceUri) - runs via tester file
 * - File level: Executes logtalk.run.file.tests with (fileUri) - runs only tests in that file
 * - Object level: Executes logtalk.run.object.tests with (fileUri, objectName) - runs only tests in that object
 * - Individual test: Executes logtalk.run.test with (fileUri, objectName, testName) - runs only that test
 */

import {
  TestController,
  TestItem,
  TestRunRequest,
  TestMessage,
  Uri,
  workspace,
  FileSystemWatcher,
  Disposable,
  tests,
  TestRunProfileKind,
  Location,
  Position,
  Range,
  RelativePattern,
  commands
} from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import { getLogger } from "../utils/logger";

interface TestResultData {
  file: string;
  line: number;
  object: string;
  test: string;
  status: string;
}

interface TestSummaryData {
  file: string;
  line: number;
  status: string;
}

interface TestItemMetadata {
  type: 'file' | 'object' | 'test';
  fileUri: Uri;
  objectName?: string;
  testName?: string;
}

export class LogtalkTestsExplorerProvider implements Disposable {
  private controller: TestController;
  private watchers: Map<string, FileSystemWatcher> = new Map();
  private testItems: Map<string, TestItem> = new Map();
  private testItemMetadata: WeakMap<TestItem, TestItemMetadata> = new WeakMap();
  private logger = getLogger();
  private disposables: Disposable[] = [];

  constructor() {
    // Create the test controller
    this.controller = tests.createTestController(
      'logtalkTests',
      'Logtalk Tests'
    );

    this.disposables.push(this.controller);

    // Create a run profile for running tests
    const runProfile = this.controller.createRunProfile(
      'Run',
      TestRunProfileKind.Run,
      async (request, token) => {
        this.logger.debug('Run profile handler called');
        this.logger.debug(`request.include: ${request.include ? 'defined' : 'undefined'}`);
        this.logger.debug(`Number of controller items: ${this.controller.items.size}`);
        await this.runTests(request, token);
      },
      true // isDefault
    );

    this.disposables.push(runProfile);

    // Watch for workspace folders to discover test result files
    this.discoverTestResultFiles();

    // Watch for workspace folder changes
    const workspaceFoldersListener = workspace.onDidChangeWorkspaceFolders(() => {
      this.discoverTestResultFiles();
    });
    this.disposables.push(workspaceFoldersListener);
  }

  /**
   * Run tests based on the test run request
   */
  private async runTests(request: TestRunRequest, token: any): Promise<void> {
    this.logger.debug('runTests method called');
    this.logger.debug(`request.include is ${request.include ? 'defined' : 'undefined'}`);

    // If no specific tests are selected, run all tests via the tester file
    if (!request.include) {
      this.logger.info('Running all tests via tester file (no specific tests selected)');
      // Get the first file item to extract a test file URI
      let firstFileUri: Uri | undefined;
      this.controller.items.forEach(item => {
        if (!firstFileUri) {
          const metadata = this.testItemMetadata.get(item);
          this.logger.debug(`Checking item: ${item.id}, metadata type: ${metadata?.type}`);
          if (metadata && metadata.type === 'file') {
            firstFileUri = metadata.fileUri;
          }
        }
      });

      if (firstFileUri) {
        this.logger.info(`Using file URI: ${firstFileUri.fsPath}`);
        await commands.executeCommand('logtalk.run.tests', firstFileUri);
      } else {
        this.logger.warn('No test runs so far; running all tests via tester file');
        await commands.executeCommand('logtalk.run.tests', undefined);
      }

      return;
    }

    const queue: TestItem[] = [];

    // Collect specific tests to run
    request.include.forEach(test => queue.push(test));

    // Process each test item
    for (const test of queue) {
      if (token.isCancellationRequested) {
        break;
      }

      const metadata = this.testItemMetadata.get(test);
      if (!metadata) {
        this.logger.warn(`No metadata found for test item: ${test.id}`);
        continue;
      }

      try {
        switch (metadata.type) {
          case 'file':
            // Run all tests in the file
            this.logger.info(`Running all tests in file: ${metadata.fileUri.fsPath}`);
            await commands.executeCommand('logtalk.run.file.tests', metadata.fileUri);
            break;

          case 'object':
            // Run all tests in the object (test suite)
            this.logger.info(`Running all tests for object: ${metadata.objectName} in file: ${metadata.fileUri.fsPath}`);
            await commands.executeCommand('logtalk.run.object.tests', metadata.fileUri, metadata.objectName);
            break;

          case 'test':
            // Run a specific test
            this.logger.info(`Running test: ${metadata.testName} in object: ${metadata.objectName}`);
            await commands.executeCommand('logtalk.run.test', metadata.fileUri, metadata.objectName, metadata.testName);
            break;
        }
      } catch (error) {
        this.logger.error(`Error running test ${test.id}:`, error);
      }
    }
  }

  /**
   * Discover all .vscode_test_results files in workspace folders
   */
  private async discoverTestResultFiles(): Promise<void> {
    if (!workspace.workspaceFolders) {
      return;
    }

    for (const folder of workspace.workspaceFolders) {
      // Search for all .vscode_test_results files in the workspace
      const pattern = new RelativePattern(folder, '**/.vscode_test_results');
      const files = await workspace.findFiles(pattern);
      await files.forEach(uri => fsp.rm(`${uri.fsPath}`, { force: true }));

      for (const file of files) {
        this.watchTestResultFile(file);
      }

      // Create a watcher for new test result files
      const watcher = workspace.createFileSystemWatcher(pattern);
      
      watcher.onDidCreate(uri => {
        this.logger.debug(`Test results file created: ${uri.fsPath}`);
        this.watchTestResultFile(uri);
      });

      watcher.onDidChange(uri => {
        this.logger.debug(`Test results file changed: ${uri.fsPath}`);
        this.parseTestResultFile(uri);
      });

      watcher.onDidDelete(uri => {
        this.logger.debug(`Test results file deleted: ${uri.fsPath}`);
        this.removeTestsForFile(uri);
      });

      const watcherKey = folder.uri.toString();
      if (this.watchers.has(watcherKey)) {
        this.watchers.get(watcherKey)?.dispose();
      }
      this.watchers.set(watcherKey, watcher);
      this.disposables.push(watcher);
    }
  }

  /**
   * Watch a specific test result file and parse it
   */
  private watchTestResultFile(uri: Uri): void {
    this.parseTestResultFile(uri);
  }

  /**
   * Parse a .vscode_test_results file and create/update test items
   */
  private parseTestResultFile(uri: Uri): void {
    if (!fs.existsSync(uri.fsPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(uri.fsPath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      // Parse individual test results
      // Format: File:<path>;Line:<line>;Object:<object>;Test:<test>;Status:<status>
      const testRegex = /File:(.+?);Line:(\d+);Object:(.+?);Test:(.+?);Status:(.+)/i;
      
      // Parse test summary results
      // Format: File:<path>;Line:<line>;Status:<status>
      const summaryRegex = /File:(.+?);Line:(\d+);Status:(.+)/i;

      const testResults: TestResultData[] = [];
      const summaryResults: TestSummaryData[] = [];

      for (const line of lines) {
        const testMatch = line.match(testRegex);
        if (testMatch) {
          testResults.push({
            file: testMatch[1],
            line: parseInt(testMatch[2]),
            object: testMatch[3],
            test: testMatch[4],
            status: testMatch[5]
          });
          continue;
        }

        const summaryMatch = line.match(summaryRegex);
        if (summaryMatch) {
          summaryResults.push({
            file: summaryMatch[1],
            line: parseInt(summaryMatch[2]),
            status: summaryMatch[3]
          });
        }
      }

      // Create test items from the parsed data
      this.createTestItems(testResults, summaryResults, uri);

      // Create a test run to register that tests have been executed
      // This is needed so VS Code shows the run button on the root node
      if (testResults.length > 0) {
        this.createTestRunFromResults(testResults);
      }
    } catch (error) {
      this.logger.error(`Error parsing test results file ${uri.fsPath}:`, error);
    }
  }

  /**
   * Create a test run from test results to register with VS Code's Testing API
   * This makes VS Code aware that tests have been run, enabling the run button
   */
  private createTestRunFromResults(testResults: TestResultData[]): void {
    this.logger.debug('Creating test run from results to register with VS Code');

    // Collect all test items that have results
    const testItemsToRun: TestItem[] = [];
    for (const result of testResults) {
      const normalizedPath = path.resolve(result.file).split(path.sep).join("/");
      const fileUri = Uri.file(normalizedPath);
      const testId = `${fileUri.toString()}::${result.object}::${result.test}`;
      const testItem = this.testItems.get(testId);
      if (testItem) {
        testItemsToRun.push(testItem);
      }
    }

    if (testItemsToRun.length === 0) {
      this.logger.warn('No test items found to create test run');
      return;
    }

    // Create a test run with the test items
    // Pass the test items in the request so VS Code knows what was run
    const request = new TestRunRequest(testItemsToRun);
    const testRun = this.controller.createTestRun(
      request,
      'Logtalk Tests',
      false // persist = false, since we can reload from file
    );

    // Update test states based on results
    for (const result of testResults) {
      const normalizedPath = path.resolve(result.file).split(path.sep).join("/");
      const fileUri = Uri.file(normalizedPath);
      const testId = `${fileUri.toString()}::${result.object}::${result.test}`;
      const testItem = this.testItems.get(testId);

      if (testItem) {
        testRun.started(testItem);

        // Update test state based on status
        const status = result.status.toLowerCase();
        if (status.includes('passed') || status.includes('success')) {
          testRun.passed(testItem);
        } else if (status.includes('failed') || status.includes('error')) {
          const message = new TestMessage(result.status);
          message.location = new Location(
            fileUri,
            new Position(result.line - 1, 0)
          );
          testRun.failed(testItem, message);
        } else if (status.includes('skipped')) {
          testRun.skipped(testItem);
        }
      }
    }

    testRun.end();
    this.logger.debug('Test run created and ended - VS Code should now show run button');
  }

  /**
   * Create test items from parsed test results
   */
  private createTestItems(
    testResults: TestResultData[],
    summaryResults: TestSummaryData[],
    resultsFileUri: Uri
  ): void {
    // Group tests by file
    const testsByFile = new Map<string, TestResultData[]>();
    for (const result of testResults) {
      const normalizedPath = path.resolve(result.file).split(path.sep).join("/");
      if (!testsByFile.has(normalizedPath)) {
        testsByFile.set(normalizedPath, []);
      }
      testsByFile.get(normalizedPath)!.push(result);
    }

    // Track which test IDs should exist after this update
    const expectedTestIds = new Set<string>();

    // Create or update test items for each file
    for (const [filePath, tests] of testsByFile) {
      const fileUri = Uri.file(filePath);
      const fileId = fileUri.toString();
      expectedTestIds.add(fileId);

      // Get or create file-level test item
      let fileItem = this.testItems.get(fileId);
      if (!fileItem) {
        fileItem = this.controller.createTestItem(
          fileId,
          path.basename(filePath),
          fileUri
        );
        this.controller.items.add(fileItem);
        this.testItems.set(fileId, fileItem);

        // Store metadata for file-level item
        this.testItemMetadata.set(fileItem, {
          type: 'file',
          fileUri: fileUri
        });
      }

      // Group tests by object
      const testsByObject = new Map<string, TestResultData[]>();
      for (const test of tests) {
        if (!testsByObject.has(test.object)) {
          testsByObject.set(test.object, []);
        }
        testsByObject.get(test.object)!.push(test);
      }

      // Track which object IDs should exist for this file
      const expectedObjectIds = new Set<string>();

      // Create or update object-level and test-level items
      for (const [objectName, objectTests] of testsByObject) {
        const objectId = `${fileId}::${objectName}`;
        expectedTestIds.add(objectId);
        expectedObjectIds.add(objectId);

        let objectItem = this.testItems.get(objectId);
        if (!objectItem) {
          objectItem = this.controller.createTestItem(
            objectId,
            objectName,
            fileUri
          );
          fileItem.children.add(objectItem);
          this.testItems.set(objectId, objectItem);

          // Store metadata for object-level item
          this.testItemMetadata.set(objectItem, {
            type: 'object',
            fileUri: fileUri,
            objectName: objectName
          });
        }

        // Track which test IDs should exist for this object
        const expectedTestIdsForObject = new Set<string>();

        // Create individual test items
        for (const test of objectTests) {
          const testId = `${objectId}::${test.test}`;
          expectedTestIds.add(testId);
          expectedTestIdsForObject.add(testId);

          let testItem = this.testItems.get(testId);
          if (!testItem) {
            testItem = this.controller.createTestItem(
              testId,
              test.test,
              fileUri
            );
            testItem.range = new Range(
              new Position(test.line - 1, 0),
              new Position(test.line - 1, 0)
            );
            objectItem.children.add(testItem);
            this.testItems.set(testId, testItem);

            // Store metadata for test-level item
            this.testItemMetadata.set(testItem, {
              type: 'test',
              fileUri: fileUri,
              objectName: objectName,
              testName: test.test
            });
          } else {
            // Update the range if it changed
            testItem.range = new Range(
              new Position(test.line - 1, 0),
              new Position(test.line - 1, 0)
            );
          }
        }

        // Remove test items that are no longer in this object
        objectItem.children.forEach(child => {
          if (!expectedTestIdsForObject.has(child.id)) {
            this.logger.debug(`Removing test item: ${child.id}`);
            objectItem.children.delete(child.id);
            this.testItems.delete(child.id);
          }
        });
      }

      // Remove object items that are no longer in this file
      fileItem.children.forEach(child => {
        if (!expectedObjectIds.has(child.id)) {
          this.logger.debug(`Removing object item: ${child.id}`);
          fileItem.children.delete(child.id);
          this.testItems.delete(child.id);
        }
      });
    }

    // Remove file items that are no longer in the results
    this.controller.items.forEach(fileItem => {
      if (!expectedTestIds.has(fileItem.id)) {
        this.logger.debug(`Removing file item: ${fileItem.id}`);
        this.controller.items.delete(fileItem.id);
        this.testItems.delete(fileItem.id);
      }
    });

    // Update test states based on results
    this.updateTestStates(testResults);
  }

  /**
   * Update test states based on test results
   */
  private updateTestStates(testResults: TestResultData[]): void {
    // Create a test run to update states
    const run = this.controller.createTestRun(
      new TestRunRequest(),
      'Test Results',
      false // Don't persist
    );

    for (const result of testResults) {
      const normalizedPath = path.resolve(result.file).split(path.sep).join("/");
      const fileUri = Uri.file(normalizedPath);
      const testId = `${fileUri.toString()}::${result.object}::${result.test}`;
      
      const testItem = this.testItems.get(testId);
      if (testItem) {
        // Parse status and update test state
        const status = result.status.toLowerCase();
        
        if (status.includes('passed') || status.includes('success')) {
          run.passed(testItem);
        } else if (status.includes('failed') || status.includes('error')) {
          const message = new TestMessage(result.status);
          message.location = new Location(
            fileUri,
            new Position(result.line - 1, 0)
          );
          run.failed(testItem, message);
        } else if (status.includes('skipped')) {
          run.skipped(testItem);
        }
      }
    }

    run.end();
  }

  /**
   * Remove all tests associated with a test results file
   */
  private removeTestsForFile(uri: Uri): void {
    // Remove all test items (they will be recreated when the file is updated)
    this.controller.items.replace([]);
    this.testItems.clear();
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
    
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    
    this.testItems.clear();
  }
}

