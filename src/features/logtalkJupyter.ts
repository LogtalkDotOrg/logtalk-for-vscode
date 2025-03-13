"use strict";

import {
  window,
  workspace,
  commands,
  OutputChannel,
  Uri,
  ExtensionContext,
} from "vscode";
import * as path from "path";
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import * as semver from 'semver';

const exec = promisify(execCallback);

export default class LogtalkJupyter {
  public static jupytextAvailable: boolean = false;
  private static jupytextPath: string = "";
  private static outputChannel: OutputChannel;

  public static async init(context: ExtensionContext): Promise<void> {
    LogtalkJupyter.outputChannel = window.createOutputChannel("Logtalk Jupytext");
    context.subscriptions.push(LogtalkJupyter.outputChannel);

    const section = workspace.getConfiguration("logtalk");
    LogtalkJupyter.jupytextPath = section.get<string>("jupytext.path", "jupytext");
    
    LogtalkJupyter.jupytextAvailable = await LogtalkJupyter.checkJupytextAvailability();
    commands.executeCommand('setContext', 'logtalk.jupytext.available', LogtalkJupyter.jupytextAvailable);
  }

  public static async openAsNotebook(uri?: Uri): Promise<void> {
    uri = uri || window.activeTextEditor?.document.uri;
    if (!uri) {
      window.showErrorMessage('No active document to convert to notebook');
      return;
    }

    const notebook = path.join(
      path.dirname(uri.fsPath),
      `${path.parse(uri.fsPath).name}.ipynb`
    );
    
    const cmd = `${LogtalkJupyter.jupytextPath} --to notebook "${uri.fsPath}"`;
    
    try {
      await exec(cmd);
      await commands.executeCommand(
        'vscode.openWith',
        Uri.file(notebook),
        'jupyter-notebook'
      );
    } catch (error) {
      LogtalkJupyter.handleCommandError(cmd, 'Failed to open the file as a notebook', error);
    }
  }

  public static async openAsPairedNotebook(uri?: Uri): Promise<void> {
    uri = uri || window.activeTextEditor?.document.uri;
    if (!uri) {
      window.showErrorMessage('No active document to convert to paired notebook');
      return;
    }

    const notebook = path.join(
      path.dirname(uri.fsPath),
      `${path.parse(uri.fsPath).name}.ipynb`
    );
    
    const fileExt = path.extname(uri.fsPath).slice(1);
    const cmd = 
      `${LogtalkJupyter.jupytextPath} --to notebook "${uri.fsPath}" && ` +
      `${LogtalkJupyter.jupytextPath} --set-formats ipynb,${fileExt} "${notebook}"`;
    
    try {
      await exec(cmd);
      await commands.executeCommand(
        'vscode.openWith',
        Uri.file(notebook),
        'jupyter-notebook'
      );
    } catch (error) {
      LogtalkJupyter.handleCommandError(cmd, 'Failed to open the file as a paired notebook', error);
    }
  }

  public static async syncNotebook(uri?: Uri): Promise<void> {
    uri = uri || window.activeTextEditor?.document.uri;
    if (!uri) {
      window.showErrorMessage('No active document to sync');
      return;
    }
    
    const cmd = `${LogtalkJupyter.jupytextPath} --sync "${uri.fsPath}"`;
    
    try {
      await exec(cmd);
      window.showInformationMessage('Notebook synchronized successfully');
    } catch (error) {
      LogtalkJupyter.handleCommandError(cmd, 'Failed to sync notebook', error);
    }
  }

  private static async checkJupytextAvailability(): Promise<boolean> {
    const cmd = `${LogtalkJupyter.jupytextPath} --version`;
    try {
      const { stdout } = await exec(cmd);
      return semver.satisfies(stdout.trim(), ">=1.16.7");
    } catch (error) {
      LogtalkJupyter.handleCommandError(
        cmd, 
        'Failed to find supported jupytext command', 
        error,
        false // Don't show output option
      );
      return false;
    }
  }

  private static handleCommandError(
    cmd: string, 
    message: string, 
    error: any, 
    showOutputOption: boolean = true
  ): void {
    console.error(`${message}: ${error}`);
    LogtalkJupyter.outputChannel.appendLine(`Command: ${cmd}`);
    LogtalkJupyter.outputChannel.appendLine(`Error: ${error.message || error}`);
    
    if (error.stderr) {
      LogtalkJupyter.outputChannel.appendLine(`stderr: ${error.stderr}`);
    }
    
    if (showOutputOption) {
      window.showErrorMessage(message, "Show Output").then(selection => {
        if (selection === "Show Output") {
          LogtalkJupyter.outputChannel.show();
        }
      });
    } else {
      window.showErrorMessage(message);
    }
  }
}
