"use strict";

import {
  CancellationToken,
  DeclarationProvider,
  Location,
  Position,
  TextDocument,
  Uri
} from "vscode";
import LogtalkTerminal from "./logtalkTerminal";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import { getLogger } from "../utils/logger";

export class LogtalkDeclarationProvider implements DeclarationProvider {
  private logger = getLogger();

  public async provideDeclaration(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location | null> {
    let location: Location = null;
    const call = Utils.getCallUnderCursor(doc, position);

    if (!call) {
      return null;
    }

    await LogtalkTerminal.getDeclaration(doc, position, call);

    const dir = path.dirname(doc.uri.fsPath);
    const dcl = path.join(dir, ".vscode_declaration");

    if (fs.existsSync(dcl)) {
      const out = fs.readFileSync(dcl).toString();
      await fsp.rm(dcl, { force: true });
      const match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        const fileName: string = match[1];
        const lineNum: number = parseInt(match[2]);
        location = new Location(Uri.file(fileName), new Position(lineNum - 1, 0));
      }
    } else {
      this.logger.debug('declaration not found');
    }

    return location;
  }
}
