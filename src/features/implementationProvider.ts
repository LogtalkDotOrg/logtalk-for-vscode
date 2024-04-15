import {
  CancellationToken,
  ImplementationProvider,
  ProviderResult,
  Definition,
  LocationLink,
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

export class LogtalkImplementationProvider implements ImplementationProvider {
  public async provideImplementation(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Definition | LocationLink[]> {
    let locations: Location[] = [];
    let predicate = Utils.getPredicateIndicatorUnderCursor(doc, position);
    if (!predicate) {
      return null;
    }

    await LogtalkTerminal.getImplementations(doc, position, predicate);

    const dir = path.dirname(doc.uri.fsPath);
    const imps = path.join(dir, ".implementations_done");

    if (fs.existsSync(imps)) {
      let out = await fs.readFileSync(imps).toString();
      fsp.rm(imps, { force: true });
      let matches = out.matchAll(/File:(.+);Line:(\d+)/g);
      console.log(predicate);
      console.log(matches);
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
