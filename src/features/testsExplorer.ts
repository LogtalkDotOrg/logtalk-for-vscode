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
 * - Invalidates test results when source files are modified
 * - Removes stale test items when they are no longer in the results file
 * - Integrates with logtalk.run.tests, logtalk.run.file.tests, logtalk.run.object.tests, and logtalk.run.test commands
 * - Supports running individual tests from the Tests Explorer
 * - Supports running all tests in an object (test suite) from the Tests Explorer
 * - Supports running all tests in a file from the Tests Explorer
 * - Supports running all tests via tester file from the Tests Explorer root
 * - Supports running tests across multiple workspace folders
 *
 * Test Result File Format:
 * - Individual tests: File:<path>;Line:<line>;Object:<object>;Test:<test>;Status:<status>
 * - Test summaries: File:<path>;Line:<line>;Status:<status>
 *
 * Running Tests:
 * - Root (all tests): Executes logtalk.run.tests with (workspaceUri) - runs via tester file for each workspace folder
 * - File level: Executes logtalk.run.file.tests with (fileUri) - runs only tests in that file
 * - Object level: Executes logtalk.run.object.tests with (fileUri, objectName) - runs only tests in that object
 * - Individual test: Executes logtalk.run.test with (fileUri, objectName, testName) - runs only that test
 */

import {
  TestController,
  TestItem,
  TestRunRequest,
  TestRun,
  TestMessage,
  Uri,
  workspace,
  Disposable,
  tests,
  TestRunProfile,
  TestRunProfileKind,
  Location,
  Position,
  Range,
  RelativePattern,
  CancellationToken,
  FileCoverage,
  StatementCoverage,
  DeclarationCoverage,
  TextDocument
} from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import { getLogger } from "../utils/logger";
import LogtalkTerminal from "./terminal";
import { PredicateUtils } from "../utils/predicateUtils";
import { ArgumentUtils } from "../utils/argumentUtils";

interface TestResultData {
  file: string;
  line: number;
  object: string;
  test: string;
  status: string;
  reason?: string; // Optional reason for failure
}

interface TestSummaryData {
  file: string;
  line: number;
  object: string;
  status: string;
}

interface TestItemMetadata {
  type: 'directory' | 'file' | 'object' | 'test';
  fileUri: Uri;
  resultsFileUri?: Uri; // The .vscode_test_results file this item came from
  directoryUri?: Uri; // For directory items
  objectName?: string;
  testName?: string;
}

interface CoverageData {
  file: string;
  line: number;
  covered: number;
  total: number;
  coveredIndexes: number[]; // List of covered clause indexes (1-based)
}

export class LogtalkTestsExplorerProvider implements Disposable {
  public runProfile: TestRunProfile;
  public coverageProfile: TestRunProfile;
  private controller: TestController;
  private testItems: Map<string, TestItem> = new Map();
  private testItemMetadata: WeakMap<TestItem, TestItemMetadata> = new WeakMap();
  private logger = getLogger();
  private disposables: Disposable[] = [];
  private linter: any; // LogtalkLinter instance
  private testsReporter: any; // LogtalkTestsReporter instance
  private coverageData: Map<string, CoverageData[]> = new Map(); // Store coverage data by file path

  /**
   * Get test item for a file
   */
  public getTestItemForFile(uri: Uri): TestItem | undefined {
    const fileId = uri.toString();
    return this.testItems.get(fileId);
  }

  /**
   * Get test item for an object (test suite)
   */
  public getTestItemForObject(uri: Uri, objectName: string): TestItem | undefined {
    const objectId = `${uri.toString()}::${objectName}`;
    return this.testItems.get(objectId);
  }

  /**
   * Get test item for a specific test
   */
  public getTestItemForTest(uri: Uri, objectName: string, testName: string): TestItem | undefined {
    const testId = `${uri.toString()}::${objectName}::${testName}`;
    return this.testItems.get(testId);
  }

  constructor(linter: any, testsReporter: any) {
    this.linter = linter;
    this.testsReporter = testsReporter;

    // Create the test controller
    this.controller = tests.createTestController(
      'logtalkTests',
      'Logtalk Tests'
    );

    this.disposables.push(this.controller);

    // Create a run profile for running tests without coverage
    this.runProfile = this.controller.createRunProfile(
      'Run',
      TestRunProfileKind.Run,
      async (request, token) => {
        this.logger.debug('Run profile handler called (no coverage)');
        this.logger.debug(`request.include: ${request.include ? 'defined' : 'undefined'}`);
        this.logger.debug(`Number of controller items: ${this.controller.items.size}`);
        await this.runTests(request, token, false); // false = no coverage
      },
      true // isDefault
    );

    this.disposables.push(this.runProfile);

    // Create a coverage profile for running tests with coverage
    this.coverageProfile = this.controller.createRunProfile(
      'Coverage',
      TestRunProfileKind.Coverage,
      async (request, token) => {
        this.logger.debug('Coverage profile handler called');
        this.logger.debug(`request.include: ${request.include ? 'defined' : 'undefined'}`);
        this.logger.debug(`Number of controller items: ${this.controller.items.size}`);
        await this.runTests(request, token, true); // true = with coverage
      },
      false // not default
    );

    // Set up coverage loading callback
    this.coverageProfile.loadDetailedCoverage = async (testRun, fileCoverage, token) => {
      this.logger.debug(`loadDetailedCoverage called for ${fileCoverage.uri.fsPath}`);
      return await this.loadDetailedCoverage(fileCoverage);
    };

    this.disposables.push(this.coverageProfile);

    // Clean up any old test result files from previous sessions
    this.cleanupOldTestResultFiles();

    // Clean up test result files when workspace folders change
    const workspaceFoldersListener = workspace.onDidChangeWorkspaceFolders(() => {
      this.cleanupOldTestResultFiles();
    });
    this.disposables.push(workspaceFoldersListener);

    // Watch for source file changes to invalidate test results
    const textDocumentListener = workspace.onDidChangeTextDocument(event => {
      // Only process Logtalk files
      if (event.document.languageId === 'logtalk') {
        this.invalidateTestResultsForFile(event.document.uri);
      }
    });
    this.disposables.push(textDocumentListener);
  }

  /**
   * Run tests based on the test run request
   * This method is called both from the Testing pane (via run profile handler)
   * and from CodeLens/context menu (via ViaProfile methods in LogtalkTerminal)
   * @param request - The test run request
   * @param token - Optional cancellation token
   * @param withCoverage - Whether to collect and report coverage data (default: false)
   * @param uri - Optional URI for running tests from a specific file/directory (used by ViaProfile methods)
   */
  public async runTests(request: TestRunRequest, token?: CancellationToken, withCoverage: boolean = false, uri?: Uri): Promise<void> {
    this.logger.debug('runTests method called');
    this.logger.debug(`request.include is ${request.include ? 'defined' : 'undefined'}`);
    if (request.include) {
      this.logger.debug(`request.include length: ${request.include.length}`);
      request.include.forEach((item, index) => {
        const metadata = this.testItemMetadata.get(item);
        this.logger.debug(`  [${index}] id: ${item.id}, label: ${item.label}, type: ${metadata?.type}`);
      });
    }
    this.logger.debug(`withCoverage: ${withCoverage}`);
    this.logger.debug(`uri is ${uri ? 'provided: ' + uri.fsPath : 'not provided'}`);

    // Create a test run for this execution
    const testRun = this.controller.createTestRun(
      request,
      'Logtalk Tests',
      true // persist = true for "Rerun Last Run" functionality
    );
    this.logger.debug('Created test run');

    try {
      // If no specific tests are selected, run all tests via the tester file
      if (!request.include) {
        this.logger.info('Running all tests via tester file (no specific tests selected)');

        // If URI is provided (from ViaProfile methods), use it directly
        if (uri) {
          this.logger.info(`Running tests for provided URI: ${uri.fsPath}`);
          await LogtalkTerminal.runAllTests(uri, this.linter, this.testsReporter);

          // Parse results
          // Check if URI is a directory or file
          const stats = fs.statSync(uri.fsPath);
          const dir0 = stats.isDirectory() ? uri.fsPath : path.dirname(uri.fsPath);
          const resultsFilePath = path.join(dir0, '.vscode_test_results');
          if (fs.existsSync(resultsFilePath)) {
            this.logger.debug(`Parsing results from: ${resultsFilePath}`);
            await this.parseTestResultFile(Uri.file(resultsFilePath), testRun, withCoverage);
          }

          testRun.end();
          return;
        }

        // Iterate through all top-level items (directories or files) and run tests
        // Collect all items first, then process them sequentially
        const topLevelItems: TestItem[] = [];
        this.controller.items.forEach(item => topLevelItems.push(item));

        // If there are no top-level items yet, run tests on workspace directories
        if (topLevelItems.length === 0) {
          this.logger.info('No test items found - running tests on workspace directories');
          if (workspace.workspaceFolders) {
            for (const workspaceFolder of workspace.workspaceFolders) {
              const workspacePath = workspaceFolder.uri.fsPath;
              this.logger.info(`Running all tests in workspace folder: ${workspacePath}`);
              await LogtalkTerminal.runAllTests(workspaceFolder.uri, this.linter, this.testsReporter);

              // Parse results
              const resultsFilePath = path.join(workspacePath, '.vscode_test_results');
              if (fs.existsSync(resultsFilePath)) {
                this.logger.debug(`Parsing results from: ${resultsFilePath}`);
                await this.parseTestResultFile(Uri.file(resultsFilePath), testRun, withCoverage);
              } else {
                this.logger.warn(`Results file not found: ${resultsFilePath}`);
              }
            }
          }
          testRun.end();
          return;
        }

        // Group items by directory to avoid running tests multiple times for the same directory
        const directoriesProcessed = new Set<string>();

        for (const item of topLevelItems) {
          const metadata = this.testItemMetadata.get(item);
          this.logger.debug(`Checking top-level item: ${item.id}, metadata type: ${metadata?.type}`);

          if (metadata && metadata.type === 'directory') {
            // Run tests for this directory
            const dirPath = metadata.directoryUri!.fsPath;
            if (!directoriesProcessed.has(dirPath)) {
              directoriesProcessed.add(dirPath);
              this.logger.info(`Running all tests in directory: ${dirPath}`);
              await LogtalkTerminal.runAllTests(metadata.directoryUri!, this.linter, this.testsReporter);

              // Parse results
              const dirResultsFilePath = path.join(dirPath, '.vscode_test_results');
              if (fs.existsSync(dirResultsFilePath)) {
                this.logger.debug(`Parsing results from: ${dirResultsFilePath}`);
                await this.parseTestResultFile(Uri.file(dirResultsFilePath), testRun, withCoverage);
              } else {
                this.logger.warn(`Results file not found: ${dirResultsFilePath}`);
              }
            }
          } else if (metadata && metadata.type === 'file') {
            // File is at top level (in workspace root) - run tests for the workspace directory
            const filePath = metadata.fileUri.fsPath;
            const dirPath = path.dirname(filePath);
            if (!directoriesProcessed.has(dirPath)) {
              directoriesProcessed.add(dirPath);
              this.logger.info(`Running all tests in workspace root directory: ${dirPath}`);
              await LogtalkTerminal.runAllTests(Uri.file(dirPath), this.linter, this.testsReporter);

              // Parse results
              const dirResultsFilePath = path.join(dirPath, '.vscode_test_results');
              if (fs.existsSync(dirResultsFilePath)) {
                this.logger.debug(`Parsing results from: ${dirResultsFilePath}`);
                await this.parseTestResultFile(Uri.file(dirResultsFilePath), testRun, withCoverage);
              } else {
                this.logger.warn(`Results file not found: ${dirResultsFilePath}`);
              }
            }
          }
        }

        testRun.end();
        return;
      }

      const queue: TestItem[] = [];

      // Collect specific tests to run
      request.include.forEach(test => queue.push(test));

      // Process each test item
      for (const test of queue) {
        if (token?.isCancellationRequested) {
          break;
        }

        const metadata = this.testItemMetadata.get(test);
        if (!metadata) {
          this.logger.warn(`No metadata found for test item: ${test.id}`);
          continue;
        }

        try {
          const dir0 = path.dirname(metadata.fileUri.fsPath);
          const resultsFilePath = path.join(dir0, '.vscode_test_results');

          switch (metadata.type) {
            case 'directory':
              // Run all tests in the directory
              this.logger.info(`Running all tests in directory: ${metadata.directoryUri!.fsPath}`);
              await LogtalkTerminal.runAllTests(metadata.directoryUri!, this.linter, this.testsReporter);

              // Parse results
              const dirResultsFilePath = path.join(metadata.directoryUri!.fsPath, '.vscode_test_results');
              this.logger.debug(`Looking for results file: ${dirResultsFilePath}`);
              if (fs.existsSync(dirResultsFilePath)) {
                this.logger.debug(`Parsing results from: ${dirResultsFilePath}`);
                await this.parseTestResultFile(Uri.file(dirResultsFilePath), testRun, withCoverage);
              } else {
                this.logger.warn(`Results file not found: ${dirResultsFilePath}`);
              }
              break;

            case 'file':
              // Run all tests in the file
              this.logger.info(`Running all tests in file: ${metadata.fileUri.fsPath}`);
              await LogtalkTerminal.runFileTests(metadata.fileUri, this.linter, this.testsReporter);

              // Parse results
              if (fs.existsSync(resultsFilePath)) {
                this.logger.debug(`Parsing results from: ${resultsFilePath}`);
                await this.parseTestResultFile(Uri.file(resultsFilePath), testRun, withCoverage);
              }
              break;

            case 'object':
              // Run all tests in the object (test suite)
              this.logger.info(`Running all tests for object: ${metadata.objectName} in file: ${metadata.fileUri.fsPath}`);
              await LogtalkTerminal.runObjectTests(metadata.fileUri, metadata.objectName!, this.linter, this.testsReporter);

              // Parse results
              if (fs.existsSync(resultsFilePath)) {
                this.logger.debug(`Parsing results from: ${resultsFilePath}`);
                await this.parseTestResultFile(Uri.file(resultsFilePath), testRun, withCoverage);
              }
              break;

            case 'test':
              // Run a specific test
              this.logger.info(`Running test: ${metadata.testName} in object: ${metadata.objectName}`);
              await LogtalkTerminal.runTest(metadata.fileUri, metadata.objectName!, metadata.testName!, this.linter, this.testsReporter);

              // Parse results
              if (fs.existsSync(resultsFilePath)) {
                this.logger.debug(`Parsing results from: ${resultsFilePath}`);
                await this.parseTestResultFile(Uri.file(resultsFilePath), testRun, withCoverage);
              }
              break;
          }
        } catch (error) {
          this.logger.error(`Error running test ${test.id}:`, error);
        }
      }

      testRun.end();
    } catch (error) {
      this.logger.error('Error in runTests:', error);
      testRun.end();
    }
  }

  /**
   * Clean up old test result files in workspace folders
   * This is called on startup and when workspace folders change to ensure
   * we start with a clean slate. Test result files will be recreated when tests are run.
   */
  private async cleanupOldTestResultFiles(): Promise<void> {
    if (!workspace.workspaceFolders) {
      return;
    }

    for (const folder of workspace.workspaceFolders) {
      // Search for all .vscode_test_results files in the workspace and delete them
      const pattern = new RelativePattern(folder, '**/.vscode_test_results');
      const files = await workspace.findFiles(pattern);

      for (const file of files) {
        try {
          await fsp.rm(file.fsPath, { force: true });
          this.logger.debug(`Deleted old test results file: ${file.fsPath}`);
        } catch (error) {
          this.logger.error(`Error deleting test results file ${file.fsPath}:`, error);
        }
      }
    }

    // Clear all test items since we deleted the results files
    this.controller.items.replace([]);
    this.testItems.clear();
  }

  /**
   * Find and parse all .vscode_test_results files in the workspace
   * @param testRun - Optional test run to update with results
   */
  private async parseAllTestResultFiles(testRun?: TestRun): Promise<void> {
    if (!workspace.workspaceFolders) {
      return;
    }

    for (const folder of workspace.workspaceFolders) {
      const pattern = new RelativePattern(folder, '**/.vscode_test_results');
      const files = await workspace.findFiles(pattern);

      for (const file of files) {
        this.logger.info(`Parsing test results from: ${file.fsPath}`);
        await this.parseTestResultFile(file, testRun);
      }
    }
  }

  /**
   * Parse a .vscode_test_results file and create/update test items
   * @param uri - URI of the results file to parse
   * @param testRun - Optional test run to update with results. If not provided, a new test run will be created.
   * @param withCoverage - Whether to process and report coverage data (default: false)
   */
  private async parseTestResultFile(uri: Uri, testRun?: TestRun, withCoverage: boolean = false): Promise<void> {
    if (!fs.existsSync(uri.fsPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(uri.fsPath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      // Parse individual test results
      // Format: File:<path>;Line:<line>;Object:<object>;Test:<test>;Status:<status>
      const testRegex = /File:(.+?);Line:(\d+);Object:(.+?);Test:(.+?);Status:(.+)/i;
      const testRegexFailed = /File:(.+);Line:(\d+);Object:(.+);Test:(.+);Status:(.+);Reason:(.+)/i;

      // Parse test summary results
      // Format: File:<path>;Line:<line>;Object:<object>;Status:<status>
      const summaryRegex = /File:(.+);Line:(\d+);Object:(.+);Status:(.+)/i;

      // Parse coverage data
      // Format: File:<path>;Line:<line>;Status:Tests clause coverage: <covered>/<total> - (all) or [1,2,3]
      const coverageRegex = /File:(.+?);Line:(\d+);Status:Tests clause coverage: (\d+)\/(\d+)(?:\s*-\s*(.+))?/i;

      const testResults: TestResultData[] = [];
      const summaryResults: TestSummaryData[] = [];
      const coverageResults: CoverageData[] = [];

      for (const line of lines) {
        const testMatch = line.match(testRegex);
        const testMatchFailed = line.match(testRegexFailed);
        if (testMatchFailed) {
          testResults.push({
            file: testMatchFailed[1],
            line: parseInt(testMatchFailed[2]),
            object: testMatchFailed[3],
            test: testMatchFailed[4],
            status: testMatchFailed[5],
            reason: testMatchFailed[6]
          });
          continue;
        } else if (testMatch) {
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
            object: summaryMatch[3],
            status: summaryMatch[4]
          });
          continue;
        }

        const coverageMatch = line.match(coverageRegex);
        if (coverageMatch) {
          const covered = parseInt(coverageMatch[3]);
          const total = parseInt(coverageMatch[4]);
          const clauseInfo = coverageMatch[5]; // "(all)" or "[1,2,3]" or undefined

          let coveredIndexes: number[] = [];

          if (clauseInfo) {
            if (clauseInfo.trim() === '(all)') {
              // All clauses are covered - generate array [1, 2, ..., total]
              coveredIndexes = Array.from({ length: total }, (_, i) => i + 1);
            } else {
              // Parse the array of covered indexes: [1,2,3]
              const match = clauseInfo.match(/\[([0-9,\s]+)\]/);
              if (match) {
                coveredIndexes = match[1].split(',').map(s => parseInt(s.trim()));
              }
            }
          }

          coverageResults.push({
            file: coverageMatch[1],
            line: parseInt(coverageMatch[2]),
            covered,
            total,
            coveredIndexes
          });
        }
      }

      // Create test items from the parsed data
      this.logger.debug(`Parsed ${testResults.length} test results and ${summaryResults.length} summaries from ${uri.fsPath}`);
      this.createTestItems(testResults, summaryResults, uri);

      // Update the test run with results and coverage
      if (testRun) {
        // Update coverage data BEFORE updating test results (which ends the run)
        // Only process coverage if withCoverage is true
        if (withCoverage && coverageResults.length > 0) {
          this.updateCoverageFromResults(coverageResults, testRun);
        }

        // Update test results (this will end the test run)
        if (testResults.length > 0) {
          this.updateTestRunFromResults(testResults, testRun);
        }
      }
    } catch (error) {
      this.logger.error(`Error parsing test results file ${uri.fsPath}:`, error);
    }
  }

  /**
   * Update test item decoration to indicate flakiness
   * @param testItem - The test item to update
   * @param status - The test status string
   */
  private updateTestItemDecoration(testItem: TestItem, status: string): void {
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

      this.logger.debug(`Marked test item as flaky: ${testItem.id}`);
    } else {
      // Remove flaky indicator if it exists and test is no longer flaky
      if (testItem.description && testItem.description.includes('⚠️')) {
        testItem.description = testItem.description.replace(/⚠️\s*/, '').trim();
        // If description becomes empty, set it to undefined
        if (testItem.description === '') {
          testItem.description = undefined;
        }
        this.logger.debug(`Removed flaky indicator from test item: ${testItem.id}`);
      }
    }
  }

  /**
   * Update a test run with test results, or create a new one if not provided
   * @param testResults - Array of test results to update
   * @param testRun - Optional test run to update. If not provided, a new test run will be created and ended.
   */
  private updateTestRunFromResults(testResults: TestResultData[], testRun?: TestRun): void {
    this.logger.debug('Updating test run from results');

    // Collect all test items that have results
    const testItemsWithResults: TestItem[] = [];
    for (const result of testResults) {
      const normalizedPath = path.resolve(result.file).split(path.sep).join("/");
      const fileUri = Uri.file(normalizedPath);
      const testId = `${fileUri.toString()}::${result.object}::${result.test}`;
      const testItem = this.testItems.get(testId);
      if (testItem) {
        testItemsWithResults.push(testItem);
      }
    }

    if (testItemsWithResults.length === 0) {
      this.logger.warn('No test items found to update test run');
      return;
    }

    // Use provided test run or create a new one
    let actualTestRun: TestRun;
    let shouldEndRun = false;
    if (testRun) {
      this.logger.debug('Using provided test run');
      actualTestRun = testRun;
      shouldEndRun = false; // Don't end the run if it was provided - caller will end it
    } else {
      this.logger.debug(`Creating new test run with ${testItemsWithResults.length} test items (fallback)`);
      const request = new TestRunRequest(testItemsWithResults);
      actualTestRun = this.controller.createTestRun(
        request,
        'Logtalk Tests',
        true // persist = true for "Rerun Last Run" functionality
      );
      shouldEndRun = true; // End the run if we created it
    }

    // Enqueue all test items that have results so they appear in the Test Results pane
    for (const testItem of testItemsWithResults) {
      actualTestRun.enqueued(testItem);
    }

    // Update test states based on results
    for (const result of testResults) {
      const normalizedPath = path.resolve(result.file).split(path.sep).join("/");
      const fileUri = Uri.file(normalizedPath);
      const testId = `${fileUri.toString()}::${result.object}::${result.test}`;
      const testItem = this.testItems.get(testId);

      if (testItem) {
        // Update test item decoration for flaky tests
        this.updateTestItemDecoration(testItem, result.status);

        actualTestRun.started(testItem);

        // Update test state based on status
        const status = result.status.toLowerCase();
        if (status.startsWith('passed')) {
          actualTestRun.passed(testItem);
        } else if (status.startsWith('failed')) {
          const message = new TestMessage(result.reason);
          message.location = new Location(
            fileUri,
            new Position(result.line - 1, 0)
          );
          actualTestRun.failed(testItem, message);
        } else if (status.startsWith('skipped')) {
          actualTestRun.skipped(testItem);
        }
      }
    }

    // Only end the test run if we created it ourselves
    if (shouldEndRun) {
      actualTestRun.end();
      this.logger.debug('Test run ended (created by updateTestRunFromResults)');
    } else {
      this.logger.debug('Test run updated (will be ended by caller)');
    }
  }

  /**
   * Update test run with coverage data
   * @param coverageResults - Array of coverage results
   * @param testRun - Test run to update with coverage
   */
  private updateCoverageFromResults(coverageResults: CoverageData[], testRun: TestRun): void {
    this.logger.debug('Updating coverage from results');

    // Group coverage data by file
    const coverageByFile = new Map<string, CoverageData[]>();
    for (const coverage of coverageResults) {
      const normalizedPath = path.resolve(coverage.file).split(path.sep).join("/");
      if (!coverageByFile.has(normalizedPath)) {
        coverageByFile.set(normalizedPath, []);
      }
      coverageByFile.get(normalizedPath)!.push(coverage);
    }

    // Store coverage data and create FileCoverage for each file
    for (const [filePath, coverages] of coverageByFile) {
      const fileUri = Uri.file(filePath);

      // Store coverage data for later retrieval
      this.coverageData.set(filePath, coverages);

      // Calculate summary statistics
      // Statement coverage: clauses (sum of all clauses across all predicates)
      // Declaration coverage: predicates (number of predicates)
      let coveredStatements = 0;
      let totalStatements = 0;
      let coveredDeclarations = 0;
      let totalDeclarations = coverages.length;

      for (const coverage of coverages) {
        // Statement coverage: sum of clauses
        totalStatements += coverage.total;
        coveredStatements += coverage.covered;

        // Declaration coverage: count predicates with at least one clause covered
        if (coverage.covered > 0) {
          coveredDeclarations++;
        }

        this.logger.debug(`Line ${coverage.line}: covered=${coverage.covered}, total=${coverage.total}`);
      }

      // Create file coverage with both statement and declaration coverage
      // Parameters: uri, statementCoverage, branchCoverage, declarationCoverage
      const fileCoverage = new FileCoverage(
        fileUri,
        {
          covered: coveredStatements,
          total: totalStatements
        },
        undefined, // branchCoverage - not applicable for Logtalk
        {
          covered: coveredDeclarations,
          total: totalDeclarations
        }
      );

      testRun.addCoverage(fileCoverage);
      this.logger.debug(`Added coverage for ${filePath}: ${coveredStatements}/${totalStatements} statements (clauses) covered, ${coveredDeclarations}/${totalDeclarations} declarations (predicates) covered`);
    }

    this.logger.debug('Coverage update completed');
  }

  /**
   * Load detailed coverage for a file
   * @param fileCoverage - The file coverage to load details for
   * @returns Array of statement coverage details (one per clause)
   */
  private async loadDetailedCoverage(fileCoverage: FileCoverage): Promise<StatementCoverage[]> {
    this.logger.debug(`Loading detailed coverage for ${fileCoverage.uri.fsPath}`);

    const normalizedPath = path.resolve(fileCoverage.uri.fsPath).split(path.sep).join("/");
    this.logger.debug(`Normalized path: ${normalizedPath}`);
    this.logger.debug(`Available coverage paths: ${Array.from(this.coverageData.keys()).join(', ')}`);

    const coverages = this.coverageData.get(normalizedPath);

    if (!coverages) {
      this.logger.debug('No coverage data found for file');
      return [];
    }

    this.logger.debug(`Found ${coverages.length} coverage entries for file`);

    // Open the document
    let document: TextDocument;
    try {
      document = await workspace.openTextDocument(fileCoverage.uri);
    } catch (error) {
      this.logger.error(`Failed to open document for detailed coverage: ${fileCoverage.uri.fsPath}`, error);
      return [];
    }

    // Create coverage array for statements (clauses)
    const coverageItems: StatementCoverage[] = [];

    for (const coverage of coverages) {
      const lineNumber = coverage.line - 1;

      // Validate line number
      if (lineNumber < 0 || lineNumber >= document.lineCount) {
        this.logger.warn(`Invalid line number ${coverage.line} for file ${fileCoverage.uri.fsPath}`);
        continue;
      }

      // Skip if total is 0 (dynamic predicates with no clauses)
      if (coverage.total === 0) {
        this.logger.debug(`Skipping line ${coverage.line}: total clauses is 0 (dynamic predicate)`);
        continue;
      }

      const lineText = document.lineAt(lineNumber).text;
      this.logger.debug(`Processing coverage for line ${coverage.line}: covered=${coverage.covered}, total=${coverage.total}, indexes=[${coverage.coveredIndexes.join(',')}]`);

      // Parse the predicate/non-terminal indicator from the clause head (may be multi-line)
      const predicateIndicator = this.parsePredicateIndicatorFromClauseHead(document, lineNumber);
      if (!predicateIndicator) {
        this.logger.warn(`Could not parse predicate indicator from line ${coverage.line}: "${lineText.trim()}"`);
        continue;
      }

      this.logger.debug(`Parsed predicate indicator: ${predicateIndicator}`);

      // Find all consecutive clauses for this predicate/non-terminal
      const clauseRanges = PredicateUtils.findConsecutivePredicateClauseRanges(
        document,
        predicateIndicator,
        lineNumber
      );

      this.logger.debug(`Found ${clauseRanges.length} consecutive clauses for ${predicateIndicator}`);

      // Mark each clause as covered or not covered (statement coverage)
      for (let i = 0; i < clauseRanges.length; i++) {
        const clauseIndex = i + 1; // 1-based index
        const isClauseCovered = coverage.coveredIndexes.includes(clauseIndex);
        const executionCount = isClauseCovered ? 1 : 0;

        this.logger.debug(`Clause ${clauseIndex} at lines ${clauseRanges[i].start.line + 1}-${clauseRanges[i].end.line + 1}: ${isClauseCovered ? 'covered' : 'not covered'}, executionCount=${executionCount}`);

        // Create one StatementCoverage per clause
        coverageItems.push(new StatementCoverage(executionCount, clauseRanges[i]));
      }
    }

    this.logger.debug(`Loaded ${coverageItems.length} coverage items`);
    return coverageItems;
  }

  /**
   * Parse predicate/non-terminal indicator from a clause head (may be multi-line)
   * @param document - The document
   * @param startLine - The line number where the clause head starts
   * @returns The predicate indicator (name/arity or name//arity) or null if not found
   */
  private parsePredicateIndicatorFromClauseHead(document: TextDocument, startLine: number): string | null {
    // Read the complete clause head (up to :-, -->, or .)
    let clauseHead = '';
    let currentLine = startLine;
    let foundEnd = false;

    while (currentLine < document.lineCount && !foundEnd) {
      const lineText = document.lineAt(currentLine).text;
      clauseHead += lineText;

      // Check if we've reached the end of the clause head
      if (lineText.includes(':-') || lineText.includes('-->') || lineText.trim().endsWith('.')) {
        foundEnd = true;
      } else {
        clauseHead += ' '; // Add space between lines
        currentLine++;
      }
    }

    // Extract just the head part (before :-, -->, or .)
    let headPart = clauseHead;
    const neckPos = clauseHead.indexOf(':-');
    const dcgPos = clauseHead.indexOf('-->');

    if (neckPos !== -1 && (dcgPos === -1 || neckPos < dcgPos)) {
      headPart = clauseHead.substring(0, neckPos);
    } else if (dcgPos !== -1) {
      headPart = clauseHead.substring(0, dcgPos);
    } else {
      // Fact - remove the trailing period
      const dotPos = clauseHead.lastIndexOf('.');
      if (dotPos !== -1) {
        headPart = clauseHead.substring(0, dotPos);
      }
    }

    return this.parsePredicateIndicatorFromText(headPart.trim(), clauseHead.includes('-->'));
  }

  /**
   * Parse predicate/non-terminal indicator from clause head text
   * @param headText - The clause head text (without :-, -->, or .)
   * @param isNonTerminal - Whether this is a DCG rule
   * @returns The predicate indicator (name/arity or name//arity) or null if not found
   */
  private parsePredicateIndicatorFromText(headText: string, isNonTerminal: boolean): string | null {
    const trimmed = headText.trim();

    // Check for multifile clause: Entity::predicate(...)
    const multifileMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(\(.+\))?::([a-z][a-zA-Z0-9_]*|'[^']*')\s*(\()?/);
    if (multifileMatch) {
      const name = multifileMatch[3].replace(/^'|'$/g, '');
      const hasArgs = multifileMatch[4] === '(';
      if (hasArgs) {
        const openParenPos = trimmed.indexOf('::', multifileMatch[1].length) + 2 + multifileMatch[3].length;
        const actualOpenParenPos = trimmed.indexOf('(', openParenPos);
        const closeParenPos = ArgumentUtils.findMatchingCloseParen(trimmed, actualOpenParenPos);
        if (closeParenPos === -1) {
          return null;
        }
        const args = trimmed.substring(actualOpenParenPos, closeParenPos + 1);
        const arity = this.countArguments(args);
        return isNonTerminal ? `${name}//${arity}` : `${name}/${arity}`;
      } else {
        return isNonTerminal ? `${name}//0` : `${name}/0`;
      }
    }

    // Check for regular predicate/non-terminal clause
    const match = trimmed.match(/^([a-z][a-zA-Z0-9_]*|'[^']*')\s*(\()?/);
    if (match) {
      const name = match[1].replace(/^'|'$/g, '');
      const hasArgs = match[2] === '(';
      if (hasArgs) {
        const openParenPos = match[0].length - 1;
        const closeParenPos = ArgumentUtils.findMatchingCloseParen(trimmed, openParenPos);
        if (closeParenPos === -1) {
          return null;
        }
        const args = trimmed.substring(openParenPos, closeParenPos + 1);
        const arity = this.countArguments(args);
        return isNonTerminal ? `${name}//${arity}` : `${name}/${arity}`;
      } else {
        return isNonTerminal ? `${name}//0` : `${name}/0`;
      }
    }

    return null;
  }

  /**
   * Count the number of arguments in a parenthesized argument list
   * @param argsText - The argument list text including parentheses, e.g., "(X, Y, Z)"
   * @returns The number of arguments
   */
  private countArguments(argsText: string): number {
    // Remove outer parentheses and use ArgumentUtils.parseArguments for robust parsing
    const inner = argsText.substring(1, argsText.length - 1).trim();

    if (inner === '') {
      return 0;
    }

    const args = ArgumentUtils.parseArguments(inner);
    return args.length;
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

    // Group summary results by file
    const summariesByFile = new Map<string, TestSummaryData[]>();
    for (const summary of summaryResults) {
      const normalizedPath = path.resolve(summary.file).split(path.sep).join("/");
      if (!summariesByFile.has(normalizedPath)) {
        summariesByFile.set(normalizedPath, []);
      }
      summariesByFile.get(normalizedPath)!.push(summary);
    }

    // Track which test IDs should exist after this update
    const expectedTestIds = new Set<string>();

    // Combine all files from both test results and summaries
    const allFiles = new Set([...testsByFile.keys(), ...summariesByFile.keys()]);

    // Create or update test items for each file
    for (const filePath of allFiles) {
      const fileUri = Uri.file(filePath);
      const fileId = fileUri.toString();
      expectedTestIds.add(fileId);

      // Get workspace folder for this file
      const workspaceFolder = workspace.getWorkspaceFolder(fileUri);
      if (!workspaceFolder) {
        continue; // Skip files not in a workspace folder
      }

      // Get the directory containing the .vscode_test_results file (where tester.lgt is located)
      const testerDir = path.dirname(resultsFileUri.fsPath);
      const workspacePath = workspaceFolder.uri.fsPath;
      const isInSubdirectory = testerDir !== workspacePath;

      // Determine parent item for file
      let parentItem: TestItem | null = null;

      if (isInSubdirectory) {
        // Tester is in a subdirectory - create/get directory item
        const dirUri = Uri.file(testerDir);
        const dirId = dirUri.toString();
        const dirRelativePath = path.relative(workspacePath, testerDir);

        // Always add directory ID to expected IDs
        expectedTestIds.add(dirId);

        // Get or create directory item (added directly to controller)
        let dirItem = this.testItems.get(dirId);
        if (!dirItem) {
          // Determine the URI for the directory item - prefer tester file if it exists
          const testerLgt = path.join(testerDir, 'tester.lgt');
          const testerLogtalk = path.join(testerDir, 'tester.logtalk');
          let itemUri = dirUri;
          if (fs.existsSync(testerLgt)) {
            itemUri = Uri.file(testerLgt);
          } else if (fs.existsSync(testerLogtalk)) {
            itemUri = Uri.file(testerLogtalk);
          }

          dirItem = this.controller.createTestItem(
            dirId,
            dirRelativePath,
            itemUri
          );

          // Set range to enable "Go to Test" icon
          dirItem.range = new Range(new Position(0, 0), new Position(0, 0));

          // Set canResolveChildren to false to enable "Go to Test" and "Reveal in Explorer" icons
          dirItem.canResolveChildren = false;

          this.controller.items.add(dirItem);
          this.testItems.set(dirId, dirItem);

          // Store metadata for directory item
          this.testItemMetadata.set(dirItem, {
            type: 'directory',
            fileUri: dirUri,
            resultsFileUri: resultsFileUri,
            directoryUri: dirUri
          });
        }
        // Note: Don't update resultsFileUri for existing directory items
        // Each directory keeps its own resultsFileUri to avoid cleanup conflicts
        parentItem = dirItem;
      }
      // else: Tester is in workspace root - no parent item, will be added directly to controller

      // Get or create file-level test item
      // Use relative path from tester directory to file for the label
      const fileLabel = isInSubdirectory ? path.relative(testerDir, filePath) : path.basename(filePath);
      let fileItem = this.testItems.get(fileId);
      if (!fileItem) {
        fileItem = this.controller.createTestItem(
          fileId,
          fileLabel,
          fileUri
        );

        // Set range to the beginning of the file to enable "Go to Test" icon
        fileItem.range = new Range(new Position(0, 0), new Position(0, 0));

        // Set canResolveChildren to false to enable "Go to Test" and "Reveal in Explorer" icons
        fileItem.canResolveChildren = false;

        // Add to parent (directory) or directly to controller (workspace root)
        if (parentItem) {
          parentItem.children.add(fileItem);
        } else {
          this.controller.items.add(fileItem);
        }
        this.testItems.set(fileId, fileItem);

        // Store metadata for file-level item
        this.testItemMetadata.set(fileItem, {
          type: 'file',
          fileUri: fileUri,
          resultsFileUri: resultsFileUri
        });
      } else {
        // File item already exists - update its metadata with the new results file
        const existingMetadata = this.testItemMetadata.get(fileItem);
        if (existingMetadata) {
          this.testItemMetadata.set(fileItem, {
            ...existingMetadata,
            resultsFileUri: resultsFileUri
          });
        }

        // Ensure the file item is in the correct parent
        if (fileItem.parent !== parentItem) {
          // Remove from current parent
          if (fileItem.parent) {
            fileItem.parent.children.delete(fileItem.id);
          } else {
            this.controller.items.delete(fileItem.id);
          }
          // Add to new parent
          if (parentItem) {
            parentItem.children.add(fileItem);
          } else {
            this.controller.items.add(fileItem);
          }
        }
      }

      // Clear existing children and rebuild from scratch
      // This ensures invalidated tests are properly recreated
      fileItem.children.forEach(child => {
        // Remove all descendants from the testItems map
        child.children.forEach(grandchild => {
          this.testItems.delete(grandchild.id);
        });
        this.testItems.delete(child.id);
      });
      fileItem.children.replace([]);

      const tests = testsByFile.get(filePath) || [];
      const summaries = summariesByFile.get(filePath) || [];

      // Group tests by object
      const testsByObject = new Map<string, TestResultData[]>();
      for (const test of tests) {
        if (!testsByObject.has(test.object)) {
          testsByObject.set(test.object, []);
        }
        testsByObject.get(test.object)!.push(test);
      }

      // Group object-level summaries by object
      const objectSummaries = new Map<string, TestSummaryData>();
      for (const summary of summaries) {
        objectSummaries.set(summary.object, summary);
      }

      // Combine all objects from both test results and summaries
      const allObjects = new Set([...testsByObject.keys(), ...objectSummaries.keys()]);

      // Create object-level and test-level items
      for (const objectName of allObjects) {
        const objectId = `${fileId}::${objectName}`;
        expectedTestIds.add(objectId);

        const objectTests = testsByObject.get(objectName) || [];
        const objectSummary = objectSummaries.get(objectName);

        // Create object item (always create new since we cleared children)
        const objectItem = this.controller.createTestItem(
          objectId,
          objectName,
          fileUri
        );

        // If we have an object summary, set the range from it
        if (objectSummary) {
          objectItem.range = new Range(
            new Position(objectSummary.line - 1, 0),
            new Position(objectSummary.line - 1, 0)
          );
        }

        // Set canResolveChildren to false to enable "Go to Test" and "Reveal in Explorer" icons
        objectItem.canResolveChildren = false;

        fileItem.children.add(objectItem);
        this.testItems.set(objectId, objectItem);

        // Store metadata for object-level item
        this.testItemMetadata.set(objectItem, {
          type: 'object',
          fileUri: fileUri,
          resultsFileUri: resultsFileUri,
          objectName: objectName
        });

        // Create individual test items (only if we have test results)
        for (const test of objectTests) {
          const testId = `${objectId}::${test.test}`;
          expectedTestIds.add(testId);

          // Create test item (always create new since we cleared children)
          const testItem = this.controller.createTestItem(
            testId,
            test.test,
            fileUri
          );
          testItem.range = new Range(
            new Position(test.line - 1, 0),
            new Position(test.line - 1, 0)
          );

          // Set canResolveChildren to false to enable "Go to Test" and "Reveal in Explorer" icons
          testItem.canResolveChildren = false;

          // Apply flaky decoration if the test status indicates flakiness
          this.updateTestItemDecoration(testItem, test.status);

          objectItem.children.add(testItem);
          this.testItems.set(testId, testItem);

          // Store metadata for test-level item
          this.testItemMetadata.set(testItem, {
            type: 'test',
            fileUri: fileUri,
            resultsFileUri: resultsFileUri,
            objectName: objectName,
            testName: test.test
          });
        }
      }
    }

    // Remove items that came from the same results file but are no longer in the results
    // This handles the case where tests are removed from a file
    // We need to check both top-level items (directories or files) and their children
    const itemsToRemove: TestItem[] = [];

    this.controller.items.forEach(item => {
      const metadata = this.testItemMetadata.get(item);

      if (metadata && metadata.type === 'directory') {
        // Check if this directory should be removed
        if (metadata.resultsFileUri?.toString() === resultsFileUri.toString()) {
          if (!expectedTestIds.has(item.id)) {
            this.logger.debug(`Removing stale directory item: ${item.id}`);
            itemsToRemove.push(item);
          } else {
            // Check children of directory items (files)
            item.children.forEach(fileItem => {
              const fileMetadata = this.testItemMetadata.get(fileItem);
              if (fileMetadata && fileMetadata.resultsFileUri?.toString() === resultsFileUri.toString()) {
                if (!expectedTestIds.has(fileItem.id)) {
                  this.logger.debug(`Removing stale file item from directory ${item.id}: ${fileItem.id}`);
                  itemsToRemove.push(fileItem);
                }
              }
            });
          }
        }
      } else if (metadata && metadata.type === 'file') {
        // File is at top level (in workspace root)
        if (metadata.resultsFileUri?.toString() === resultsFileUri.toString()) {
          if (!expectedTestIds.has(item.id)) {
            this.logger.debug(`Removing stale file item from workspace root: ${item.id}`);
            itemsToRemove.push(item);
          }
        }
      }
    });

    // Remove the items
    for (const item of itemsToRemove) {
      const parent = item.parent;
      if (parent) {
        parent.children.delete(item.id);
      } else {
        this.controller.items.delete(item.id);
      }
      this.testItems.delete(item.id);
    }
  }

  /**
   * Invalidate test results for a specific source file
   * This marks all test items associated with the file as outdated
   */
  private invalidateTestResultsForFile(uri: Uri): void {
    const normalizedPath = path.resolve(uri.fsPath).split(path.sep).join("/");
    const fileUri = Uri.file(normalizedPath);
    const fileId = fileUri.toString();

    this.logger.debug(`Invalidating test results for file: ${fileUri.fsPath}`);

    // Find the file-level test item
    const fileItem = this.testItems.get(fileId);

    if (!fileItem) {
      // No test items for this file
      return;
    }

    // Collect all test items for this file (file, objects, and individual tests)
    const testItemsToInvalidate: TestItem[] = [fileItem];

    // Add all object-level items
    fileItem.children.forEach(objectItem => {
      testItemsToInvalidate.push(objectItem);

      // Add all individual test items
      objectItem.children.forEach(testItem => {
        testItemsToInvalidate.push(testItem);
      });
    });

    // Invalidate all collected test items
    this.controller.invalidateTestResults(testItemsToInvalidate);

    this.logger.debug(`Invalidated ${testItemsToInvalidate.length} test item(s) for file: ${fileUri.fsPath}`);
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    this.testItems.clear();
  }
}

