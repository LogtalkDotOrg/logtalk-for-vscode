"use strict";

import {
  CancellationToken,
  ImplementationProvider,
  ProviderResult,
  Definition,
  LocationLink,
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

export class LogtalkImplementationProvider implements ImplementationProvider {
  public async provideImplementation(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Definition | LocationLink[]> {
    let locations: Location[] = [];
    let predicate = Utils.getNonTerminalIndicatorUnderCursor(doc, position);
    if (!predicate) {
      predicate = Utils.getPredicateIndicatorUnderCursor(doc, position);
    }
    if (!predicate) {
      return null;
    }

    await LogtalkTerminal.getImplementations(doc, position, predicate);

    const dir = path.dirname(doc.uri.fsPath);
    const imps = path.join(dir, ".vscode_implementations");

    if (fs.existsSync(imps)) {
      let out = await fs.readFileSync(imps).toString();
      fsp.rm(imps, { force: true });
      let matches = out.matchAll(/File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        locations.push(new Location(Uri.file(match[1]), new Position(parseInt(match[2]) - 1, 0)));
      }
    } else {
      console.log('resource not found');
    }

    return locations;
  }
}
