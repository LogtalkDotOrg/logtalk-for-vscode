"use strict";

import {
  CancellationToken,
  DefinitionProvider,
  Location,
  Position,
  TextDocument,
  Uri,
  window,
  workspace,
  Disposable
} from "vscode";
import LogtalkTerminal from "./terminal";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkDefinitionProvider implements DefinitionProvider {
  private logger = getLogger();
  private disposables: Disposable[] = [];

  constructor() {
    // Delete any temporary files from previous sessions
    const directory = LogtalkTerminal.getFirstWorkspaceFolder();
    const files = [
      ".vscode_definition",
      ".vscode_definition_done"
    ];
    // Fire-and-forget cleanup - errors are logged internally
    Utils.cleanupTemporaryFiles(directory, files);

    // Clean up any temporary files when folders are added to the workspace
    const workspaceFoldersListener = workspace.onDidChangeWorkspaceFolders((event) => {
      // For each added workspace folder, run the cleanup using the folder path
      // Fire-and-forget cleanup - errors are logged internally
      for (const wf of event.added) {
        Utils.cleanupTemporaryFiles(wf.uri.fsPath, files);
      }
    });
    this.disposables.push(workspaceFoldersListener);
  }

  public async provideDefinition(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location | null> {
    if (window.activeTextEditor?.document === doc && window.activeTextEditor.selection.active.line !== position.line) {
      return null;
    }

    const lineText = doc.lineAt(position.line).text.trim();
    if (lineText.startsWith("%")) {
      return null;
    }

    let call = Utils.getCallUnderCursor(doc, position);
    if (!call) {
      return null;
    }

    if (token.isCancellationRequested) {
      return null;
    }

    await LogtalkTerminal.getDefinition(doc, position, call);

    let location: Location = null;
    const dir = LogtalkTerminal.getFirstWorkspaceFolder();
    if (!dir) {
      this.logger.error('No workspace folder open');
      return location;
    }
    const def = path.join(dir, ".vscode_definition");

    if (fs.existsSync(def)) {
      const out = fs.readFileSync(def).toString();
      await fsp.rm(def, { force: true });
      const match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        const fileName: string = match[1];
        const lineNum: number = parseInt(match[2]);
        location = new Location(Uri.file(fileName), new Position(lineNum - 1, 0));
      }
    } else {
      this.logger.error('.vscode_definition file not found');
    }

    return location;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch (err) {
        this.logger.error('Error disposing resource:', err);
      }
    }
    this.disposables = [];
  }
}
