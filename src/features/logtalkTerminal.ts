"use strict";

import { Terminal, window, workspace, TextDocument, Disposable, OutputChannel, Uri, ExtensionContext, TerminalLink, Position } from "vscode";
import * as vscode from "vscode";
import * as path from "path";
import * as jsesc from "jsesc";
import * as fs from "fs";
import { spawn } from "process-promises";
import LogtalkLinter from "./logtalkLinter";
import { isFunction } from "util";
import * as fsp from "fs/promises";
import * as timers from "timers/promises";

export default class LogtalkTerminal {
  private static _context:        ExtensionContext;
  private static _terminal:       Terminal;
  private static _execArgs:       string[];
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

  constructor() {

  }

  public static init(context: ExtensionContext): Disposable {

    LogtalkTerminal._context = context;

    let section = workspace.getConfiguration("logtalk");

    LogtalkTerminal._execArgs      =   section.get<string[]>("executable.arguments");
    LogtalkTerminal._testerExec    =   section.get<string>("tester.script", "logtalk_tester");
    LogtalkTerminal._outputChannel =   window.createOutputChannel("Logtalk Testers & Doclets");
    LogtalkTerminal._testerArgs    =   section.get<string[]>("tester.arguments");
    LogtalkTerminal._docletExec    =   section.get<string>("doclet.script", "logtalk_doclet" );
    LogtalkTerminal._docletArgs    =   section.get<string[]>("doclet.arguments");

    LogtalkTerminal._docExec       =   section.get<string>("documentation.script", "lgt2html");
    LogtalkTerminal._docArgs       =   section.get<string[]>("documentation.arguments");
    LogtalkTerminal._diaExec       =   section.get<string>("diagrams.script", "lgt2svg");
    LogtalkTerminal._diaArgs       =   section.get<string[]>("diagrams.arguments");
    LogtalkTerminal._timeout       =   section.get<number>("scripts.timeout", 480000);

    return (<any>window).onDidCloseTerminal(terminal => {
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
      let executable = jsesc(section.get<string>("executable.path", "logtalk"));
      let args = section.get<string[]>("executable.arguments");
      LogtalkTerminal._terminal = (<any>window).createTerminal(
        "Logtalk",
        executable,
        args
      );

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
//      console.log(goals);
      LogtalkTerminal.sendString(goals, false);

    } else {
      throw new Error("configuration settings error: logtalk");
    }
  }

  public static sendString(text: string, addNewLine = false) {
    // LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal._terminal.sendText(text, addNewLine);
    LogtalkTerminal._terminal.show(false);
  }

  public static openLogtalk() {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal._terminal.show(true);
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
    let compilerMessagesFile  = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`vscode::load('${dir}','${loader}').\r`, false);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_loading_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      const lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      for (const line of lines) {
        message = message + line + '\n';
        if(line == '*     ' || line == '!     ') {
          linter.lint(textDocument, message);
          message = '';
        } 
      }
    }
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
    let compilerMessagesFile  = `${logtalkUser}/scratch/.messages`;
    await fsp.rm(`${compilerMessagesFile}`, { force: true });
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`vscode::load('${dir}','${file}').\r`, false);
    // Parse any compiler errors or warnings
    const marker = path.join(dir0, ".vscode_loading_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    if(fs.existsSync(`${compilerMessagesFile}`)) {
      const lines = fs.readFileSync(`${compilerMessagesFile}`).toString().split(/\r?\n/);
      let message = '';
      for (const line of lines) {
        message = message + line + '\n';
        if(line == '*     ' || line == '!     ') {
          linter.lint(textDocument, message);
          message = '';
        } 
      }
    }
  }

  public static async makeReload(uri: Uri) {
    const file: string = await LogtalkTerminal.ensureFile(uri);
    LogtalkTerminal.createLogtalkTerm();
    let goals = `logtalk_make(all).\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static async makeCheck(uri: Uri) {
    const file: string = await LogtalkTerminal.ensureFile(uri);
    LogtalkTerminal.createLogtalkTerm();
    let goals = `logtalk_make(check).\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static runTests(uri: Uri) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    LogtalkTerminal.createLogtalkTerm();
    let dir: string;
    dir = path.dirname(uri.fsPath);
    const testfile0 = path.join(dir, "tester");
    const testfile = path.resolve(testfile0).split(path.sep).join("/");
    let goals = `logtalk_load('${testfile}').\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static runDoclet(uri: Uri) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    LogtalkTerminal.createLogtalkTerm();
    let dir: string;
    dir = path.dirname(uri.fsPath);
    const docfile0 = path.join(dir, "doclet");
    const docfile = path.resolve(docfile0).split(path.sep).join("/");
    let goals = `logtalk_load(doclet(loader)),logtalk_load('${docfile}').\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static async genDocumentation(uri: Uri) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    const loader0 = path.join(dir0, "loader");
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const loader = path.resolve(loader0).split(path.sep).join("/");
    const xmlDir0 = path.join(dir, "xml_docs");
    const xmlDir = path.resolve(xmlDir0).split(path.sep).join("/");
    LogtalkTerminal.sendString(`vscode::documentation('${dir}','${loader}').\r`, false);
    const marker = path.join(dir0, ".vscode_xml_files_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    LogtalkTerminal.spawnScript4(
      xmlDir0,
      ["documentation", "logtalk.documentation.script", LogtalkTerminal._docExec],
      LogtalkTerminal._docExec,
      LogtalkTerminal._docArgs
    );
  }

  public static async genDiagrams(uri: Uri) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    const loader0 = path.join(dir0, "loader");
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const loader = path.resolve(loader0).split(path.sep).join("/");
    const project = path.basename(dir);
    LogtalkTerminal.sendString(`vscode::diagrams('${project}','${dir}','${loader}').\r`, false);
    const marker = path.join(dir0, ".vscode_dot_files_done");
    await LogtalkTerminal.waitForFile(marker);
    await fsp.rm(marker, { force: true });
    LogtalkTerminal.spawnScript4(
      path.join(dir0, "dot_dias"),
      ["diagrams", "logtalk.diagrams.script", LogtalkTerminal._diaExec],
      LogtalkTerminal._diaExec,
      LogtalkTerminal._diaArgs
    );
  }

  public static async scanForDeadCode(uri: Uri) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    const loader0 = path.join(dir0, "loader");
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const loader = path.resolve(loader0).split(path.sep).join("/");
    let goals = `logtalk_load(dead_code_scanner(loader)),logtalk_load('${loader}'),dead_code_scanner::directory('${dir}').\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static runTesters(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.spawnScript(
      uri,
      ["logtalk_tester", "logtalk.run.tester", LogtalkTerminal._testerExec],
      LogtalkTerminal._testerExec,
      LogtalkTerminal._testerArgs
    );
  }

  public static runDoclets(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.spawnScript(
      uri,
      ["logtalk_doclet", "logtalk.run.doclets", LogtalkTerminal._docletExec],
      LogtalkTerminal._docletExec,
      LogtalkTerminal._docletArgs
    );
  }

  public static async getDeclaration(doc: TextDocument, position: Position, call: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const file = path.resolve(doc.fileName).split(path.sep).join("/");
    let goals = `vscode::find_declaration('${dir}', ${call}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(dir0, ".vscode_declaration_done");
    await LogtalkTerminal.waitForFile(marker);
    fsp.rm(marker, { force: true });
  }

  public static async getDefinition(doc: TextDocument, position: Position, call: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const file = path.resolve(doc.fileName).split(path.sep).join("/");
    let goals = `vscode::find_definition('${dir}', ${call}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(dir0, ".vscode_definition_done");
    await LogtalkTerminal.waitForFile(marker);
    fsp.rm(marker, { force: true });
  }

  public static async getTypeDefinition(doc: TextDocument, position: Position, entity: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const file = path.resolve(doc.fileName).split(path.sep).join("/");
    let goals = `vscode::find_type_definition('${dir}', ${entity}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(dir0, ".vscode_type_definition_done");
    await LogtalkTerminal.waitForFile(marker);
    fsp.rm(marker, { force: true });
  }

  public static async getReferences(doc: TextDocument, position: Position, call: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const file = path.resolve(doc.fileName).split(path.sep).join("/");
    let goals = `vscode::find_references('${dir}', ${call}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(dir0, ".vscode_references_done");
    await LogtalkTerminal.waitForFile(marker);
    fsp.rm(marker, { force: true });
  }

  public static async getImplementations(doc: TextDocument, position: Position, predicate: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(doc.uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const file = path.resolve(doc.fileName).split(path.sep).join("/");
    let goals = `vscode::find_implementations('${dir}', ${predicate}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(dir0, ".vscode_implementations_done");
    await LogtalkTerminal.waitForFile(marker);
    fsp.rm(marker, { force: true });
  }

  public static async getCallers(file: string, position: Position, predicate: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = path.resolve(path.dirname(file)).split(path.sep).join("/");
    let goals = `vscode::find_callers('${dir}', ${predicate}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(dir, ".vscode_callers_done");
    await LogtalkTerminal.waitForFile(marker);
    fsp.rm(marker, { force: true });
  }

  public static async getCallees(file: string, position: Position, predicate: string) {
    LogtalkTerminal.createLogtalkTerm();
    const dir = path.resolve(path.dirname(file)).split(path.sep).join("/");
    let goals = `vscode::find_callees('${dir}', ${predicate}, '${file}', ${position.line+1}).\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(dir, ".vscode_callees_done");
    await LogtalkTerminal.waitForFile(marker);
    fsp.rm(marker, { force: true });
  }

  public static async gotoLoaderFile(uri: Uri) {
    if (typeof uri === 'undefined') {
      uri = window.activeTextEditor.document.uri;
    }
    LogtalkTerminal.createLogtalkTerm();
    const dir0: string = LogtalkTerminal.ensureDir(uri);
    const dir = path.resolve(dir0).split(path.sep).join("/");
    const file: string = path.resolve(uri.fsPath).split(path.sep).join("/");
    let goals = `vscode::find_loader_file('${dir}', '${file}').\r`;
    LogtalkTerminal.sendString(goals);
    const marker = path.join(dir, ".vscode_find_loader_done");
    await LogtalkTerminal.waitForFile(marker);
    fsp.rm(marker, { force: true });
    const result = path.join(dir, ".vscode_find_loader");
    let loader = await fs.readFileSync(result).toString();
    fsp.rm(result, { force: true });
    workspace.openTextDocument(loader).then(doc => {
      vscode.window.showTextDocument(doc);
    });
  }

  private static spawnScript4(dir: string, type: string[], path: string, args: string[]) {
    let pp = spawn(path, args, { cwd: dir })
      .on("stdout", out => {
        LogtalkTerminal._outputChannel.append(out + "\n");
        LogtalkTerminal._outputChannel.show(true);
      })
      .on("stderr", err => {
        LogtalkTerminal._outputChannel.append(err + "\n");
        LogtalkTerminal._outputChannel.show(true);
      })
      .catch(error => {
        let message: string = null;
        if ((<any>error).code === "ENOENT") {
          message = `Cannot run the ${type[0]} script. The script was not found. Use the '${type[1]}' setting to configure`;
        } else {
          message = error.message
            ? error.message
            : `Failed to run the script ${type[0]} using path: ${type[2]}. Reason is unknown.`;
        }
        this._outputChannel.append(message);
        this._outputChannel.show(true);
      });
  }

  private static spawnScript(uri: Uri, type: string[], path: string, args: string[]) {
    let dir: string;
    dir = LogtalkTerminal.getWorkspaceFolder(uri);
    LogtalkTerminal.spawnScript4(dir, type, path, args);
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

  private static getWorkspaceFolder(uri: Uri): string {
    return vscode.workspace.workspaceFolders
      ?.map((folder) => folder.uri.fsPath)
      .filter((fsPath) => uri.path?.startsWith(fsPath))[0];
  }

}
