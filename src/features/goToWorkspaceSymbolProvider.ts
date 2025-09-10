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
import { SymbolRegexes, SymbolTypes, SymbolUtils, PatternSets } from "../utils/symbols";

export class LogtalkWorkspaceSymbolProvider implements WorkspaceSymbolProvider {
  private logger = getLogger();

  public async provideWorkspaceSymbols(
    query: string,
    token: CancellationToken
  ): Promise<SymbolInformation[]> {
    const symbols: SymbolInformation[] = [];

    const docs = await workspace.findFiles('**/*.{lgt,logtalk}');
    for (let i = 0; i < docs.length; i++) {
      try {
        const doc = await workspace.openTextDocument(docs[i]);

        // Track current entity and predicates/non-terminals per entity
        let currentEntity: string | null = null;
        let currentEntityType: string | null = null;
        const entityPredicates = new Map<string, Set<string>>(); // entity -> set of predicate names
        const entityNonTerminals = new Map<string, Set<string>>(); // entity -> set of non-terminal names
        let insideTerm = false;

        for (let j = 0; j < doc.lineCount; j++) {
          const line = doc.lineAt(j);
          const lineText = line.text;

          // Performance optimization: Check if line starts with ":- " (with optional whitespace before)
          // before attempting to match directive patterns
          const startsWithDirective = /^\s*:-\s/.test(lineText);

          if (startsWithDirective) {
            // Check for entity opening directives
            const entityMatch = SymbolUtils.matchFirst(lineText, PatternSets.entityOpening);
            if (entityMatch) {
              currentEntity = entityMatch.match[1];
              currentEntityType = entityMatch.type;
              entityPredicates.set(currentEntity, new Set<string>());
              entityNonTerminals.set(currentEntity, new Set<string>());

              const symbolKind = entityMatch.type === SymbolTypes.OBJECT ? SymbolKind.Class :
                                entityMatch.type === SymbolTypes.PROTOCOL ? SymbolKind.Interface :
                                SymbolKind.Struct;
              symbols.push(new SymbolInformation(
                entityMatch.match[1],
                symbolKind,
                entityMatch.type,
                new Location(doc.uri, line.range)
              ));
              continue;
            }

            // Check for entity ending directives
            const entityEndMatch = SymbolUtils.matchFirst(lineText, PatternSets.entityEnding);
            if (entityEndMatch) {
              currentEntity = null;
              currentEntityType = null;
              continue;
            }

            // Check for scope directives
            // First try single-predicate scope directives
            const scopeMatch = SymbolUtils.matchFirst(lineText, PatternSets.allScopes);
            if (scopeMatch) {
              const symbolKind = scopeMatch.type.includes('non-terminal') ? SymbolKind.Field : SymbolKind.Function;
              const containerName = currentEntity ? `${scopeMatch.type} • ${currentEntity} (${currentEntityType})` : scopeMatch.type;
              symbols.push(new SymbolInformation(
                scopeMatch.match[1],
                symbolKind,
                containerName,
                new Location(doc.uri, line.range)
              ));
              continue;
            }

            // Check for multi-line/multi-predicate scope directive openings
            const scopeOpening = SymbolUtils.matchScopeDirectiveOpening(lineText);
            if (scopeOpening) {
              // Collect the complete directive text
              const { text: directiveText, endLine } = SymbolUtils.collectScopeDirectiveText(doc, j);

              // Extract all predicate/non-terminal indicators from the directive
              const indicators = SymbolUtils.extractIndicatorsFromScopeDirective(directiveText);

              // Create symbols for each indicator
              for (const { indicator, isNonTerminal } of indicators) {
                const baseType = scopeOpening.type;
                const symbolType = isNonTerminal
                  ? baseType.replace('predicate', 'non-terminal')
                  : baseType;
                const symbolKind = isNonTerminal ? SymbolKind.Field : SymbolKind.Function;
                const containerName = currentEntity ? `${symbolType} • ${currentEntity} (${currentEntityType})` : symbolType;

                symbols.push(new SymbolInformation(
                  indicator,
                  symbolKind,
                  containerName,
                  new Location(doc.uri, line.range)
                ));
              }

              // Skip to the end of the directive
              j = endLine;
              continue;
            }
          }

          // Check for predicate clauses and non-terminal rules (only if not inside a multi-line term and inside an entity)
          if (!insideTerm && currentEntity) {
            // Performance optimization: Check for DCG operator first since most files don't contain grammar rules
            if (lineText.includes('-->')) {
              const nonTerminalMatch = lineText.match(SymbolRegexes.nonTerminalRule);
              if (nonTerminalMatch) {
                const nonTerminalName = SymbolUtils.extractNonTerminalName(nonTerminalMatch[1]);
                if (nonTerminalName) {
                  const entityNonTerminalSet = entityNonTerminals.get(currentEntity);
                  if (entityNonTerminalSet && !entityNonTerminalSet.has(nonTerminalName)) {
                    entityNonTerminalSet.add(nonTerminalName);
                    const containerName = `${SymbolTypes.NON_TERMINAL_RULE} • ${currentEntity} (${currentEntityType})`;
                    symbols.push(new SymbolInformation(
                      nonTerminalMatch[1],
                      SymbolKind.Property,
                      containerName,
                      new Location(doc.uri, line.range)
                    ));
                  }
                }
                continue;
              }
            } else {
              // If not a directive (already filtered out) and not a DCG rule, it can only be a predicate clause
              const predicateMatch = lineText.match(SymbolRegexes.predicateClause);
              if (predicateMatch) {
                const predicateName = SymbolUtils.extractPredicateName(predicateMatch[1]);
                if (predicateName) {
                  const entityPredicateSet = entityPredicates.get(currentEntity);
                  if (entityPredicateSet && !entityPredicateSet.has(predicateName)) {
                    entityPredicateSet.add(predicateName);
                    const containerName = `${SymbolTypes.PREDICATE_CLAUSE} • ${currentEntity} (${currentEntityType})`;
                    symbols.push(new SymbolInformation(
                      predicateMatch[1],
                      SymbolKind.Property,
                      containerName,
                      new Location(doc.uri, line.range)
                    ));
                  }
                }
                continue;
              }
            }
          }

          // Update inside_term state based on line ending
          insideTerm = SymbolUtils.isContinuationLine(lineText);
        }
      } catch(err) {
        this.logger.debug("failed to open " + docs[i]);
      }
    }

    return symbols;
  }
}
