"use strict";

import { Terminal, window, workspace, TextDocument, Disposable, OutputChannel, Uri, ExtensionContext } from "vscode";
import * as path from "path";
import * as jsesc from "jsesc";
import * as fs from "fs";
import * as cp from 'child_process';
import { spawn } from "process-promises";
import LogtalkLinter from "./logtalkLinter";
import { isFunction } from "util";

export default class LogtalkTerminal {
  private static _context:        ExtensionContext;
  private static _messages :      any;
  private static _terminal:       Terminal;
  private static _execArgs:       string[];
  private static _testerExec:     string;
  private static _testerArgs:     string[];
  private static _docletExec:     string;
  private static _docletArgs:     string[];
  private static _docExec:        string;
  private static _docArgs:        string[];
  private static _graphvizExec:   string;
  private static _graphvizArgs:   string[];
  private static _graphvizExt:    string[];
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
    LogtalkTerminal._graphvizExec  =   section.get<string>("graphviz.executable", "dot");
    LogtalkTerminal._graphvizArgs  =   section.get<string[]>("graphviz.arguments");
    LogtalkTerminal._graphvizExt   =   section.get<string[]>("graphviz.extension");

    return (<any>window).onDidCloseTerminal(terminal => {
        LogtalkTerminal._terminal = null;
        terminal.dispose();
        // if ('kill' in LogtalkTerminal._messages) {
        //   LogtalkTerminal._messages.kill('SIGHUP');
        // }
        
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

      let logtalkMessageFile = jsesc(section.get<string>("vscode.messagefile", "logtalk"));
      let logtalkScratch = jsesc(section.get<string>("scratch.path", "logtalk"));

      let executable = jsesc(section.get<string>("executable.path", "logtalk"));
      let args = section.get<string[]>("executable.arguments");
      LogtalkTerminal._terminal = (<any>window).createTerminal(
        "Logtalk",
        executable,
        args
      );
      let goals = `logtalk_load('${logtalkHome}${logtalkMessageFile}', [scratch_directory('${logtalkUser}${logtalkScratch}')]).\r`;
      console.log(goals);
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
  

  public static async loadDocument(uri: Uri, linter: LogtalkLinter) {

    // Declare Variables
    const file: string = await LogtalkTerminal.ensureFile(uri);
    let textDocument = null;
    let working_directory: string = path.dirname(uri.fsPath);
    let logtalkHome: string = '',
        logtalkUser: string = '',
        tailCommand: string = '';
    // Check for Configurations
    let section = workspace.getConfiguration("logtalk");
    if (section) { 
      logtalkHome = jsesc(section.get<string>("home.path", "logtalk")); 
      logtalkUser = jsesc(section.get<string>("user.path", "logtalk")); 
      tailCommand = jsesc(section.get<string>("tail.command", "logtalk")); 
    } else { 
      throw new Error("configuration settings error: logtalk"); 
    }
    // Get the Scratch Directory
    let pathLogtalkMessageFile  = `${logtalkUser}/scratch/.messages`;

    // Open the Text Document
    await workspace.openTextDocument(uri).then((document: TextDocument) => { textDocument = document });

    // Clear the Scratch Message File & Tail it
    cp.spawn('rm', [`${pathLogtalkMessageFile}`]);
    cp.spawn('touch', [`${pathLogtalkMessageFile}`]);
    
    const sleep = (waitTimeInMs) => new Promise (resolve => setTimeout (resolve, waitTimeInMs));
    await sleep (500);

    var messages = cp.spawn(tailCommand, ['-f',`${pathLogtalkMessageFile}`, '-n','0']);

    console.log({cp: messages});

    // Clear the Diagnostics & Output Channel
    // Create the Terminal
    LogtalkTerminal.createLogtalkTerm();

    // Lint the incoming messages
    let message = '';
    let count = 0;
    messages.stdout.on('data', function(data) {
      let output = data.toString('ascii');
      message += output;
      let last = data.slice(data.length-7, data.length);
      if(last.toString() == '*     \n' || last.toString() == '!     \n') {
        linter.lint(textDocument, message);
        message = '';
        count++
        console.log(count)
      } 
    });

    messages.stderr.on('data', function(data) {
      console.log(data)
    });




    let sourceFile = file.replace(/\\/g, "/");

    LogtalkTerminal.sendString(`logtalk_load('${sourceFile}').\r`, false);

  }

  public static async make(uri: Uri) {
    const file: string = await LogtalkTerminal.ensureFile(uri);
    LogtalkTerminal.createLogtalkTerm();
    let goals = `logtalk_make.\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static runTests(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    let dir: string;
    dir = path.dirname(uri.fsPath);
    const testfile = path.join(dir, "tester");
    let goals = `logtalk_load('${testfile}').\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static runDoclet(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    let dir: string;
    dir = path.dirname(uri.fsPath);
    const docfile = path.join(dir, "doclet");
    let goals = `logtalk_load(doclet(loader)),logtalk_load('${docfile}').\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static async genDocumentation(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    let dir: string = LogtalkTerminal.ensureDir(uri);
    let file: string = await LogtalkTerminal.ensureFile(uri);
    const xmlDir = path.join(dir, "xml_docs");
    let goals = `logtalk_load(lgtdoc(loader)),logtalk_load('${file}'),os::change_directory('${dir}'),lgtdoc::directory('${dir}').\r`;
    LogtalkTerminal.sendString(goals);
    cp.execSync(
      `${LogtalkTerminal._docExec} ${LogtalkTerminal._docArgs.join(
        " "
      )} && code index.html`,
      { cwd: xmlDir }
    );
  }

  public static async genDiagrams(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    let dir: string = LogtalkTerminal.ensureDir(uri);
    let file: string = await LogtalkTerminal.ensureFile(uri);
    let goals = `logtalk_load(diagrams(loader)),logtalk_load('${file}'),os::change_directory('${dir}'),diagrams::directory('${dir}').\r`;
    LogtalkTerminal.sendString(goals);
    cp.execSync(
      `for f in *.dot; do ${LogtalkTerminal._graphvizExec} ${LogtalkTerminal._graphvizArgs.join(
        " "
      )} "$f" > "$(basename "$f" .dot).${LogtalkTerminal._graphvizExt}" || continue; done`,
      { cwd: dir }
    );
  }

  public static async scanForDeadCode(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    const file: string = await LogtalkTerminal.ensureFile(uri);
    let goals = `set_logtalk_flag(report, warnings),logtalk_load('${file}'),flush_output,logtalk_load(dead_code_scanner(loader)),dead_code_scanner::all.\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static runTesters() {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.spawnScript(
      ["logtalk_tester", "logtalk.run.tester", LogtalkTerminal._testerExec],
      LogtalkTerminal._testerExec,
      LogtalkTerminal._testerArgs
    );
  }

  private static spawnScript(type: string[], path: string, args: string[]) {
    let dir: string;
    dir = workspace.rootPath;
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
  
  public static runDoclets() {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.spawnScript(
      ["logtalk_doclet", "logtalk.run.doclets", LogtalkTerminal._docletExec],
      LogtalkTerminal._docletExec,
      LogtalkTerminal._docletArgs
    );
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
      dir = workspace.rootPath;
    }
    return dir;
  }
}


