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
  FunctionBreakpoint,
  WorkspaceEdit
} from "vscode";
import * as jsesc from "jsesc";

import { loadEditHelpers } from "./features/editHelpers";
import { Utils } from "./utils/utils";
import LogtalkDocumentHighlightProvider from "./features/documentHighlightProvider";
import LogtalkTerminal from "./features/terminal";
import LogtalkLinter from "./features/linterCodeActionProvider";
import LogtalkDeadCodeScanner from "./features/deadCodeScannerCodeActionProvider";
import LogtalkDocumentationLinter from "./features/documentationLinterCodeActionProvider";
import LogtalkTestsReporter from "./features/testsCodeActionProvider";
import LogtalkJupyter from "./features/jupyter";
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
import { LogtalkTestsExplorerProvider } from "./features/testsExplorer";
import { LogtalkRenameProvider } from "./features/renameProvider";
import { LogtalkChatParticipant } from "./features/chatParticipant";
import { LogtalkRefactorProvider } from "./features/refactorProvider";
import { LogtalkDocumentFormattingEditProvider } from "./features/documentFormattingEditProvider";
import { LogtalkDocumentRangeFormattingEditProvider } from "./features/documentRangeFormattingEditProvider";
import { LogtalkListCompletionProvider } from "./features/completionItemProvider";
import { LogtalkSelectionRangeProvider } from "./features/selectionRangeProvider";
import { LogtalkProfiling } from "./features/profiling";
import { getLogger } from "./utils/logger";
import { DiagnosticsUtils } from "./utils/diagnostics";
import { SvgViewerProvider } from "./features/svgViewer";
import { FileRenameHandler } from "./utils/fileRenameHandler";

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

function createDebugFileWatcher(): void {
  // Only create watcher if it doesn't already exist
  // The watcher monitors the Logtalk user directory (from configuration), not the workspace
  if (!watcher) {
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
  }
}

export async function activate(context: ExtensionContext) {

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

  // Create debug file watcher
  createDebugFileWatcher();

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
    window.showWarningMessage(
      `Cannot determine Logtalk version: ${error.message}. Please ensure Logtalk is properly installed and configured.`
    );
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
    { command: "logtalk.run.testers",               callback: uri  => LogtalkTerminal.runTesters(uri, linter, testsReporter)},
    { command: "logtalk.run.doclets",               callback: uri  => LogtalkTerminal.runDoclets(uri, linter, documentationLinter)},
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
    // SVG Viewer commands
    { command: "logtalk.open.svg",                  callback: uri  => SvgViewerProvider.openSvgFile(uri, context)},
    { command: "logtalk.svgViewer.back",            callback: ()   => SvgViewerProvider.goBack()},
    { command: "logtalk.svgViewer.reload",          callback: ()   => SvgViewerProvider.reload()},
    { command: "logtalk.svgViewer.zoomIn",          callback: ()   => SvgViewerProvider.zoomIn()},
    { command: "logtalk.svgViewer.zoomOut",         callback: ()   => SvgViewerProvider.zoomOut()},
    { command: "logtalk.svgViewer.zoomReset",       callback: ()   => SvgViewerProvider.zoomReset()},
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
    commands.executeCommand('workbench.action.openSettings', 'Logtalk');
    return { openWalkthrough: 'logtalk-for-vscode#logtalk-walkthrough#configure' };
	}));

	context.subscriptions.push(commands.registerCommand('logtalk-for-vscode.openReadme', async () => {
    // Open extension details page which shows the README
    await commands.executeCommand('extension.open', 'LogtalkDotOrg.logtalk-for-vscode');
    // Re-open the walkthrough to the side so both can coexist
    await commands.executeCommand('workbench.action.openWalkthrough', {
      category: 'LogtalkDotOrg.logtalk-for-vscode#logtalk-walkthrough',
      step: 'logtalk-for-vscode#logtalk-walkthrough#configure'
    }, true); // true = open to side
    return { openWalkthrough: 'logtalk-for-vscode#logtalk-walkthrough#configure' };
	}));

	context.subscriptions.push(commands.registerCommand('logtalk-for-vscode.openExample', async () => {
    // Open folder picker (will open in new window when user selects a folder)
    await commands.executeCommand('workbench.action.files.openFolder', { forceNewWindow: true });
    // Re-open the walkthrough to the side so both can coexist
    await commands.executeCommand('workbench.action.openWalkthrough', {
      category: 'LogtalkDotOrg.logtalk-for-vscode#logtalk-walkthrough',
      step: 'logtalk-for-vscode#logtalk-walkthrough#open'
    }, true); // true = open to side
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

	context.subscriptions.push(commands.registerCommand('logtalk-for-vscode.createProject', async () => {
    // Execute the create project command (shows folder picker dialog and waits for user selection)
    await commands.executeCommand('logtalk.create.project');
    // Re-open the walkthrough to the side so both can coexist
    await commands.executeCommand('workbench.action.openWalkthrough', {
      category: 'LogtalkDotOrg.logtalk-for-vscode#logtalk-walkthrough',
      step: 'logtalk-for-vscode#logtalk-walkthrough#create'
    }, true); // true = open to side
    return { openWalkthrough: 'logtalk-for-vscode#logtalk-walkthrough#create' };
	}));

  // Register refactor commands
  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.addPredicateDeclaration', async (document, position, indicator) => {
      if (refactorProvider) {
        await refactorProvider.addPredicateDeclaration(document, position, indicator);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.splitInIndividualDirectives', async (document, listDirectiveInfo) => {
      if (refactorProvider) {
        await refactorProvider.splitInIndividualDirectives(document, listDirectiveInfo);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.extractToEntity', async (document, selection) => {
      if (refactorProvider) {
        await refactorProvider.extractToEntity(document, selection);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.extractToNewEntity', async (document, selection) => {
      if (refactorProvider) {
        await refactorProvider.extractToNewEntity(document, selection);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.extractToNewFile', async (document, selection) => {
      if (refactorProvider) {
        await refactorProvider.extractToNewFile(document, selection);
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

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.unifyWithNewVariable', async (document, selection) => {
      if (refactorProvider) {
        await refactorProvider.unifyWithNewVariable(document, selection);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.extractPredicate', async (document, selection) => {
      if (refactorProvider) {
        await refactorProvider.extractPredicate(document, selection);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.inlineVariable', async (document, selection) => {
      if (refactorProvider) {
        await refactorProvider.inlineVariable(document, selection);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.renumberVariables', async (document, selection) => {
      if (refactorProvider) {
        await refactorProvider.renumberVariables(document, selection);
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

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.convertModuleToObject', async (document, entityTypeInfo) => {
      if (refactorProvider) {
        await refactorProvider.convertModuleToObject(document, entityTypeInfo);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.wrapFileAsObject', async (document) => {
      if (refactorProvider) {
        await refactorProvider.wrapFileAsObject(document);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('logtalk.refactor.inferPublicPredicates', async (document, entityInfo) => {
      if (refactorProvider) {
        await refactorProvider.inferPublicPredicates(document, entityInfo);
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

  // Store provider instances to ensure their dispose() methods are called on deactivation
  const declarationProvider = new LogtalkDeclarationProvider();
  context.subscriptions.push(
    languages.registerDeclarationProvider(LOGTALK_MODE, declarationProvider)
  );
  context.subscriptions.push(declarationProvider);

  const definitionProvider = new LogtalkDefinitionProvider();
  context.subscriptions.push(
    languages.registerDefinitionProvider(LOGTALK_MODE, definitionProvider)
  );
  context.subscriptions.push(definitionProvider);

  const typeDefinitionProvider = new LogtalkTypeDefinitionProvider();
  context.subscriptions.push(
    languages.registerTypeDefinitionProvider(LOGTALK_MODE, typeDefinitionProvider)
  );
  context.subscriptions.push(typeDefinitionProvider);

  const referenceProvider = new LogtalkReferenceProvider();
  context.subscriptions.push(
    languages.registerReferenceProvider(LOGTALK_MODE, referenceProvider)
  );
  context.subscriptions.push(referenceProvider);

  const implementationProvider = new LogtalkImplementationProvider();
  context.subscriptions.push(
    languages.registerImplementationProvider(LOGTALK_MODE, implementationProvider)
  );
  context.subscriptions.push(implementationProvider);

  context.subscriptions.push(
    languages.registerRenameProvider(LOGTALK_MODE, new LogtalkRenameProvider())
  );

  context.subscriptions.push(
    languages.registerSelectionRangeProvider(LOGTALK_MODE, new LogtalkSelectionRangeProvider())
  );

  const callHierarchyProvider = new LogtalkCallHierarchyProvider();
  context.subscriptions.push(
    languages.registerCallHierarchyProvider(LOGTALK_MODE, callHierarchyProvider)
  );
  context.subscriptions.push(callHierarchyProvider);

  const typeHierarchyProvider = new LogtalkTypeHierarchyProvider();
  context.subscriptions.push(
    languages.registerTypeHierarchyProvider(LOGTALK_MODE, typeHierarchyProvider)
  );
  context.subscriptions.push(typeHierarchyProvider);
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

  const listCompletionProvider = new LogtalkListCompletionProvider();
  context.subscriptions.push(
    languages.registerCompletionItemProvider({ language: "logtalk" }, listCompletionProvider, '|')
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

  // Provide file deletion edits for preview (before deletion happens)
  // Note: VS Code API does not support canceling file deletion from onWillDeleteFiles.
  // The preview dialog only shows the edits, not the deletion itself.
  // If the user cancels the preview, the file will still be deleted.
  context.subscriptions.push(
    workspace.onWillDeleteFiles(event => {
      event.waitUntil((async () => {
        const edit = new WorkspaceEdit();

        for (const uri of event.files) {
          // Only process Logtalk files (not Prolog files for this feature)
          const fileName = uri.fsPath.toLowerCase();
          if (fileName.endsWith('.lgt') || fileName.endsWith('.logtalk')) {
            try {
              const propagationEdit = await FileRenameHandler.propagateFileDeletion(uri);
              if (propagationEdit) {
                // Merge the propagation edits into the main edit
                for (const [editUri, edits] of propagationEdit.entries()) {
                  for (const textEdit of edits) {
                    edit.replace(editUri, textEdit.range, textEdit.newText);
                  }
                }
                logger.info(`Added file deletion propagation to preview for ${uri.fsPath}`);
              }
            } catch (error) {
              logger.error(`Error preparing file deletion propagation:`, error);
            }
          }
        }

        // Return the edit so VS Code includes it in the deletion preview
        return edit;
      })());
    })
  );

  // Delete diagnostics when files are deleted from the workspace
  context.subscriptions.push(
    workspace.onDidDeleteFiles(event => {
      event.files.forEach(uri => {
        // Only process Logtalk and Prolog files
        const fileName = uri.fsPath.toLowerCase();
        if (fileName.endsWith('.lgt') || fileName.endsWith('.logtalk') || fileName.endsWith('.pl') || fileName.endsWith('.prolog')) {
          // Delete from diagnostic collections
          linter.diagnosticCollection.delete(uri);
          testsReporter.diagnosticCollection.delete(uri);
          deadCodeScanner.diagnosticCollection.delete(uri);
          documentationLinter.diagnosticCollection.delete(uri);

          // Clean up internal diagnostics objects
          const filePath = uri.fsPath;
          if (filePath in linter.diagnostics) {
            delete linter.diagnostics[filePath];
          }
          if (filePath in testsReporter.diagnostics) {
            delete testsReporter.diagnostics[filePath];
          }
          if (filePath in deadCodeScanner.diagnostics) {
            delete deadCodeScanner.diagnostics[filePath];
          }
          if (filePath in documentationLinter.diagnostics) {
            delete documentationLinter.diagnostics[filePath];
          }
        }
      });
    })
  );

  // Provide file rename edits for preview (before rename happens)
  context.subscriptions.push(
    workspace.onWillRenameFiles(event => {
      event.waitUntil((async () => {
        const edit = new WorkspaceEdit();

        for (const file of event.files) {
          // Only process Logtalk files (not Prolog files for this feature)
          const oldFileName = file.oldUri.fsPath.toLowerCase();
          if (oldFileName.endsWith('.lgt') || oldFileName.endsWith('.logtalk')) {
            try {
              const propagationEdit = await FileRenameHandler.propagateFileRename(file.oldUri, file.newUri);
              if (propagationEdit) {
                // Merge the propagation edits into the main edit
                for (const [uri, edits] of propagationEdit.entries()) {
                  for (const textEdit of edits) {
                    edit.replace(uri, textEdit.range, textEdit.newText);
                  }
                }
                logger.info(`Added file rename propagation to preview for ${file.oldUri.fsPath}`);
              }
            } catch (error) {
              logger.error(`Error preparing file rename propagation:`, error);
            }
          }
        }

        // Return the edit so VS Code includes it in the rename preview
        return edit;
      })());
    })
  );

  // Delete diagnostics when files are renamed/moved in the workspace
  context.subscriptions.push(
    workspace.onDidRenameFiles(async event => {
      for (const file of event.files) {
        // Only process Logtalk and Prolog files
        const oldFileName = file.oldUri.fsPath.toLowerCase();
        if (oldFileName.endsWith('.lgt') || oldFileName.endsWith('.logtalk') || oldFileName.endsWith('.pl') || oldFileName.endsWith('.prolog')) {
          // Delete diagnostics for the old file path
          linter.diagnosticCollection.delete(file.oldUri);
          testsReporter.diagnosticCollection.delete(file.oldUri);
          deadCodeScanner.diagnosticCollection.delete(file.oldUri);
          documentationLinter.diagnosticCollection.delete(file.oldUri);

          // Clean up internal diagnostics objects for the old file path
          const oldFilePath = file.oldUri.fsPath;
          if (oldFilePath in linter.diagnostics) {
            delete linter.diagnostics[oldFilePath];
          }
          if (oldFilePath in testsReporter.diagnostics) {
            delete testsReporter.diagnostics[oldFilePath];
          }
          if (oldFilePath in deadCodeScanner.diagnostics) {
            delete deadCodeScanner.diagnostics[oldFilePath];
          }
          if (oldFilePath in documentationLinter.diagnostics) {
            delete documentationLinter.diagnostics[oldFilePath];
          }
        }
      }
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
  context.subscriptions.push(await LogtalkTerminal.init(context, linter, testsReporter, deadCodeScanner, documentationLinter));
  updateBreakpointStates(logtalkDebuggingEnabled);

  // Load project on activation if setting is enabled and a Logtalk file is open
  const loadProjectOnActivation = workspace.getConfiguration("logtalk").get<boolean>("loadProject.onActivation", false);
  if (loadProjectOnActivation) {
    const activeEditor = window.activeTextEditor;
    if (activeEditor) {
      const document = activeEditor.document;
      const isLogtalkFile = document.languageId === 'logtalk' ||
                           document.fileName.endsWith('.lgt') ||
                           document.fileName.endsWith('.logtalk');
      if (isLogtalkFile) {
        commands.executeCommand('logtalk.load.project');
      }
    }
  }
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
    LogtalkTerminal.dispose();
  } catch (error) {
    logger.error('Error disposing Logtalk terminal:', error);
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
