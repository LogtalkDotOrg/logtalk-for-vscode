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
import { LogtalkChatParticipant } from "./features/logtalkChatParticipant";
import { getLogger } from "./utils/logger";

const DEBUG = 1;

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
  const linter = new LogtalkLinter(context);
  linter.activate(subscriptions);
  const testsReporter = new LogtalkTestsReporter(context);
  testsReporter.activate(subscriptions);
  const deadCodeScanner = new LogtalkDeadCodeScanner(context);
  deadCodeScanner.activate(subscriptions);
  const documentationLinter = new LogtalkDocumentationLinter(context);
  documentationLinter.activate(subscriptions);

  let section = workspace.getConfiguration("logtalk");
  let logtalkUser: string = '';
  if (section) {
    logtalkUser = jsesc(section.get<string>("user.path", "logtalk")); 
  } else {
    throw new Error("configuration settings error: logtalk"); 
  }

  const watcher = workspace.createFileSystemWatcher(new RelativePattern(logtalkUser, "scratch/.debug_info"), false, false, true);

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

  // Initialize chat participant
  new LogtalkChatParticipant(context);

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

  // Track Logtalk debugging state
  let logtalkDebuggingEnabled = true;

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
      LogtalkTerminal.sendString('vscode::debug.\r');
      commands.executeCommand('setContext', 'logtalk.debuggingEnabled', true);
      updateBreakpointStates(true);
    })
  );

  context.subscriptions.push(
    commands.registerCommand('workbench.action.debug.run', () => {
      LogtalkTerminal.sendString('vscode::nodebug.\r');
      commands.executeCommand('setContext', 'logtalk.debuggingEnabled', false);
      updateBreakpointStates(false);
    })
  );

  let logtalkCommands = [
    // Debugging commands
    { command: "logtalk.toggleDebugging", callback: () => {
      logtalkDebuggingEnabled = !logtalkDebuggingEnabled;
      updateBreakpointStates(logtalkDebuggingEnabled);
      
      // Send appropriate Logtalk command
      LogtalkTerminal.sendString(logtalkDebuggingEnabled ? 'vscode::debug.\r' : 'vscode::nodebug.\r');
      commands.executeCommand('setContext', 'logtalk.debuggingEnabled', logtalkDebuggingEnabled);
    }},
    // Workspace commands
    { command: "logtalk.create.project",          callback: ()   => LogtalkTerminal.createProject()},
    { command: "logtalk.load.project",            callback: uri  => LogtalkTerminal.loadProject(uri, linter)},
    { command: "logtalk.open",                    callback: ()   => LogtalkTerminal.openLogtalk()},
    { command: "logtalk.rscan.deadCode",          callback: uri  => LogtalkTerminal.rscanForDeadCode(uri, deadCodeScanner)},
    { command: "logtalk.rgenerate.documentation", callback: uri  => LogtalkTerminal.rgenDocumentation(uri, documentationLinter)},
    { command: "logtalk.rgenerate.diagrams",      callback: uri  => LogtalkTerminal.rgenDiagrams(uri)},
    { command: "logtalk.run.testers",             callback: uri  => LogtalkTerminal.runTesters(uri)},
    { command: "logtalk.run.doclets",             callback: uri  => LogtalkTerminal.runDoclets(uri)},
    // Directory and file commands
    { command: "logtalk.load.directory",          callback: uri  => LogtalkTerminal.loadDirectory(uri, linter)},
    { command: "logtalk.load.file",               callback: uri  => LogtalkTerminal.loadFile(uri, linter)},
    { command: "logtalk.make.reload",             callback: uri  => LogtalkTerminal.makeReload(uri, linter)},
    { command: "logtalk.make.optimal",            callback: uri  => LogtalkTerminal.makeOptimal(uri, linter)},
    { command: "logtalk.make.normal",             callback: uri  => LogtalkTerminal.makeNormal(uri, linter)},
    { command: "logtalk.make.debug",              callback: uri  => LogtalkTerminal.makeDebug(uri, linter)},
    { command: "logtalk.make.check",              callback: uri  => LogtalkTerminal.makeCheck(uri, linter)},
    { command: "logtalk.make.circular",           callback: uri  => LogtalkTerminal.makeCircular(uri, linter)},
    { command: "logtalk.make.clean",              callback: uri  => LogtalkTerminal.makeClean(uri, linter)},
    { command: "logtalk.make.caches",             callback: uri  => LogtalkTerminal.makeCaches(uri, linter)},
    { command: "logtalk.run.tests",               callback: uri  => LogtalkTerminal.runTests(uri, linter, testsReporter)},
    { command: "logtalk.run.test",                callback: (uri, object, test) => LogtalkTerminal.runTest(uri, object, test, linter, testsReporter)},
    { command: "logtalk.run.doclet",              callback: uri  => LogtalkTerminal.runDoclet(uri, linter)},
    { command: "logtalk.scan.deadCode",           callback: uri  => LogtalkTerminal.scanForDeadCode(uri, deadCodeScanner)},
    { command: "logtalk.generate.documentation",  callback: uri  => LogtalkTerminal.genDocumentation(uri, documentationLinter)},
    { command: "logtalk.generate.diagrams",       callback: uri  => LogtalkTerminal.genDiagrams(uri)},
    { command: "logtalk.open.parentFile",         callback: uri  => LogtalkTerminal.openParentFile(uri)},
    { command: "logtalk.compute.metrics",         callback: uri  => LogtalkTerminal.computeMetrics(uri)},
    // CodeLens commands
    { command: "logtalk.toggle.codeLens",         callback: uri  => LogtalkTerminal.toggleCodeLens(uri)},
    // Jupyter commands
    { command: "logtalk.open.notebook",           callback: uri  => LogtalkJupyter.openAsNotebook(uri)},
    { command: "logtalk.open.paired.notebook",    callback: uri  => LogtalkJupyter.openAsPairedNotebook(uri)},
    { command: "logtalk.sync.notebook",           callback: uri  => LogtalkJupyter.syncNotebook(uri)}
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
    languages.registerCallHierarchyProvider(LOGTALK_MODE, new LogtalkCallHierarchyProvider())
  );
  context.subscriptions.push(
    languages.registerTypeHierarchyProvider(LOGTALK_MODE, new LogtalkTypeHierarchyProvider())
  );
  context.subscriptions.push(
    languages.registerDocumentSymbolProvider(LOGTALK_MODE, new LogtalkDocumentSymbolProvider())
  );
  context.subscriptions.push(
    languages.registerWorkspaceSymbolProvider(new LogtalkWorkspaceSymbolProvider())
  );
  context.subscriptions.push(
    languages.registerCodeLensProvider(LOGTALK_MODE, new LogtalkTestsCodeLensProvider())
  );
  context.subscriptions.push(
    languages.registerCodeLensProvider(LOGTALK_MODE, new LogtalkMetricsCodeLensProvider())
  );
  context.subscriptions.push(LogtalkTerminal.init(context));
}
// this method is called when your extension is deactivated
export function deactivate() {}
