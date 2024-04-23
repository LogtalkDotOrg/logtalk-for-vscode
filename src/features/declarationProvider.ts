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

export class LogtalkDeclarationProvider implements DeclarationProvider {
  public async provideDeclaration(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location> {
    let location: Location = null;
    let call = Utils.getCallUnderCursor(doc, position);
    if (!call) {
      return null;
    }

    await LogtalkTerminal.getDeclaration(doc, position, call);

    const dir = path.dirname(doc.uri.fsPath);
    const dcl = path.join(dir, ".declaration_done");

    if (fs.existsSync(dcl)) {
      let out = await fs.readFileSync(dcl).toString();
      fsp.rm(dcl, { force: true });
      let match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        let fileName: string = match[1];
        let lineNum: number = parseInt(match[2]);
        location = new Location(Uri.file(fileName), new Position(lineNum - 1, 0));
      }
    } else {
      console.log('declaration not found');
    }

    return location;
  }
}
