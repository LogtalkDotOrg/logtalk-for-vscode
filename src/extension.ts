"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  commands,
  DocumentFilter,
  ExtensionContext,
  RelativePattern,
  languages,
  workspace,
  debug,
  window,
  SourceBreakpoint,
  FunctionBreakpoint
} from "vscode";
import * as jsesc from "jsesc";

import { loadEditHelpers } from "./features/editHelpers";
import { Utils } from "./utils/utils";
import LogtalkDocumentHighlightProvider from "./features/documentHighlightProvider";
import LogtalkTerminal from "./features/logtalkTerminal";
import LogtalkLinter from "./features/logtalkLinter";
import LogtalkDeadCodeScanner from "./features/logtalkDeadCodeScanner";
import LogtalkDocumentationLinter from "./features/logtalkDocumentationLinter";
import LogtalkTestsReporter from "./features/logtalkTestsReporter";
import LogtalkJupyter from "./features/logtalkJupyter";
import LogtalkHoverProvider from "./features/hoverProvider";
import { LogtalkDeclarationProvider } from "./features/declarationProvider";
import { LogtalkDefinitionProvider } from "./features/definitionProvider";
import { LogtalkTypeDefinitionProvider } from "./features/typeDefinitionProvider";
import { LogtalkReferenceProvider } from "./features/referenceProvider";
import { LogtalkImplementationProvider } from "./features/implementationProvider";
import { LogtalkDocumentSymbolProvider } from "./features/goToDocumentSymbolProvider";
import { LogtalkWorkspaceSymbolProvider } from "./features/goToWorkspaceSymbolProvider";
import { LogtalkCallHierarchyProvider } from "./features/callHierarchyProvider";
import { LogtalkTypeHierarchyProvider } from "./features/typeHierarchyProvider";
import { LogtalkMetricsCodeLensProvider } from "./features/metricsCodeLensProvider";
import { LogtalkTestsCodeLensProvider } from "./features/testsCodeLensProvider";
import { LogtalkTestsExplorerProvider } from "./features/testsExplorerProvider";
import { LogtalkRenameProvider } from "./features/renameProvider";
import { LogtalkChatParticipant } from "./features/logtalkChatParticipant";
import { LogtalkRefactorProvider } from "./features/refactorProvider";
import { LogtalkDocumentFormattingEditProvider } from "./features/documentFormattingEditProvider";
import { LogtalkDocumentRangeFormattingEditProvider } from "./features/documentRangeFormattingEditProvider";
import { LogtalkProfiling } from "./features/logtalkProfiling";
import { getLogger } from "./utils/logger";
import { DiagnosticsUtils } from "./utils/diagnostics";

const DEBUG = 1;

// Module-level references for cleanup in deactivate()
let linter: LogtalkLinter;
let testsReporter: LogtalkTestsReporter;
let deadCodeScanner: LogtalkDeadCodeScanner;
let documentationLinter: LogtalkDocumentationLinter;
let chatParticipant: LogtalkChatParticipant;
let profiling: LogtalkProfiling;
let watcher: any;
let testsCodeLensProvider: LogtalkTestsCodeLensProvider;
let testsExplorerProvider: LogtalkTestsExplorerProvider;
let metricsCodeLensProvider: LogtalkMetricsCodeLensProvider;
let refactorProvider: LogtalkRefactorProvider;
let makeOnSaveTimer: NodeJS.Timeout | undefined;
let savedLogtalkFiles: Set<string> = new Set();

function getLogLevelDescription(level: string): string {
  switch (level) {
    case 'off': return 'No logging output';
    case 'error': return 'Only error messages';
    case 'warn': return 'Error and warning messages';
    case 'info': return 'Error, warning, and informational messages';
    case 'debug': return 'All messages including detailed debug information';
    default: return '';
  }
}

export function activate(context: ExtensionContext) {

  let subscriptions = context.subscriptions;

  // Initialize logger early
  const logger = getLogger();
  subscriptions.push({ dispose: () => logger.dispose() });

  DEBUG ? logger.debug('Congratulations, your extension "logtalk-for-vscode" is now active!') : null;

  const LOGTALK_MODE: DocumentFilter = { language: "logtalk", scheme: "file" };

  loadEditHelpers(subscriptions);
  linter = new LogtalkLinter(context);
  linter.activate(subscriptions);
  testsReporter = new LogtalkTestsReporter(context);
  testsReporter.activate(subscriptions);
  deadCodeScanner = new LogtalkDeadCodeScanner(context);
  deadCodeScanner.activate(subscriptions);
  documentationLinter = new LogtalkDocumentationLinter(context);
  documentationLinter.activate(subscriptions);

  let section = workspace.getConfiguration("logtalk");
  let logtalkUser: string = '';
  if (section) {
    logtalkUser = jsesc(section.get<string>("user.path", "logtalk")); 
  } else {
    throw new Error("configuration settings error: logtalk"); 
  }

  watcher = workspace.createFileSystemWatcher(new RelativePattern(logtalkUser, "scratch/.debug_info"), false, false, true);

  watcher.onDidCreate((uri) => {
    Utils.openFileAt(uri);
  });
  // Windows requires the onDidChange event
  watcher.onDidChange((uri) => {
    Utils.openFileAt(uri);
  });

  DEBUG ? logger.debug('Linters loaded') : null;

  LogtalkJupyter.init(context);
  Utils.init(context);

  // Check Logtalk version
  Utils.checkLogtalkVersion().then(isVersionSufficient => {
    if (!isVersionSufficient) {
      const minVersion = `${Utils.LOGTALK_MIN_VERSION_MAJOR}.${Utils.LOGTALK_MIN_VERSION_MINOR}.${Utils.LOGTALK_MIN_VERSION_PATCH}`;
      window.showWarningMessage(
        `Logtalk version ${minVersion} or later is required. Some features may not work correctly with older versions.`
      );
      logger.warn(`Logtalk version check failed. Minimum required version: ${minVersion}`);
    } else {
      logger.info('Logtalk version check passed');
    }
  }).catch(error => {
    logger.error('Failed to check Logtalk version:', error);
  });

  // Initialize chat participant
  chatParticipant = new LogtalkChatParticipant(context);

  // Initialize profiling
  profiling = LogtalkProfiling.getInstance(context);

  // Add logging commands
  context.subscriptions.push(
    commands.registerCommand('logtalk.logging.show', () => {
      logger.show();
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.logging.setLevel', async () => {
      const levels = ['off', 'error', 'warn', 'info', 'debug'];
      const currentLevel = logger.getCurrentLevelString();

      const selected = await window.showQuickPick(
        levels.map(level => ({
          label: level,
          description: level === currentLevel ? '(current)' : '',
          detail: getLogLevelDescription(level)
        })),
        {
          placeHolder: `Select extension logging level (current: ${currentLevel})`,
          title: 'Logtalk Extension Logging Level'
        }
      );

      if (selected) {
        const config = workspace.getConfiguration('logtalk');
        await config.update('logging.level', selected.label, true);
        window.showInformationMessage(`Logtalk extension logging level set to: ${selected.label}`);
      }
    })
  );

  // Add a test command for the documentation cache
  context.subscriptions.push(
    commands.registerCommand('logtalk.test.documentation', async () => {
      try {
        const { DocumentationCache } = await import('./utils/documentationCache');
        const cache = DocumentationCache.getInstance(context);

        // Check for version updates first
        const versionInfo = await cache.checkForVersionUpdate();
        logger.info('Version check:', versionInfo);

        const docs = await cache.getDocumentation();
        logger.info(`Documentation loaded: Handbook ${docs.handbook.length} chars, APIs ${docs.apis.length} chars, Version: ${docs.version}, Last updated: ${docs.lastUpdated}`);

        let message = `Logtalk documentation loaded successfully!\nVersion: ${docs.version}`;
        if (versionInfo.hasUpdate && versionInfo.cachedVersion) {
          message += `\n(Updated from version ${versionInfo.cachedVersion})`;
        } else if (!versionInfo.hasUpdate) {
          message += `\n(Using cached documentation)`;
        }

        window.showInformationMessage(message);
      } catch (error) {
        logger.error('Error testing documentation:', error);
        window.showErrorMessage(`Error loading documentation: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Add a command to refresh the documentation cache
  context.subscriptions.push(
    commands.registerCommand('logtalk.refresh.documentation', async () => {
      try {
        const { DocumentationCache } = await import('./utils/documentationCache');
        const cache = DocumentationCache.getInstance(context);

        window.showInformationMessage('Refreshing Logtalk documentation cache...');
        const docs = await cache.refreshCache();
        logger.info(`Documentation refreshed: Version ${docs.version}, Last updated: ${docs.lastUpdated}`);

        window.showInformationMessage(`Logtalk documentation cache refreshed successfully!\nVersion: ${docs.version}`);
      } catch (error) {
        logger.error('Error refreshing documentation:', error);
        window.showWarningMessage(
          `Failed to refresh Logtalk documentation cache. ` +
          `Please check your internet connection and Logtalk configuration. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  // Add profiling commands
  context.subscriptions.push(
    commands.registerCommand('logtalk.profiling.toggle', async () => {
      await profiling.toggleProfiling();
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.profiling.showData', async () => {
      await profiling.showProfilingData();
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.profiling.reset', async () => {
      await profiling.resetProfilingData();
    })
  );

  // Track Logtalk debugging state
  let logtalkDebuggingEnabled = false;

  // Function to update breakpoint states
  function updateBreakpointStates(enabled: boolean) {
    // Update all breakpoints through VS Code's API
    const allBreakpoints = debug.breakpoints;
    debug.removeBreakpoints(allBreakpoints);
    
    // Re-add breakpoints with new enabled state
    const updatedBreakpoints = allBreakpoints.map(bp => {
      if (bp instanceof SourceBreakpoint) {
        return new SourceBreakpoint(
          bp.location,
          enabled,
          bp.condition,
          bp.hitCondition,
          bp.logMessage
        );
      } else if (bp instanceof FunctionBreakpoint) {
        return new FunctionBreakpoint(
          bp.functionName,
          enabled,
          bp.condition,
          bp.hitCondition,
          bp.logMessage
        );
      }
      return bp;
    });
    debug.addBreakpoints(updatedBreakpoints);
  }

  // Register debug session start/stop handlers
  context.subscriptions.push(
    commands.registerCommand('workbench.action.debug.start', () => {
      commands.executeCommand('setContext', 'logtalk.debuggingEnabled', true);
      updateBreakpointStates(true);
      LogtalkTerminal.createLogtalkTerm();
      LogtalkTerminal.sendString('vscode::debug.\r');
    })
  );

  context.subscriptions.push(
    commands.registerCommand('workbench.action.debug.run', () => {
      commands.executeCommand('setContext', 'logtalk.debuggingEnabled', false);
      updateBreakpointStates(false);
      LogtalkTerminal.createLogtalkTerm();
      LogtalkTerminal.sendString('vscode::nodebug.\r');
    })
  );

  let logtalkCommands = [
    // Debugging commands
    { command: "logtalk.toggleDebugging", callback: () => {
      logtalkDebuggingEnabled = !logtalkDebuggingEnabled;
      updateBreakpointStates(logtalkDebuggingEnabled);
      
      // Send appropriate Logtalk command
      LogtalkTerminal.createLogtalkTerm();
      LogtalkTerminal.sendString(logtalkDebuggingEnabled ? 'vscode::debug.\r' : 'vscode::nodebug.\r');
      commands.executeCommand('setContext', 'logtalk.debuggingEnabled', logtalkDebuggingEnabled);
    }},
    // Workspace commands
    { command: "logtalk.create.project",            callback: ()   => LogtalkTerminal.createProject()},
    { command: "logtalk.load.project",              callback: uri  => LogtalkTerminal.loadProject(uri, linter)},
    { command: "logtalk.open",                      callback: ()   => LogtalkTerminal.openLogtalk()},
    { command: "logtalk.rscan.deadCode",            callback: uri  => LogtalkTerminal.rscanForDeadCode(uri, deadCodeScanner)},
    { command: "logtalk.rcompute.metrics",          callback: uri  => LogtalkTerminal.rcomputeMetrics(uri)},
    { command: "logtalk.rgenerate.documentation",   callback: uri  => LogtalkTerminal.rgenDocumentation(uri, documentationLinter)},
    { command: "logtalk.rgenerate.diagrams",        callback: uri  => LogtalkTerminal.rgenDiagrams(uri)},
    { command: "logtalk.run.testers",               callback: uri  => LogtalkTerminal.runTesters(uri)},
    { command: "logtalk.run.doclets",               callback: uri  => LogtalkTerminal.runDoclets(uri)},
    // Directory and file commands
    { command: "logtalk.load.directory",            callback: uri  => LogtalkTerminal.loadDirectory(uri, linter)},
    { command: "logtalk.load.file",                 callback: uri  => LogtalkTerminal.loadFile(uri, linter)},
    { command: "logtalk.make.reload",               callback: uri  => LogtalkTerminal.makeReload(uri, linter)},
    { command: "logtalk.make.optimal",              callback: uri  => LogtalkTerminal.makeOptimal(uri, linter)},
    { command: "logtalk.make.normal",               callback: uri  => LogtalkTerminal.makeNormal(uri, linter)},
    { command: "logtalk.make.debug",                callback: uri  => LogtalkTerminal.makeDebug(uri, linter)},
    { command: "logtalk.make.check",                callback: uri  => LogtalkTerminal.makeCheck(uri, linter)},
    { command: "logtalk.make.circular",             callback: uri  => LogtalkTerminal.makeCircular(uri, linter)},
    { command: "logtalk.make.clean",                callback: uri  => LogtalkTerminal.makeClean(uri, linter)},
    { command: "logtalk.make.caches",               callback: uri  => LogtalkTerminal.makeCaches(uri, linter)},
    { command: "logtalk.run.tests",                 callback: uri  => LogtalkTerminal.runAllTestsViaProfile(uri, linter, testsReporter, testsExplorerProvider)},
    { command: "logtalk.run.tests.coverage",        callback: uri  => LogtalkTerminal.runAllTestsWithCoverageViaProfile(uri, linter, testsReporter, testsExplorerProvider)},
    { command: "logtalk.run.file.tests",            callback: uri  => LogtalkTerminal.runFileTestsViaProfile(uri, linter, testsReporter, testsExplorerProvider)},
    { command: "logtalk.run.object.tests",          callback: (uri, object) => LogtalkTerminal.runObjectTestsViaProfile(uri, object, linter, testsReporter, testsExplorerProvider)},
    { command: "logtalk.run.test",                  callback: (uri, object, test) => LogtalkTerminal.runTestViaProfile(uri, object, test, linter, testsReporter, testsExplorerProvider)},
    { command: "logtalk.run.doclet",                callback: uri  => LogtalkTerminal.runDoclet(uri, linter)},
    { command: "logtalk.scan.deadCode",             callback: uri  => LogtalkTerminal.scanForDeadCode(uri, deadCodeScanner)},
    { command: "logtalk.generate.documentation",    callback: uri  => LogtalkTerminal.genDocumentation(uri, documentationLinter)},
    { command: "logtalk.generate.diagrams",         callback: uri  => LogtalkTerminal.genDiagrams(uri)},
    { command: "logtalk.open.parentFile",           callback: uri  => LogtalkTerminal.openParentFile(uri)},
    { command: "logtalk.compute.metrics",           callback: uri  => LogtalkTerminal.computeMetrics(uri)},
    // CodeLens commands
    { command: "logtalk.toggle.codeLens",           callback: uri  => LogtalkTerminal.toggleCodeLens(uri)},
    // Jupyter commands
    { command: "logtalk.open.notebook",             callback: uri  => LogtalkJupyter.openAsNotebook(uri)},
    { command: "logtalk.open.paired.notebook",      callback: uri  => LogtalkJupyter.openAsPairedNotebook(uri)},
    { command: "logtalk.sync.notebook",             callback: uri  => LogtalkJupyter.syncNotebook(uri)},
    // Diagnostic commands
    { command: "logtalk.update.diagnostics", callback: (uri, diagnostic) => {
      // Route to appropriate diagnostic collection based on the diagnostic source
      if (diagnostic.source === "Logtalk Linter") {
        linter.updateDiagnostics(uri, diagnostic);
      } else if (diagnostic.source === "Logtalk Tests Reporter") {
        testsReporter.updateDiagnostics(uri, diagnostic);
      } else if (diagnostic.source === "Logtalk Dead Code Scanner") {
        deadCodeScanner.updateDiagnostics(uri, diagnostic);
      } else if (diagnostic.source === "Logtalk Documentation Linter") {
        documentationLinter.updateDiagnostics(uri, diagnostic);
      }
    }}
  ];

  logtalkCommands.map(command => {
    context.subscriptions.push(
      commands.registerCommand(command.command, command.callback)
    );
  });

	context.subscriptions.push(commands.registerCommand('logtalk-for-vscode.openSettings', () => {
    commands.executeCommand('workbench.action.openSettings', 'logtalk');
    return { openWalkthrough: 'logtalk-for-vscode#logtalk-walkthrough#configure' };
	}));

	context.subscriptions.push(commands.registerCommand('logtalk-for-vscode.openReadme', () => {
    commands.executeCommand('extension.open', 'LogtalkDotOrg.logtalk-for-vscode');
    return { openWalkthrough: 'logtalk-for-vscode#logtalk-walkthrough#configure' };
	}));

	context.subscriptions.push(commands.registerCommand('logtalk-for-vscode.openExample', () => {
    commands.executeCommand('workbench.action.files.openFolder');
    return { openWalkthrough: 'logtalk-for-vscode#logtalk-walkthrough#open' };
	}));

	context.subscriptions.push(commands.registerCommand('logtalk-for-vscode.loadExample', () => {
    commands.executeCommand('logtalk.load.directory');
    return { openWalkthrough: 'logtalk-for-vscode#logtalk-walkthrough#load' };
	}));

	context.subscriptions.push(commands.registerCommand('logtalk-for-vscode.testExample', () => {
    commands.executeCommand('logtalk.run.testers');
    return { openWalkthrough: 'logtalk-for-vscode#logtalk-walkthrough#test' };
	}));

  // Register refactor commands
  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.extractToEntity', async (document, selection) => {
      if (refactorProvider) {
        await refactorProvider.extractToEntity(document, selection);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.extractToFile', async (document, selection) => {
      if (refactorProvider) {
        await refactorProvider.extractToFile(document, selection);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.addArgument', async (document, position, indicator) => {
      if (refactorProvider) {
        await refactorProvider.addArgument(document, position, indicator);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.reorderArguments', async (document, position, indicator) => {
      if (refactorProvider) {
        await refactorProvider.reorderArguments(document, position, indicator);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.removeArgument', async (document, position, indicator) => {
      if (refactorProvider) {
        await refactorProvider.removeArgument(document, position, indicator);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.replaceIncludeByFileContents', async (document, position, selection) => {
      if (refactorProvider) {
        await refactorProvider.replaceIncludeByFileContents(document, position, selection);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.replaceWithInclude', async (document, range) => {
      if (refactorProvider) {
        await refactorProvider.replaceWithInclude(document, range);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.extractProtocol', async (document, range) => {
      if (refactorProvider) {
        await refactorProvider.extractProtocol(document, range);
      }
    })
  );

  // Entity parameter refactorings
  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.addParameter', async (document, range) => {
      if (refactorProvider) {
        await refactorProvider.addParameter(document, range);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.reorderParameters', async (document, range) => {
      if (refactorProvider) {
        await refactorProvider.reorderParameters(document, range);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.removeParameter', async (document, range) => {
      if (refactorProvider) {
        await refactorProvider.removeParameter(document, range);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.replaceMagicNumber', async (document, selection) => {
      if (refactorProvider) {
        await refactorProvider.replaceMagicNumber(document, selection);
      }
    })
  );

  // Entity type conversion refactorings
  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.convertObjectToProtocol', async (document, entityTypeInfo) => {
      if (refactorProvider) {
        await refactorProvider.convertObjectToProtocol(document, entityTypeInfo);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.convertObjectToCategory', async (document, entityTypeInfo) => {
      if (refactorProvider) {
        await refactorProvider.convertObjectToCategory(document, entityTypeInfo);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.convertProtocolToCategory', async (document, entityTypeInfo) => {
      if (refactorProvider) {
        await refactorProvider.convertProtocolToCategory(document, entityTypeInfo);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.convertProtocolToObject', async (document, entityTypeInfo) => {
      if (refactorProvider) {
        await refactorProvider.convertProtocolToObject(document, entityTypeInfo);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.convertCategoryToProtocol', async (document, entityTypeInfo) => {
      if (refactorProvider) {
        await refactorProvider.convertCategoryToProtocol(document, entityTypeInfo);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.convertCategoryToObject', async (document, entityTypeInfo) => {
      if (refactorProvider) {
        await refactorProvider.convertCategoryToObject(document, entityTypeInfo);
      }
    })
  );

  // Listen for breakpoint changes
  context.subscriptions.push(
    debug.onDidChangeBreakpoints(session => {
      LogtalkTerminal.processBreakpoints(session);
    })
  );

  // Track if debugging is currently enabled
  let debuggingEnabled = true;

  context.subscriptions.push(
    languages.registerDocumentHighlightProvider(LOGTALK_MODE, new LogtalkDocumentHighlightProvider())
  );
  context.subscriptions.push(
    languages.registerHoverProvider(LOGTALK_MODE, new LogtalkHoverProvider())
  );
  context.subscriptions.push(
    languages.registerDeclarationProvider(LOGTALK_MODE, new LogtalkDeclarationProvider())
  );
  context.subscriptions.push(
    languages.registerDefinitionProvider(LOGTALK_MODE, new LogtalkDefinitionProvider())
  );
  context.subscriptions.push(
    languages.registerTypeDefinitionProvider(LOGTALK_MODE, new LogtalkTypeDefinitionProvider())
  );
  context.subscriptions.push(
    languages.registerReferenceProvider(LOGTALK_MODE, new LogtalkReferenceProvider())
  );
  context.subscriptions.push(
    languages.registerImplementationProvider(LOGTALK_MODE, new LogtalkImplementationProvider())
  );
  context.subscriptions.push(
    languages.registerRenameProvider(LOGTALK_MODE, new LogtalkRenameProvider())
  );
  context.subscriptions.push(
    languages.registerCallHierarchyProvider(LOGTALK_MODE, new LogtalkCallHierarchyProvider())
  );
  context.subscriptions.push(
    languages.registerTypeHierarchyProvider(LOGTALK_MODE, new LogtalkTypeHierarchyProvider())
  );
  context.subscriptions.push(
    languages.registerDocumentSymbolProvider({ language: "logtalk" }, new LogtalkDocumentSymbolProvider())
  );
  context.subscriptions.push(
    languages.registerWorkspaceSymbolProvider(new LogtalkWorkspaceSymbolProvider())
  );
  testsCodeLensProvider = new LogtalkTestsCodeLensProvider();
  context.subscriptions.push(
    languages.registerCodeLensProvider(LOGTALK_MODE, testsCodeLensProvider)
  );
  testsExplorerProvider = new LogtalkTestsExplorerProvider(linter, testsReporter);
  context.subscriptions.push(testsExplorerProvider);
  metricsCodeLensProvider = new LogtalkMetricsCodeLensProvider();
  context.subscriptions.push(
    languages.registerCodeLensProvider(LOGTALK_MODE, metricsCodeLensProvider)
  );
  context.subscriptions.push(
    languages.registerCodeActionsProvider(LOGTALK_MODE, linter)
  );
  context.subscriptions.push(
    languages.registerCodeActionsProvider(LOGTALK_MODE, testsReporter)
  );
  context.subscriptions.push(
    languages.registerCodeActionsProvider(LOGTALK_MODE, deadCodeScanner)
  );
  context.subscriptions.push(
    languages.registerCodeActionsProvider(LOGTALK_MODE, documentationLinter)
  );
  refactorProvider = new LogtalkRefactorProvider();
  context.subscriptions.push(
    languages.registerCodeActionsProvider(LOGTALK_MODE, refactorProvider)
  );
  const documentFormattingProvider = new LogtalkDocumentFormattingEditProvider();
  context.subscriptions.push(
    languages.registerDocumentFormattingEditProvider({ language: "logtalk" }, documentFormattingProvider)
  );

  const documentRangeFormattingProvider = new LogtalkDocumentRangeFormattingEditProvider();
  context.subscriptions.push(
    languages.registerDocumentRangeFormattingEditProvider({ language: "logtalk" }, documentRangeFormattingProvider)
  );

  // Register chained formatting command (indentation conversion + Logtalk formatting)
  context.subscriptions.push(
    commands.registerCommand('logtalk.format.withIndentationConversion', async () => {
      await documentFormattingProvider.formatDocumentWithIndentationConversion();
    })
  );
  // Register chained range formatting command (indentation conversion + Logtalk range formatting)
  context.subscriptions.push(
    commands.registerCommand('logtalk.format.range.withIndentationConversion', async () => {
      await documentRangeFormattingProvider.formatDocumentRangeWithIndentationConversion();
    })
  );

  context.subscriptions.push(
    workspace.onDidChangeTextDocument(event => {
      // Update diagnostics for all diagnostic collections
      DiagnosticsUtils.updateDiagnosticsOnChange(linter.diagnosticCollection, event);
      DiagnosticsUtils.updateDiagnosticsOnChange(testsReporter.diagnosticCollection, event);
      DiagnosticsUtils.updateDiagnosticsOnChange(deadCodeScanner.diagnosticCollection, event);
      DiagnosticsUtils.updateDiagnosticsOnChange(documentationLinter.diagnosticCollection, event);
    })
  );

  // Add onDidSaveTextDocument event handler for auto-reload functionality
  // Use debouncing to handle "Save All" command - only call make once after all files are saved
  context.subscriptions.push(
    workspace.onDidSaveTextDocument(document => {
      // Check if the saved document is a Logtalk file
      if (document.languageId === 'logtalk') {
        const section = workspace.getConfiguration("logtalk");
        const makeOnSave = section.get<boolean>("make.onSave", false);

        if (makeOnSave && LogtalkTerminal.hasUserCodeLoaded()) {
          // Track this file as saved
          savedLogtalkFiles.add(document.uri.toString());

          // Clear any existing timer
          if (makeOnSaveTimer) {
            clearTimeout(makeOnSaveTimer);
          }

          // Set a new timer to call make after a short delay
          // This allows "Save All" to save multiple files before make is called once
          makeOnSaveTimer = setTimeout(() => {
            // Call the logtalk.make.reload command only if there's user code loaded
            // Use the URI of the first saved file (make operates on the whole project)
            const firstUri = Array.from(savedLogtalkFiles)[0];
            if (firstUri) {
              commands.executeCommand('logtalk.make.reload', document.uri);
            }
            // Clear the saved files set
            savedLogtalkFiles.clear();
            makeOnSaveTimer = undefined;
          }, 500); // 500ms debounce delay
        }
      }
    })
  );
  context.subscriptions.push(LogtalkTerminal.init(context));
  updateBreakpointStates(logtalkDebuggingEnabled);
}

export function deactivate() {
  // Get logger instance for error reporting during cleanup
  const logger = getLogger();

  // Dispose of all module-level resources
  try {
    if (linter) {
      linter.dispose();
    }
  } catch (error) {
    logger.error('Error disposing linter:', error);
  }

  try {
    if (testsReporter) {
      testsReporter.dispose();
    }
  } catch (error) {
    logger.error('Error disposing tests reporter:', error);
  }

  try {
    if (deadCodeScanner) {
      deadCodeScanner.dispose();
    }
  } catch (error) {
    logger.error('Error disposing dead code scanner:', error);
  }

  try {
    if (documentationLinter) {
      documentationLinter.dispose();
    }
  } catch (error) {
    logger.error('Error disposing documentation linter:', error);
  }

  try {
    if (chatParticipant) {
      chatParticipant.dispose();
    }
  } catch (error) {
    logger.error('Error disposing chat participant:', error);
  }

  try {
    if (profiling) {
      profiling.dispose();
    }
  } catch (error) {
    logger.error('Error disposing profiling:', error);
  }

  try {
    if (watcher) {
      watcher.dispose();
    }
  } catch (error) {
    logger.error('Error disposing file watcher:', error);
  }

  try {
    if (testsCodeLensProvider) {
      testsCodeLensProvider.dispose();
    }
  } catch (error) {
    logger.error('Error disposing tests code lens provider:', error);
  }

  try {
    if (testsExplorerProvider) {
      testsExplorerProvider.dispose();
    }
  } catch (error) {
    logger.error('Error disposing tests explorer provider:', error);
  }

  try {
    if (metricsCodeLensProvider) {
      metricsCodeLensProvider.dispose();
    }
  } catch (error) {
    logger.error('Error disposing metrics code lens provider:', error);
  }

  try {
    if (refactorProvider) {
      refactorProvider.dispose();
    }
  } catch (error) {
    logger.error('Error disposing refactor provider:', error);
  }

  try {
    if (makeOnSaveTimer) {
      clearTimeout(makeOnSaveTimer);
      makeOnSaveTimer = undefined;
    }
    savedLogtalkFiles.clear();
  } catch (error) {
    logger.error('Error cleaning up make on save timer:', error);
  }
}
