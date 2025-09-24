"use strict";

import {
  CancellationToken,
  WorkspaceSymbolProvider,
  Location,
  SymbolInformation,
  SymbolKind,
  workspace
} from "vscode";
import { getLogger } from "../utils/logger";
import { SymbolTypes, SymbolUtils, PatternSets } from "../utils/symbols";
import { PredicateUtils } from "../utils/predicateUtils";
import { ArgumentUtils } from "../utils/argumentUtils";

export class LogtalkWorkspaceSymbolProvider implements WorkspaceSymbolProvider {
  private logger = getLogger();

  public async provideWorkspaceSymbols(
    query: string,
    token: CancellationToken
  ): Promise<SymbolInformation[]> {
    const symbols: SymbolInformation[] = [];

    const docs = await workspace.findFiles('**/*.{lgt,logtalk}');
    for (let i = 0; i < docs.length; i++) {
      // Check for cancellation before processing each file
      if (token.isCancellationRequested) {
        return [];
      }

      try {
        const doc = await workspace.openTextDocument(docs[i]);

        // Track current entity and predicates/non-terminals per entity
        let currentEntity: string | null = null;
        let currentEntityType: string | null = null;
        const entityPredicates = new Map<string, Set<string>>(); // entity -> set of predicate indicators
        const entityNonTerminals = new Map<string, Set<string>>(); // entity -> set of non-terminal indicators

        let j = 0;
        while (j < doc.lineCount) {
          // Check for cancellation at each iteration
          if (token.isCancellationRequested) {
            return [];
          }

          const line = doc.lineAt(j);
          const lineText = line.text;

          // Performance optimization: Check if line starts with ":- " (with optional whitespace before)
          // before attempting to match directive patterns
          const startsWithDirective = /^\s*:-\s/.test(lineText);

          if (startsWithDirective) {
            // Check for entity opening directives
            const entityMatch = SymbolUtils.matchFirst(lineText, PatternSets.entityOpening);
            if (entityMatch) {
              const symbolKind = entityMatch.type === SymbolTypes.OBJECT ? SymbolKind.Class :
                                entityMatch.type === SymbolTypes.PROTOCOL ? SymbolKind.Interface :
                                SymbolKind.Struct;

              // Create entity indicator: use atom name if no arguments, or name/arity if compound term
              const entityName = entityMatch.match[1];
              let entityIndicator: string;

              // Check if it's a compound term by looking for parentheses
              if (entityName.includes('(') && entityName.includes(')')) {
                // Compound term - extract name and count arguments
                const openParenPos = entityName.indexOf('(');
                let name = entityName.substring(0, openParenPos);
                // Escape single quotes if the name starts with one
                if (name.startsWith("'")) {
                  name = name.replace(/'/g, "\u0027"); // Replace with Unicode escape
                }
                const args = ArgumentUtils.extractArgumentsFromCall(entityName);
                entityIndicator = `${name}/${args.length}`;
              } else {
                // Simple atom - escape single quotes if it starts with one
                if (entityName.startsWith("'")) {
                  entityIndicator = entityName.replace(/'/g, "\u0027"); // Replace with Unicode escape
                } else {
                  entityIndicator = entityName;
                }
              }

              currentEntity = entityIndicator;
              currentEntityType = entityMatch.type;
              entityPredicates.set(currentEntity, new Set<string>());
              entityNonTerminals.set(currentEntity, new Set<string>());

              symbols.push(new SymbolInformation(
                entityIndicator,
                symbolKind,
                entityMatch.type,
                new Location(doc.uri, line.range)
              ));
              // Skip only past the opening directive, not the entire entity
              const openingDirectiveRange = PredicateUtils.getDirectiveRange(doc, j);
              j = openingDirectiveRange.end + 1; // Move to the line after the opening directive
              continue;
            }

            // Check for entity ending directives to reset tracking
            const entityEndMatch = SymbolUtils.matchFirst(lineText, PatternSets.entityEnding);
            if (entityEndMatch) {
              currentEntity = null;
              currentEntityType = null;
              j++; // Move to next line
              continue;
            }

            // Check for scope directives
            // First try single-predicate scope directives
            let escapedIndicator: string;
            const scopeMatch = SymbolUtils.matchFirst(lineText, PatternSets.allScopes);
            if (scopeMatch) {
              escapedIndicator = scopeMatch.match[1];
              // Escape single quotes if the name starts with one
              if (escapedIndicator.startsWith("'")) {
                escapedIndicator = escapedIndicator.replace(/'/g, "\u0027"); // Replace with Unicode escape
              }
              const symbolKind = scopeMatch.type.includes('non-terminal') ? SymbolKind.Field : SymbolKind.Function;
              const containerName = currentEntity ? `${scopeMatch.type} • ${currentEntity} (${currentEntityType})` : scopeMatch.type;
              symbols.push(new SymbolInformation(
                escapedIndicator,
                symbolKind,
                containerName,
                new Location(doc.uri, line.range)
              ));
              j++; // Move to next line
              continue;
            }

            // Check for multi-line/multi-predicate scope directive openings
            const scopeOpening = SymbolUtils.matchScopeDirectiveOpening(lineText);
            if (scopeOpening) {
              // Get the complete directive range
              const directiveRange = PredicateUtils.getDirectiveRange(doc, j);

              // Collect the complete directive text
              const { text: directiveText } = SymbolUtils.collectScopeDirectiveText(doc, j);

              // Extract all predicate/non-terminal indicators from the directive
              const indicators = SymbolUtils.extractIndicatorsFromScopeDirective(directiveText);

              // Create symbols for each indicator
              for (const { indicator, isNonTerminal } of indicators) {
                escapedIndicator = indicator;
                // Escape single quotes if the indicator starts with one
                if (indicator.startsWith("'")) {
                  escapedIndicator = indicator.replace(/'/g, "\u0027"); // Replace with Unicode escape
                }
                const baseType = scopeOpening.type;
                const symbolType = isNonTerminal
                  ? baseType.replace('predicate', 'non-terminal')
                  : baseType;
                const symbolKind = isNonTerminal ? SymbolKind.Field : SymbolKind.Function;
                const containerName = currentEntity ? `${symbolType} • ${currentEntity} (${currentEntityType})` : symbolType;

                symbols.push(new SymbolInformation(
                  escapedIndicator,
                  symbolKind,
                  containerName,
                  new Location(doc.uri, line.range)
                ));
              }

              // Skip to the end of the directive using the range function
              j = directiveRange.end + 1; // Move to the line after the directive
              continue;
            }
          }

          // Check for predicate clauses and non-terminal rules (only if inside an entity)
          if (currentEntity) {
            // Performance optimization: Check for DCG operator first since most files don't contain grammar rules
            if (lineText.includes('-->')) {
              const nonTerminalHead = SymbolUtils.extractCompleteNonTerminalHead(lineText);
              if (nonTerminalHead) {
                const nonTerminalIndicator = SymbolUtils.extractNonTerminalIndicator(nonTerminalHead);
                if (nonTerminalIndicator) {
                  let escapedIndicator = nonTerminalIndicator;
                  // Escape single quotes if the indicator starts with one
                  if (nonTerminalIndicator.startsWith("'")) {
                    escapedIndicator = nonTerminalIndicator.replace(/'/g, "\u0027"); // Replace with Unicode escape
                  }
                  const entityNonTerminalSet = entityNonTerminals.get(currentEntity);
                  if (entityNonTerminalSet && !entityNonTerminalSet.has(nonTerminalIndicator)) {
                    entityNonTerminalSet.add(nonTerminalIndicator);
                    const containerName = `${SymbolTypes.NON_TERMINAL_RULE} • ${currentEntity} (${currentEntityType})`;
                    symbols.push(new SymbolInformation(
                      escapedIndicator,
                      SymbolKind.Property,
                      containerName,
                      new Location(doc.uri, line.range)
                    ));
                  }
                }
                // Skip to the end of the clause
                const clauseRange = PredicateUtils.getClauseRange(doc, j);
                j = clauseRange.end + 1; // Move to the line after the clause
                continue;
              }
            } else {
              // Check if this could be a predicate clause (not a directive)
              if (!startsWithDirective) {
                const predicateHead = SymbolUtils.extractCompletePredicateHead(lineText);
                if (predicateHead) {
                  const predicateIndicator = SymbolUtils.extractPredicateIndicator(predicateHead);
                  if (predicateIndicator) {
                    let escapedIndicator = predicateIndicator;
                    // Escape single quotes if the indicator starts with one
                    if (predicateIndicator.startsWith("'")) {
                      escapedIndicator = predicateIndicator.replace(/'/g, "\u0027"); // Replace with HTML entity
                    }
                    const entityPredicateSet = entityPredicates.get(currentEntity);
                    if (entityPredicateSet && !entityPredicateSet.has(predicateIndicator)) {
                      entityPredicateSet.add(predicateIndicator);
                      const containerName = `${SymbolTypes.PREDICATE_CLAUSE} • ${currentEntity} (${currentEntityType})`;
                      symbols.push(new SymbolInformation(
                        escapedIndicator,
                        SymbolKind.Property,
                        containerName,
                        new Location(doc.uri, line.range)
                      ));
                    }
                  }
                  // Skip to the end of the clause
                  const clauseRange = PredicateUtils.getClauseRange(doc, j);
                  j = clauseRange.end + 1; // Move to the line after the clause
                  continue;
                }
              }
            }
          }

          // Advance to next line
          j++;
        }
      } catch(err) {
        this.logger.debug("failed to open " + docs[i]);
      }
    }

    return symbols;
  }
}
