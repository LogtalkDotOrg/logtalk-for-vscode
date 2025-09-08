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
import { SymbolRegexes, SymbolTypes, SymbolUtils, PatternSets } from "../utils/symbols";

export class LogtalkDocumentSymbolProvider implements DocumentSymbolProvider {
  public provideDocumentSymbols(
    doc: TextDocument,
    token: CancellationToken
  ): Thenable<DocumentSymbol[]> {
    return new Promise((resolve, reject) => {
      const symbols: DocumentSymbol[] = [];

      let entity: DocumentSymbol | undefined;

      // Track predicates and non-terminals to only add first clause
      const seenPredicates = new Set<string>();
      const seenNonTerminals = new Set<string>();
      // Track if we're inside a multi-line term
      let insideTerm = false;

      for (let i = 0; i < doc.lineCount; i++) {
        const line = doc.lineAt(i);
        const lineText = line.text;

        // Check for entity opening directives
        const entityMatch = SymbolUtils.matchFirst(lineText, PatternSets.entityOpening);
        if (entityMatch) {
          const endRegex = entityMatch.type === SymbolTypes.OBJECT ? SymbolRegexes.endObject :
                          entityMatch.type === SymbolTypes.PROTOCOL ? SymbolRegexes.endProtocol :
                          SymbolRegexes.endCategory;
          const j = SymbolUtils.findEndEntityDirectivePosition(doc, i, endRegex);
          const symbolKind = entityMatch.type === SymbolTypes.OBJECT ? SymbolKind.Class :
                            entityMatch.type === SymbolTypes.PROTOCOL ? SymbolKind.Interface :
                            SymbolKind.Struct;
          const endLength = entityMatch.type === SymbolTypes.OBJECT ? 13 : 15;

          entity = new DocumentSymbol(
            entityMatch.match[1],
            entityMatch.type,
            symbolKind,
            new Range(new Position(i, 0), new Position(j, endLength)),
            new Range(line.range.start, line.range.end)
          );
          symbols.push(entity);
          continue;
        }

        // Check for entity ending directives to reset tracking
        if (entity && (lineText.match(SymbolRegexes.endObject) || lineText.match(SymbolRegexes.endCategory))) {
          seenPredicates.clear();
          seenNonTerminals.clear();
          continue;
        }

        // Check for scope directives
        if (entity) {
          // First try single-predicate scope directives
          const scopeMatch = SymbolUtils.matchFirst(lineText, PatternSets.allScopes);
          if (scopeMatch) {
            const symbolKind = scopeMatch.type.includes('non-terminal') ? SymbolKind.Field : SymbolKind.Function;
            entity.children.push(new DocumentSymbol(
              scopeMatch.match[1],
              scopeMatch.type,
              symbolKind,
              new Range(line.range.start, line.range.end),
              new Range(line.range.start, line.range.end)
            ));
            continue;
          }

          // Check for multi-line/multi-predicate scope directive openings
          const scopeOpening = SymbolUtils.matchScopeDirectiveOpening(lineText);
          if (scopeOpening) {
            // Collect the complete directive text
            const { text: directiveText, endLine } = SymbolUtils.collectScopeDirectiveText(doc, i);

            // Extract all predicate/non-terminal indicators from the directive
            const indicators = SymbolUtils.extractIndicatorsFromScopeDirective(directiveText);

            // Create symbols for each indicator
            for (const { indicator, isNonTerminal } of indicators) {
              const baseType = scopeOpening.type;
              const symbolType = isNonTerminal
                ? baseType.replace('predicate', 'non-terminal')
                : baseType;
              const symbolKind = isNonTerminal ? SymbolKind.Field : SymbolKind.Function;

              entity.children.push(new DocumentSymbol(
                indicator,
                symbolType,
                symbolKind,
                new Range(new Position(i, 0), new Position(endLine, doc.lineAt(endLine).text.length)),
                new Range(line.range.start, line.range.end)
              ));
            }

            // Skip to the end of the directive
            i = endLine;
            continue;
          }

          // Check for predicate clauses (only if not inside a multi-line term)
          if (!insideTerm) {
            const predicateMatch = lineText.match(SymbolRegexes.predicateClause);
            if (predicateMatch) {
              const predicateName = SymbolUtils.extractPredicateName(predicateMatch[1]);
              if (predicateName && !seenPredicates.has(predicateName)) {
                seenPredicates.add(predicateName);
                entity.children.push(new DocumentSymbol(
                  predicateMatch[1],
                  SymbolTypes.PREDICATE_CLAUSE,
                  SymbolKind.Property,
                  new Range(line.range.start, line.range.end),
                  new Range(line.range.start, line.range.end)
                ));
              }
              continue;
            }

            // Check for non-terminal rules (only if not inside a multi-line term)
            const nonTerminalMatch = lineText.match(SymbolRegexes.nonTerminalRule);
            if (nonTerminalMatch) {
              const nonTerminalName = SymbolUtils.extractNonTerminalName(nonTerminalMatch[1]);
              if (nonTerminalName && !seenNonTerminals.has(nonTerminalName)) {
                seenNonTerminals.add(nonTerminalName);
                entity.children.push(new DocumentSymbol(
                  nonTerminalMatch[1],
                  SymbolTypes.NON_TERMINAL_RULE,
                  SymbolKind.Property,
                  new Range(line.range.start, line.range.end),
                  new Range(line.range.start, line.range.end)
                ));
              }
              continue;
            }
          }
        }

        // Update inside_term state based on line ending
        insideTerm = SymbolUtils.isContinuationLine(lineText);
      }

      resolve(symbols);
    });
  }


}
