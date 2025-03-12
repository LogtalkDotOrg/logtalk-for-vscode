"use strict";

import {
  CancellationToken,
  DocumentSymbolProvider,
  DocumentSymbol,
  Range,
  Position,
  TextDocument,
  SymbolKind
} from "vscode";

export class LogtalkDocumentSymbolProvider implements DocumentSymbolProvider {
  public provideDocumentSymbols(
    doc: TextDocument,
    token: CancellationToken
  ): Thenable<DocumentSymbol[]> {
    return new Promise((resolve, reject) => {
      var symbols = [];

      const object_re   = /^(?:\:- object\()([^(),.]+(\(.*\))?)/;
      const protocol_re = /^(?:\:- protocol\()([^(),.]+(\(.*\))?)/;
      const category_re = /^(?:\:- category\()([^(),.]+(\(.*\))?)/;

      const end_object_re   = /^(?:\:- end_object\.)/;
      const end_protocol_re = /^(?:\:- end_protocol\.)/;
      const end_category_re = /^(?:\:- end_category\.)/;

      const public_predicate_re    = /(?:\s*\:- public\()(\w+[/]\d+)/;
      const protected_predicate_re = /(?:\s*\:- protected\()(\w+[/]\d+)/;
      const private_predicate_re   = /(?:\s*\:- private\()(\w+[/]\d+)/;

      const public_non_terminal_re    = /(?:\s*\:- public\()(\w+[/][/]\d+)/;
      const protected_non_terminal_re = /(?:\s*\:- protected\()(\w+[/][/]\d+)/;
      const private_non_terminal_re   = /(?:\s*\:- private\()(\w+[/][/]\d+)/;

      let found;
      let entity;

      for (var i = 0; i < doc.lineCount; i++) {
        var line = doc.lineAt(i);
        if (found = line.text.match(object_re)) {
          var j = LogtalkDocumentSymbolProvider.findEndEntityDirectivePosition(doc, i, end_object_re);
          entity = new DocumentSymbol(found[1], "object", SymbolKind.Class, new Range(new Position(i,0), new Position(j,13)), new Range(line.range.start, line.range.end));
          symbols.push(entity)
        } else if (found = line.text.match(protocol_re)) {
          var j = LogtalkDocumentSymbolProvider.findEndEntityDirectivePosition(doc, i, end_protocol_re);
          entity = new DocumentSymbol(found[1], "protocol", SymbolKind.Interface, new Range(new Position(i,0), new Position(j,15)), new Range(line.range.start, line.range.end));
          symbols.push(entity)
        } else if (found = line.text.match(category_re)) {
          var j = LogtalkDocumentSymbolProvider.findEndEntityDirectivePosition(doc, i, end_category_re);
          entity = new DocumentSymbol(found[1], "category", SymbolKind.Struct, new Range(new Position(i,0), new Position(j,15)), new Range(line.range.start, line.range.end));
          symbols.push(entity)
        } else if (entity && (found = line.text.match(public_predicate_re))) {
          entity.children.push(new DocumentSymbol(found[1], "public predicate", SymbolKind.Function, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        } else if (entity && (found = line.text.match(protected_predicate_re))) {
          entity.children.push(new DocumentSymbol(found[1], "protected predicate", SymbolKind.Function, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        } else if (entity && (found = line.text.match(private_predicate_re))) {
          entity.children.push(new DocumentSymbol(found[1], "private predicate", SymbolKind.Function, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        } else if (entity && (found = line.text.match(public_non_terminal_re))) {
          entity.children.push(new DocumentSymbol(found[1], "public non-terminal", SymbolKind.Field, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        } else if (entity && (found = line.text.match(protected_non_terminal_re))) {
          entity.children.push(new DocumentSymbol(found[1], "protected non-terminal", SymbolKind.Field, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        } else if (entity && (found = line.text.match(private_non_terminal_re))) {
          entity.children.push(new DocumentSymbol(found[1], "private non-terminal", SymbolKind.Field, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        }
      }

      resolve(symbols);
    });
  }

  private static findEndEntityDirectivePosition(doc: TextDocument, i: number, regex: RegExp): number {
    var j = i + 1;
    let end_entity = false;
    while (!end_entity && j < doc.lineCount) {
      var line = doc.lineAt(j);
      if (line.text.match(regex)) {
        end_entity = true;
      } else {
        j++;
      }
    }
    return j;
  }
}
