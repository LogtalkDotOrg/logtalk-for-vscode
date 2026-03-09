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

export class LogtalkImplementationProvider implements ImplementationProvider {
  private logger = getLogger();
  private static readonly TEMP_FILES = [
    ".vscode_implementations",
    ".vscode_implementations_done"
  ];
  private static startupCleanupPromise: Promise<void> | null = null;
  private static workspaceFoldersListener: Disposable | null = null;

  constructor() {
    // Ensure startup marker cleanup runs once and can be awaited before lookups.
    if (!LogtalkImplementationProvider.startupCleanupPromise) {
      LogtalkImplementationProvider.startupCleanupPromise = this.cleanupStartupTemporaryFiles();
    }

    // Register the workspace-folder listener only once to avoid duplicate cleanup runs.
    if (!LogtalkImplementationProvider.workspaceFoldersListener) {
      LogtalkImplementationProvider.workspaceFoldersListener = workspace.onDidChangeWorkspaceFolders((event) => {
        for (const wf of event.added) {
          // Fire-and-forget for newly added folders; startup is the critical synchronized path.
          Utils.cleanupTemporaryFiles(wf.uri.fsPath, LogtalkImplementationProvider.TEMP_FILES);
        }
      });
    }
  }

  private async cleanupStartupTemporaryFiles(): Promise<void> {
    if (!workspace.workspaceFolders) {
      return;
    }

    for (const wf of workspace.workspaceFolders) {
      await Utils.cleanupTemporaryFiles(wf.uri.fsPath, LogtalkImplementationProvider.TEMP_FILES);
    }
  }

  public async provideImplementation(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Definition | LocationLink[]> {
    if (LogtalkImplementationProvider.startupCleanupPromise) {
      await LogtalkImplementationProvider.startupCleanupPromise;
    }

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

    await LogtalkTerminal.getImplementations(doc, position, resource, token);

    let locations: Location[] = [];
    const dir = LogtalkTerminal.getWorkspaceFolderForUri(doc.uri);
    if (!dir) {
      this.logger.error('No workspace folder open');
      return locations;
    }
    const imps = path.join(dir, ".vscode_implementations");

    try {
      const content = await workspace.fs.readFile(Uri.file(imps));
      let out = content.toString();
      await workspace.fs.delete(Uri.file(imps), { useTrash: false });
      const matches = out.matchAll(/File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        let fileName = Utils.normalizeDoubleSlashPath(match[1]);
        locations.push(new Location(Uri.file(fileName), new Position(parseInt(match[2]) - 1, 0)));
      }
    } catch (err) {
      this.logger.error('.vscode_implementations file not found');
    }

    return locations;
  }

  public dispose(): void {
    // Shared listener is intentionally process-scoped and initialized once.
  }
}
