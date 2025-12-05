"use strict";

import {
  Terminal,
  window,
  workspace,
  commands,
  TextDocument,
  Disposable,
  OutputChannel,
  Uri,
  ExtensionContext,
  Position,
  BreakpointsChangeEvent,
  SourceBreakpoint,
  FunctionBreakpoint
} from "vscode";
import * as vscode from "vscode";
import * as path from "path";
import * as jsesc from "jsesc";
import * as fs from "fs";
import { spawn } from "child_process";
import LogtalkLinter from "./linterCodeActionProvider";
import LogtalkTestsReporter from "./testsCodeActionProvider";
import LogtalkDeadCodeScanner from "./deadCodeScannerCodeActionProvider";
import LogtalkDocumentationLinter from "./documentationLinterCodeActionProvider";
import { LogtalkMetricsCodeLensProvider } from "./metricsCodeLensProvider";
import { LogtalkTestsCodeLensProvider } from "./testsCodeLensProvider"
import { LogtalkTestsExplorerProvider } from "./testsExplorer";
import * as fsp from "fs/promises";
import * as timers from "timers/promises";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import { StatusBarManager } from "./statusBar";

export default class LogtalkTerminal {
  private static _terminal:       Terminal;
  private static _testerExec:     string;
  private static _testerArgs:     string[];
  private static _docletExec:     string;
  private static _docletArgs:     string[];
  private static _docExec:        string;
  private static _docArgs:        string[];
  private static _diaExec:        string;
  private static _diaArgs:        string[];
  private static _timeout:        number;
  private static _outputChannel:  OutputChannel;
  private static _loadedDirectories: Set<string> = new Set();
  private static disposables: Disposable[] = [];

  // Terminal readiness tracking
  private static _terminalReadyPromise: Promise<void> | null = null;
  private static _terminalReadyResolve: (() => void) | null = null;

  /**
   * Expands VS Code-style environment variables (${env:VAR}) to their actual values.
   * @param value The string containing environment variables to expand
   * @returns The string with environment variables expanded
   */
  private static expandEnvironmentVariables(value: string): string {
    return value.replace(/\$\{env:([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }

  /**
   * Expands VS Code-style environment variables in an array of strings.
   * @param args Array of strings that may contain environment variables
   * @returns Array with environment variables expanded
   */
  private static expandEnvironmentVariablesInArray(args: string[]): string[] {
    return args.map(arg => LogtalkTerminal.expandEnvironmentVariables(arg));
  }

  public static async init(
    context: ExtensionContext,
    linter?: LogtalkLinter,
    testsReporter?: LogtalkTestsReporter,
    deadCodeScanner?: LogtalkDeadCodeScanner,
    documentationLinter?: LogtalkDocumentationLinter
  ): Promise<Disposable> {

    // Delete any temporary files from previous sessions in all workspace folders
    const files = [
      ".vscode_loading_done",
      ".vscode_make_done",
      ".vscode_tests_done",
      ".vscode_metrics_done",
      ".vscode_xml_files_done",
      ".vscode_dot_files_done",
      ".vscode_dead_code_scanning_done",
      ".vscode_entity_definition_done",
      ".vscode_predicate_definition_done",
      ".vscode_declaration_done",
      ".vscode_definition_done",
      ".vscode_type_definition_done",
      ".vscode_references_done",
      ".vscode_implementations_done",
      ".vscode_callers_done",
      ".vscode_callees_done",
      ".vscode_ancestors_done",
      ".vscode_descendants_done",
      ".vscode_type_done",
      ".vscode_find_parent_done",
      ".vscode_infer_public_predicates_done",
      ".vscode_files_topological_sort_done",
      ".vscode_tester_output",
      ".vscode_doclet_output"
    ];
    // Wait for cleanup to complete in all workspace folders
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        await Utils.cleanupTemporaryFiles(folder.uri.fsPath, files);
      }
    }

    // Clean up any temporary files when folders are added to the workspace
    const workspaceFoldersListener = workspace.onDidChangeWorkspaceFolders(async (event) => {
      for (const wf of event.added) {
        await Utils.cleanupTemporaryFiles(wf.uri.fsPath, files);
      }
    });
    LogtalkTerminal.disposables.push(workspaceFoldersListener);

    let section = workspace.getConfiguration("logtalk");

    let logtalkHome = section.get<string>("home.path");
    let logtalkUser = section.get<string>("user.path");
    let logtalkBackend = section.get<string>("backend");

    if (logtalkHome == "") {
      vscode.window.showErrorMessage("Configuration error: missing required logtalk.home.path setting!");
    } else if (logtalkUser == "") {
      vscode.window.showErrorMessage("Configuration error: missing required logtalk.user.path setting!");
    } else if (logtalkBackend == "") {
      vscode.window.showErrorMessage("Configuration error: missing required logtalk.backend setting!");
    }

    LogtalkTerminal._testerExec    =   LogtalkTerminal.expandEnvironmentVariables(section.get<string>("tester.script"));
    LogtalkTerminal._outputChannel =   window.createOutputChannel("Logtalk Testers & Doclets");
    LogtalkTerminal._testerArgs    =   LogtalkTerminal.expandEnvironmentVariablesInArray(section.get<string[]>("tester.arguments"));
    LogtalkTerminal._docletExec    =   LogtalkTerminal.expandEnvironmentVariables(section.get<string>("doclet.script"));
    LogtalkTerminal._docletArgs    =   LogtalkTerminal.expandEnvironmentVariablesInArray(section.get<string[]>("doclet.arguments"));

    LogtalkTerminal._docExec       =   LogtalkTerminal.expandEnvironmentVariables(section.get<string>("documentation.script"));
    LogtalkTerminal._docArgs       =   LogtalkTerminal.expandEnvironmentVariablesInArray(section.get<string[]>("documentation.arguments"));
    LogtalkTerminal._diaExec       =   LogtalkTerminal.expandEnvironmentVariables(section.get<string>("diagrams.script"));
    LogtalkTerminal._diaArgs       =   LogtalkTerminal.expandEnvironmentVariablesInArray(section.get<string[]>("diagrams.arguments"));
    LogtalkTerminal._timeout       =   section.get<number>("scripts.timeout", 480000);

    if (LogtalkTerminal._testerExec == "") {
      if (process.platform === 'win32') {
        LogtalkTerminal._testerExec = LogtalkTerminal.expandEnvironmentVariables("${env:ProgramFiles}/PowerShell/7/pwsh.exe");
        LogtalkTerminal._testerArgs = ["-file", LogtalkTerminal.expandEnvironmentVariables("${env:SystemRoot}/logtalk_tester.ps1"), "-p", logtalkBackend, "-f", "xunit", "-s", "''"];
      } else {
        LogtalkTerminal._testerExec = path.join(path.join(logtalkHome, "scripts"), "logtalk_tester.sh");
        LogtalkTerminal._testerExec = path.resolve(LogtalkTerminal._testerExec).split(path.sep).join("/");
        LogtalkTerminal._testerArgs = ["-p", logtalkBackend, "-f", "xunit", "-s", "''"];
      }
    }

    if (LogtalkTerminal._docletExec == "") {
      if (process.platform === 'win32') {
        LogtalkTerminal._docletExec = LogtalkTerminal.expandEnvironmentVariables("${env:ProgramFiles}/PowerShell/7/pwsh.exe");
        LogtalkTerminal._docletArgs = ["-file", LogtalkTerminal.expandEnvironmentVariables("${env:SystemRoot}/logtalk_doclet.ps1"), "-p", logtalkBackend];
      } else {
        LogtalkTerminal._docletExec = path.join(path.join(logtalkHome, "scripts"), "logtalk_doclet.sh");
        LogtalkTerminal._docletExec = path.resolve(LogtalkTerminal._docletExec).split(path.sep).join("/");
        LogtalkTerminal._docletArgs = ["-p", logtalkBackend];
      }
    }

    if (LogtalkTerminal._docExec == "") {
      if (process.platform === 'win32') {
        LogtalkTerminal._docExec = LogtalkTerminal.expandEnvironmentVariables("${env:ProgramFiles}/PowerShell/7/pwsh.exe");
        LogtalkTerminal._docArgs = ["-file", LogtalkTerminal.expandEnvironmentVariables("${env:SystemRoot}/lgt2html.ps1"), "-t", "APIs documentation"];
      } else {
        LogtalkTerminal._docExec = path.join(logtalkHome, "tools/lgtdoc/xml/lgt2html.sh");
        LogtalkTerminal._docExec = path.resolve(LogtalkTerminal._docExec).split(path.sep).join("/");
        LogtalkTerminal._docArgs = ["-t", "APIs documentation"];
      }
    }

    if (LogtalkTerminal._diaExec == "") {
      if (process.platform === 'win32') {
        LogtalkTerminal._diaExec = LogtalkTerminal.expandEnvironmentVariables("${env:ProgramFiles}/PowerShell/7/pwsh.exe");
        LogtalkTerminal._diaArgs = ["-file", LogtalkTerminal.expandEnvironmentVariables("${env:SystemRoot}/lgt2svg.ps1")];
      } else {
        LogtalkTerminal._diaExec = path.join(logtalkHome, "tools/diagrams/lgt2svg.sh");
        LogtalkTerminal._diaExec = path.resolve(LogtalkTerminal._diaExec).split(path.sep).join("/");
        LogtalkTerminal._diaArgs = [];
      }
    }

    // Create initial Logtalk terminal without showing it
    LogtalkTerminal.createLogtalkTerm();

    return (<any>window).onDidCloseTerminal(terminal => {
      // Only clear if the closed terminal is the Logtalk terminal
      if (terminal === LogtalkTerminal._terminal) {
        // Check if the terminal crashed
        if (terminal.exitStatus) {
          if (terminal.exitStatus.code !== undefined && terminal.exitStatus.code !== 0) {
            // Non-zero exit code indicates crash or error
            window.showErrorMessage(
              `Logtalk terminal exited with code ${terminal.exitStatus.code}. The terminal may have crashed.`,
              'Restart Terminal'
            ).then(selection => {
              if (selection === 'Restart Terminal') {
                commands.executeCommand('logtalk.open');
              }
            });
          }
        }

        LogtalkTerminal._loadedDirectories.clear();
        LogtalkTerminal._terminal = null;
        // Reset terminal readiness tracking
        LogtalkTerminal._terminalReadyPromise = null;
        LogtalkTerminal._terminalReadyResolve = null;
        terminal.dispose();

        // Clear all diagnostics when the terminal is closed
        if (linter) {
          linter.diagnosticCollection.clear();
          linter.diagnostics = {};
          linter.diagnosticHash = [];
        }
        if (testsReporter) {
          testsReporter.diagnosticCollection.clear();
          testsReporter.diagnostics = {};
          testsReporter.diagnosticHash = [];
        }
        if (deadCodeScanner) {
          deadCodeScanner.diagnosticCollection.clear();
          deadCodeScanner.diagnostics = {};
          deadCodeScanner.diagnosticHash = [];
        }
        if (documentationLinter) {
          documentationLinter.diagnosticCollection.clear();
          documentationLinter.diagnostics = {};
          documentationLinter.diagnosticHash = [];
        }
      }
    });
  }

  /**
   * Dispose of all resources
   */
  public static dispose(): void {
    // Explicitly dispose of the terminal to prevent restoration
    if (LogtalkTerminal._terminal) {
      try {
        // Hide the terminal before disposing to reduce chance of restoration
        LogtalkTerminal._terminal.hide();
        LogtalkTerminal._terminal.dispose();
      } catch (error) {
        // Ignore errors during disposal
      }
      LogtalkTerminal._terminal = null;
    }

    // Dispose of all other resources
    for (const disposable of LogtalkTerminal.disposables) {
      disposable.dispose();
    }
    LogtalkTerminal.disposables = [];

    // Clear loaded directories
    LogtalkTerminal._loadedDirectories.clear();

    // Reset terminal creation flag
    LogtalkTerminal._terminalCreationInProgress = false;
  }

  // Flag to track if terminal creation is in progress (to prevent race conditions)
  private static _terminalCreationInProgress: boolean = false;

  /**
   * Wait for the Logtalk terminal to be ready (vscode.lgt loaded).
   * Returns immediately if terminal is already ready.
   */
  public static async waitForTerminalReady(): Promise<void> {
    if (LogtalkTerminal._terminalReadyPromise) {
      return LogtalkTerminal._terminalReadyPromise;
    }
    // If there's a terminal but no ready promise, it's already ready
    if (LogtalkTerminal._terminal) {
      return Promise.resolve();
    }
    // No terminal yet, nothing to wait for
    return Promise.resolve();
  }

  public static createLogtalkTerm() {
    if (LogtalkTerminal._terminal || LogtalkTerminal._terminalCreationInProgress) {
      return;
    }

    // Check if a Logtalk terminal already exists (e.g., from a previous session or multi-root workspace)
    // This handles cases where _terminal reference was lost but the terminal still exists
    const existingTerminal = window.terminals.find(t => t.name === "Logtalk");
    if (existingTerminal) {
      LogtalkTerminal._terminal = existingTerminal;
      return;
    }

    // Set flag to prevent concurrent calls from creating multiple terminals
    LogtalkTerminal._terminalCreationInProgress = true;

    // Create the readiness promise
    LogtalkTerminal._terminalReadyPromise = new Promise<void>((resolve) => {
      LogtalkTerminal._terminalReadyResolve = resolve;
    });

    try {
      let section = workspace.getConfiguration("logtalk");
      if (section) {
      let logtalkHome = jsesc(section.get<string>("home.path", "logtalk"));
      let logtalkUser = jsesc(section.get<string>("user.path", "logtalk"));
      let logtalkBackend = jsesc(section.get<string>("backend", "logtalk"));
      let executable = jsesc(section.get<string>("executable.path", "logtalk"));
      const executableArgsConfig = section.get("executable.arguments");
      let args = Utils.resolveExecutableArguments(executableArgsConfig, logtalkBackend);

      let script = "";
      if (executable == "") {
        switch(logtalkBackend) {
          case "b":
            script = "bplgt"
            break;
          case "ciao":
            script = "ciaolgt"
            break;
          case "cx":
            script = "cxlgt"
            break;
          case "eclipse":
            script = "eclipselgt"
            break;
          case "gnu":
            script = "gplgt"
            break;
          case "ji":
            script = "jiplgt"
            break;
          case "sicstus":
            script = "sicstuslgt"
            break;
          case "swi":
            script = "swilgt"
            break;
          case "tau":
            script = "taulgt"
            break;
          case "trealla":
            script = "tplgt"
            break;
          case "xsb":
            script = "xsblgt"
            break;
          case "xvm":
            script = "xvmlgt"
            break;
          case "yap":
            script = "yaplgt"
            break;
          default:
            vscode.window.showErrorMessage("Configuration error: unknown logtalk.backend setting value!");
        }
        if (process.platform === 'win32') {
          executable = LogtalkTerminal.expandEnvironmentVariables("${env:ProgramFiles}/PowerShell/7/pwsh.exe");
          args = ["-file", LogtalkTerminal.expandEnvironmentVariables("${env:SystemRoot}/" + script + ".ps1")]
        } else {
          executable = path.join(logtalkHome, path.join("integration", script + ".sh"));
          executable = path.resolve(executable).split(path.sep).join("/");
         }
      }

      LogtalkTerminal._terminal = (<any>window).createTerminal({
        name: "Logtalk",
        shellPath: executable,
        shellArgs: args,
        isTransient: true
      });

      // Reset the creation flag now that terminal is created
      LogtalkTerminal._terminalCreationInProgress = false;

      // Match "in file <path> at/between line(s) <number(s)>" pattern for warnings/errors
      let errorWarningRegex = new RegExp(/(in file)\s(.+)\s((at or above line\s(\d+))|(between lines\s(\d+)[-](\d+))|(at line\s(\d+)))/);
      // Match "% [ <path> loaded ]" pattern for informative messages
      let loadedRegex = new RegExp(/%\s\[\s(.+?)\sloaded\s\]/);

      vscode.window.registerTerminalLinkProvider({
        provideTerminalLinks: (context: vscode.TerminalLinkContext, token: vscode.CancellationToken) => {

          // Try to match error/warning pattern first
          let match = errorWarningRegex.exec(context.line);

          if (match != null && match.length > 0) {
            // Error/warning pattern matched
            const startIndex = context.line.indexOf(match[0]) + 5; // "file"

            let file = match[2] + ":"

            if (match[7] && match[8]) {
              file += match[7] + "-" + match[8]
            } else if (match[10]){
              file += match[10];
            } else {
              file += match[5];
            }

            return [{
              startIndex,
              length: match[2].length,
              tooltip: file
            }]
          }

          // Try to match loaded file pattern
          match = loadedRegex.exec(context.line);

          if (match != null && match.length > 0) {
            // Loaded file pattern matched
            const filePath = match[1];
            const startIndex = context.line.indexOf(filePath);

            return [{
              startIndex,
              length: filePath.length,
              tooltip: filePath
            }]
          }

          return [];
        },
        handleTerminalLink: async (tooltipText) => {

          const tooltip = tooltipText.tooltip;
          let filePath: string;
          let lineInfo: string | undefined;

          // Check if tooltip contains line number information (has a colon after the path)
          // For Windows: "c:\path\file.lgt:848" or "c:\path\file.lgt"
          // For Unix: "/path/file.lgt:848" or "/path/file.lgt"

          if (process.platform === 'win32' && /^[a-zA-Z]:/.test(tooltip)) {
            // Windows path with drive letter
            const lastColonIndex = tooltip.lastIndexOf(':');
            const driveColonIndex = tooltip.indexOf(':');

            // Check if there's a colon after the drive letter (indicating line number)
            if (lastColonIndex > driveColonIndex) {
              // Has line number: "c:\path\file.lgt:848"
              filePath = tooltip.substring(0, lastColonIndex);
              lineInfo = tooltip.substring(lastColonIndex + 1);
            } else {
              // No line number: "c:\path\file.lgt"
              filePath = tooltip;
              lineInfo = undefined;
            }
          } else {
            // Unix-style path
            const colonIndex = tooltip.indexOf(':');
            if (colonIndex !== -1) {
              // Has line number: "/path/file.lgt:848"
              filePath = tooltip.substring(0, colonIndex);
              lineInfo = tooltip.substring(colonIndex + 1);
            } else {
              // No line number: "/path/file.lgt"
              filePath = tooltip;
              lineInfo = undefined;
            }
          }

          // Handle paths starting with double slash followed by drive letter (e.g., //C/path -> C:/path)
          filePath = Utils.normalizeDoubleSlashPath(filePath);

          // Open the document
          vscode.workspace.openTextDocument(filePath).then(
            document => vscode.window.showTextDocument(document).then((editor) => {
              // If we have line information, navigate to it
              if (lineInfo) {
                const range = lineInfo.split("-");
                var pos1 = new vscode.Position(parseInt(range[0]) - 1, 0);
                var pos2;
                if(range[1]) {
                  pos2 = new vscode.Position(parseInt(range[1]), 0);
                } else {
                  pos2 = pos1;
                }
                editor.selections = [new vscode.Selection(pos1, pos2)];
                var revealRange = new vscode.Range(pos1, pos2);
                editor.revealRange(revealRange);
              }
              // If no line info, just open the file at the top (default behavior)
            })
          )
        }
      });

      let goals = `logtalk_load('${logtalkHome}/coding/vscode/vscode.lgt', [scratch_directory('${logtalkUser}/scratch/')]).\r`;
      LogtalkTerminal.sendString(goals, false);

      // Add the Logtalk core directory to loaded directories to avoid warnings
      const normalizedCore = fs.realpathSync(path.join(logtalkHome, "core")).split(path.sep).join("/").toLowerCase();
      LogtalkTerminal._loadedDirectories.add(normalizedCore);

      // Terminal is now ready (vscode.lgt load command has been sent)
      // Resolve the readiness promise so callers can proceed
      if (LogtalkTerminal._terminalReadyResolve) {
        LogtalkTerminal._terminalReadyResolve();
      }

      } else {
        throw new Error("configuration settings error: logtalk");
      }
    } catch (error) {
      // Reset the flag on error so terminal creation can be retried
      LogtalkTerminal._terminalCreationInProgress = false;
      // Reject the readiness promise on error
      if (LogtalkTerminal._terminalReadyResolve) {
        LogtalkTerminal._terminalReadyPromise = null;
        LogtalkTerminal._terminalReadyResolve = null;
      }
      throw error;
    }
  }

  public static sendString(text: string, show = false) {
    // LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal._terminal.sendText(text, false);
    if (show) {
      LogtalkTerminal._terminal.show(false);
    }
  }

  /**
   * Normalize a path to use forward slashes and ensure uppercase drive letter on Windows.
   * @param filePath The file path to normalize
   * @returns The normalized path with forward slashes and uppercase drive letter
   */
  private static normalizePath(filePath: string): string {
    filePath = path.resolve(filePath).split(path.sep).join("/");
    // Ensure uppercase drive letter on Windows
    // VSCode uri.fsPath normalizes drive letters to lowercase, but we want uppercase
    if (process.platform === 'win32' && /^[a-z]:/.test(filePath)) {
      return filePath.charAt(0).toUpperCase() + filePath.slice(1);
    }
    return filePath;
  }

  public static openLogtalk() {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal._terminal.show(true);
  }

  public static async createProject() {
    // Declare Variables
    let logtalkHome: string = '';
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) {
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk"));
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk"));
    } else {
      throw new Error("configuration settings error: logtalk");
    }
    // Create project - await the dialog result
    const folders = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false
    });

    if (folders != null && folders.length > 0) {
      fs.copyFile(logtalkHome + "/coding/editorconfig/editorconfig", folders[0].fsPath + "/.editorconfig", (err) => {});
      fs.copyFile(logtalkHome + "/coding/git/Logtalk.gitignore", folders[0].fsPath + "/.gitignore", (err) => {});
      if (fs.existsSync(logtalkUser + "/samples")) {
        fs.copyFile(logtalkUser + "/samples/loader-sample.lgt", folders[0].fsPath + "/loader.lgt", (err) => {});
        fs.copyFile(logtalkUser + "/samples/settings-sample.lgt", folders[0].fsPath + "/settings.lgt", (err) => {});
        fs.copyFile(logtalkUser + "/samples/tester-sample.lgt", folders[0].fsPath + "/tester.lgt", (err) => {});
        fs.copyFile(logtalkUser + "/samples/tests-sample.lgt", folders[0].fsPath + "/tests.lgt", (err) => {});
      } else {
        fs.copyFile(logtalkUser + "/loader-sample.lgt", folders[0].fsPath + "/loader.lgt", (err) => {});
        fs.copyFile(logtalkUser + "/settings-sample.lgt", folders[0].fsPath + "/settings.lgt", (err) => {});
        fs.copyFile(logtalkUser + "/tester-sample.lgt", folders[0].fsPath + "/tester.lgt", (err) => {});
        fs.copyFile(logtalkUser + "/tests-sample.lgt", folders[0].fsPath + "/tests.lgt", (err) => {});
      }
      commands.executeCommand("vscode.openFolder", folders[0]);
    }
  }

  public static async loadProject(uri: Uri, linter: LogtalkLinter) {
    if (typeof uri === 'undefined') {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }
      uri = vscode.workspace.workspaceFolders[0].uri;
    }
    // Declare Variables
    const dir0 = LogtalkTerminal.getWorkspaceFolderForUri(uri);
    if (!dir0) {
      vscode.window.showErrorMessage('No workspace folder found for the selected file');
      return;
    }
    const loader0 = path.join(dir0, "loader");
    const dir = LogtalkTerminal.normalizePath(dir0);
    const loader = LogtalkTerminal.normalizePath(loader0);
    let logtalkHome: string = '';
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) { 
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk")); 
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk")); 
    } else { 
      throw new Error("configuration settings error: logtalk"); 
    }
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Check that the loader file exists
    if (!fs.existsSync(loader + ".lgt") && !fs.existsSync(loader + ".logtalk")) {
      window.showWarningMessage("Loader file not found.");
      return;
    }
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`vscode::load('${dir}','${loader}').\r`, true);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_loading_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
          // Extract the directory from the compilation message
          const match = line.match(/% \[ compiling (.*?) \.\.\. \]/);
          if (match) {
            // Handle paths starting with double slash followed by drive letter (e.g., //C/path -> C:/path)
            let filePath = Utils.normalizeDoubleSlashPath(match[1]);
            const compiledDir = path.dirname(filePath);
            LogtalkTerminal.recordCodeLoadedFromDirectory(compiledDir);
          }
        } else {
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            linter.lint(message);
            message = '';
          }
        }
      }
    }
    window.showInformationMessage("Project loading completed.");
  }

  public static async loadDirectory(uri: Uri, linter: LogtalkLinter) {
    if (typeof uri === 'undefined') {
      if (!window.activeTextEditor) {
        window.showErrorMessage('No file open or selected');
        return;
      }
      uri = window.activeTextEditor.document.uri;
    }
    // Declare Variables
    const dir0 = path.dirname(uri.fsPath);
    const loader0 = path.join(dir0, "loader");
    const dir = LogtalkTerminal.normalizePath(dir0);
    const loader = LogtalkTerminal.normalizePath(loader0);
    let logtalkHome: string = '';
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) { 
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk")); 
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk")); 
    } else { 
      throw new Error("configuration settings error: logtalk"); 
    }
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Check that the loader file exists
    if (!fs.existsSync(loader + ".lgt") && !fs.existsSync(loader + ".logtalk")) {
      window.showWarningMessage("Loader file not found.");
      return;
    }
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`vscode::load('${dir}','${loader}').\r`, true);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_loading_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
          // Extract the directory from the compilation message
          const match = line.match(/% \[ compiling (.*?) \.\.\. \]/);
          if (match) {
            // Handle paths starting with double slash followed by drive letter (e.g., //C/path -> C:/path)
            let filePath = Utils.normalizeDoubleSlashPath(match[1]);
            const compiledDir = path.dirname(filePath);
            LogtalkTerminal.recordCodeLoadedFromDirectory(compiledDir);
          }
        } else {
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            linter.lint(message);
            message = '';
          }
        }
      }
    }
    window.showInformationMessage("Directory loading completed.");
  }

  public static async loadFile(uri: Uri, linter: LogtalkLinter) {
    if (typeof uri === 'undefined') {
      if (!window.activeTextEditor) {
        window.showErrorMessage('No file open or selected');
        return;
      }
      uri = window.activeTextEditor.document.uri;
    }
    // Declare Variables
    let dir0: string;
    dir0 = path.dirname(uri.fsPath);
    const dir = LogtalkTerminal.normalizePath(dir0);
    const file0: string = await LogtalkTerminal.ensureFile(uri);
    const file = LogtalkTerminal.normalizePath(file0);
    let logtalkHome: string = '';
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) { 
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk")); 
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk")); 
    } else { 
      throw new Error("configuration settings error: logtalk"); 
    }
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`vscode::load('${dir}','${file}').\r`, true);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_loading_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
          // Extract the directory from the compilation message
          const match = line.match(/% \[ compiling (.*?) \.\.\. \]/);
          if (match) {
            // Handle paths starting with double slash followed by drive letter (e.g., //C/path -> C:/path)
            let filePath = Utils.normalizeDoubleSlashPath(match[1]);
            const compiledDir = path.dirname(filePath);
            LogtalkTerminal.recordCodeLoadedFromDirectory(compiledDir);
          }
        } else {
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            linter.lint(message);
            message = '';
          }
        }
      }
    }
    window.showInformationMessage("File loading completed.");
  }

  public static async makeClean(uri: Uri, linter: LogtalkLinter) {
    await LogtalkTerminal.make(uri, linter, "clean", false, "Deleted intermediate compilation files.");
  }

  public static async makeCaches(uri: Uri, linter: LogtalkLinter) {
    await LogtalkTerminal.make(uri, linter, "caches", false, "Deleted dynamic binding caches.");
  }

  public static async makeReload(uri: Uri, linter: LogtalkLinter) {
    await LogtalkTerminal.make(uri, linter, "all", false, "File reloading completed.");
  }

  public static async makeOptimal(uri: Uri, linter: LogtalkLinter) {
    await LogtalkTerminal.make(uri, linter, "optimal", false, "Recompiled files in optimal mode.");
  }

  public static async makeNormal(uri: Uri, linter: LogtalkLinter) {
    await LogtalkTerminal.make(uri, linter, "normal", false, "Recompiled files in optimal mode.");
  }

  public static async makeDebug(uri: Uri, linter: LogtalkLinter) {
    await LogtalkTerminal.make(uri, linter, "debug", false, "Recompiled files in debug mode.");
  }

  public static async makeCheck(uri: Uri, linter: LogtalkLinter) {
    LogtalkTerminal.make(uri, linter, "check", true, "");
  }

  public static async makeCircular(uri: Uri, linter: LogtalkLinter) {
    LogtalkTerminal.make(uri, linter, "circular", true, "");
  }

  public static async make(uri: Uri, linter: LogtalkLinter, target: string, showTerminal: boolean, info: string) {
    if (!LogtalkTerminal._terminal) {
      window.showWarningMessage("No Logtalk process is running.");
      return;
    }
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    // Declare Variables
    const dir0 = path.dirname(uri.fsPath);
    const dir = LogtalkTerminal.normalizePath(dir0);
    let logtalkHome: string = '';
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) {
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk"));
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk"));
    } else {
      throw new Error("configuration settings error: logtalk");
    }
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Call the make tool
    LogtalkTerminal.sendString(`vscode::make('${dir}','${target}').\r`, showTerminal);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_make_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if (fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
        } else {
          message = message + line + '\n';
          if (line == '*     ' || line == '!     ') {
            linter.lint(message);
            message = '';
          }
        }
      }
    }
    if (info != "") {
      window.showInformationMessage(info);
    }
  }

  public static async runAllTests(uri: Uri, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }

    // Declare Variables
    // Check if URI is a directory or file
    let dir0: string;
    let textDocument = null;
    const stats = fs.statSync(uri.fsPath);
    if (stats.isDirectory()) {
      // URI is a directory (e.g., workspace folder)
      dir0 = uri.fsPath;
    } else {
      // URI is a file
      dir0 = path.dirname(uri.fsPath);
      // Open the Text Document
      await workspace.openTextDocument(uri).then((document: TextDocument) => { textDocument = document });
    }

    const tester0 = path.join(dir0, "tester");
    const dir = LogtalkTerminal.normalizePath(dir0);
    const tester = LogtalkTerminal.normalizePath(tester0);
    let logtalkHome: string = '';
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) {
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk"));
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk"));
    } else {
      throw new Error("configuration settings error: logtalk");
    }
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Check that the tester file exists
    if (!fs.existsSync(tester + ".lgt") && !fs.existsSync(tester + ".logtalk")) {
      window.showWarningMessage("Tester file not found.");
      return;
    }
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`vscode::tests('${dir}','${tester}').\r`, true);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_loading_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      let test = false;
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
          testsReporter.clear(line);
        } else if (test || line.includes('cpu/wall seconds')) {
          test = true;
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            testsReporter.lint(textDocument, message);
            message = '';
            test = false;
          }
        } else {
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            linter.lint(message);
            message = '';
          }
        }
      }
    }
    LogtalkTerminal.recordCodeLoadedFromDirectory(dir);
    window.showInformationMessage("Tests completed.");
    LogtalkTestsCodeLensProvider.outdated = false;
  }

  public static async runFileTests(uri: Uri, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }

    // Declare Variables
    const dir0 = path.dirname(uri.fsPath);
    const dir = LogtalkTerminal.normalizePath(dir0);
    const file = LogtalkTerminal.normalizePath(uri.fsPath);
    let textDocument = null;
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) {
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk"));
    } else {
      throw new Error("configuration settings error: logtalk");
    }
    // Open the Text Document
    await workspace.openTextDocument(uri).then((document: TextDocument) => { textDocument = document });
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`vscode::tests_file('${dir}','${file}').\r`, true);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_loading_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      let test = false;
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
          testsReporter.clear(line);
        } else if (test || line.includes('cpu/wall seconds')) {
          test = true;
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            testsReporter.lint(textDocument, message);
            message = '';
            test = false;
          }
        } else {
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            linter.lint(message);
            message = '';
          }
        }
      }
    }
    window.showInformationMessage("Tests from file completed.");
    LogtalkTestsCodeLensProvider.outdated = false;
  }

  public static async runObjectTests(uri: Uri, object: string, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }

    // Declare Variables
    const dir0 = path.dirname(uri.fsPath);
    const dir = LogtalkTerminal.normalizePath(dir0);
    const file = LogtalkTerminal.normalizePath(uri.fsPath);
    let textDocument = null;
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) {
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk"));
    } else {
      throw new Error("configuration settings error: logtalk");
    }
    // Open the Text Document
    await workspace.openTextDocument(uri).then((document: TextDocument) => { textDocument = document });
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`vscode::tests_object('${dir}','${object}').\r`, true);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_loading_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      let test = false;
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
          testsReporter.clear(line);
        } else if (test || line.includes('cpu/wall seconds')) {
          test = true;
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            testsReporter.lint(textDocument, message);
            message = '';
            test = false;
          }
        } else {
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            linter.lint(message);
            message = '';
          }
        }
      }
    }

    window.showInformationMessage("Tests from object completed.");
    LogtalkTestsCodeLensProvider.outdated = false;
  }

  public static async runTest(uri: Uri, object: string, test: string, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }

    // Declare Variables
    const dir0 = path.dirname(uri.fsPath);
    const tester0 = path.join(dir0, "tester");
    const dir = LogtalkTerminal.normalizePath(dir0);
    const tester = LogtalkTerminal.normalizePath(tester0);
    let textDocument = null;
    let logtalkHome: string = '';
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) {
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk"));
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk"));
    } else {
      throw new Error("configuration settings error: logtalk");
    }
    // Open the Text Document
    await workspace.openTextDocument(uri).then((document: TextDocument) => { textDocument = document });
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Check that the tester file exists
    if (!fs.existsSync(tester + ".lgt") && !fs.existsSync(tester + ".logtalk")) {
      window.showWarningMessage("Tester file not found.");
      return;
    }
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`vscode::test('${dir}',${object}, ${test}).\r`, true);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_loading_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      let test = false;
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
          testsReporter.clear(line);
        } else if (test || line.includes('cpu/wall seconds')) {
          test = true;
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            testsReporter.lint(textDocument, message);
            message = '';
            test = false;
          }
        } else {
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            linter.lint(message);
            message = '';
          }
        }
      }
    }
    window.showInformationMessage("Test completed.");
    LogtalkTestsCodeLensProvider.outdated = false;
  }

  public static async computeMetrics(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    const dir = LogtalkTerminal.normalizePath(dir0);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    let goals = `vscode::metrics('${dir}').\r`;
    LogtalkTerminal.sendString(goals, true);
    const marker = path.join(dir0, ".vscode_metrics_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    window.showInformationMessage("Metrics completed.");
    LogtalkMetricsCodeLensProvider.outdated = false;
  }

  public static async rcomputeMetrics(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    const dir = LogtalkTerminal.normalizePath(dir0);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    let goals = `vscode::metrics_recursive('${dir}').\r`;
    LogtalkTerminal.sendString(goals, true);
    const marker = path.join(dir0, ".vscode_metrics_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    window.showInformationMessage("Metrics completed.");
    LogtalkMetricsCodeLensProvider.outdated = false;
  }

  public static async runDoclet(uri: Uri, linter: LogtalkLinter) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    // Declare Variables
    const dir0 = path.dirname(uri.fsPath);
    const doclet0 = path.join(dir0, "doclet");
    const dir = LogtalkTerminal.normalizePath(dir0);
    const doclet = LogtalkTerminal.normalizePath(doclet0);
    let textDocument = null;
    let logtalkHome: string = '';
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) { 
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk")); 
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk")); 
    } else { 
      throw new Error("configuration settings error: logtalk"); 
    }
    // Open the Text Document
    await workspace.openTextDocument(uri).then((document: TextDocument) => { textDocument = document });
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Check that the doclet file exists
    if (!fs.existsSync(doclet + ".lgt") && !fs.existsSync(doclet + ".logtalk")) {
      window.showWarningMessage("Doclet file not found.");
      return;
    }
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`vscode::doclet('${dir}','${doclet}').\r`, true);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_loading_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
        } else {
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            linter.lint(message);
            message = '';
          }
        }
      }
    }
    LogtalkTerminal.recordCodeLoadedFromDirectory(dir);
    window.showInformationMessage("Doclet completed.");
  }

  public static async genDocumentation(uri: Uri, documentationLinter: LogtalkDocumentationLinter) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    LogtalkTerminal.genDocumentationHelper(documentationLinter, dir0, "documentation");
  }

  public static async rgenDocumentation(uri: Uri, documentationLinter: LogtalkDocumentationLinter) {
    if (typeof uri === 'undefined') {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }
      uri = vscode.workspace.workspaceFolders[0].uri;
    }
    const dir0 = LogtalkTerminal.getWorkspaceFolderForUri(uri);
    if (!dir0) {
      vscode.window.showErrorMessage('No workspace folder found for the selected file');
      return;
    }
    LogtalkTerminal.genDocumentationHelper(documentationLinter, dir0, "documentation_recursive");
  }

  public static async genDocumentationHelper(documentationLinter: LogtalkDocumentationLinter, dir0: string, predicate: string) {
    // Declare Variables
    let textDocument = null;
    let logtalkHome: string = '';
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) {
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk"));
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk"));
    } else {
      throw new Error("configuration settings error: logtalk");
    }
    // Clear all existing diagnostics before starting documentation generation
    documentationLinter.clearAll();
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    const dir = LogtalkTerminal.normalizePath(dir0);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const xmlDir0 = path.join(dir, "xml_docs");
    const xmlDir = LogtalkTerminal.normalizePath(xmlDir0);
    LogtalkTerminal.sendString(`vscode::${predicate}('${dir}').\r`, true);
    const marker = path.join(dir0, ".vscode_xml_files_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          documentationLinter.clear(line);
        } else {
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            documentationLinter.lint(message);
            message = '';
          }
        }
      }
    }
    LogtalkTerminal.spawnScript(
      xmlDir0,
      ["documentation", "logtalk.documentation.script", LogtalkTerminal._docExec],
      LogtalkTerminal._docExec,
      LogtalkTerminal._docArgs,
      "Documentation generation completed."
    );
  }

  public static async genDiagrams(uri: Uri) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    LogtalkTerminal.rgenDiagramsHelper(dir0, "diagrams");
  }

  public static async rgenDiagrams(uri: Uri) {
    if (typeof uri === 'undefined') {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }
      uri = vscode.workspace.workspaceFolders[0].uri;
    }
    const dir0 = LogtalkTerminal.getWorkspaceFolderForUri(uri);
    if (!dir0) {
      vscode.window.showErrorMessage('No workspace folder found for the selected file');
      return;
    }
    LogtalkTerminal.rgenDiagramsHelper(dir0, "diagrams_recursive");
  }

  public static async rgenDiagramsHelper(dir0: string, predicate: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = LogtalkTerminal.normalizePath(dir0);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const project = path.basename(dir);
    const format = workspace.getConfiguration("logtalk").get<string>("diagrams.format", "Graphviz");
    LogtalkTerminal.sendString(`vscode::${predicate}('${project}','${dir}', '${format}').\r`, true);
    const marker = path.join(dir0, ".vscode_dot_files_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    LogtalkTerminal.spawnScript(
      path.join(dir0, "dot_dias"),
      ["diagrams", "logtalk.diagrams.script", LogtalkTerminal._diaExec],
      LogtalkTerminal._diaExec,
      LogtalkTerminal._diaArgs,
      "Diagrams generation completed."
    );
  }

  public static async scanForDeadCode(uri: Uri, deadCodeScanner: LogtalkDeadCodeScanner) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    LogtalkTerminal.scanForDeadCodeHelper(uri, deadCodeScanner, dir0, "dead_code")
  }

  public static async rscanForDeadCode(uri: Uri, deadCodeScanner: LogtalkDeadCodeScanner) {
    if (typeof uri === 'undefined') {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }
      uri = vscode.workspace.workspaceFolders[0].uri;
    }
    const dir0 = LogtalkTerminal.getWorkspaceFolderForUri(uri);
    if (!dir0) {
      vscode.window.showErrorMessage('No workspace folder found for the selected file');
      return;
    }
    LogtalkTerminal.scanForDeadCodeHelper(uri, deadCodeScanner, dir0, "dead_code_recursive")
  }

  public static async scanForDeadCodeHelper(uri: Uri, deadCodeScanner: LogtalkDeadCodeScanner, dir0: string, predicate: string) {
    // Declare Variables
    let textDocument = null;
    let logtalkHome: string = '';
    let logtalkUser: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) { 
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk")); 
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk")); 
    } else { 
      throw new Error("configuration settings error: logtalk"); 
    }
    // Clear all existing diagnostics before starting scanning for dead code
    deadCodeScanner.clearAll();
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    const dir = LogtalkTerminal.normalizePath(dir0);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    let goals = `vscode::${predicate}('${dir}').\r`;
    LogtalkTerminal.sendString(goals);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_dead_code_scanning_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      let lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          deadCodeScanner.clear(line);
        } else {
          message = message + line + '\n';
          if(line == '*     ' || line == '!     ') {
            deadCodeScanner.lint(message);
            message = '';
          }
        }
      }
    }
    window.showInformationMessage("Dead code scanning completed.");
  }

  /**
   * Parse tester output file and create diagnostics
   */
  private static async parseTesterOutput(outputFile: string, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter): Promise<void> {
    try {
      if (!fs.existsSync(outputFile)) {
        return;
      }

      const content = await fsp.readFile(outputFile, 'utf8');
      const lines = content.split(/\r?\n/);
      let message = '';
      let test = false;

      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
          testsReporter.clear(line);
        } else if (test || line.includes('cpu/wall seconds')) {
          test = true;
          message = message + line + '\n';
          if (line == '*     ' || line == '!     ') {
            // This is a test-related message
            testsReporter.lint(null as any, message);
            message = '';
            test = false;
          }
        } else {
          message = message + line + '\n';
          if (line == '*     ' || line == '!     ') {
            // This is a compiler error/warning
            linter.lint(message);
            message = '';
          }
        }
      }

      // Clean up the output file
      await fsp.rm(outputFile, { force: true });
    } catch (err) {
      LogtalkTerminal._outputChannel.appendLine(`Error parsing tester output: ${err}`);
    }
  }

  public static runTesters(uri: Uri, linter?: LogtalkLinter, testsReporter?: LogtalkTestsReporter) {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal._outputChannel.clear();

    const dir = LogtalkTerminal.getWorkspaceFolderForUri(uri);
    if (!dir) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }
    const outputFile = linter && testsReporter ? path.join(dir, '.vscode_tester_output') : undefined;

    LogtalkTerminal.spawnScriptWorkspace(
      dir,
      ["logtalk_tester", "logtalk.run.tester", LogtalkTerminal._testerExec],
      LogtalkTerminal._testerExec,
      LogtalkTerminal._testerArgs,
      "Testers completed.",
      outputFile,
      linter && testsReporter ? async (file) => {
        await LogtalkTerminal.parseTesterOutput(file, linter, testsReporter);
      } : undefined
    );
  }

  /**
   * Parse doclet output file and create diagnostics
   */
  private static async parseDocletOutput(outputFile: string, linter: LogtalkLinter, documentationLinter: LogtalkDocumentationLinter): Promise<void> {
    try {
      if (!fs.existsSync(outputFile)) {
        return;
      }

      const content = await fsp.readFile(outputFile, 'utf8');
      const lines = content.split(/\r?\n/);
      let message = '';

      for (let line of lines) {
        if (line.startsWith('% [ compiling ')) {
          linter.clear(line);
          documentationLinter.clear(line);
        } else {
          message = message + line + '\n';
          if (line == '*     ' || line == '!     ') {
            // Parse both linter and documentation linter messages
            linter.lint(message);
            documentationLinter.lint(message);
            message = '';
          }
        }
      }

      // Clean up the output file
      await fsp.rm(outputFile, { force: true });
    } catch (err) {
      LogtalkTerminal._outputChannel.appendLine(`Error parsing doclet output: ${err}`);
    }
  }

  public static runDoclets(uri: Uri, linter?: LogtalkLinter, documentationLinter?: LogtalkDocumentationLinter) {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal._outputChannel.clear();

    const dir = LogtalkTerminal.getWorkspaceFolderForUri(uri);
    if (!dir) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }
    const outputFile = linter && documentationLinter ? path.join(dir, '.vscode_doclet_output') : undefined;

    LogtalkTerminal.spawnScriptWorkspace(
      dir,
      ["logtalk_doclet", "logtalk.run.doclets", LogtalkTerminal._docletExec],
      LogtalkTerminal._docletExec,
      LogtalkTerminal._docletArgs,
      "Doclets completed.",
      outputFile,
      linter && documentationLinter ? async (file) => {
        await LogtalkTerminal.parseDocletOutput(file, linter, documentationLinter);
      } : undefined
    );
  }

  public static async getEntityDefinition(entity: string) {
    LogtalkTerminal.createLogtalkTerm();
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_entity_definition('${wdir}', ${entity}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_entity_definition_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getPredicateDefinition(entity: string, predicate: string) {
    LogtalkTerminal.createLogtalkTerm();
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_predicate_definition('${wdir}', ${entity}, ${predicate}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_predicate_definition_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getDeclaration(doc: TextDocument, position: Position, call: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = LogtalkTerminal.normalizePath(dir0);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const file = LogtalkTerminal.normalizePath(doc.fileName);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(doc.uri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_declaration('${wdir}', ${call}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_declaration_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getDefinition(doc: TextDocument, position: Position, call: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = LogtalkTerminal.normalizePath(dir0);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const file = LogtalkTerminal.normalizePath(doc.fileName);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(doc.uri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_definition('${wdir}', ${call}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_definition_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getTypeDefinition(doc: TextDocument, position: Position, entity: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = LogtalkTerminal.normalizePath(dir0);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const file = LogtalkTerminal.normalizePath(doc.fileName);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(doc.uri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_type_definition('${wdir}', ${entity}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_type_definition_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getReferences(doc: TextDocument, position: Position, call: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = LogtalkTerminal.normalizePath(dir0);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const file = LogtalkTerminal.normalizePath(doc.fileName);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(doc.uri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_references('${wdir}', ${call}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_references_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getImplementations(doc: TextDocument, position: Position, predicate: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = LogtalkTerminal.normalizePath(dir0);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const file = LogtalkTerminal.normalizePath(doc.fileName);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(doc.uri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_implementations('${wdir}', ${predicate}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_implementations_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getCallers(file: string, position: Position, predicate: string, fileUri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = LogtalkTerminal.normalizePath(path.dirname(file));
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const fileSlash = LogtalkTerminal.normalizePath(file);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(fileUri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_callers('${wdir}', ${predicate}, '${fileSlash}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_callers_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getCallees(file: string, position: Position, predicate: string, fileUri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = LogtalkTerminal.normalizePath(path.dirname(file));
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const fileSlash = LogtalkTerminal.normalizePath(file);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(fileUri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_callees('${wdir}', ${predicate}, '${fileSlash}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_callees_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getAncestors(file: string, entity: string, fileUri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = LogtalkTerminal.normalizePath(path.dirname(file));
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(fileUri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_ancestors('${wdir}', ${entity}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_ancestors_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getDescendants(file: string, entity: string, fileUri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = LogtalkTerminal.normalizePath(path.dirname(file));
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(fileUri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_descendants('${wdir}', ${entity}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_descendants_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getType(file: string, entity: string, fileUri: Uri): Promise<string> {
    LogtalkTerminal.createLogtalkTerm();
    const dir = LogtalkTerminal.normalizePath(path.dirname(file));
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(fileUri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_entity_type('${wdir}', ${entity}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_type_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    const result = path.join(wdir, ".vscode_type");
    let type = fs.readFileSync(result).toString();
    await fsp.rm(result, { force: true });
    return type;
  }

  public static async inferPublicPredicates(entityName: string, fileUri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(fileUri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::infer_public_predicates('${wdir}', ${entityName}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_infer_public_predicates_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async sortFilesByDependencies(workspaceDir: string, loaderDir: string, files: string[]) {
    LogtalkTerminal.createLogtalkTerm();
    const filesListStr = '[' + files.join(', ') + ']';
    let goals = `vscode::files_topological_sort('${workspaceDir}', '${loaderDir}', ${filesListStr}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(workspaceDir, ".vscode_files_topological_sort_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async openParentFile(uri: Uri) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir0);
    const dir = LogtalkTerminal.normalizePath(dir0);
    const file: string = LogtalkTerminal.normalizePath(uri.fsPath);
    const wdir = LogtalkTerminal.getWorkspaceFolderForUri(uri);
    if (!wdir) {
      throw new Error('No workspace folder open');
    }
    let goals = `vscode::find_parent_file('${wdir}', '${file}').\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_find_parent_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    const result = path.join(wdir, ".vscode_find_parent");
    let loader = fs.readFileSync(result).toString();
    await fsp.rm(result, { force: true });
    if (loader.trim() === '') {
      window.showInformationMessage("No parent file found for the current file.");
      return;
    }
    loader = Utils.normalizeDoubleSlashPath(loader);
    workspace.openTextDocument(loader).then(doc => {
      vscode.window.showTextDocument(doc);
    });
  }

  public static async toggleCodeLens(uri: Uri) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    let section = workspace.getConfiguration("logtalk", uri);
    if (section) {
      let enabled: boolean = section.get<boolean>("enableCodeLens");
      let metricsCodeLensOutdated: boolean = LogtalkMetricsCodeLensProvider.outdated;
      let testsCodeLensOutdated: boolean = LogtalkTestsCodeLensProvider.outdated;
      if (enabled) {
        await section.update("enableCodeLens", false, false);
        LogtalkMetricsCodeLensProvider.outdated = metricsCodeLensOutdated;
        LogtalkTestsCodeLensProvider.outdated = testsCodeLensOutdated;
      } else {
        await section.update("enableCodeLens", true, false);
        LogtalkMetricsCodeLensProvider.outdated = metricsCodeLensOutdated;
        LogtalkTestsCodeLensProvider.outdated = testsCodeLensOutdated;
      }
      // Update status bar (will be updated by configuration change listener)
      StatusBarManager.getInstance().updateCodeLensStatus();
    } else {
      throw new Error("configuration settings error: logtalk");
    }
  }

  public static processBreakpoints(session: BreakpointsChangeEvent) {
    LogtalkTerminal.createLogtalkTerm();
    let file: string = '';
    let line: number = 0;
    let message: string = '';
    let condition: string = '';
    let predicate: string = '';
    session.added.forEach(breakpoint => {
      if (breakpoint instanceof SourceBreakpoint) {
        file = path.resolve(breakpoint.location.uri.fsPath).split(path.sep).join("/");
        line = breakpoint.location.range.start.line;
        LogtalkTerminal.checkCodeLoadedFromDirectory(path.dirname(file));
        if (breakpoint.logMessage != undefined) {
          message = breakpoint.logMessage.replace(/['\\]/g, "\\$&");
          LogtalkTerminal.sendString(`vscode::log('${file}', ${line+1}, '${message}').\r`);
        } else if (breakpoint.condition != undefined) {
          condition = breakpoint.condition;
          LogtalkTerminal.sendString(`vscode::spy('${file}', ${line+1}, ${condition}).\r`);
        } else if (breakpoint.hitCondition != undefined) {
          condition = breakpoint.hitCondition;
          LogtalkTerminal.sendString(`vscode::spy('${file}', ${line+1}, ${condition}).\r`);
        } else {
          LogtalkTerminal.sendString(`vscode::spy('${file}', ${line+1}).\r`);
        }
      } else if (breakpoint instanceof FunctionBreakpoint) {
        predicate = breakpoint.functionName;
        if (predicate != '') {
          LogtalkTerminal.sendString(`vscode::spy(${predicate}).\r`);
        }
      }
    });
    session.removed.forEach(breakpoint => {
      if (breakpoint instanceof SourceBreakpoint) {
        file = path.resolve(breakpoint.location.uri.fsPath).split(path.sep).join("/");
        line = breakpoint.location.range.start.line;
        LogtalkTerminal.checkCodeLoadedFromDirectory(path.dirname(file));
        LogtalkTerminal.sendString(`vscode::nolog('${file}', ${line+1}).\r`);
        LogtalkTerminal.sendString(`vscode::nospy('${file}', ${line+1}).\r`);
      } else if (breakpoint instanceof FunctionBreakpoint) {
        predicate = breakpoint.functionName;
        if (predicate != '') {
          LogtalkTerminal.sendString(`vscode::nospy(${predicate}).\r`);
        }
      }
    });  
    session.changed.forEach(breakpoint => {
      if (breakpoint.enabled) {
        if (breakpoint instanceof SourceBreakpoint) {
          file = path.resolve(breakpoint.location.uri.fsPath).split(path.sep).join("/");
          line = breakpoint.location.range.start.line;
          LogtalkTerminal.checkCodeLoadedFromDirectory(path.dirname(file));
          if (breakpoint.logMessage != undefined) {
            message = breakpoint.logMessage.replace(/['\\]/g, "\\$&");
            LogtalkTerminal.sendString(`vscode::log('${file}', ${line+1}, '${message}').\r`);
          } else if (breakpoint.condition != undefined) {
            condition = breakpoint.condition;
            LogtalkTerminal.sendString(`vscode::spy('${file}', ${line+1}, ${condition}).\r`);
          } else if (breakpoint.hitCondition != undefined) {
            condition = breakpoint.hitCondition;
            LogtalkTerminal.sendString(`vscode::spy('${file}', ${line+1}, ${condition}).\r`);
          } else {
            LogtalkTerminal.sendString(`vscode::spy('${file}', ${line+1}).\r`);
          }
        } else if (breakpoint instanceof FunctionBreakpoint) {
          predicate = breakpoint.functionName;
          if (predicate != '') {
            LogtalkTerminal.sendString(`vscode::spy(${predicate}).\r`);
          }
        }
      } else {
        if (breakpoint instanceof SourceBreakpoint) {
          file = path.resolve(breakpoint.location.uri.fsPath).split(path.sep).join("/");
          line = breakpoint.location.range.start.line;
          LogtalkTerminal.checkCodeLoadedFromDirectory(path.dirname(file));
          LogtalkTerminal.sendString(`vscode::nospy('${file}', ${line+1}).\r`);
          LogtalkTerminal.sendString(`vscode::nolog('${file}', ${line+1}).\r`);
        } else if (breakpoint instanceof FunctionBreakpoint) {
          predicate = breakpoint.functionName;
          if (predicate != '') {
            LogtalkTerminal.sendString(`vscode::nospy(${predicate}).\r`);
          }
        }
      }
    });  
  }

  private static spawnScript(
    dir: string,
    type: string[],
    path: string,
    args: string[],
    message: string,
    outputFile?: string,
    onComplete?: (outputFile: string) => Promise<void>
  ) {
    let pp = spawn(path, args, { cwd: dir });
    let outputBuffer = '';

    pp.stdout.on('data', (data) => {
      const dataStr = data.toString();
      LogtalkTerminal._outputChannel.append(dataStr);
      LogtalkTerminal._outputChannel.show(true);

      // Accumulate output if we need to write to file
      if (outputFile) {
        outputBuffer += dataStr;
      }
    });

    pp.stderr.on('data', (data) => {
      const dataStr = data.toString();
      LogtalkTerminal._outputChannel.append(dataStr);
      LogtalkTerminal._outputChannel.show(true);

      // Accumulate stderr output as well
      if (outputFile) {
        outputBuffer += dataStr;
      }
    });

    pp.on('error', (err) => {
      let message: string = null;
      if ((<any>err).code === "ENOENT") {
        message = `Cannot run the ${type[0]} script: ${type[2]}. The script was not found. Use the '${type[1]}' setting to configure.`;
      } else {
        message = err.message
          ? err.message
          : `Failed to run the script ${type[0]} using path: ${type[2]}. Reason is unknown.`;
      }
      this._outputChannel.append(message);
      this._outputChannel.show(true);
    });

    pp.on('close', async (code) => {
      // Write output to file if specified
      if (outputFile && outputBuffer) {
        try {
          await fsp.writeFile(outputFile, outputBuffer, 'utf8');

          // Call the completion callback if provided
          if (onComplete) {
            await onComplete(outputFile);
          }
        } catch (err) {
          this._outputChannel.appendLine(`Error writing output to file ${outputFile}: ${err}`);
        }
      }

      window.showInformationMessage(message);
    })
  }

  private static spawnScriptWorkspace(
    dir: string,
    type: string[],
    path: string,
    args: string[],
    message: string,
    outputFile?: string,
    onComplete?: (outputFile: string) => Promise<void>
  ) {
    LogtalkTerminal.spawnScript(dir, type, path, args, message, outputFile, onComplete);
  }

  private static async ensureFile(uri: Uri): Promise<string> {
    let file: string;
    let doc: TextDocument;

    if (uri && uri.fsPath) {
      doc = workspace.textDocuments.find(txtDoc => {
        return txtDoc.uri.fsPath === uri.fsPath;
      });
      if (!doc) {
        doc = await workspace.openTextDocument(uri);
      }
    } else {
      doc = window.activeTextEditor.document;
    }
    await doc.save();
    return await doc.fileName;
  }

  private static ensureDir(uri: Uri): string {
    let dir: string;
    if (uri && uri.fsPath) {
      dir = path.dirname(uri.fsPath);
    } else {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
      }
      dir = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    return dir;
  }

  private static waitForFile = async (
    filePath,
    {timeout = LogtalkTerminal._timeout, delay = 200} = {}
  ) => {
    const tid = setTimeout(() => {
      const msg = `Timeout of ${timeout} ms exceeded waiting for ${filePath}`;
      throw Error(msg);
    }, timeout);

    for (;;) {
      try {
        await fsp.stat(filePath);
        clearTimeout(tid);
        return;
      }
      catch (err) {}

      await timers.setTimeout(delay);
    }
  };

  public static getFirstWorkspaceFolder(): string | undefined {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return undefined;
    }
    return LogtalkTerminal.normalizePath(vscode.workspace.workspaceFolders[0].uri.fsPath);
  }

  /**
   * Gets the workspace folder path for a given URI.
   * This is the primary method for multi-root workspace support.
   * @param uri The URI to find the workspace folder for
   * @returns The normalized workspace folder path, or undefined if not found
   */
  public static getWorkspaceFolderForUri(uri: Uri): string | undefined {
    if (!uri) {
      return LogtalkTerminal.getFirstWorkspaceFolder();
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      return LogtalkTerminal.normalizePath(workspaceFolder.uri.fsPath);
    }
    // Fallback: try to find workspace folder by path prefix matching
    const folder = LogtalkTerminal.findWorkspaceFolderByPathPrefix(uri);
    if (folder) {
      return LogtalkTerminal.normalizePath(folder);
    }
    // Last resort: return first workspace folder
    return LogtalkTerminal.getFirstWorkspaceFolder();
  }

  private static findWorkspaceFolderByPathPrefix(uri: Uri): string | undefined {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return undefined;
    }
    return vscode.workspace.workspaceFolders
      ?.map((folder) => folder.uri.fsPath)
      .filter((fsPath) => uri.fsPath?.startsWith(fsPath))[0];
  }

  public static recordCodeLoadedFromDirectory(
    dir: string
  ): void {
    const normalizedDir = fs.realpathSync(dir).split(path.sep).join("/").toLowerCase();
    getLogger().debug("recordedDir: " + normalizedDir);
    LogtalkTerminal._loadedDirectories.add(normalizedDir);
  }

  public static checkCodeLoadedFromDirectory(
    dir: string
  ): void {
    const normalizedDir = fs.realpathSync(dir).split(path.sep).join("/").toLowerCase();
    getLogger().debug("checkLoadedDir: " + normalizedDir);

    if (!LogtalkTerminal._loadedDirectories.has(normalizedDir)) {
      let found: boolean = false;
      for (const loadedDir of LogtalkTerminal._loadedDirectories) {
        if (normalizedDir.startsWith(loadedDir)) {
          found = true;
          break;
        }
      }
      if (!found) {
        vscode.window.showWarningMessage("No code loaded from selected directory as required by command.");
      }
    }
  }

  /**
   * Check if there's user code loaded (more than just the core directory)
   * @returns true if there are loaded directories beyond the core directory
   */
  public static hasUserCodeLoaded(): boolean {
    // More than one entry means there's user code loaded (core directory is always loaded)
    return LogtalkTerminal._loadedDirectories.size > 1;
  }

  public static clearLoadedDirectories(): void {
    LogtalkTerminal._loadedDirectories.clear();
  }

  /**
   * ViaProfile methods - These create TestRunRequest and call the provider's runTests() method
   * Used by CodeLens and editor context menu commands
   */

  public static async runAllTestsViaProfile(uri: Uri, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter, testsExplorerProvider?: LogtalkTestsExplorerProvider) {
    if (!testsExplorerProvider) {
      // Fallback to direct execution if no provider
      await LogtalkTerminal.runAllTests(uri, linter, testsReporter);
      return;
    }

    // Import TestRunRequest
    const vscode = require('vscode');
    const request = new vscode.TestRunRequest(undefined, undefined, testsExplorerProvider.runProfile, true); // Run all tests
    await testsExplorerProvider.runTests(request, undefined, false, uri); // Pass withCoverage=false, URI as fourth parameter
  }

  public static async runAllTestsWithCoverageViaProfile(uri: Uri, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter, testsExplorerProvider?: LogtalkTestsExplorerProvider) {
    if (!testsExplorerProvider) {
      // Fallback to direct execution if no provider
      await LogtalkTerminal.runAllTests(uri, linter, testsReporter);
      return;
    }

    // Import TestRunRequest
    const vscode = require('vscode');
    const request = new vscode.TestRunRequest(undefined, undefined, testsExplorerProvider.coverageProfile, true); // Run all tests with coverage
    await testsExplorerProvider.runTests(request, undefined, true, uri); // Pass withCoverage=true, URI as fourth parameter
  }

  public static async runFileTestsViaProfile(uri: Uri, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter, testsExplorerProvider?: LogtalkTestsExplorerProvider) {
    if (!testsExplorerProvider) {
      // Fallback to direct execution if no provider
      await LogtalkTerminal.runFileTests(uri, linter, testsReporter);
      return;
    }

    // Get the file test item
    const fileTestItem = testsExplorerProvider.getTestItemForFile(uri);

    // Import TestRunRequest
    const vscode = require('vscode');
    const request = new vscode.TestRunRequest(fileTestItem ? [fileTestItem] : undefined, undefined, testsExplorerProvider.runProfile, true);
    await testsExplorerProvider.runTests(request);
  }

  public static async runObjectTestsViaProfile(uri: Uri, object: string, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter, testsExplorerProvider?: LogtalkTestsExplorerProvider) {
    if (!testsExplorerProvider) {
      // Fallback to direct execution if no provider
      await LogtalkTerminal.runObjectTests(uri, object, linter, testsReporter);
      return;
    }

    // Get the object test item
    const objectTestItem = testsExplorerProvider.getTestItemForObject(uri, object);

    // Import TestRunRequest
    const vscode = require('vscode');
    const request = new vscode.TestRunRequest(objectTestItem ? [objectTestItem] : undefined, undefined, testsExplorerProvider.runProfile, true);
    await testsExplorerProvider.runTests(request);
  }

  public static async runTestViaProfile(uri: Uri, object: string, test: string, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter, testsExplorerProvider?: LogtalkTestsExplorerProvider) {
    if (!testsExplorerProvider) {
      // Fallback to direct execution if no provider
      await LogtalkTerminal.runTest(uri, object, test, linter, testsReporter);
      return;
    }

    // Get the test item
    const testItem = testsExplorerProvider.getTestItemForTest(uri, object, test);

    // Import TestRunRequest
    const vscode = require('vscode');
    const request = new vscode.TestRunRequest(testItem ? [testItem] : undefined, undefined, testsExplorerProvider.runProfile, true);
    await testsExplorerProvider.runTests(request);
  }

}
