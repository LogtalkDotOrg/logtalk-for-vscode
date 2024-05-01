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

      let object_re   = /^(?:\:- object\()([^(),.]+(\(.*\))?)/;
      let protocol_re = /^(?:\:- protocol\()([^(),.]+(\(.*\))?)/;
      let category_re = /^(?:\:- category\()([^(),.]+(\(.*\))?)/;

      let end_object_re   = /^(?:\:- end_object\.)/;
      let end_protocol_re = /^(?:\:- end_protocol\.)/;
      let end_category_re = /^(?:\:- end_category\.)/;

      let public_predicate_re    = /(?:\s*\:- public\()(\w+[/]\d+)/;
      let protected_predicate_re = /(?:\s*\:- protected\()(\w+[/]\d+)/;
      let private_predicate_re   = /(?:\s*\:- private\()(\w+[/]\d+)/;

      let public_non_terminal_re    = /(?:\s*\:- public\()(\w+[/][/]\d+)/;
      let protected_non_terminal_re = /(?:\s*\:- protected\()(\w+[/][/]\d+)/;
      let private_non_terminal_re   = /(?:\s*\:- private\()(\w+[/][/]\d+)/;

      let found;
      let entity;
      let end_entity;

      var i = 0;
      var j = 0;
      while ( i < doc.lineCount ) {
        var line = doc.lineAt(i);
        if (found = line.text.match(object_re)) {
          j = i + 1;
          end_entity = false;
          while (!end_entity && j < doc.lineCount) {
            var jline = doc.lineAt(j);
            if (jline.text.match(end_object_re)) {
              end_entity = true;
            } else {
              j++;
            }
          }
          entity = new DocumentSymbol(found[1], "object", SymbolKind.Class, new Range(new Position(i,0), new Position(j,13)), new Range(line.range.start, line.range.end));
          symbols.push(entity)
        } else if (found = line.text.match(protocol_re)) {
          j = i + 1;
          end_entity = false;
          while (!end_entity && j < doc.lineCount) {
            var jline = doc.lineAt(j);
            if (jline.text.match(end_protocol_re)) {
              end_entity = true;
            } else {
              j++;
            }
          }
          entity = new DocumentSymbol(found[1], "protocol", SymbolKind.Interface, new Range(new Position(i,0), new Position(j,15)), new Range(line.range.start, line.range.end));
          symbols.push(entity)
        } else if (found = line.text.match(category_re)) {
          j = i + 1;
          end_entity = false;
          while (!end_entity && j < doc.lineCount) {
            var jline = doc.lineAt(j);
            if (jline.text.match(end_category_re)) {
              end_entity = true;
            } else {
              j++;
            }
          }
          entity = new DocumentSymbol(found[1], "category", SymbolKind.Struct, new Range(new Position(i,0), new Position(j,15)), new Range(line.range.start, line.range.end));
          symbols.push(entity)
        } else if (found = line.text.match(public_predicate_re)) {
          entity.children.push(new DocumentSymbol(found[1], "public predicate", SymbolKind.Function, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        } else if (found = line.text.match(protected_predicate_re)) {
          entity.children.push(new DocumentSymbol(found[1], "protected predicate", SymbolKind.Function, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        } else if (found = line.text.match(private_predicate_re)) {
          entity.children.push(new DocumentSymbol(found[1], "private predicate", SymbolKind.Function, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        } else if (found = line.text.match(public_non_terminal_re)) {
          entity.children.push(new DocumentSymbol(found[1], "public non-terminal", SymbolKind.Field, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        } else if (found = line.text.match(protected_non_terminal_re)) {
          entity.children.push(new DocumentSymbol(found[1], "protected non-terminal", SymbolKind.Field, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        } else if (found = line.text.match(private_non_terminal_re)) {
          entity.children.push(new DocumentSymbol(found[1], "private non-terminal", SymbolKind.Field, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)))
        }
        i++;
      }

      resolve(symbols);
    });
  }
}
