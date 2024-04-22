import {
  CancellationToken,
  DocumentSymbolProvider,
  Location,
  TextDocument,
  SymbolInformation,
  SymbolKind
} from "vscode";

export class LogtalkDocumentSymbolProvider implements DocumentSymbolProvider {
  public provideDocumentSymbols(
    doc: TextDocument,
    token: CancellationToken
  ): Thenable<SymbolInformation[]> {
    return new Promise((resolve, reject) => {
      var symbols = [];

      let ro = /(?:\:- object\()([^(),.]+(\(.*\))?)/;
      let rp = /(?:\:- protocol\()([^(),.]+(\(.*\))?)/;
      let rc = /(?:\:- category\()([^(),.]+(\(.*\))?)/;

      let ppub = /(?:\s*\:- public\()(\w+[/]\d+)/;
      let ppro = /(?:\s*\:- protected\()(\w+[/]\d+)/;
      let ppri = /(?:\s*\:- private\()(\w+[/]\d+)/;

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
          symbols.push(new SymbolInformation(found[1], SymbolKind.Struct, "category", new Location(doc.uri, line.range)))
        } else if (line.text.match(ppub)) {
          const found = line.text.match(ppub);
          symbols.push(new SymbolInformation(found[1], SymbolKind.Function, "public predicate", new Location(doc.uri, line.range)))
        } else if (line.text.match(ppro)) {
          const found = line.text.match(ppro);
          symbols.push(new SymbolInformation(found[1], SymbolKind.Function, "protected predicate", new Location(doc.uri, line.range)))
        } else if (line.text.match(ppri)) {
          const found = line.text.match(ppri);
          symbols.push(new SymbolInformation(found[1], SymbolKind.Function, "private predicate", new Location(doc.uri, line.range)))
        }
      }

      resolve(symbols);
    });
  }
}
