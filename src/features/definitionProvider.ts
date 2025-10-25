"use strict";

import {
  CancellationToken,
  DefinitionProvider,
  Location,
  Position,
  TextDocument,
  Uri,
  window
} from "vscode";
import LogtalkTerminal from "./terminal";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkDefinitionProvider implements DefinitionProvider {
  private logger = getLogger();

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
}
