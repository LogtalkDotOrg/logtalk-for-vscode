import {
  CancellationToken,
  TypeDefinitionProvider,
  Location,
  Position,
  Range,
  TextDocument,
  Uri,
  workspace
} from "vscode";
import * as cp from "child_process";
import LogtalkTerminal from "./logtalkTerminal";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as jsesc from "jsesc";
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkTypeDefinitionProvider implements TypeDefinitionProvider {
  public async provideTypeDefinition(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location> {
    let location: Location = null;
    let entity = Utils.getCallUnderCursor(doc, position);
    if (!entity) {
      return null;
    }

    await LogtalkTerminal.getTypeDefinition(doc, entity);

    const dir = path.dirname(doc.uri.fsPath);
    const tdef = path.join(dir, ".type_definition_done");

    if (fs.existsSync(tdef)) {
      let out = await fs.readFileSync(tdef).toString();
      fsp.rm(tdef, { force: true });
      let match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        let fileName: string = match[1];
        let lineNum: number = parseInt(match[2]);
        location = new Location(Uri.file(fileName), new Position(lineNum - 1, 0));
      }
    } else {
      console.log('type definition not found');
    }

    return location;
  }
}
