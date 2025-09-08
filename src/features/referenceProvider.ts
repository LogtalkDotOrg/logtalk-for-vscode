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
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkReferenceProvider implements ReferenceProvider {
  private logger = getLogger();

  public async provideReferences(
    doc: TextDocument,
    position: Position,
    context: ReferenceContext,
    token: CancellationToken
  ): Promise<Location[] | null> {
    let locations: Location[] = [];
    const resource =
      Utils.getNonTerminalIndicatorUnderCursor(doc, position) ||
      Utils.getPredicateIndicatorUnderCursor(doc, position) ||
      Utils.getCallUnderCursor(doc, position);
    
    if (!resource) {
      return null;
    }

    await LogtalkTerminal.getReferences(doc, position, resource);

    const dir = LogtalkTerminal.getFirstWorkspaceFolder();
    const refs = path.join(dir, ".vscode_references");

    if (fs.existsSync(refs)) {
      const out = fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      const matches = out.matchAll(/File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        locations.push(new Location(Uri.file(match[1]), new Position(parseInt(match[2]) - 1, 0)));
      }
    } else {
      this.logger.error('.vscode_references file not found');
    }

    return locations;
  }
}
