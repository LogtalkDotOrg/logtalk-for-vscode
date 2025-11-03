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
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkTypeDefinitionProvider implements TypeDefinitionProvider {
  private logger = getLogger();
  private disposables: Disposable[] = [];

  constructor() {
    // Delete any temporary files from previous sessions
    const directory = LogtalkTerminal.getFirstWorkspaceFolder();
    const files = [
      ".vscode_type_definition",
      ".vscode_type_definition_done"
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

  public async provideTypeDefinition(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location | null> {
    let location: Location = null;
    const entity = Utils.getIndicatorUnderCursor(doc, position);

    if (!entity) {
      return null;
    }

    await LogtalkTerminal.getTypeDefinition(doc, position, entity);

    const dir = LogtalkTerminal.getFirstWorkspaceFolder();
    if (!dir) {
      this.logger.error('No workspace folder open');
      return null;
    }
    const tdef = path.join(dir, ".vscode_type_definition");

    if (fs.existsSync(tdef)) {
      const out = fs.readFileSync(tdef).toString();
      await fsp.rm(tdef, { force: true });
      const match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        const fileName: string = match[1];
        const lineNum: number = parseInt(match[2]);
        location = new Location(Uri.file(fileName), new Position(lineNum - 1, 0));
      }
    } else {
      this.logger.error('.vscode_type_definition file not found');
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
