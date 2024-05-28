"use strict";

import {
  CancellationToken,
  ReferenceProvider,
  ReferenceContext,
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

export class LogtalkReferenceProvider implements ReferenceProvider {
  public async provideReferences(
    doc: TextDocument,
    position: Position,
    context: ReferenceContext,
    token: CancellationToken
  ): Promise<Location[]> {
    let locations: Location[] = [];
    let resource = Utils.getNonTerminalIndicatorUnderCursor(doc, position);
    if (!resource) {
      resource = Utils.getPredicateIndicatorUnderCursor(doc, position);
    }
    if (!resource) {
      resource = Utils.getCallUnderCursor(doc, position);
    }
    if (!resource) {
      return null;
    }

    await LogtalkTerminal.getReferences(doc, position, resource);

    const dir = path.dirname(doc.uri.fsPath);
    const refs = path.join(dir, ".vscode_references");

    if (fs.existsSync(refs)) {
      let out = await fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      let matches = out.matchAll(/File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        locations.push(new Location(Uri.file(match[1]), new Position(parseInt(match[2]) - 1, 0)));
      }
    } else {
      console.log('references not found');
    }

    return locations;
  }
}
