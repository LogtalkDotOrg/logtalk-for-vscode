import {
  CancellationToken,
  DocumentSymbolProvider,
  Location,
  Position,
  Range,
  TextDocument,
  SymbolInformation,
  SymbolKind,
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

export class LogtalkDocumentSymbolProvider implements DocumentSymbolProvider {
  public async provideDocumentSymbols(
    doc: TextDocument,
    token: CancellationToken
  ): Promise<SymbolInformation[]> {
    var symbols = [];
  
    let ro = /(?:\:- object\()([^(),.]+(\(.*\))?)/;
    let rp = /(?:\:- protocol\()([^(),.]+(\(.*\))?)/;
    let rc = /(?:\:- category\()([^(),.]+(\(.*\))?)/;
  
    for (var i = 0; i < doc.lineCount; i++) {
      var line = doc.lineAt(i);
      if (line.text.startsWith(":- object(")) {
        const found = line.text.match(ro);
        symbols.push(new SymbolInformation(found[1], SymbolKind.Object, "object", new Location(doc.uri, line.range)))
      } else if (line.text.startsWith(":- protocol(")) {
        const found = line.text.match(rp);
        symbols.push(new SymbolInformation(found[1], SymbolKind.Interface, "protocol", new Location(doc.uri, line.range)))
      } else if (line.text.startsWith(":- category(")) {
        const found = line.text.match(rc);
        symbols.push(new SymbolInformation(found[1], SymbolKind.Package, "category", new Location(doc.uri, line.range)))
      }
    }
  
    return symbols;
  }
}
