import {
  CancellationToken,
  WorkspaceSymbolProvider,
  Location,
  Position,
  TextDocument,
  SymbolInformation,
  SymbolKind,
  Uri,
  workspace
} from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import LogtalkTerminal from "./logtalkTerminal";

export class LogtalkWorkspaceSymbolProvider implements WorkspaceSymbolProvider {
  public async provideWorkspaceSymbols(
    query: string
  ): Promise<SymbolInformation[]> {
    var symbols = [];

    await LogtalkTerminal.getSymbols();

    const matcher = query ? new RegExp(query.split("").join(".*"), "i") : /.*/;
    const results = path.join(workspace.rootPath, ".symbols_done");
  
    if (fs.existsSync(results)) {
      let out = await fs.readFileSync(results).toString();
      fsp.rm(results, { force: true });
      let matches = out.matchAll(/Symbol:(\w+);Kind:(\d+);Line:(\d+);File:([^\r\n]+)/g);
      var match = null;
      for (match of matches) {
        if (match[1].match(matcher)) {
          symbols.push(new SymbolInformation(match[1], parseInt(match[2]), "", new Location(Uri.file(match[4]), new Position(parseInt(match[3]) - 1, 0))))
        }
      }
    }
    
    return symbols;
  }
}
