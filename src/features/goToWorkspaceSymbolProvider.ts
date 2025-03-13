"use strict";

import {
  CancellationToken,
  WorkspaceSymbolProvider,
  Location,
  SymbolInformation,
  SymbolKind,
  workspace
} from "vscode";

export class LogtalkWorkspaceSymbolProvider implements WorkspaceSymbolProvider {
  public async provideWorkspaceSymbols(
    query: string,
    token: CancellationToken
  ): Promise<SymbolInformation[]> {
    var symbols = [];

    const object_re   = /^(?:\:- object\()([^(),.]+(\(.*\))?)/;
    const protocol_re = /^(?:\:- protocol\()([^(),.]+(\(.*\))?)/;
    const category_re = /^(?:\:- category\()([^(),.]+(\(.*\))?)/;

    const public_predicate_re    = /(?:\s*\:- public\()(\w+[/]\d+)/;
    const protected_predicate_re = /(?:\s*\:- protected\()(\w+[/]\d+)/;
    const private_predicate_re   = /(?:\s*\:- private\()(\w+[/]\d+)/;

    const public_non_terminal_re    = /(?:\s*\:- public\()(\w+[/][/]\d+)/;
    const protected_non_terminal_re = /(?:\s*\:- protected\()(\w+[/][/]\d+)/;
    const private_non_terminal_re   = /(?:\s*\:- private\()(\w+[/][/]\d+)/;

    let found;

    const docs = await workspace.findFiles('**/*.{lgt,logtalk}');
    for (var i = 0; i < docs.length; i++) {
      try {
        const doc = await workspace.openTextDocument(docs[i]);
        for (var j = 0; j < doc.lineCount; j++) {
          var line = doc.lineAt(j);
          if (found = line.text.match(object_re)) {
            symbols.push(new SymbolInformation(found[1], SymbolKind.Class, "object", new Location(doc.uri, line.range)))
          } else if (found = line.text.match(protocol_re)) {
            symbols.push(new SymbolInformation(found[1], SymbolKind.Interface, "protocol", new Location(doc.uri, line.range)))
          } else if (found = line.text.match(category_re)) {
            symbols.push(new SymbolInformation(found[1], SymbolKind.Struct, "category", new Location(doc.uri, line.range)))
          } else if (found = line.text.match(public_predicate_re)) {
            symbols.push(new SymbolInformation(found[1], SymbolKind.Function, "public predicate", new Location(doc.uri, line.range)))
          } else if (found = line.text.match(protected_predicate_re)) {
            symbols.push(new SymbolInformation(found[1], SymbolKind.Function, "protected predicate", new Location(doc.uri, line.range)))
          } else if (found = line.text.match(private_predicate_re)) {
            symbols.push(new SymbolInformation(found[1], SymbolKind.Function, "private predicate", new Location(doc.uri, line.range)))
          } else if (found = line.text.match(public_non_terminal_re)) {
            symbols.push(new SymbolInformation(found[1], SymbolKind.Field, "public non-terminal", new Location(doc.uri, line.range)))
          } else if (found = line.text.match(protected_non_terminal_re)) {
            symbols.push(new SymbolInformation(found[1], SymbolKind.Field, "protected non-terminal", new Location(doc.uri, line.range)))
          } else if (found = line.text.match(private_non_terminal_re)) {
            symbols.push(new SymbolInformation(found[1], SymbolKind.Field, "private non-terminal", new Location(doc.uri, line.range)))
          }
        }
      } catch(err) {
        console.log("failed to open " + docs[i]);
      }
    }

    return symbols;
  }
}
