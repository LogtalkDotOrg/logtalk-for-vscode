import {
  CancellationToken,
  DeclarationProvider,
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

export class LogtalkDeclarationProvider implements DeclarationProvider {
  public async provideDeclaration(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location> {
    let location: Location = null;
    let pi = Utils.getCallUnderCursor(doc, position);
    if (!pi) {
      return null;
    }

    let match = pi.match(/(\w+)[/](\d+)/);
    let functor = match[1];
    let arity = parseInt(match[2]);

    await LogtalkTerminal.getDeclaration(doc, position, functor, arity);

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
