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
import { ArgumentUtils } from "../utils/argumentUtils";
import { PredicateUtils } from "../utils/predicateUtils";

export class LogtalkDocumentSymbolProvider implements DocumentSymbolProvider {
  public provideDocumentSymbols(
    doc: TextDocument,
    token: CancellationToken
  ): Thenable<DocumentSymbol[]> {
    return new Promise((resolve, reject) => {
      const symbols: DocumentSymbol[] = [];

      let entity: DocumentSymbol | undefined;

      // Track predicates and non-terminals by indicator to handle same name, different arity
      const seenPredicates = new Set<string>();
      const seenNonTerminals = new Set<string>();

      let i = 0;
      while (i < doc.lineCount) {
        // Check for cancellation at each iteration
        if (token.isCancellationRequested) {
          return resolve([]);
        }

        const line = doc.lineAt(i);
        const lineText = line.text;

        // Performance optimization: Check if line starts with ":- " (with optional whitespace before)
        // before attempting to match directive patterns
        const startsWithDirective = /^\s*:-\s/.test(lineText);

        if (startsWithDirective) {
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

            // Create entity indicator: use atom name if no arguments, or name/arity if compound term
            const entityName = entityMatch.match[1];
            let entityIndicator: string;

            // Check if it's a compound term by looking for parentheses
            if (entityName.includes('(') && entityName.includes(')')) {
              // Compound term - extract name and count arguments
              const openParenPos = entityName.indexOf('(');
              const name = entityName.substring(0, openParenPos);
              const args = ArgumentUtils.extractArgumentsFromCall(entityName);
              entityIndicator = `${name}/${args.length}`;
            } else {
              // Simple atom
              entityIndicator = entityName;
            }

            entity = new DocumentSymbol(
              entityIndicator,
              entityMatch.type,
              symbolKind,
              new Range(new Position(i, 0), new Position(j, endLength)),
              new Range(line.range.start, line.range.end)
            );
            symbols.push(entity);

            // Skip only past the opening directive, not the entire entity
            const openingDirectiveRange = PredicateUtils.getDirectiveRange(doc, i);
            i = openingDirectiveRange.end + 1; // Move to the line after the opening directive
            continue;
          }

          // Check for entity ending directives to reset tracking
          if (entity && (lineText.match(SymbolRegexes.endObject) || lineText.match(SymbolRegexes.endCategory))) {
            seenPredicates.clear();
            seenNonTerminals.clear();
            entity = null; // Reset entity tracking
            i++; // Move to next line
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
              i++; // Move to next line
              continue;
            }

            // Check for multi-line/multi-predicate scope directive openings
            const scopeOpening = SymbolUtils.matchScopeDirectiveOpening(lineText);
            if (scopeOpening) {
              // Get the complete directive range
              const directiveRange = PredicateUtils.getDirectiveRange(doc, i);

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

              // Skip to the end of the directive using the range function
              i = directiveRange.end + 1; // Move to the line after the directive
              continue;
            }
          }
        }

        // Check for predicate clauses and non-terminal rules (only if inside an entity)
        if (entity) {
          // Performance optimization: Check for DCG operator first since most files don't contain grammar rules
          if (lineText.includes('-->')) {
            const nonTerminalHead = SymbolUtils.extractCompleteNonTerminalHead(lineText);
            if (nonTerminalHead) {
              const nonTerminalIndicator = SymbolUtils.extractNonTerminalIndicator(nonTerminalHead);
              if (nonTerminalIndicator && !seenNonTerminals.has(nonTerminalIndicator)) {
                seenNonTerminals.add(nonTerminalIndicator);
                entity.children.push(new DocumentSymbol(
                  nonTerminalIndicator,
                  SymbolTypes.NON_TERMINAL_RULE,
                  SymbolKind.Property,
                  new Range(line.range.start, line.range.end),
                  new Range(line.range.start, line.range.end)
                ));
              }
              // Skip to the end of the clause
              const clauseRange = PredicateUtils.getClauseRange(doc, i);
              i = clauseRange.end + 1; // Move to the line after the rule
              continue;
            }
          } else {
            // Check if this could be a predicate clause (not a directive)
            if (!startsWithDirective) {
              const predicateHead = SymbolUtils.extractCompletePredicateHead(lineText);
              if (predicateHead) {
                const predicateIndicator = SymbolUtils.extractPredicateIndicator(predicateHead);
                if (predicateIndicator && !seenPredicates.has(predicateIndicator)) {
                  seenPredicates.add(predicateIndicator);
                  entity.children.push(new DocumentSymbol(
                    predicateIndicator,
                    SymbolTypes.PREDICATE_CLAUSE,
                    SymbolKind.Property,
                    new Range(line.range.start, line.range.end),
                    new Range(line.range.start, line.range.end)
                  ));
                }
                // Skip to the end of the clause
                const clauseRange = PredicateUtils.getClauseRange(doc, i);
                i = clauseRange.end + 1; // Move to the line after the clause
                continue;
              }
            }
          }
        }

        // Advance to next line
        i++;
      }

      resolve(symbols);
    });
  }


}
