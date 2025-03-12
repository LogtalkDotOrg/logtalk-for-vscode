"use strict";

import {
  CancellationToken,
  TypeDefinitionProvider,
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

export class LogtalkTypeDefinitionProvider implements TypeDefinitionProvider {
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

    const dir = path.dirname(doc.uri.fsPath);
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
      console.log('type definition not found');
    }

    return location;
  }
}
