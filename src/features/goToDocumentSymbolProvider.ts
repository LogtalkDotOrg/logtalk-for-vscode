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

      // Match entity opening directive
      const object_re   = /^(?:\:- object\()([^(),.]+(\(.*\))?)/;
      const protocol_re = /^(?:\:- protocol\()([^(),.]+(\(.*\))?)/;
      const category_re = /^(?:\:- category\()([^(),.]+(\(.*\))?)/;
      // Match entity ending directive
      const end_object_re   = /^(?:\:- end_object\.)/;
      const end_protocol_re = /^(?:\:- end_protocol\.)/;
      const end_category_re = /^(?:\:- end_category\.)/;
      // Match predicate scope directive
      const public_predicate_re    = /(?:\s*\:- public\()(\w+[/]\d+)/;
      const protected_predicate_re = /(?:\s*\:- protected\()(\w+[/]\d+)/;
      const private_predicate_re   = /(?:\s*\:- private\()(\w+[/]\d+)/;
      // Match non-terminal scope directive
      const public_non_terminal_re    = /(?:\s*\:- public\()(\w+[/][/]\d+)/;
      const protected_non_terminal_re = /(?:\s*\:- protected\()(\w+[/][/]\d+)/;
      const private_non_terminal_re   = /(?:\s*\:- private\()(\w+[/][/]\d+)/;
      // Match predicate clause (rule head or fact)
      const predicate_clause_re = /^\s*(\w+\([^)]*\))\s*(?::-|\.)$/;
      // Match non-terminal rule using the --> operator
      const non_terminal_rule_re = /^\s*(\w+\([^)]*\))\s*-->/;
      // Match a line ending with a comma or semicolon, optionally followed by a comment
      const continuation_re = /^\s*.*[,;]\s*(?:%.*)?$/;

      let found: string[];
      let entity: DocumentSymbol;

      // Track predicates and non-terminals to only add first clause
      let seenPredicates = new Set();
      let seenNonTerminals = new Set();
      // Track if we're inside a multi-line term
      let inside_term = false;

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
        } else if (entity && (line.text.match(end_object_re) || line.text.match(end_category_re))) {
          seenPredicates = new Set();
          seenNonTerminals = new Set();
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
        } else if (entity && !inside_term && (found = line.text.match(predicate_clause_re))) {
          // Extract name and arity from the predicate clause
          const match = found[1].match(/(\w+)\s*\([^)]*\)/);
          if (match) {
            const name = match[1];
            if (!seenPredicates.has(name)) {
              seenPredicates.add(name);
              entity.children.push(new DocumentSymbol(found[1], "predicate clause", SymbolKind.Property, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)));
            }
          }
        } else if (entity && !inside_term && (found = line.text.match(non_terminal_rule_re))) {
          // Extract name from the non-terminal rule
          const match = found[1].match(/(\w+)\s*\(/);
          if (match) {
            const name = match[1];
            if (!seenNonTerminals.has(name)) {
              seenNonTerminals.add(name);
              entity.children.push(new DocumentSymbol(found[1], "non-terminal rule", SymbolKind.Property, new Range(line.range.start, line.range.end), new Range(line.range.start, line.range.end)));
            }
          }
        }
        // Update inside_term state based on line ending
        if (line.text.match(continuation_re)) {
          inside_term = true;
        } else {
          inside_term = false;
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
