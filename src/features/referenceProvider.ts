import {
  CancellationToken,
  ReferenceProvider,
  ReferenceContext,
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

export class LogtalkReferenceProvider implements ReferenceProvider {
  public async provideReferences(
    doc: TextDocument,
    position: Position,
    context: ReferenceContext,
    token: CancellationToken
  ): Promise<Location[]> {
    let locations: Location[] = [];
    let call = Utils.getCallUnderCursor(doc, position);
    if (!call) {
      return null;
    }

    await LogtalkTerminal.getReferences(doc, position, call);

    const dir = path.dirname(doc.uri.fsPath);
    const refs = path.join(dir, ".references_done");

    if (fs.existsSync(refs)) {
      let out = await fs.readFileSync(refs).toString();
      fsp.rm(refs, { force: true });
      let matches = out.matchAll(/File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        console.log(match[1]);
        console.log(match[2]);
        locations.push(new Location(Uri.file(match[1]), new Position(parseInt(match[2]) - 1, 0)));
      }
    } else {
      console.log('references not found');
    }

    return locations;
  }
}
