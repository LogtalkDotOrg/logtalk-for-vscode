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

export class LogtalkDeclarationProvider implements DeclarationProvider {
  private logger = getLogger();
  private static readonly TEMP_FILES = [
    ".vscode_declaration",
    ".vscode_declaration_done"
  ];
  private static startupCleanupPromise: Promise<void> | null = null;
  private static workspaceFoldersListener: Disposable | null = null;

  constructor() {
    // Ensure startup marker cleanup runs once and can be awaited before lookups.
    if (!LogtalkDeclarationProvider.startupCleanupPromise) {
      LogtalkDeclarationProvider.startupCleanupPromise = this.cleanupStartupTemporaryFiles();
    }

    // Register the workspace-folder listener only once to avoid duplicate cleanup runs.
    if (!LogtalkDeclarationProvider.workspaceFoldersListener) {
      LogtalkDeclarationProvider.workspaceFoldersListener = workspace.onDidChangeWorkspaceFolders((event) => {
        for (const wf of event.added) {
          // Fire-and-forget for newly added folders; startup is the critical synchronized path.
          Utils.cleanupTemporaryFiles(wf.uri.fsPath, LogtalkDeclarationProvider.TEMP_FILES);
        }
      });
    }
  }

  private async cleanupStartupTemporaryFiles(): Promise<void> {
    if (!workspace.workspaceFolders) {
      return;
    }

    for (const wf of workspace.workspaceFolders) {
      await Utils.cleanupTemporaryFiles(wf.uri.fsPath, LogtalkDeclarationProvider.TEMP_FILES);
    }
  }

  public async provideDeclaration(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location | null> {
    if (LogtalkDeclarationProvider.startupCleanupPromise) {
      await LogtalkDeclarationProvider.startupCleanupPromise;
    }

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

    await LogtalkTerminal.getDeclaration(doc, position, call, token);

    let location: Location = null;
    const dir = LogtalkTerminal.getWorkspaceFolderForUri(doc.uri);
    if (!dir) {
      this.logger.error('No workspace folder open');
      return location;
    }
    const dcl = path.join(dir, ".vscode_declaration");

    try {
      const content = await workspace.fs.readFile(Uri.file(dcl));
      const out = content.toString();
      await workspace.fs.delete(Uri.file(dcl), { useTrash: false });
      const match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        let fileName = Utils.normalizeDoubleSlashPath(match[1]);
        const lineNum: number = parseInt(match[2]);
        location = new Location(Uri.file(fileName), new Position(lineNum - 1, 0));
      }
    } catch (err) {
      this.logger.error('.vscode_declaration file not found');
    }

    return location;
  }

  public dispose(): void {
    // Shared listener is intentionally process-scoped and initialized once.
  }
}
