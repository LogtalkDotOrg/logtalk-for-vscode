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
  TerminalLink,
  Position,
  BreakpointsChangeEvent,
  SourceBreakpoint,
  FunctionBreakpoint
} from "vscode";
import * as vscode from "vscode";
import * as path from "path";
import * as jsesc from "jsesc";
import * as fs from "fs";
import LogtalkLinter from "./logtalkLinter";
import LogtalkTestsReporter from "./logtalkTestsReporter";
import LogtalkDeadCodeScanner from "./logtalkDeadCodeScanner";
import LogtalkDocumentationLinter from "./logtalkDocumentationLinter";
import { LogtalkMetricsCodeLensProvider } from "./metricsCodeLensProvider";
import { LogtalkTestsCodeLensProvider } from "./testsCodeLensProvider"
import * as fsp from "fs/promises";
import * as timers from "timers/promises";

const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

var semver = require('semver');

let jupytextConsole: OutputChannel;

export default class LogtalkJupyter {
  public static jupytextAvailable: boolean = false;
  private static jupytextPath: String = "";
  private static _outputChannel:  OutputChannel;

  constructor() {

  }

  public static async init(context: ExtensionContext) {

    LogtalkJupyter._outputChannel = window.createOutputChannel("Logtalk Jupytext");

    let section = workspace.getConfiguration("logtalk");
    LogtalkJupyter.jupytextPath = section.get<string>("jupytext.path");

    if (LogtalkJupyter.jupytextPath == "") {
      // try to use the jupytext command from the system PATH
      LogtalkJupyter.jupytextPath = "jupytext";
    }

    LogtalkJupyter.jupytextAvailable = await LogtalkJupyter.checkJupytextAvailability();
    console.log("LogtalkJupyter.jupytextAvailable: " + LogtalkJupyter.jupytextAvailable);
    vscode.commands.executeCommand('setContext', 'logtalk.jupytext.available', LogtalkJupyter.jupytextAvailable);    
  }

  public static async openAsNotebook(uri: Uri): Promise<void> {
    const notebook = path.dirname(uri.fsPath) + path.sep + path.parse(uri.fsPath).name + ".ipynb";
    const cmd = LogtalkJupyter.jupytextPath + " --to notebook " + uri.fsPath;
    try {
        const { stdout, stderr } = await exec(cmd);
        await commands.executeCommand(
            'vscode.openWith',
            Uri.file(notebook),
            'jupyter-notebook'
        );
    } catch (error) {
        window.showErrorMessage('Failed to open the file as a Jupyter notebook');
        const selection = await window.showErrorMessage(`Calling \`${cmd}\` failed.`, "Show Output");
        if (selection === "Show Output") {
            jupytextConsole.show();
        }
    };
  }

  public static async openAsNotebookAndRun(uri: Uri): Promise<void> {
    const notebook = path.dirname(uri.fsPath) + path.sep + path.parse(uri.fsPath).name + ".ipynb";
    const cmd = LogtalkJupyter.jupytextPath + " --to notebook --execute " + uri.fsPath;
    try {
        const { stdout, stderr } = await exec(cmd);
        await commands.executeCommand(
            'vscode.openWith',
            Uri.file(notebook),
            'jupyter-notebook'
        );
    } catch (error) {
        window.showErrorMessage('Failed to open and run the file as a Jupyter notebook');
        const selection = await window.showErrorMessage(`Calling \`${cmd}\` failed.`, "Show Output");
        if (selection === "Show Output") {
            jupytextConsole.show();
        }
    };
  }

  public static async openAsPairedNotebook(uri: Uri): Promise<void> {
    const notebook = path.dirname(uri.fsPath) + path.sep + path.parse(uri.fsPath).name + ".ipynb";
    const cmd =
        LogtalkJupyter.jupytextPath + " --to notebook " + uri.fsPath + " && " +
        LogtalkJupyter.jupytextPath + " --set-formats ipynb," + path.extname(uri.fsPath).slice(1) + " " + notebook;
        console.log("openAsPairedNotebook: " + cmd);
    try {
        const { stdout, stderr } = await exec(cmd);
        await commands.executeCommand(
            'vscode.openWith',
            Uri.file(notebook),
            'jupyter-notebook'
        );
    } catch (error) {
        window.showErrorMessage('Failed to open the file as a paired Jupyter notebook');
        const selection = await window.showErrorMessage(`Calling \`${cmd}\` failed.`, "Show Output");
        if (selection === "Show Output") {
            jupytextConsole.show();
        }
    };
  }

  public static async syncNotebook(uri: Uri): Promise<void> {
    const notebook = path.dirname(uri.fsPath) + path.sep + path.parse(uri.fsPath).name + ".ipynb";
    const cmd = LogtalkJupyter.jupytextPath + " --sync " + uri.fsPath;
    try {
        const { stdout, stderr } = await exec(cmd);
    } catch (error) {
        window.showErrorMessage('Failed to sync Jupyter notebook');
        const selection = await window.showErrorMessage(`Calling \`${cmd}\` failed.`, "Show Output");
        if (selection === "Show Output") {
            jupytextConsole.show();
        }
    };
  }

  private static async checkJupytextAvailability(): Promise<boolean> {
    const cmd = LogtalkJupyter.jupytextPath + " --version";
    try {
        const { stdout, stderr } = await exec(cmd);
        return semver.satisfies(stdout, ">=1.16.7");
    } catch (error) {
        window.showErrorMessage('Failed to finnd supported jupytext command');
        const selection = await window.showErrorMessage(`Calling \`${cmd}\` failed.`, "Show Output");
        if (selection === "Show Output") {
            jupytextConsole.show();
        }
        return false;
    };
  }

}
