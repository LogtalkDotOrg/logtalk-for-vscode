import {
  CancellationToken,
  DocumentSymbolProvider,
  Location,
  Position,
  Range,
  TextDocument,
  SymbolInformation,
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
  
    await LogtalkTerminal.getSymbols(doc);
  
    const dir = path.dirname(doc.uri.fsPath);
    const triples = path.join(dir, ".symbols_done");
  
    if (fs.existsSync(triples)) {
      let out = await fs.readFileSync(triples).toString();
      fsp.rm(triples, { force: true });
      let matches = out.matchAll(/Symbol:(\w+);Kind:(\d+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        symbols.push({
            name: match[1],
            kind: parseInt(match[2]),
            location: new Location(doc.uri, new Range(new Position(parseInt(match[3]) - 1, 0), new Position(parseInt(match[3]) - 1, 0)))
        })
      }
    }
  
    return symbols;
  }
}
