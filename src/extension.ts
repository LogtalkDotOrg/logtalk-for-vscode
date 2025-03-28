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
  debug
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

const DEBUG = 1;

export function activate(context: ExtensionContext) {

  let subscriptions = context.subscriptions;
  DEBUG ? console.log('Congratulations, your extension "logtalk-for-vscode" is now active!') : null;

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

  DEBUG ? console.log('Linters loaded') : null;

  LogtalkJupyter.init(context);
  Utils.init(context);

  let logtalkCommands = [
    // workspace commands
    { command: "logtalk.create.project",          callback: ()   => LogtalkTerminal.createProject()},
    { command: "logtalk.load.project",            callback: uri  => LogtalkTerminal.loadProject(uri, linter)},
    { command: "logtalk.open",                    callback: ()   => LogtalkTerminal.openLogtalk()},
    { command: "logtalk.rscan.deadCode",          callback: uri  => LogtalkTerminal.rscanForDeadCode(uri, deadCodeScanner)},
    { command: "logtalk.rgenerate.documentation", callback: uri  => LogtalkTerminal.rgenDocumentation(uri, documentationLinter)},
    { command: "logtalk.rgenerate.diagrams",      callback: uri  => LogtalkTerminal.rgenDiagrams(uri)},
    { command: "logtalk.run.testers",             callback: uri  => LogtalkTerminal.runTesters(uri)},
    { command: "logtalk.run.doclets",             callback: uri  => LogtalkTerminal.runDoclets(uri)},
    // directory and file commands
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

  context.subscriptions.push(
    debug.onDidChangeBreakpoints(
      session => {
        LogtalkTerminal.processBreakpoints(session);
      }
  ));

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
