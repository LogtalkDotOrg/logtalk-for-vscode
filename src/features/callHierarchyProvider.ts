"use strict";

import {
  ProviderResult,
  CancellationToken,
  CallHierarchyProvider,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  Location,
  Position,
  TextDocument,
  Uri,
  SymbolKind,
  Range
} from "vscode";
import LogtalkTerminal from "./logtalkTerminal";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkCallHierarchyProvider implements CallHierarchyProvider {
  public prepareCallHierarchy(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): ProviderResult<CallHierarchyItem> {
    let predicate = Utils.getCallUnderCursor(doc, position);
    if (!predicate) {
      return null;
    } else {
      return new CallHierarchyItem(
        SymbolKind.Function,
        predicate,
        "",
        doc.uri,
        new Range(position, position),
        new Range(position, position)
      );
    }
  }

  public async provideCallHierarchyIncomingCalls(
    item: CallHierarchyItem,
    token: CancellationToken
  ): Promise<CallHierarchyIncomingCall[]> {
    let callers: CallHierarchyIncomingCall[] = [];
    let fromRanges: Range[] = [];
    let file = item.uri.fsPath;
    let predicate = item.name;
    let position = item.range.start;

    await LogtalkTerminal.getCallers(file, position, predicate);

    const dir = path.dirname(file);
    const refs = path.join(dir, ".vscode_callers");

    if (fs.existsSync(refs)) {
      const out = fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      let matches = out.matchAll(/Name:(.+);File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        callers.push(
          new CallHierarchyIncomingCall(
            new CallHierarchyItem(
              SymbolKind.Function,
              match[1],
              "",
              Uri.file(match[2]),
              new Range(new Position(parseInt(match[3]) - 1, 0), new Position(parseInt(match[3]) - 1, 0)),
              new Range(new Position(parseInt(match[3]) - 1, 0), new Position(parseInt(match[3]) - 1, 0))
            ),
            fromRanges
          )
        );
      }
    } else {
      console.log('references not found');
    }

    return callers;
  }

  public async provideCallHierarchyOutgoingCalls(
    item: CallHierarchyItem,
    token: CancellationToken
  ): Promise<CallHierarchyOutgoingCall[]> {
    let callees: CallHierarchyOutgoingCall[] = [];
    let fromRanges: Range[] = [];
    let file = item.uri.fsPath;
    let predicate = item.name;
    let position = item.range.start;

    await LogtalkTerminal.getCallees(file, position, predicate);

    const dir = path.dirname(file);
    const refs = path.join(dir, ".vscode_callees");

    if (fs.existsSync(refs)) {
      const out = fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      const matches = out.matchAll(/Name:(.+);File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        callees.push(
          new CallHierarchyOutgoingCall(
            new CallHierarchyItem(
              SymbolKind.Function,
              match[1],
              "",
              Uri.file(match[2]),
              new Range(new Position(parseInt(match[3]) - 1, 0), new Position(parseInt(match[3]) - 1, 0)),
              new Range(new Position(parseInt(match[3]) - 1, 0), new Position(parseInt(match[3]) - 1, 0))
            ),
            fromRanges
          )
        );
      }
    } else {
      console.log('references not found');
    }

    return callees;
  }

}
