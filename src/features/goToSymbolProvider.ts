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

      resolve(symbols);
    });
  }
}
