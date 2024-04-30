"use strict";

import {
  ProviderResult,
  CancellationToken,
  TypeHierarchyProvider,
  TypeHierarchyItem,
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

export class LogtalkTypeHierarchyProvider implements TypeHierarchyProvider {
  public prepareTypeHierarchy(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): ProviderResult<TypeHierarchyItem> {
    let entity = Utils.getEntityNameUnderCursor(doc, position);
    if (!entity) {
      return null;
    } else {
      return new TypeHierarchyItem(
        SymbolKind.Function,
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
    let file = item.uri.path;
    let entity = item.name;

    await LogtalkTerminal.getAncestors(file, entity);

    const dir = path.dirname(file);
    const refs = path.join(dir, ".vscode_ancestors");

    if (fs.existsSync(refs)) {
      let out = await fs.readFileSync(refs).toString();
      fsp.rm(refs, { force: true });
      let matches = out.matchAll(/Name:(.+);File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        ancestors.push(
          new TypeHierarchyItem(
            SymbolKind.Function,
            match[1],
            "",
            Uri.file(match[2]),
            new Range(new Position(parseInt(match[3]) - 1, 0), new Position(parseInt(match[3]) - 1, 0)),
            new Range(new Position(parseInt(match[3]) - 1, 0), new Position(parseInt(match[3]) - 1, 0))
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
    let file = item.uri.path;
    let entity = item.name;

    await LogtalkTerminal.getDescendants(file, entity);

    const dir = path.dirname(file);
    const refs = path.join(dir, ".vscode_descendants");

    if (fs.existsSync(refs)) {
      let out = await fs.readFileSync(refs).toString();
      fsp.rm(refs, { force: true });
      let matches = out.matchAll(/Name:(.+);File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        descendants.push(
          new TypeHierarchyItem(
            SymbolKind.Function,
            match[1],
            "",
            Uri.file(match[2]),
            new Range(new Position(parseInt(match[3]) - 1, 0), new Position(parseInt(match[3]) - 1, 0)),
            new Range(new Position(parseInt(match[3]) - 1, 0), new Position(parseInt(match[3]) - 1, 0))
          )
        );
      }
    } else {
      console.log('descendants not found');
    }

    return descendants;
  }

}
