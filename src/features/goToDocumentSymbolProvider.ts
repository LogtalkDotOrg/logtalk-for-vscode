"use strict";

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

      let object_re   = /^(?:\:- object\()([^(),.]+(\(.*\))?)/;
      let protocol_re = /^(?:\:- protocol\()([^(),.]+(\(.*\))?)/;
      let category_re = /^(?:\:- category\()([^(),.]+(\(.*\))?)/;

      let public_predicate_re    = /(?:\s*\:- public\()(\w+[/]\d+)/;
      let protected_predicate_re = /(?:\s*\:- protected\()(\w+[/]\d+)/;
      let private_predicate_re   = /(?:\s*\:- private\()(\w+[/]\d+)/;

      let public_non_terminal_re    = /(?:\s*\:- public\()(\w+[/][/]\d+)/;
      let protected_non_terminal_re = /(?:\s*\:- protected\()(\w+[/][/]\d+)/;
      let private_non_terminal_re   = /(?:\s*\:- private\()(\w+[/][/]\d+)/;

      let found;

      for (var i = 0; i < doc.lineCount; i++) {
        var line = doc.lineAt(i);
        if (found = line.text.match(object_re)) {
          symbols.push(new SymbolInformation(found[1], SymbolKind.Object, "object", new Location(doc.uri, line.range)))
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

      resolve(symbols);
    });
  }
}
