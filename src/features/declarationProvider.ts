"use strict";

import {
  CancellationToken,
  DeclarationProvider,
  Location,
  Position,
  TextDocument,
  Uri,
  workspace,
  Disposable
} from "vscode";
import LogtalkTerminal from "./terminal";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkDeclarationProvider implements DeclarationProvider {
  private logger = getLogger();
  private disposables: Disposable[] = [];

  constructor() {
    // Delete any temporary files from previous sessions
    const directory = LogtalkTerminal.getFirstWorkspaceFolder();
    const files = [
      ".vscode_declaration",
      ".vscode_declaration_done"
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

  public async provideDeclaration(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location | null> {
    const lineText = doc.lineAt(position.line).text.trim();
    if (lineText.startsWith("%")) {
      return null;
    }

    const call = Utils.getCallUnderCursor(doc, position);
    if (!call) {
      return null;
    }

    if (token.isCancellationRequested) {
      return null;
    }

    await LogtalkTerminal.getDeclaration(doc, position, call);

    let location: Location = null;
    const dir = LogtalkTerminal.getFirstWorkspaceFolder();
    if (!dir) {
      this.logger.error('No workspace folder open');
      return location;
    }
    const dcl = path.join(dir, ".vscode_declaration");

    if (fs.existsSync(dcl)) {
      const out = fs.readFileSync(dcl).toString();
      await fsp.rm(dcl, { force: true });
      const match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        let fileName = Utils.normalizeDoubleSlashPath(match[1]);
        const lineNum: number = parseInt(match[2]);
        location = new Location(Uri.file(fileName), new Position(lineNum - 1, 0));
      }
    } else {
      this.logger.error('.vscode_declaration file not found');
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
