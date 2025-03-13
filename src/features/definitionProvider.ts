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
import LogtalkTerminal from "./logtalkTerminal";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkDefinitionProvider implements DefinitionProvider {
  public async provideDefinition(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location | null> {
    let location: Location = null;
    let call = Utils.getCallUnderCursor(doc, position);
    if (!call) {
      return null;
    }

    const text = window.activeTextEditor.document.getText(window.activeTextEditor.selection);
    if (text.length === 0) {
      return null;
    }

    await LogtalkTerminal.getDefinition(doc, position, call);

    const dir = path.dirname(doc.uri.fsPath);
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
      console.log('definition not found');
    }

    return location;
  }
}
