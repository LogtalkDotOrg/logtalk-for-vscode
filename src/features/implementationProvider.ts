"use strict";

import {
  CancellationToken,
  ImplementationProvider,
  Definition,
  LocationLink,
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

export class LogtalkImplementationProvider implements ImplementationProvider {
  private logger = getLogger();

  public async provideImplementation(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Definition | LocationLink[]> {
    const lineText = doc.lineAt(position.line).text.trim();
    if (lineText.startsWith("%")) {
      return null;
    }

    const resource =
      Utils.getNonTerminalIndicatorUnderCursor(doc, position) ||
      Utils.getPredicateIndicatorUnderCursor(doc, position) ||
      Utils.getCallUnderCursor(doc, position);

    if (!resource) {
      return null;
    }

    if (token.isCancellationRequested) {
      return null;
    }

    await LogtalkTerminal.getImplementations(doc, position, resource);

    let locations: Location[] = [];
    const dir = LogtalkTerminal.getFirstWorkspaceFolder();
    const imps = path.join(dir, ".vscode_implementations");

    if (fs.existsSync(imps)) {
      let out = fs.readFileSync(imps).toString();
      await fsp.rm(imps, { force: true });
      const matches = out.matchAll(/File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        locations.push(new Location(Uri.file(match[1]), new Position(parseInt(match[2]) - 1, 0)));
      }
    } else {
      this.logger.error('.vscode_implementations file not found');
    }

    return locations;
  }
}
