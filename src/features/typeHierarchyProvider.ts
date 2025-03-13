"use strict";

import {
  CancellationToken,
  TypeHierarchyProvider,
  TypeHierarchyItem,
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

export class LogtalkTypeHierarchyProvider implements TypeHierarchyProvider {
  public async prepareTypeHierarchy(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<TypeHierarchyItem> {
    let entity = Utils.getEntityNameUnderCursor(doc, position);
    if (!entity) {
      return null;
    } else {
      let type = await LogtalkTerminal.getType(doc.uri.fsPath, entity);
      let symbol = type == "object" ? SymbolKind.Class : type == "protocol" ? SymbolKind.Interface : SymbolKind.Struct;
      return new TypeHierarchyItem(
        symbol,
        entity,
        "",
        doc.uri,
        new Range(position, position),
        new Range(position, position)
      );
    }
  }

  public async provideTypeHierarchySupertypes(
    item: TypeHierarchyItem,
    token: CancellationToken
  ): Promise<TypeHierarchyItem[]> {
    let ancestors: TypeHierarchyItem[] = [];
    let fromRanges: Range[] = [];
    let file = item.uri.fsPath;
    let entity = item.name;

    await LogtalkTerminal.getAncestors(file, entity);

    const dir = path.dirname(file);
    const refs = path.join(dir, ".vscode_ancestors");

    if (fs.existsSync(refs)) {
      const out = fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      let matches = out.matchAll(/Type:(\w+);Name:(.+);File:(.+);Line:(\d+)/g);
      var match = null;
      var symbol = null;
      for (match of matches) {
        symbol = match[1] == "object" ? SymbolKind.Class : match[1] == "protocol" ? SymbolKind.Interface : SymbolKind.Struct;
        ancestors.push(
          new TypeHierarchyItem(
            symbol,
            match[2],
            "",
            Uri.file(match[3]),
            new Range(new Position(parseInt(match[4]) - 1, 0), new Position(parseInt(match[4]) - 1, 0)),
            new Range(new Position(parseInt(match[4]) - 1, 0), new Position(parseInt(match[4]) - 1, 0))
          )
        );
      }
    } else {
      console.log('ancestors not found');
    }

    return ancestors;
  }

  public async provideTypeHierarchySubtypes(
    item: TypeHierarchyItem,
    token: CancellationToken
  ): Promise<TypeHierarchyItem[]> {
    let descendants: TypeHierarchyItem[] = [];
    let fromRanges: Range[] = [];
    let file = item.uri.fsPath;
    let entity = item.name;

    await LogtalkTerminal.getDescendants(file, entity);

    const dir = path.dirname(file);
    const refs = path.join(dir, ".vscode_descendants");

    if (fs.existsSync(refs)) {
      const out = fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      const matches = out.matchAll(/Type:(\w+);Name:(.+);File:(.+);Line:(\d+)/g);
      var match = null;
      var symbol = null;
      for (match of matches) {
        symbol = match[1] == "object" ? SymbolKind.Class : match[1] == "protocol" ? SymbolKind.Interface : SymbolKind.Struct;
        descendants.push(
          new TypeHierarchyItem(
            symbol,
            match[2],
            "",
            Uri.file(match[3]),
            new Range(new Position(parseInt(match[4]) - 1, 0), new Position(parseInt(match[4]) - 1, 0)),
            new Range(new Position(parseInt(match[4]) - 1, 0), new Position(parseInt(match[4]) - 1, 0))
          )
        );
      }
    } else {
      console.log('descendants not found');
    }

    return descendants;
  }

}
