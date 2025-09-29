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
import LogtalkLinter from "./logtalkLinter";
import LogtalkTestsReporter from "./logtalkTestsReporter";
import LogtalkDeadCodeScanner from "./logtalkDeadCodeScanner";
import LogtalkDocumentationLinter from "./logtalkDocumentationLinter";
import { LogtalkMetricsCodeLensProvider } from "./metricsCodeLensProvider";
import { LogtalkTestsCodeLensProvider } from "./testsCodeLensProvider"
import * as fsp from "fs/promises";
import * as timers from "timers/promises";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";

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

  constructor() {

  }

  public static init(context: ExtensionContext): Disposable {

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

    LogtalkTerminal._testerExec    =   section.get<string>("tester.script");
    LogtalkTerminal._outputChannel =   window.createOutputChannel("Logtalk Testers & Doclets");
    LogtalkTerminal._testerArgs    =   section.get<string[]>("tester.arguments");
    LogtalkTerminal._docletExec    =   section.get<string>("doclet.script");
    LogtalkTerminal._docletArgs    =   section.get<string[]>("doclet.arguments");

    LogtalkTerminal._docExec       =   section.get<string>("documentation.script");
    LogtalkTerminal._docArgs       =   section.get<string[]>("documentation.arguments");
    LogtalkTerminal._diaExec       =   section.get<string>("diagrams.script");
    LogtalkTerminal._diaArgs       =   section.get<string[]>("diagrams.arguments");
    LogtalkTerminal._timeout       =   section.get<number>("scripts.timeout", 480000);

    if (LogtalkTerminal._testerExec == "") {
      if (process.platform === 'win32') {
        LogtalkTerminal._testerExec = "${env:ProgramFiles}/PowerShell/7/pwsh.exe";
        LogtalkTerminal._testerArgs = ["-file", "${env:SystemRoot}/logtalk_tester.ps1", "-p", logtalkBackend, "-f", "xunit"];
      } else {
        LogtalkTerminal._testerExec = path.join(path.join(logtalkHome, "scripts"), "logtalk_tester.sh");
        LogtalkTerminal._testerExec = path.resolve(LogtalkTerminal._testerExec).split(path.sep).join("/");
        LogtalkTerminal._testerArgs = ["-p", logtalkBackend, "-f", "xunit"];
      }
    }

    if (LogtalkTerminal._docletExec == "") {
      if (process.platform === 'win32') {
        LogtalkTerminal._docletExec = "${env:ProgramFiles}/PowerShell/7/pwsh.exe";
        LogtalkTerminal._docletArgs = ["-file", "${env:SystemRoot}/logtalk_doclet.ps1", "-p", logtalkBackend];
      } else {
        LogtalkTerminal._docletExec = path.join(path.join(logtalkHome, "scripts"), "logtalk_doclet.sh");
        LogtalkTerminal._docletExec = path.resolve(LogtalkTerminal._docletExec).split(path.sep).join("/");
        LogtalkTerminal._docletArgs = ["-p", logtalkBackend];
      }
    }

    if (LogtalkTerminal._docExec == "") {
      if (process.platform === 'win32') {
        LogtalkTerminal._docExec = "${env:ProgramFiles}/PowerShell/7/pwsh.exe";
        LogtalkTerminal._docArgs = ["-file", "${env:SystemRoot}/lgt2html.ps1", "-t", "APIs documentation"];
      } else {
        LogtalkTerminal._docExec = path.join(logtalkHome, "tools/lgtdoc/xml/lgt2html.sh");
        LogtalkTerminal._docExec = path.resolve(LogtalkTerminal._docExec).split(path.sep).join("/");
        LogtalkTerminal._docArgs = ["-t", "APIs documentation"];
      }
    }

    if (LogtalkTerminal._diaExec == "") {
      if (process.platform === 'win32') {
        LogtalkTerminal._diaExec = "${env:ProgramFiles}/PowerShell/7/pwsh.exe";
        LogtalkTerminal._diaArgs = ["-file", "${env:SystemRoot}/lgt2svg.ps1"];
      } else {
        LogtalkTerminal._diaExec = path.join(logtalkHome, "tools/diagrams/lgt2svg.sh");
        LogtalkTerminal._diaExec = path.resolve(LogtalkTerminal._diaExec).split(path.sep).join("/");
        LogtalkTerminal._diaArgs = [];
      }
    }

    // Create initial Logtalk terminal without showing it
    LogtalkTerminal.createLogtalkTerm();

    return (<any>window).onDidCloseTerminal(terminal => {
      // Clear the in-memory loaded directories set when terminal closes
      LogtalkTerminal._loadedDirectories.clear();
      LogtalkTerminal._terminal = null;
      terminal.dispose();
    });
  }

  private static createLogtalkTerm() {
    if (LogtalkTerminal._terminal) {
      return;
    }

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
            script = "jilgt"
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
          executable = "${env:ProgramFiles}/PowerShell/7/pwsh.exe";
          args = ["-file", "${env:SystemRoot}/" + script + ".ps1"]
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

      let UrlRegex = new RegExp(/(in file)\s(.+)\s((at or above line\s(\d+))|(between lines\s(\d+)[-](\d+))|(at line\s(\d+)))/);

      vscode.window.registerTerminalLinkProvider({
        provideTerminalLinks: (context: vscode.TerminalLinkContext, token: vscode.CancellationToken) => {

          let match = UrlRegex.exec(context.line);
    
          if (match == null) {
            return [];
          } else if (match.length === 0) {
            return [];
          }

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
        },
        handleTerminalLink: async (tooltipText) => {

          let text =  tooltipText.tooltip.split(":");
          let range = text[1].split("-");
          var pos1 = new vscode.Position(parseInt(range[0]) - 1,0);
          var pos2;
          if(range[1]) {
            pos2 = new vscode.Position(parseInt(range[1]),0);
          } else {
            pos2 = pos1;
          }

          vscode.workspace.openTextDocument(text[0]).then(
            document => vscode.window.showTextDocument(document).then((editor) =>
              {
                editor.selections = [new vscode.Selection(pos1,pos2)]; 
                var range = new vscode.Range(pos1, pos2);
                editor.revealRange(range);
              }
            )
          )
        }
      });

      let goals = `logtalk_load('${logtalkHome}/coding/vscode/vscode.lgt', [scratch_directory('${logtalkUser}/scratch/')]).\r`;
      LogtalkTerminal.sendString(goals, false);

      // Add the Logtalk core directory to loaded directories to avoid warnings
      const normalizedCore = fs.realpathSync(path.join(logtalkHome, "core")).split(path.sep).join("/").toLowerCase();
      LogtalkTerminal._loadedDirectories.add(normalizedCore);

    } else {
      throw new Error("configuration settings error: logtalk");
    }
  }

  public static sendString(text: string, show = false) {
    // LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal._terminal.sendText(text, false);
    if (show) {
      LogtalkTerminal._terminal.show(false);
    }
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
    // Create project
    vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false
    }).then(folders => {
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
    });
  }

  public static async loadProject(uri: Uri, linter: LogtalkLinter) {
    if (typeof uri === 'undefined') {
      uri = workspace.workspaceFolders[0].uri;
    }
    // Declare Variables
    const dir0 = LogtalkTerminal.getWorkspaceFolder(uri);
    const loader0 = path.join(dir0, "loader");
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const loader = path.resolve(loader0).split(path.sep).join("/");
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
            const filePath = match[1];
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
      uri = window.activeTextEditor.document.uri;
    }
    // Declare Variables
    const dir0 = path.dirname(uri.fsPath);
    const loader0 = path.join(dir0, "loader");
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const loader = path.resolve(loader0).split(path.sep).join("/");
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
            const filePath = match[1];
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
      uri = window.activeTextEditor.document.uri;
    }
    // Declare Variables
    let dir0: string;
    dir0 = path.dirname(uri.fsPath);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const file0: string = await LogtalkTerminal.ensureFile(uri);
    const file = path.resolve(file0).split(path.sep).join("/");
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
            const filePath = match[1];
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
    const dir = path.resolve(dir0).split(path.sep).join("/");
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

  public static async runTests(uri: Uri, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    // Declare Variables
    const dir0 = path.dirname(uri.fsPath);
    const tester0 = path.join(dir0, "tester");
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const tester = path.resolve(tester0).split(path.sep).join("/");
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

  public static async runTest(uri: Uri, object: string, test: string, linter: LogtalkLinter, testsReporter: LogtalkTestsReporter) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    // Declare Variables
    const dir0 = path.dirname(uri.fsPath);
    const tester0 = path.join(dir0, "tester");
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const tester = path.resolve(tester0).split(path.sep).join("/");
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
    LogtalkTerminal.recordCodeLoadedFromDirectory(dir);
    window.showInformationMessage("Test completed.");
    LogtalkTestsCodeLensProvider.outdated = false;
  }

  public static async computeMetrics(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
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
    const dir = path.resolve(dir0).split(path.sep).join("/");
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
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const doclet = path.resolve(doclet0).split(path.sep).join("/");
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
      uri = workspace.workspaceFolders[0].uri;
    }
    const dir0: string = LogtalkTerminal.getWorkspaceFolder(uri);
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
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    const dir = path.resolve(dir0).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const xmlDir0 = path.join(dir, "xml_docs");
    const xmlDir = path.resolve(xmlDir0).split(path.sep).join("/");
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
      uri = workspace.workspaceFolders[0].uri;
    }
    const dir0: string = LogtalkTerminal.getWorkspaceFolder(uri);
    LogtalkTerminal.rgenDiagramsHelper(dir0, "diagrams_recursive");
  }

  public static async rgenDiagramsHelper(dir0: string, predicate: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = path.resolve(dir0).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const project = path.basename(dir);
    LogtalkTerminal.sendString(`vscode::${predicate}('${project}','${dir}').\r`, true);
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
      uri = workspace.workspaceFolders[0].uri;
    }
    const dir0: string = LogtalkTerminal.getWorkspaceFolder(uri);
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
    // Clear the Scratch Message File
    let compilerMessagesFile = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    const dir = path.resolve(dir0).split(path.sep).join("/");
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

  public static runTesters(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.spawnScriptWorkspace(
      uri,
      ["logtalk_tester", "logtalk.run.tester", LogtalkTerminal._testerExec],
      LogtalkTerminal._testerExec,
      LogtalkTerminal._testerArgs,
      "Testers completed."
    );
  }

  public static runDoclets(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.spawnScriptWorkspace(
      uri,
      ["logtalk_doclet", "logtalk.run.doclets", LogtalkTerminal._docletExec],
      LogtalkTerminal._docletExec,
      LogtalkTerminal._docletArgs,
      "Doclets completed."
    );
  }

  public static async getDeclaration(doc: TextDocument, position: Position, call: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const file = path.resolve(doc.fileName).split(path.sep).join("/");
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    let goals = `vscode::find_declaration('${wdir}', ${call}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_declaration_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getDefinition(doc: TextDocument, position: Position, call: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const file = path.resolve(doc.fileName).split(path.sep).join("/");
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    let goals = `vscode::find_definition('${wdir}', ${call}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_definition_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getTypeDefinition(doc: TextDocument, position: Position, entity: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const file = path.resolve(doc.fileName).split(path.sep).join("/");
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    let goals = `vscode::find_type_definition('${wdir}', ${entity}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_type_definition_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getReferences(doc: TextDocument, position: Position, call: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const file = path.resolve(doc.fileName).split(path.sep).join("/");
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    let goals = `vscode::find_references('${wdir}', ${call}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_references_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getImplementations(doc: TextDocument, position: Position, predicate: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const file = path.resolve(doc.fileName).split(path.sep).join("/");
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    let goals = `vscode::find_implementations('${wdir}', ${predicate}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_implementations_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getCallers(file: string, position: Position, predicate: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = path.resolve(path.dirname(file)).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const fileSlash = path.resolve(file).split(path.sep).join("/");
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    let goals = `vscode::find_callers('${wdir}', ${predicate}, '${fileSlash}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_callers_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getCallees(file: string, position: Position, predicate: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = path.resolve(path.dirname(file)).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const fileSlash = path.resolve(file).split(path.sep).join("/");
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    let goals = `vscode::find_callees('${wdir}', ${predicate}, '${fileSlash}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_callees_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getAncestors(file: string, entity: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = path.resolve(path.dirname(file)).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    let goals = `vscode::find_ancestors('${wdir}', ${entity}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_ancestors_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getDescendants(file: string, entity: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = path.resolve(path.dirname(file)).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    let goals = `vscode::find_descendants('${wdir}', ${entity}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_descendants_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
  }

  public static async getType(file: string, entity: string): Promise<string> {
    LogtalkTerminal.createLogtalkTerm();
    const dir = path.resolve(path.dirname(file)).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir);
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
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

  public static async openParentFile(uri: Uri) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    LogtalkTerminal.checkCodeLoadedFromDirectory(dir0);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const file: string = path.resolve(uri.fsPath).split(path.sep).join("/");
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    let goals = `vscode::find_parent_file('${wdir}', '${file}').\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(wdir, ".vscode_find_parent_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    const result = path.join(wdir, ".vscode_find_parent");
    let loader = fs.readFileSync(result).toString();
    await fsp.rm(result, { force: true });
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

  private static spawnScript(dir: string, type: string[], path: string, args: string[], message: string) {
    let pp = spawn(path, args, { cwd: dir });
    pp.stdout.on('data', (data) => {
      LogtalkTerminal._outputChannel.append(data.toString());
      LogtalkTerminal._outputChannel.show(true);
    });
    pp.stderr.on('data', (data) => {
      LogtalkTerminal._outputChannel.append(data.toString());
      LogtalkTerminal._outputChannel.show(true);
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
    pp.on('close', (code) => {
      window.showInformationMessage(message);
    })
  }

  private static spawnScriptWorkspace(uri: Uri, type: string[], path: string, args: string[], message: string) {
    let dir: string;
    dir = LogtalkTerminal.getWorkspaceFolder(uri);
    LogtalkTerminal.spawnScript(dir, type, path, args, message);
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

  public static getFirstWorkspaceFolder(): string {
    return path.resolve(vscode.workspace.workspaceFolders?.[0].uri.fsPath).split(path.sep).join("/");
  }

  private static getWorkspaceFolder(uri: Uri): string {
    return workspace.workspaceFolders
      ?.map((folder) => folder.uri.fsPath)
      .filter((fsPath) => uri.fsPath?.startsWith(fsPath))[0];
  }

  public static recordCodeLoadedFromDirectory(
    dir: string
  ): void {
    const normalizedDir = fs.realpathSync(dir).split(path.sep).join("/").toLowerCase();
    LogtalkTerminal._loadedDirectories.add(normalizedDir);
  }

  public static checkCodeLoadedFromDirectory(
    dir: string
  ): void {
    const normalizedDir = fs.realpathSync(dir).split(path.sep).join("/").toLowerCase();
    getLogger().debug("normalizedDir: " + normalizedDir);

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

}
