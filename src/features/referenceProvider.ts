"use strict";

import {
  CancellationToken,
  ReferenceProvider,
  ReferenceContext,
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

export class LogtalkReferenceProvider implements ReferenceProvider {
  private logger = getLogger();
  private disposables: Disposable[] = [];

  constructor() {
    // Delete any temporary files from previous sessions
    const directory = LogtalkTerminal.getFirstWorkspaceFolder();
    const files = [
      ".vscode_references",
      ".vscode_references_done"
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

  public async provideReferences(
    doc: TextDocument,
    position: Position,
    context: ReferenceContext,
    token: CancellationToken
  ): Promise<Location[] | null> {
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

    await LogtalkTerminal.getReferences(doc, position, resource);

    let locations: Location[] = [];
    const dir = LogtalkTerminal.getFirstWorkspaceFolder();
    if (!dir) {
      this.logger.error('No workspace folder open');
      return locations;
    }
    const refs = path.join(dir, ".vscode_references");

    if (fs.existsSync(refs)) {
      const out = fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      const matches = out.matchAll(/File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        let fileName = Utils.normalizeDoubleSlashPath(match[1]);
        locations.push(new Location(Uri.file(fileName), new Position(parseInt(match[2]) - 1, 0)));
      }
    } else {
      this.logger.error('.vscode_references file not found');
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
