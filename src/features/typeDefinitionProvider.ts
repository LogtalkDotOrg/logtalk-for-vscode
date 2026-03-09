"use strict";

import {
  CancellationToken,
  TypeDefinitionProvider,
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

export class LogtalkTypeDefinitionProvider implements TypeDefinitionProvider {
  private logger = getLogger();
  private static readonly TEMP_FILES = [
    ".vscode_type_definition",
    ".vscode_type_definition_done"
  ];
  private static startupCleanupPromise: Promise<void> | null = null;
  private static workspaceFoldersListener: Disposable | null = null;

  constructor() {
    // Ensure startup marker cleanup runs once and can be awaited before lookups.
    if (!LogtalkTypeDefinitionProvider.startupCleanupPromise) {
      LogtalkTypeDefinitionProvider.startupCleanupPromise = this.cleanupStartupTemporaryFiles();
    }

    // Register the workspace-folder listener only once to avoid duplicate cleanup runs.
    if (!LogtalkTypeDefinitionProvider.workspaceFoldersListener) {
      LogtalkTypeDefinitionProvider.workspaceFoldersListener = workspace.onDidChangeWorkspaceFolders((event) => {
        for (const wf of event.added) {
          // Fire-and-forget for newly added folders; startup is the critical synchronized path.
          Utils.cleanupTemporaryFiles(wf.uri.fsPath, LogtalkTypeDefinitionProvider.TEMP_FILES);
        }
      });
    }
  }

  private async cleanupStartupTemporaryFiles(): Promise<void> {
    if (!workspace.workspaceFolders) {
      return;
    }

    for (const wf of workspace.workspaceFolders) {
      await Utils.cleanupTemporaryFiles(wf.uri.fsPath, LogtalkTypeDefinitionProvider.TEMP_FILES);
    }
  }

  public async provideTypeDefinition(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location | null> {
    if (LogtalkTypeDefinitionProvider.startupCleanupPromise) {
      await LogtalkTypeDefinitionProvider.startupCleanupPromise;
    }

    let location: Location = null;
    const entity = Utils.getIndicatorUnderCursor(doc, position);

    if (!entity) {
      return null;
    }

    await LogtalkTerminal.getTypeDefinition(doc, position, entity, token);

    const dir = LogtalkTerminal.getWorkspaceFolderForUri(doc.uri);
    if (!dir) {
      this.logger.error('No workspace folder open');
      return null;
    }
    const tdef = path.join(dir, ".vscode_type_definition");

    try {
      const content = await workspace.fs.readFile(Uri.file(tdef));
      const out = content.toString();
      await workspace.fs.delete(Uri.file(tdef), { useTrash: false });
      const match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        let fileName = Utils.normalizeDoubleSlashPath(match[1]);
        const lineNum: number = parseInt(match[2]);
        location = new Location(Uri.file(fileName), new Position(lineNum - 1, 0));
      }
    } catch (err) {
      this.logger.error('.vscode_type_definition file not found');
    }

    return location;
  }

  public dispose(): void {
    // Shared listener is intentionally process-scoped and initialized once.
  }
}
