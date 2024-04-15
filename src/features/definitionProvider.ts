import {
  CancellationToken,
  DefinitionProvider,
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

export class LogtalkDefinitionProvider implements DefinitionProvider {
  public async provideDefinition(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location> {
    let location: Location = null;
    let call = Utils.getCallUnderCursor(doc, position);
    if (!call) {
      return null;
    }

    await LogtalkTerminal.getDefinition(doc, position, call);

    const dir = path.dirname(doc.uri.fsPath);
    const def = path.join(dir, ".definition_done");

    if (fs.existsSync(def)) {
      let out = await fs.readFileSync(def).toString();
      fsp.rm(def, { force: true });
      let match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        let fileName: string = match[1];
        let lineNum: number = parseInt(match[2]);
        location = new Location(Uri.file(fileName), new Position(lineNum - 1, 0));
      }
    } else {
      console.log('definition not found');
    }

    return location;
  }
}
