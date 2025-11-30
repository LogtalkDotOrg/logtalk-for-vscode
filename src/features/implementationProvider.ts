"use strict";

import {
  CancellationToken,
  ImplementationProvider,
  Definition,
  LocationLink,
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

export class LogtalkImplementationProvider implements ImplementationProvider {
  private logger = getLogger();
  private disposables: Disposable[] = [];

  constructor() {
    // Delete any temporary files from previous sessions
    const directory = LogtalkTerminal.getFirstWorkspaceFolder();
    const files = [
      ".vscode_implementations",
      ".vscode_implementations_done"
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

  public async provideImplementation(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Definition | LocationLink[]> {
    const lineText = doc.lineAt(position.line).text.trim();
    if (lineText.startsWith("%")) {
      return null;
    }

    const resource =
      Utils.getNonTerminalIndicatorUnderCursor(doc, position) ||
      Utils.getPredicateIndicatorUnderCursor(doc, position) ||
      Utils.getCallUnderCursor(doc, position);

    if (!resource) {
      return null;
    }

    if (token.isCancellationRequested) {
      return null;
    }

    await LogtalkTerminal.getImplementations(doc, position, resource);

    let locations: Location[] = [];
    const dir = LogtalkTerminal.getFirstWorkspaceFolder();
    if (!dir) {
      this.logger.error('No workspace folder open');
      return locations;
    }
    const imps = path.join(dir, ".vscode_implementations");

    if (fs.existsSync(imps)) {
      let out = fs.readFileSync(imps).toString();
      await fsp.rm(imps, { force: true });
      const matches = out.matchAll(/File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        let fileName = Utils.normalizeDoubleSlashPath(match[1]);
        locations.push(new Location(Uri.file(fileName), new Position(parseInt(match[2]) - 1, 0)));
      }
    } else {
      this.logger.error('.vscode_implementations file not found');
    }

    return locations;
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
