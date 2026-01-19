"use strict";

import {
  CancellationToken,
  RenameProvider,
  Position,
  TextDocument,
  WorkspaceEdit,
  Range,
  TextEdit,
  Uri,
  window,
  workspace,
  Location
} from "vscode";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import { PredicateUtils } from "../utils/predicateUtils";
import { ArgumentUtils } from "../utils/argumentUtils";
import { LogtalkDeclarationProvider } from "./declarationProvider";
import { LogtalkDefinitionProvider } from "./definitionProvider";
import { LogtalkImplementationProvider } from "./implementationProvider";
import { LogtalkReferenceProvider } from "./referenceProvider";
import { PatternSets, SymbolRegexes, SymbolUtils } from "../utils/symbols";
import LogtalkTerminal from "./terminal";
import * as path from "path";

export class LogtalkRenameProvider implements RenameProvider {
  private logger = getLogger();
  private declarationProvider = new LogtalkDeclarationProvider();
  private definitionProvider = new LogtalkDefinitionProvider();
  private implementationProvider = new LogtalkImplementationProvider();
  private referenceProvider = new LogtalkReferenceProvider();

  /**
   * Validates if the new name is a valid Logtalk predicate name
   * @param newName The proposed new name
   * @returns true if valid, false otherwise
   */
  private isValidPredicateName(newName: string): boolean {
    // Check if it's a quoted atom (starts and ends with single quotes)
    if (newName.startsWith("'") && newName.endsWith("'") && newName.length > 2) {
      return true;
    }

    // Check if it's a regular atom (starts with lowercase letter, followed by letters, digits, underscores)
    const atomRegex = /^[a-z][a-zA-Z0-9_]*$/;
    return atomRegex.test(newName);
  }

  /**
   * Detects if the cursor position is on a variable
   * @param document The document
   * @param position The cursor position
   * @returns Object with variable info if detected, null otherwise
   */
  private detectVariableContext(document: TextDocument, position: Position): { name: string; range: Range } | null {
    // Get the word at the cursor position
    // Use \b word boundary to prevent matching "_world" in "hello_world"
    const wordRange = document.getWordRangeAtPosition(position, /\b[A-Z_][A-Za-z0-9_]*/);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);

    // Check if we're in a comment
    const lineText = document.lineAt(position.line).text;
    if (lineText.trim().startsWith("%")) {
      return null;
    }

    // Check if we're in a string literal
    const beforeCursor = lineText.substring(0, position.character);
    const singleQuotes = (beforeCursor.match(/'/g) || []).length;
    const doubleQuotes = (beforeCursor.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
      return null;
    }

    return {
      name: word,
      range: wordRange
    };
  }

  /**
   * Prepares the rename operation by validating the position
   * @param document The document containing the symbol to rename
   * @param position The position of the symbol
   * @param token Cancellation token
   * @returns Range of the symbol or null if rename is not possible
   */
  public async prepareRename(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Range | null> {
    // Check if we're in a comment
    const currentLineText = document.lineAt(position.line).text;
    if (currentLineText.trim().startsWith("%")) {
      return null;
    }

    // Check if code is loaded from the source file's directory
    const sourceDir0 = path.dirname(document.uri.fsPath);
    const sourceDir = path.resolve(sourceDir0).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(sourceDir);

    // First, check if we're in a variable context
    const variableContext = this.detectVariableContext(document, position);
    if (variableContext) {
      this.logger.debug(`Found variable: ${variableContext.name}`);
      return variableContext.range;
    }

    // Check if we're in an entity context
    const entityContext = this.detectEntityContext(document, position);
    if (entityContext) {
      this.logger.debug(`Found entity: ${entityContext.indicator} (${entityContext.type})`);

      // Get the word range for the entity name
      const wordRange = document.getWordRangeAtPosition(position);
      if (wordRange) {
        return wordRange;
      }
      return null;
    }

    if (token.isCancellationRequested) {
      return null;
    }

    // Check if we're clicking on a predicate/non-terminal indicator or callable term
    const indicator = Utils.getNonTerminalIndicatorUnderCursor(document, position) ||
                      Utils.getPredicateIndicatorUnderCursor(document, position) ||
                      Utils.getCallUnderCursor(document, position);

    if (!indicator) {
      this.logger.debug("No predicate, non-terminal, entity, or variable found at position");
      return null;
    }

    this.logger.debug(`Found indicator: ${indicator}`);

    // Get the word range at the current position
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      this.logger.debug("Could not determine word range");
      return null;
    }

    return wordRange;
  }

  /**
   * Provides rename edits for a predicate
   * @param document The document containing the symbol to rename
   * @param position The position of the symbol
   * @param newName The new name for the symbol
   * @param token Cancellation token
   * @returns WorkspaceEdit containing all necessary changes
   */
  public async provideRenameEdits(
    document: TextDocument,
    position: Position,
    newName: string,
    token: CancellationToken
  ): Promise<WorkspaceEdit | null> {
    // Check if we're in a variable context
    const variableContext = this.detectVariableContext(document, position);
    if (variableContext) {
      // Validate the new variable name
      if (!ArgumentUtils.isValidVariableName(newName)) {
        window.showErrorMessage(
          `Invalid variable name: "${newName}". ` +
          `Variable names must start with uppercase letter or underscore.`
        );
        return null;
      }
      this.logger.debug(`Renaming variable: ${variableContext.name} to ${newName}`);
      return this.handleVariableRename(document, position, variableContext, newName);
    }

    // Validate the new name for predicates/entities
    if (!this.isValidPredicateName(newName)) {
      window.showErrorMessage(
        `Invalid predicate name: "${newName}". ` +
        `Predicate names must be atoms.`
      );
      return null;
    }

    // Check if we're in an entity context
    const entityContext = this.detectEntityContext(document, position);
    if (entityContext) {
      this.logger.debug(`Renaming entity: ${entityContext.indicator} (${entityContext.type}) to ${newName}`);
      return this.handleEntityRename(document, position, entityContext, newName, token);
    }

    // Get the initial indicator under cursor (will be refined based on declaration)
    let predicateIndicator = Utils.getNonTerminalIndicatorUnderCursor(document, position) ||
                             Utils.getPredicateIndicatorUnderCursor(document, position);
    if (!predicateIndicator) {
      const callable = Utils.getCallUnderCursor(document, position);
      // Predicate calls can be message sending or super calls
      predicateIndicator = callable.match(/(?:(\w+(\(.*\))?)?(::|\^\^))?(\w+[\/]\d+)/)[4];
    }
    // const newIndicator = `${newName}${separator}${arity}`;

    // Collect all locations where the predicate is used
    const allLocations: { uri: Uri; range: Range; origin: 'declaration' | 'definition' | 'implementation' | 'reference' }[] = [];
    let declarationLocation: Location | null = null;
    let implementationLocations: any = null;

    // Variables to be determined based on declaration or heuristics
    let isNonTerminal: boolean;
    let currentName: string;
    let arity: string;

    try {
      // Step 1: Try to get declaration location from user click position
      declarationLocation = await this.declarationProvider.provideDeclaration(document, position, token);

      if (declarationLocation && this.isValidLocation(declarationLocation)) {
        // Case 1: Declaration found - definitively determine predicate vs non-terminal from declaration
        this.logger.debug(`Found declaration at: ${declarationLocation.uri.fsPath}:${declarationLocation.range.start.line + 1}`);

        // Step 2: Determine the actual indicator type from the declaration
        const declarationDocument = await workspace.openTextDocument(declarationLocation.uri);
        const declarationLineText = declarationDocument.lineAt(declarationLocation.range.start.line).text;

        // Definitively determine if it's a predicate or non-terminal by checking the declaration line
        // Extract the name and arity from the original indicator
        const tempSeparator = predicateIndicator.includes('//') ? '//' : '/';
        const [originalName, originalArity] = predicateIndicator.split(tempSeparator);

        // Check the declaration line to determine the correct type
        if (declarationLineText.includes(`${originalName}//`)) {
          isNonTerminal = true;
          predicateIndicator = `${originalName}//${originalArity}`;
          this.logger.debug(`Definitively determined as non-terminal from declaration: ${predicateIndicator}`);
        } else if (declarationLineText.includes(`${originalName}/`)) {
          isNonTerminal = false;
          predicateIndicator = `${originalName}/${originalArity}`;
          this.logger.debug(`Definitively determined as predicate from declaration: ${predicateIndicator}`);
        } else {
          // Fallback: use the original indicator and determine type from it
          isNonTerminal = predicateIndicator.includes('//');
          this.logger.debug(`Could not find indicator in declaration, using original: ${predicateIndicator}`);
        }

        const separator = isNonTerminal ? '//' : '/';
        [currentName, arity] = predicateIndicator.split(separator);

        this.logger.debug(`Renaming ${isNonTerminal ? 'non-terminal' : 'predicate'}: ${predicateIndicator} to ${newName}`);

        // Step 3: Add the declaration location itself to the bag
        allLocations.push({ uri: declarationLocation.uri, range: declarationLocation.range, origin: 'declaration' });

        // Step 4: Use the declaration position to find all other locations
        const declarationPosition = this.findPredicatePositionInDeclaration(declarationDocument, declarationLocation.range.start.line, predicateIndicator);
        this.logger.debug(`declarationPosition: ${declarationPosition.line}:${declarationPosition.character}`);

        // Get definition location from declaration position
        const definitionLocation = await this.definitionProvider.provideDefinition(declarationDocument, declarationPosition, token);
        this.logger.debug(`Definition provider returned: ${definitionLocation ? 'Location' : 'null'}`);
        if (definitionLocation) {
          this.logger.debug(`Definition location: ${definitionLocation.uri.fsPath}:${definitionLocation.range.start.line + 1}:${definitionLocation.range.start.character}-${definitionLocation.range.end.character}`);
        }
        if (definitionLocation && this.isValidLocation(definitionLocation)) {
          allLocations.push({ uri: definitionLocation.uri, range: definitionLocation.range, origin: 'definition' });
          this.logger.debug(`Found definition at: ${definitionLocation.uri.fsPath}:${definitionLocation.range.start.line + 1}`);
        } else if (definitionLocation) {
          this.logger.debug(`Definition location is invalid: ${definitionLocation.uri.fsPath}:${definitionLocation.range.start.line + 1}`);
        }

        // Get implementation locations from declaration position
        this.logger.debug(`declarationDocument: ${declarationDocument.uri.fsPath}`);
        this.logger.debug(`declarationPosition: ${declarationPosition.line}:${declarationPosition.character}`);
        implementationLocations = await this.implementationProvider.provideImplementation(declarationDocument, declarationPosition, token);
        this.logger.debug(`Implementation provider returned: ${implementationLocations ? (Array.isArray(implementationLocations) ? implementationLocations.length : 1) + ' locations' : 'null'}`);
        if (implementationLocations) {
          const implArray = Array.isArray(implementationLocations) ? implementationLocations : [implementationLocations];
          for (const location of implArray) {
            this.logger.debug(`Implementation location: ${location.uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character}-${location.range.end.character}`);
            if (this.isValidLocation(location)) {
              allLocations.push({ uri: location.uri, range: location.range, origin: 'implementation' });
              this.logger.debug(`Found implementation at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
            } else {
              this.logger.debug(`Implementation location is invalid: ${location.uri.fsPath}:${location.range.start.line + 1}`);
            }
          }
        }

        // Get reference locations from declaration position
        const referenceLocations = await this.referenceProvider.provideReferences(
          declarationDocument,
          declarationPosition,
          { includeDeclaration: true },
          token
        );
        if (referenceLocations) {
          for (const location of referenceLocations) {
            if (this.isValidLocation(location)) {
              allLocations.push({ uri: location.uri, range: location.range, origin: 'reference' });
              this.logger.debug(`Found reference at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
            }
          }
        }
      } else {
        // Case 2: No declaration found - find definition first to determine type
        this.logger.debug(`No declaration found for: ${predicateIndicator}. Finding definition to determine type...`);

        // Get definition location from user click position first
        const definitionLocation = await this.definitionProvider.provideDefinition(document, position, token);

        if (definitionLocation && this.isValidLocation(definitionLocation)) {
          // Found definition - check if it's a DCG rule to determine type
          const definitionDocument = await workspace.openTextDocument(definitionLocation.uri);
          const definitionLineText = definitionDocument.lineAt(definitionLocation.range.start.line).text;

          if (definitionLineText.includes('-->')) {
            // Definition contains DCG operator - it's a non-terminal
            if (predicateIndicator.includes('/') && !predicateIndicator.includes('//')) {
              const [name, arity] = predicateIndicator.split('/');
              predicateIndicator = `${name}//${arity}`;
              this.logger.debug(`DCG rule found in definition, inferring non-terminal: ${predicateIndicator}`);
            }
          } else if (definitionLineText.includes(':-') || definitionLineText.includes('.')) {
            // Definition contains predicate operator or fact - it's a predicate
            this.logger.debug(`Predicate rule/fact found in definition, keeping as predicate: ${predicateIndicator}`);
          } else {
            // Fallback to current line context
            const currentLineText = document.lineAt(position.line).text;
            const isDCGContext = currentLineText.includes('-->');

            if (isDCGContext && predicateIndicator.includes('/') && !predicateIndicator.includes('//')) {
              const [name, arity] = predicateIndicator.split('/');
              predicateIndicator = `${name}//${arity}`;
              this.logger.debug(`DCG context detected in current line, inferring non-terminal: ${predicateIndicator}`);
            }
          }
        } else {
          // No definition found - fallback to current line context
          this.logger.debug(`No definition found, using current line context for type determination`);
          const currentLineText = document.lineAt(position.line).text;
          const isDCGContext = currentLineText.includes('-->');

          if (isDCGContext && predicateIndicator.includes('/') && !predicateIndicator.includes('//')) {
            const [name, arity] = predicateIndicator.split('/');
            predicateIndicator = `${name}//${arity}`;
            this.logger.debug(`DCG context detected in current line, inferring non-terminal: ${predicateIndicator}`);
          }
        }

        isNonTerminal = predicateIndicator.includes('//');
        const separator = isNonTerminal ? '//' : '/';
        [currentName, arity] = predicateIndicator.split(separator);

        this.logger.debug(`Renaming ${isNonTerminal ? 'non-terminal' : 'predicate'}: ${predicateIndicator} to ${newName}`);
        if (definitionLocation && this.isValidLocation(definitionLocation)) {
          allLocations.push({ uri: definitionLocation.uri, range: definitionLocation.range, origin: 'definition' });
          this.logger.debug(`Found definition at: ${definitionLocation.uri.fsPath}:${definitionLocation.range.start.line + 1}`);

          // Find the actual position of the predicate/non-terminal in the definition line
          const definitionDocument = await workspace.openTextDocument(definitionLocation.uri);
          const definitionPosition = this.findPredicatePositionInDefinition(definitionDocument, definitionLocation.range.start.line, predicateIndicator, isNonTerminal);
          this.logger.debug(`definitionPosition: ${definitionPosition.line}:${definitionPosition.character}`);

          // Get reference locations from the definition position
          const referenceLocations = await this.referenceProvider.provideReferences(
            definitionDocument,
            definitionPosition,
            { includeDeclaration: true },
            token
          );
          this.logger.debug(`Reference provider returned ${referenceLocations ? referenceLocations.length : 0} locations`);
          if (referenceLocations) {
            for (const location of referenceLocations) {
              if (this.isValidLocation(location)) {
                allLocations.push({ uri: location.uri, range: location.range, origin: 'reference' });
                this.logger.debug(`Found reference at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
              }
            }
          }
        } else {
          // Fallback: Get reference locations from user click position if no definition found
          const referenceLocations = await this.referenceProvider.provideReferences(
            document,
            position,
            { includeDeclaration: true },
            token
          );
          this.logger.debug(`Reference provider returned ${referenceLocations ? referenceLocations.length : 0} locations`);
          if (referenceLocations) {
            for (const location of referenceLocations) {
              this.logger.debug(`Reference location: ${location.uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character}`);
              if (this.isValidLocation(location)) {
                allLocations.push({ uri: location.uri, range: location.range, origin: 'reference' });
                this.logger.debug(`Added reference at: ${location.uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character}`);
              } else {
                this.logger.debug(`Rejected invalid reference at: ${location.uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character}`);
              }
            }
          }
        }

        // If we still have no locations, show an error
        if (allLocations.length === 0) {
          window.showErrorMessage(`Could not find any locations for ${isNonTerminal ? 'non-terminal' : 'predicate'}: ${predicateIndicator}`);
          return null;
        }
      }

      // Deduplicate allLocations to create a clean set before finding additional clauses
      const uniqueLocations = new Map<string, { uri: Uri; range: Range; origin: 'declaration' | 'definition' | 'implementation' | 'reference' }>();
      for (const location of allLocations) {
        const key = `${location.uri.toString()}:${location.range.start.line}:${location.range.start.character}:${location.range.end.line}:${location.range.end.character}`;
        uniqueLocations.set(key, location);
      }
      allLocations.length = 0; // Clear the array
      allLocations.push(...uniqueLocations.values()); // Add back unique locations

      this.logger.debug(`After deduplication: ${allLocations.length} unique locations`);

      // Find all predicate clauses in files that have definitions/implementations
      // Only search for consecutive clauses for 'definition' and 'implementation' origins, not for 'reference'
      const filesWithDefinitionsOrImplementations = new Set<string>();
      for (const location of allLocations) {
        if (location.origin === 'definition' || location.origin === 'implementation') {
          filesWithDefinitionsOrImplementations.add(location.uri.toString());
        }
      }

      for (const fileUri of filesWithDefinitionsOrImplementations) {
        const fileDocument = await workspace.openTextDocument(Uri.parse(fileUri));
        // Filter locations to only pass definition/implementation locations for this file
        const definitionImplementationLocations = allLocations.filter(loc =>
          loc.uri.toString() === fileUri && (loc.origin === 'definition' || loc.origin === 'implementation')
        );
        const allClauseLocations = await this.findAllPredicateClauses(fileDocument, predicateIndicator, definitionImplementationLocations);
        for (const location of allClauseLocations) {
          if (this.isValidLocation(location)) {
            allLocations.push({ ...location, origin: 'implementation' }); // Mark additional clauses as implementation
            this.logger.debug(`Found additional clause at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
          }
        }
      }

    } catch (error) {
      this.logger.error(`Error collecting locations for rename: ${error}`);
      window.showErrorMessage(`Failed to collect all references for renaming: ${error}`);
      return null;
    }

    // Convert bag of locations to set of unique locations (more efficient than deduplicating edits)
    const uniqueLocations = this.deduplicateLocations(allLocations);

    this.logger.debug(`Total locations collected: ${allLocations.length}`);
    this.logger.debug(`Unique locations after deduplication: ${uniqueLocations.length}`);
    uniqueLocations.forEach((loc, index) => {
      this.logger.debug(`  ${index + 1}. ${loc.uri.fsPath}:${loc.range.start.line + 1}:${loc.range.start.character}`);
    });

    // Create workspace edit
    const workspaceEdit = new WorkspaceEdit();

    // Group locations by file for better performance
    const locationsByFile = new Map<string, { uri: Uri; range: Range }[]>();
    for (const location of uniqueLocations) {
      const fileKey = location.uri.toString();
      if (!locationsByFile.has(fileKey)) {
        locationsByFile.set(fileKey, []);
      }
      locationsByFile.get(fileKey)!.push(location);
    }

    // Process each file
    for (const [fileKey, locations] of locationsByFile) {
      const uri = locations[0].uri;
      const textEdits: TextEdit[] = [];
      const processedRanges = new Set<string>(); // Track processed ranges to avoid duplicates

      // Read the document to analyze the text
      let doc: TextDocument;
      try {
        doc = await workspace.openTextDocument(uri);
      } catch (error) {
        this.logger.error(`Failed to open document ${uri.fsPath}: ${error}`);
        continue;
      }

      for (const location of locations) {
        // Validate line number before accessing
        if (location.range.start.line >= doc.lineCount) {
          this.logger.warn(`Invalid line number ${location.range.start.line} in ${uri.fsPath} (max: ${doc.lineCount - 1})`);
          continue;
        }

        // Check if this is a declaration location (scope directive)
        const isDeclaration = declarationLocation &&
                             location.uri.toString() === declarationLocation.uri.toString() &&
                             location.range.start.line === declarationLocation.range.start.line;

        if (isDeclaration) {
          // Handle multi-line directives and find related mode/info directives
          const directiveRanges = this.findDirectivePredicateRanges(
            doc,
            location.range.start.line,
            currentName,
            predicateIndicator
          );

          for (const range of directiveRanges) {
            const rangeKey = `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
            if (!processedRanges.has(rangeKey)) {
              processedRanges.add(rangeKey);

              let replacementText = this.determineReplacementText(
                doc.lineAt(range.start.line).text,
                range,
                currentName,
                newName
              );

              const edit = TextEdit.replace(range, replacementText);
              textEdits.push(edit);
              this.logger.debug(`Created directive edit at ${uri.fsPath}:${range.start.line + 1}:${range.start.character + 1} - "${doc.getText(range)}" → "${replacementText}"`);
            } else {
              this.logger.debug(`Skipping duplicate directive range at ${uri.fsPath}:${range.start.line + 1}:${range.start.character + 1}`);
            }
          }
        } else {
          // Handle regular predicate references
          const lineText = doc.lineAt(location.range.start.line).text;

          // Check if this is a line-level location (character position 0) from reference provider
          // or a specific character range from other providers
          const isLineLevelLocation = location.range.start.character === 0 && location.range.end.character === 0;

          this.logger.debug(`Processing location at ${uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character} - isLineLevelLocation: ${isLineLevelLocation}`);

          if (isLineLevelLocation) {
            // Line-level location: detect context and search appropriately
            this.logger.debug(`Line-level location detected - analyzing context for ${predicateIndicator}`);
            this.logger.debug(`Line text: "${lineText}"`);

            // Check if this is a directive context (starts with :-)
            const isDirectiveContext = lineText.trim().startsWith(':-');
            let clauseResult: { ranges: { uri: Uri; range: Range }[], endLine: number };

            if (isDirectiveContext) {
              // Use directive-specific search that handles both indicator and callable formats
              this.logger.debug(`Directive context detected - searching for predicate indicators and callable forms`);
              clauseResult = this.findPredicateInDirectiveWithEndLine(doc, location.range.start.line, predicateIndicator);
            } else {
              // Use clause-specific search that handles callable format
              this.logger.debug(`Clause context detected - searching for predicate calls`);
              clauseResult = this.findPredicateInClauseWithEndLine(doc, location.range.start.line, predicateIndicator);
            }

            this.logger.debug(`Found ${clauseResult.ranges.length} occurrences starting at line ${location.range.start.line + 1}`);

            for (const clauseRange of clauseResult.ranges) {
              const rangeKey = `${clauseRange.range.start.line}:${clauseRange.range.start.character}:${clauseRange.range.end.line}:${clauseRange.range.end.character}`;
              const rangeLineText = doc.lineAt(clauseRange.range.start.line).text;
              const rangeText = rangeLineText.substring(clauseRange.range.start.character, clauseRange.range.end.character);
              this.logger.debug(`Processing range ${rangeKey}: "${rangeText}"`);

              const isValidRange = this.isValidRange(doc, clauseRange.range);
              const isDuplicate = processedRanges.has(rangeKey);

              this.logger.debug(`Range validation: ${rangeKey} - valid: ${isValidRange}, duplicate: ${isDuplicate}`);

              if (!isDuplicate && isValidRange) {
                processedRanges.add(rangeKey);

                let replacementText = this.determineReplacementText(
                  rangeLineText,
                  clauseRange.range,
                  currentName,
                  newName
                );

                const edit = TextEdit.replace(clauseRange.range, replacementText);
                textEdits.push(edit);
                this.logger.debug(`✅ Created line-level edit at ${uri.fsPath}:${clauseRange.range.start.line + 1}:${clauseRange.range.start.character + 1} - "${doc.getText(clauseRange.range)}" → "${replacementText}"`);
              } else if (isDuplicate) {
                this.logger.debug(`❌ Skipping duplicate line-level range at ${uri.fsPath}:${clauseRange.range.start.line + 1}:${clauseRange.range.start.character + 1}`);
              } else {
                this.logger.debug(`❌ Skipping invalid line-level range at ${uri.fsPath}:${clauseRange.range.start.line + 1}:${clauseRange.range.start.character + 1} - line count: ${doc.lineCount}, line length: ${rangeLineText.length}`);
              }
            }
          } else {
            // Specific character range: use the exact location range
            const rangeKey = `${location.range.start.line}:${location.range.start.character}:${location.range.end.line}:${location.range.end.character}`;
            if (!processedRanges.has(rangeKey) && this.isValidRange(doc, location.range)) {
              processedRanges.add(rangeKey);

              let replacementText = this.determineReplacementText(
                lineText,
                location.range,
                currentName,
                newName
              );

              const edit = TextEdit.replace(location.range, replacementText);
              textEdits.push(edit);
              this.logger.debug(`Created specific edit at ${uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character + 1} - "${doc.getText(location.range)}" → "${replacementText}"`);
            } else if (processedRanges.has(rangeKey)) {
              this.logger.debug(`Skipping duplicate specific range at ${uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character + 1}`);
            } else {
              this.logger.warn(`Skipping invalid specific range at ${uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character + 1}`);
            }
          }
        }
      }

      workspaceEdit.set(uri, textEdits);
      this.logger.debug(`Added ${textEdits.length} edits for file: ${uri.fsPath}`);
      if (textEdits.length > 0) {
        textEdits.forEach((edit, index) => {
          this.logger.debug(`  Edit ${index + 1}: ${edit.range.start.line + 1}:${edit.range.start.character + 1} - "${edit.newText}"`);
        });
      }
    }

    // Count total edits created across all files
    let totalEditsCreated = 0;
    for (const [, edits] of workspaceEdit.entries()) {
      totalEditsCreated += edits.length;
    }

    // Show preview information to user
    const totalLocations = uniqueLocations.length;
    const fileCount = locationsByFile.size;
    this.logger.debug(`Preview: ${totalLocations} locations found, ${totalEditsCreated} edits created`);
    window.showInformationMessage(
      `Rename will update ${totalEditsCreated} occurrence${totalEditsCreated !== 1 ? 's' : ''} ` +
      `across ${fileCount} file${fileCount !== 1 ? 's' : ''}`
    );

    return workspaceEdit;
  }

  /**
   * Handles entity renaming by finding all references and creating rename edits
   * @param document The document containing the entity
   * @param position The position where the user clicked
   * @param entityContext The detected entity context
   * @param newName The new entity name
   * @param token Cancellation token
   * @returns WorkspaceEdit with all rename operations
   */
  private async handleEntityRename(
    document: TextDocument,
    position: Position,
    entityContext: { name: string; type: string; indicator: string },
    newName: string,
    token: CancellationToken
  ): Promise<WorkspaceEdit | null> {
    const { name: currentName, indicator: entityIndicator } = entityContext;

    // Collect all locations where the entity is used
    const allLocations: { uri: Uri; range: Range; origin: 'declaration' | 'definition' | 'implementation' | 'reference' }[] = [];

    try {
      // Add the current entity opening directive location
      const currentRange = document.getWordRangeAtPosition(position, /\w+/);
      if (currentRange) {
        allLocations.push({ uri: document.uri, range: currentRange, origin: 'declaration' });
        this.logger.debug(`Added entity opening directive at: ${document.uri.fsPath}:${currentRange.start.line + 1}`);
      }

      // Get all references to the entity using the reference provider
      const referenceLocations = await this.referenceProvider.provideReferences(
        document,
        position,
        { includeDeclaration: false }, // We already added the declaration above
        token
      );

      this.logger.debug(`Reference provider returned ${referenceLocations ? referenceLocations.length : 0} locations for entity`);

      if (referenceLocations) {
        for (const location of referenceLocations) {
          if (this.isValidLocation(location)) {
            allLocations.push({ uri: location.uri, range: location.range, origin: 'reference' });
            this.logger.debug(`Found entity reference at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
          }
        }
      }

      // Process all locations and create edits
      return this.createEntityRenameEdits(allLocations, currentName, newName, entityIndicator);

    } catch (error) {
      this.logger.error(`Error collecting locations for entity rename: ${error}`);
      window.showErrorMessage(`Failed to collect all references for renaming entity: ${error}`);
      return null;
    }
  }

  /**
   * Creates rename edits for entity references, handling special cases like Entity::Message
   * @param locations All locations where the entity appears
   * @param currentName The current entity name
   * @param newName The new entity name
   * @param entityIndicator The entity indicator (name/arity)
   * @returns WorkspaceEdit with all rename operations
   */
  private async createEntityRenameEdits(
    locations: { uri: Uri; range: Range; origin: 'declaration' | 'definition' | 'implementation' | 'reference' }[],
    currentName: string,
    newName: string,
    entityIndicator: string
  ): Promise<WorkspaceEdit> {
    const workspaceEdit = new WorkspaceEdit();
    const locationsByFile = new Map<string, { uri: Uri; range: Range; origin: 'declaration' | 'definition' | 'implementation' | 'reference' }[]>();

    // Group locations by file
    for (const location of locations) {
      const fileKey = location.uri.toString();
      if (!locationsByFile.has(fileKey)) {
        locationsByFile.set(fileKey, []);
      }
      locationsByFile.get(fileKey)!.push(location);
    }

    // Process each file
    for (const [, fileLocations] of locationsByFile) {
      const uri = fileLocations[0].uri;
      const doc = await workspace.openTextDocument(uri);
      const textEdits: TextEdit[] = [];
      const processedRanges = new Set<string>();

      for (const location of fileLocations) {
        const isLineLevelLocation = location.range.start.character === 0 && location.range.end.character === 0;

        if (isLineLevelLocation) {
          // Line-level location: determine if it's a directive or clause
          const startLineText = doc.lineAt(location.range.start.line).text;
          const trimmedStartLine = startLineText.trim();
          this.logger.debug(`Processing line-level entity location: ${uri.fsPath}:${location.range.start.line + 1}`);
          this.logger.debug(`Start line text: "${startLineText}"`);

          let ranges: Range[] = [];

          if (trimmedStartLine.startsWith(':-')) {
            // This is a directive - use getDirectiveRange to get the full range
            this.logger.debug(`Detected directive at line ${location.range.start.line + 1}`);
            const directiveRange = PredicateUtils.getDirectiveRange(doc, location.range.start.line);

            // Search for the first (and only) entity reference within the directive range
            const entityRange = this.findEntityRangeInRange(doc, directiveRange.start, directiveRange.end, currentName, entityIndicator);
            if (entityRange) {
              ranges = [entityRange];
              this.logger.debug(`Found entity occurrence in directive (lines ${directiveRange.start + 1}-${directiveRange.end + 1})`);
            } else {
              this.logger.debug(`No entity occurrence found in directive (lines ${directiveRange.start + 1}-${directiveRange.end + 1})`);
            }
          } else {
            // This is a clause - check if it's a multifile predicate clause when origin is 'reference'
            this.logger.debug(`Detected clause at line ${location.range.start.line + 1}`);

            if (location.origin === 'reference') {
              // Check if this is a multifile predicate clause (Entity::Head or Entity(...)::Head format)
              const clauseRange = PredicateUtils.getClauseRange(doc, location.range.start.line);
              const clauseHeadLine = doc.lineAt(clauseRange.start).text;
              const multifileResult = this.parseMultifileEntityClause(clauseHeadLine.trim(), currentName, parseInt(entityIndicator.split('/')[1], 10));

              if (multifileResult.isMatch && multifileResult.entityName === currentName && multifileResult.arity === parseInt(entityIndicator.split('/')[1], 10)) {
                this.logger.debug(`Found multifile predicate clause for entity ${currentName} at line ${clauseRange.start + 1}`);

                // Find all consecutive multifile clauses for this entity
                const consecutiveRanges = this.findConsecutiveMultifileClausesForEntity(doc, clauseRange.start, currentName, entityIndicator);
                this.logger.debug(`Found ${consecutiveRanges.length} consecutive multifile clauses for entity ${currentName}`);

                // Process all consecutive multifile clauses
                for (const consecutiveRange of consecutiveRanges) {
                  const entityRanges = this.findEntityRangesInRange(doc, consecutiveRange.start.line, consecutiveRange.end.line, currentName, entityIndicator);
                  ranges.push(...entityRanges);
                }
              } else {
                // Regular clause processing
                const clauseRange = PredicateUtils.getClauseRange(doc, location.range.start.line);
                ranges = this.findEntityRangesInRange(doc, clauseRange.start, clauseRange.end, currentName, entityIndicator);
                this.logger.debug(`Found ${ranges.length} entity occurrences in clause (lines ${clauseRange.start + 1}-${clauseRange.end + 1})`);
              }
            } else {
              // Regular clause processing for non-reference origins
              const clauseRange = PredicateUtils.getClauseRange(doc, location.range.start.line);
              ranges = this.findEntityRangesInRange(doc, clauseRange.start, clauseRange.end, currentName, entityIndicator);
              this.logger.debug(`Found ${ranges.length} entity occurrences in clause (lines ${clauseRange.start + 1}-${clauseRange.end + 1})`);
            }
          }

          for (const range of ranges) {
            const rangeKey = `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;

            if (!processedRanges.has(rangeKey) && this.isValidRange(doc, range)) {
              processedRanges.add(rangeKey);

              const lineText = doc.lineAt(range.start.line).text;
              const replacementText = this.determineEntityReplacementText(lineText, range, currentName, newName);
              const edit = TextEdit.replace(range, replacementText);
              textEdits.push(edit);

              this.logger.debug(`✅ Created entity edit at ${uri.fsPath}:${range.start.line + 1}:${range.start.character + 1} - "${doc.getText(range)}" → "${replacementText}"`);
            }
          }
        } else {
          // Specific character range: use the exact location range
          const rangeKey = `${location.range.start.line}:${location.range.start.character}:${location.range.end.line}:${location.range.end.character}`;

          if (!processedRanges.has(rangeKey) && this.isValidRange(doc, location.range)) {
            processedRanges.add(rangeKey);

            const lineText = doc.lineAt(location.range.start.line).text;
            const replacementText = this.determineEntityReplacementText(lineText, location.range, currentName, newName);
            const edit = TextEdit.replace(location.range, replacementText);
            textEdits.push(edit);

            this.logger.debug(`✅ Created specific entity edit at ${uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character + 1} - "${doc.getText(location.range)}" → "${replacementText}"`);
          }
        }
      }

      workspaceEdit.set(uri, textEdits);
      this.logger.debug(`Added ${textEdits.length} entity edits for file: ${uri.fsPath}`);
    }

    // Count total edits created
    let totalEditsCreated = 0;
    for (const [, edits] of workspaceEdit.entries()) {
      totalEditsCreated += edits.length;
    }

    // Show preview information
    const fileCount = locationsByFile.size;
    this.logger.debug(`Entity rename preview: ${locations.length} locations found, ${totalEditsCreated} edits created`);
    window.showInformationMessage(
      `Rename will update ${totalEditsCreated} occurrence${totalEditsCreated !== 1 ? 's' : ''} ` +
      `across ${fileCount} file${fileCount !== 1 ? 's' : ''}`
    );

    return workspaceEdit;
  }

  /**
   * Handles variable renaming by finding all occurrences in the clause/rule/directive and creating rename edits
   * @param document The document containing the variable
   * @param position The position where the user clicked
   * @param variableContext The detected variable context
   * @param newName The new variable name
   * @returns WorkspaceEdit with all rename operations
   */
  private handleVariableRename(
    document: TextDocument,
    position: Position,
    variableContext: { name: string; range: Range },
    newName: string
  ): WorkspaceEdit {
    const { name: currentName } = variableContext;
    const workspaceEdit = new WorkspaceEdit();

    // Check if this is a parameter variable (e.g., _Foo_) in an entity opening directive
    const isParameterVariable = this.isParameterVariable(currentName);
    const isInEntityOpening = this.isInEntityOpeningDirective(document, position.line);

    // Determine the scope: clause, grammar rule, directive, or entire entity
    const lineText = document.lineAt(position.line).text;
    const trimmedLine = lineText.trim();

    let scopeRange: { start: number; end: number };

    if (isParameterVariable && isInEntityOpening) {
      // Special case: parameter variable in entity opening directive
      // Rename throughout the entire entity (all directives, clauses, and grammar rules)
      scopeRange = this.getEntityScopeRange(document, position.line);
      this.logger.debug(`Parameter variable in entity scope: lines ${scopeRange.start + 1}-${scopeRange.end + 1}`);
    } else if (trimmedLine.startsWith(':-')) {
      // We're in a directive
      scopeRange = PredicateUtils.getDirectiveRange(document, position.line);
      this.logger.debug(`Variable in directive scope: lines ${scopeRange.start + 1}-${scopeRange.end + 1}`);
    } else {
      // We're in a clause or grammar rule
      // Find the start of the term
      const termStart = Utils.findTermStart(document, position.line);
      if (termStart === null) {
        this.logger.warn(`Could not find term start for variable at line ${position.line + 1}`);
        return workspaceEdit;
      }

      scopeRange = PredicateUtils.getClauseRange(document, termStart);
      this.logger.debug(`Variable in clause/rule scope: lines ${scopeRange.start + 1}-${scopeRange.end + 1}`);
    }

    // Find all occurrences of the variable in the scope
    // Variable names only contain alphanumeric characters and underscores, so no escaping needed
    const variablePattern = new RegExp(`\\b${currentName}\\b`, 'g');
    const textEdits: TextEdit[] = [];

    for (let lineNum = scopeRange.start; lineNum <= scopeRange.end; lineNum++) {
      const lineText = document.lineAt(lineNum).text;

      // Find all matches in this line
      let match: RegExpExecArray | null;
      while ((match = variablePattern.exec(lineText)) !== null) {
        const startChar = match.index;
        const endChar = startChar + currentName.length;

        // Validate that this is a valid variable context (not in a string)
        if (this.isValidVariableContextInLine(lineText, startChar, endChar)) {
          const range = new Range(lineNum, startChar, lineNum, endChar);
          const edit = TextEdit.replace(range, newName);
          textEdits.push(edit);
          this.logger.debug(`Found variable occurrence at ${lineNum + 1}:${startChar + 1}`);
        }
      }
    }

    workspaceEdit.set(document.uri, textEdits);

    // Show preview information
    this.logger.debug(`Variable rename: ${textEdits.length} occurrences found`);
    window.showInformationMessage(
      `Rename will update ${textEdits.length} occurrence${textEdits.length !== 1 ? 's' : ''} of variable ${currentName}`
    );

    return workspaceEdit;
  }

  /**
   * Validates if a variable occurrence is in a valid context (not in string)
   * Note: We DO want to rename variables in comments to keep them accurate
   * @param lineText The line text
   * @param startPos Start position of the variable
   * @param endPos End position of the variable
   * @returns true if valid context
   */
  private isValidVariableContextInLine(lineText: string, startPos: number, endPos: number): boolean {
    // Check if this is in a string literal
    const beforeMatch = lineText.substring(0, startPos);
    const singleQuotes = (beforeMatch.match(/'/g) || []).length;
    const doubleQuotes = (beforeMatch.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
      return false;
    }

    return true;
  }

  /**
   * Checks if a variable name uses parameter variable syntax
   * Parameter variables start with uppercase letter and have underscore prefix and suffix (e.g., _Foo_)
   * @param variableName The variable name to check
   * @returns true if this is a parameter variable
   */
  private isParameterVariable(variableName: string): boolean {
    // Must start with underscore, followed by uppercase letter, and end with underscore
    // Examples: _Foo_, _Bar_, _X_
    return /^_[A-Z][A-Za-z0-9_]*_$/.test(variableName);
  }

  /**
   * Checks if a line is part of an entity opening directive (object or category only)
   * Note: Only objects and categories can be parametric, not protocols
   * @param document The document
   * @param lineNum The line number to check
   * @returns true if the line is part of an object or category opening directive
   */
  private isInEntityOpeningDirective(document: TextDocument, lineNum: number): boolean {
    // Search backwards to find the start of the directive
    for (let i = lineNum; i >= 0; i--) {
      const lineText = document.lineAt(i).text.trim();

      // Check if this is an object or category opening directive
      // Only objects and categories can be parametric
      if (SymbolRegexes.openingObject.test(lineText) ||
          SymbolRegexes.openingCategory.test(lineText)) {
        // Found entity opening - now check if our line is within this directive
        const directiveRange = PredicateUtils.getDirectiveRange(document, i);
        return lineNum >= directiveRange.start && lineNum <= directiveRange.end;
      }

      // If we hit another directive or clause, we're not in an entity opening
      if (lineText.startsWith(':-') && !lineText.match(/^:-\s*(object|category)\(/)) {
        return false;
      }

      // If we hit a clause head (not a directive), we're not in an entity opening
      if (!lineText.startsWith(':-') && lineText.includes(':-')) {
        return false;
      }
    }

    return false;
  }

  /**
   * Gets the range of the entire entity (from opening to closing directive)
   * Note: Only objects and categories can be parametric
   * @param document The document
   * @param lineNum A line number within the entity
   * @returns The range of the entity
   */
  private getEntityScopeRange(document: TextDocument, lineNum: number): { start: number; end: number } {
    // Search backwards to find the entity opening directive
    let entityStartLine: number | null = null;
    let entityType: 'object' | 'category' | null = null;

    for (let i = lineNum; i >= 0; i--) {
      const lineText = document.lineAt(i).text.trim();

      // Only check for object and category (protocols cannot be parametric)
      if (SymbolRegexes.openingObject.test(lineText)) {
        entityStartLine = i;
        entityType = 'object';
        break;
      } else if (SymbolRegexes.openingCategory.test(lineText)) {
        entityStartLine = i;
        entityType = 'category';
        break;
      }
    }

    if (entityStartLine === null || entityType === null) {
      // Fallback: return just the current line
      this.logger.warn(`Could not find entity opening directive for line ${lineNum + 1}`);
      return { start: lineNum, end: lineNum };
    }

    // Search forwards to find the entity closing directive
    const endRegex = entityType === 'object' ? SymbolRegexes.endObject : SymbolRegexes.endCategory;

    for (let i = entityStartLine + 1; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text.trim();
      if (endRegex.test(lineText)) {
        return { start: entityStartLine, end: i };
      }
    }

    // Entity not properly closed, return range to end of file
    this.logger.warn(`Entity at line ${entityStartLine + 1} not properly closed`);
    return { start: entityStartLine, end: document.lineCount - 1 };
  }

  /**
   * Detects if the user clicked on an entity name in an entity opening directive
   * @param document The document
   * @param position The cursor position
   * @returns Object with entity info if detected, null otherwise
   */
  private detectEntityContext(document: TextDocument, position: Position): { name: string; type: string; indicator: string } | null {
    const lineText = document.lineAt(position.line).text.trim();

    // Check if this line contains an entity opening directive
    const entityMatch = SymbolUtils.matchFirst(lineText, PatternSets.entityOpening);
    if (!entityMatch) {
      return null;
    }

    // Use Utils.getCallUnderCursor to get the entity indicator (handles arity calculation)
    const entityIndicator = Utils.getCallUnderCursor(document, position);
    if (!entityIndicator) {
      return null;
    }

    // Extract entity name from the indicator
    const entityName = entityIndicator.split('/')[0];

    return {
      name: entityName,
      type: entityMatch.type,
      indicator: entityIndicator
    };
  }

  /**
   * Finds the first occurrence of an entity name within a range of lines (for directives)
   * @param doc The document to search
   * @param startLine The starting line number (inclusive)
   * @param endLine The ending line number (inclusive)
   * @param entityName The entity name to find
   * @param entityIndicator The entity indicator (name/arity)
   * @returns Single range where the entity name appears, or null if not found
   */
  private findEntityRangeInRange(
    doc: TextDocument,
    startLine: number,
    endLine: number,
    entityName: string,
    entityIndicator: string
  ): Range | null {
    // Search each line in the range, stopping at first match
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const lineRanges = this.findEntityRangesInLine(lineText, entityName, lineNum, entityIndicator);
      if (lineRanges.length > 0) {
        // Return the first occurrence found
        return lineRanges[0];
      }
    }

    return null;
  }

  /**
   * Finds all occurrences of an entity name within a range of lines (for clauses)
   * @param doc The document to search
   * @param startLine The starting line number (inclusive)
   * @param endLine The ending line number (inclusive)
   * @param entityName The entity name to find
   * @param entityIndicator The entity indicator (name/arity)
   * @returns Array of ranges where the entity name appears
   */
  private findEntityRangesInRange(
    doc: TextDocument,
    startLine: number,
    endLine: number,
    entityName: string,
    entityIndicator: string
  ): Range[] {
    const ranges: Range[] = [];

    // Search each line in the range
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const lineRanges = this.findEntityRangesInLine(lineText, entityName, lineNum, entityIndicator);
      ranges.push(...lineRanges);
    }

    return ranges;
  }

  /**
   * Finds entity name ranges in a line with arity checking, handling special cases like Entity::Message
   * @param lineText The text of the line
   * @param entityName The entity name to find
   * @param lineNumber The line number (for creating ranges)
   * @param entityIndicator The entity indicator (name/arity)
   * @returns Array of ranges where the entity name appears with correct arity
   */
  private findEntityRangesInLine(lineText: string, entityName: string, lineNumber: number, entityIndicator: string): Range[] {
    const ranges: Range[] = [];

    // Extract expected arity from entity indicator
    const expectedArity = parseInt(entityIndicator.split('/')[1], 10);

    // Create patterns for different entity contexts:
    // 1. Entity opening directive: :- object(entity_name, ...)
    // 2. Entity::Message patterns: entity_name::message
    // 3. Entity::Predicate patterns: entity_name::predicate/arity
    // 4. Entity::NonTerminal patterns: entity_name::non_terminal//arity
    // 5. Parametric entity references: entity_name(params) in imports/extends/etc.
    // 6. Regular entity references

    const patterns = [
      // Entity::Message patterns: entity_name directly followed by ::
      new RegExp(`\\b(${this.escapeRegex(entityName)})(?=::)`, 'g'),
      // Parametric entity patterns: entity_name followed by opening parenthesis (anywhere in line)
      new RegExp(`\\b(${this.escapeRegex(entityName)})(?=\\()`, 'g'),
      // Standalone entity name patterns (not followed by parentheses or ::)
      new RegExp(`\\b(${this.escapeRegex(entityName)})(?![\\(::])\\b`, 'g')
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(lineText)) !== null) {
        const startChar = match.index;
        const endChar = startChar + match[0].length;

        // Validate that this is a valid entity context
        if (this.isValidEntityContextInText(lineText, startChar, endChar, entityName)) {
          // Check arity for this entity occurrence
          if (this.checkEntityArityAtPosition(lineText, endChar, expectedArity)) {
            const range = new Range(lineNumber, startChar, lineNumber, endChar);
            ranges.push(range);
            this.logger.debug(`✅ Found entity "${entityName}" with correct arity ${expectedArity} at ${lineNumber + 1}:${startChar + 1}`);
          } else {
            this.logger.debug(`❌ Rejected entity "${entityName}" with wrong arity at ${lineNumber + 1}:${startChar + 1}`);
          }
        }
      }
    }

    return ranges;
  }

  /**
   * Checks if an entity occurrence has the expected arity
   * @param text The line text
   * @param endPos The position after the entity name
   * @param expectedArity The expected arity
   * @returns true if the arity matches
   */
  private checkEntityArityAtPosition(text: string, endPos: number, expectedArity: number): boolean {
    const after = endPos < text.length ? text[endPos] : '';

    this.logger.debug(`  Checking entity arity at position ${endPos}, character after: "${after}"`);

    // Check for explicit arity indicator: entity/arity
    if (after === '/') {
      const arityMatch = text.substring(endPos + 1).match(/^(\d+)/);
      if (arityMatch) {
        const arity = parseInt(arityMatch[1], 10);
        this.logger.debug(`    Found entity indicator: arity ${arity}, expected ${expectedArity}`);
        return arity === expectedArity;
      }
      this.logger.debug(`    No entity indicator found after /`);
      return false;
    }

    // Check for parameter list: entity(param1, param2, ...)
    if (after === '(') {
      const argCount = this.countArgumentsAfterPosition(text, endPos);
      this.logger.debug(`    Found parentheses: counted ${argCount} arguments, expected ${expectedArity}`);
      return argCount === expectedArity;
    }

    // For arity 0 entities, accept if no parameters or indicators follow
    if (expectedArity === 0) {
      // Check that we're not followed by parameters or arity indicators
      if (after === '(' || after === '/') {
        this.logger.debug(`    Expected arity 0 but found parameters/indicator`);
        return false;
      }
      this.logger.debug(`    Expected arity 0, no parameters found - accepting`);
      return true;
    }

    // For non-zero arity entities without explicit indicators, we need to be more careful
    // In entity contexts, this might be acceptable (e.g., in implements/extends clauses)
    // But we should validate the context more carefully
    this.logger.debug(`    Expected arity ${expectedArity} but no indicator or parentheses found - accepting for entity context`);
    return true;
  }

  /**
   * Validates if an entity occurrence is in a valid context
   * @param text The line text
   * @param startPos Start position of the entity name
   * @param endPos End position of the entity name
   * @param entityName The entity name
   * @returns true if valid context
   */
  private isValidEntityContextInText(text: string, startPos: number, endPos: number, entityName: string): boolean {
    // Check if this is in a comment
    const beforeMatch = text.substring(0, startPos);
    if (beforeMatch.includes('%')) {
      return false;
    }

    // Check if this is in a string literal
    const singleQuotes = (beforeMatch.match(/'/g) || []).length;
    const doubleQuotes = (beforeMatch.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
      return false;
    }

    // Additional validation for entity contexts could be added here
    // For now, accept all non-comment, non-string contexts

    return true;
  }

  /**
   * Determines the replacement text for an entity occurrence
   * @param lineText The line text
   * @param range The range of the entity occurrence
   * @param currentName The current entity name
   * @param newName The new entity name
   * @returns The replacement text
   */
  private determineEntityReplacementText(lineText: string, range: Range, currentName: string, newName: string): string {
    const originalText = lineText.substring(range.start.character, range.end.character);

    // If the original text is quoted, preserve quotes
    if (originalText.startsWith("'") && originalText.endsWith("'")) {
      return `'${newName}'`;
    }

    // For regular entity names, just replace with the new name
    return newName;
  }



  /**
   * Validates if a range is valid within a document
   * @param document The document
   * @param range The range to validate
   * @returns true if the range is valid
   */
  private isValidRange(document: TextDocument, range: Range): boolean {
    // Check line bounds
    if (range.start.line < 0 || range.start.line >= document.lineCount) {
      return false;
    }
    if (range.end.line < 0 || range.end.line >= document.lineCount) {
      return false;
    }

    // Check character bounds
    const startLine = document.lineAt(range.start.line);
    const endLine = document.lineAt(range.end.line);

    if (range.start.character < 0 || range.start.character > startLine.text.length) {
      return false;
    }
    if (range.end.character < 0 || range.end.character > endLine.text.length) {
      return false;
    }

    // Check that start comes before end
    if (range.start.line > range.end.line) {
      return false;
    }
    if (range.start.line === range.end.line && range.start.character >= range.end.character) {
      return false;
    }

    return true;
  }

  /**
   * Deduplicates locations by converting bag to set
   * More efficient than deduplicating edits since providers often return same locations
   * @param locations Array of locations that may contain duplicates
   * @returns Array of unique locations sorted by position
   */
  private deduplicateLocations(locations: { uri: Uri; range: Range }[]): { uri: Uri; range: Range }[] {
    if (locations.length === 0) return locations;

    // Use Map with composite key for efficient deduplication
    const locationMap = new Map<string, { uri: Uri; range: Range }>();

    for (const location of locations) {
      // Create composite key: uri + line + character + endLine + endCharacter
      const key = `${location.uri.toString()}:${location.range.start.line}:${location.range.start.character}:${location.range.end.line}:${location.range.end.character}`;

      if (!locationMap.has(key)) {
        locationMap.set(key, location);
      } else {
        this.logger.debug(`Skipping duplicate location at ${location.uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character + 1}`);
      }
    }

    // Convert back to array and sort by position for consistent processing
    const uniqueLocations = Array.from(locationMap.values());

    // Sort by URI first, then by position within file
    uniqueLocations.sort((a, b) => {
      const uriCompare = a.uri.toString().localeCompare(b.uri.toString());
      if (uriCompare !== 0) return uriCompare;

      const lineCompare = a.range.start.line - b.range.start.line;
      if (lineCompare !== 0) return lineCompare;

      return a.range.start.character - b.range.start.character;
    });

    this.logger.debug(`Deduplicated ${locations.length} locations to ${uniqueLocations.length} unique locations`);
    return uniqueLocations;
  }

  /**
   * Finds predicate/non-terminal ranges in a line of text with arity checking (for clause contexts)
   * @param lineText The line text
   * @param predicateIndicator The predicate/non-terminal indicator (name/arity or name//arity) to find
   * @param lineNumber The line number (0-based)
   * @returns Array of ranges
   */
  private findPredicateRangesInLineWithArity(lineText: string, predicateIndicator: string, lineNumber: number): Range[] {
    const ranges: Range[] = [];
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const [predicateName, arityStr] = predicateIndicator.split(separator);
    const expectedArity = parseInt(arityStr, 10);

    // For clause processing, we don't require indicator format since predicates appear as standalone names or with parentheses
    const textRanges = this.findPredicateRangesInTextWithArity(lineText, predicateName, expectedArity, isNonTerminal, false);

    for (const textRange of textRanges) {
      const startPos = new Position(lineNumber, textRange.start);
      const endPos = new Position(lineNumber, textRange.end);
      ranges.push(new Range(startPos, endPos));
    }

    return ranges;
  }

  /**
   * Finds predicate/non-terminal ranges in a line of text with arity checking (for directive contexts)
   * @param lineText The line text
   * @param predicateIndicator The predicate/non-terminal indicator (name/arity or name//arity) to find
   * @param lineNumber The line number (0-based)
   * @returns Array of ranges
   */
  private findPredicateRangesInLineWithIndicatorFormat(lineText: string, predicateIndicator: string, lineNumber: number): Range[] {
    const ranges: Range[] = [];
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const [predicateName, arityStr] = predicateIndicator.split(separator);
    const expectedArity = parseInt(arityStr, 10);

    // For directive processing, we require indicator format since predicates appear as name/arity indicators
    const textRanges = this.findPredicateRangesInTextWithArity(lineText, predicateName, expectedArity, isNonTerminal, true);

    for (const textRange of textRanges) {
      const startPos = new Position(lineNumber, textRange.start);
      const endPos = new Position(lineNumber, textRange.end);
      ranges.push(new Range(startPos, endPos));
    }

    return ranges;
  }

  /**
   * Determines the appropriate replacement text based on context
   * @param lineText The text of the line
   * @param range The range being replaced
   * @param currentName The current predicate name
   * @param newName The new predicate name
   * @returns The appropriate replacement text
   */
  private determineReplacementText(lineText: string, range: Range, currentName: string, newName: string): string {
    const originalText = lineText.substring(range.start.character, range.end.character);

    // If the original text is quoted, preserve quotes
    if (originalText.startsWith("'") && originalText.endsWith("'")) {
      // If new name is already quoted, use as-is, otherwise add quotes
      return newName.startsWith("'") && newName.endsWith("'") ? newName : `'${newName}'`;
    }

    // If the original text is not quoted but the new name is quoted, remove quotes
    if (newName.startsWith("'") && newName.endsWith("'")) {
      return newName.slice(1, -1);
    }

    // Otherwise, use the new name as-is
    return newName;
  }

  /**
   * Finds the exact position of a predicate name in a declaration line or multi-line directive
   * @param doc The document
   * @param declarationLine The line number of the declaration
   * @param predicateIndicator The predicate/non-terminal indicator (name/arity or name//arity)
   * @returns Position of the predicate name
   */
  private findPredicatePositionInDeclaration(doc: TextDocument, declarationLine: number, predicateIndicator: string): Position {
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const [predicateName] = predicateIndicator.split(separator);

    // First try to find the predicate on the declaration line itself
    const lineText = doc.lineAt(declarationLine).text;
    const ranges = this.findPredicateRangesInLineWithArity(lineText, predicateIndicator, declarationLine);

    if (ranges.length > 0) {
      return ranges[0].start;
    }

    // If not found on the declaration line, this might be a multi-line directive
    // Use the multi-line directive search logic
    const multiLineRanges = this.findPredicateInMultiLineDirective(doc, declarationLine, predicateName);

    // Filter the ranges to find the one that matches our specific predicate indicator
    for (const range of multiLineRanges) {
      const rangeLineText = doc.lineAt(range.start.line).text;
      const rangeText = rangeLineText.substring(range.start.character, range.end.character);

      // Check if this range corresponds to our specific predicate by looking at the context
      // We need to verify the arity matches
      const afterRange = rangeLineText.substring(range.end.character);
      if (this.isCorrectPredicateInDirective(rangeText, afterRange, predicateIndicator)) {
        this.logger.debug(`Found predicate "${predicateIndicator}" in multi-line directive at line ${range.start.line + 1}:${range.start.character + 1}`);
        return range.start;
      }
    }

    // Fallback: return start of line if not found
    this.logger.debug(`Predicate "${predicateIndicator}" not found in declaration, using fallback position`);
    return new Position(declarationLine, 0);
  }

  /**
   * Checks if a predicate name match in a directive corresponds to the correct predicate indicator
   * @param rangeText The matched predicate name text
   * @param afterRange The text after the matched predicate name
   * @param predicateIndicator The full predicate indicator we're looking for
   * @returns true if this is the correct predicate match
   */
  private isCorrectPredicateInDirective(rangeText: string, afterRange: string, predicateIndicator: string): boolean {
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const [expectedName, expectedArity] = predicateIndicator.split(separator);

    // The range text should match the expected predicate name
    if (rangeText !== expectedName) {
      return false;
    }

    // Check if the arity matches by looking at what follows the predicate name
    const arityMatch = afterRange.match(/^\/(\d+)/);
    if (arityMatch) {
      const foundArity = arityMatch[1];
      return foundArity === expectedArity;
    }

    // If no explicit arity found, this might be in a context where arity is implicit
    // For now, accept it as a potential match
    return true;
  }

  /**
   * Finds the position of an entity name in a multi-line directive
   * @param doc The document
   * @param startLine The line number where the directive starts
   * @param entityName The entity name to find
   * @param entityIndicator The entity indicator (name/arity)
   * @returns Position of the entity name
   */
  private findEntityPositionInDirective(doc: TextDocument, startLine: number, entityName: string, entityIndicator: string): Position {
    // Search through the directive lines to find the entity name
    // Multi-line directives can span several lines, so we need to search forward

    const maxSearchLines = 10; // Reasonable limit for directive length
    const endLine = Math.min(startLine + maxSearchLines, doc.lineCount);

    for (let lineNum = startLine; lineNum < endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // Look for the entity name in this line
      const ranges = this.findEntityRangesInLine(lineText, entityName, lineNum, entityIndicator);

      if (ranges.length > 0) {
        // Found the entity name on this line
        this.logger.debug(`Found entity "${entityName}" in directive at line ${lineNum + 1}:${ranges[0].start.character + 1}`);
        return ranges[0].start;
      }

      // Check if we've reached the end of the directive
      if (lineText.includes(').') || lineText.includes('].)')) {
        break;
      }
    }

    // Fallback: return start of the original line if not found
    this.logger.debug(`Entity "${entityName}" not found in directive starting at line ${startLine + 1}, using fallback position`);
    return new Position(startLine, 0);
  }

  /**
   * Finds the position of a predicate or non-terminal name in a definition line
   * @param doc The document
   * @param definitionLine The line number of the definition
   * @param predicateIndicator The predicate/non-terminal indicator (name/arity or name//arity)
   * @param isNonTerminal Whether this is a non-terminal (uses -->) or predicate (uses :-)
   * @returns Position of the predicate/non-terminal name
   */
  private findPredicatePositionInDefinition(doc: TextDocument, definitionLine: number, predicateIndicator: string, isNonTerminal: boolean): Position {
    const lineText = doc.lineAt(definitionLine).text;

    // For definitions, we look for the predicate/non-terminal name at the start of the clause/rule
    // Predicate clause: "predicate_name(Args) :- body."
    // Non-terminal rule: "non_terminal_name(Args) --> body."

    const expectedOperator = isNonTerminal ? '-->' : ':-';

    // Find the predicate name in the line with arity checking, but only if it's followed by the correct operator
    const ranges = this.findPredicateRangesInLineWithArity(lineText, predicateIndicator, definitionLine);

    for (const range of ranges) {
      // Check if this occurrence is followed by the expected operator or is a fact
      const afterRange = lineText.substring(range.end.character);
      const operatorMatch = afterRange.match(/^\s*(\(.*?\))?\s*(-->|:-)/);
      const factMatch = afterRange.match(/^\s*(\(.*?\))?\s*\./);

      if (operatorMatch && operatorMatch[2] === expectedOperator) {
        // Found predicate/non-terminal with expected operator
        return range.start;
      } else if (!isNonTerminal && factMatch) {
        // Found predicate fact (no operator, just arguments and period)
        return range.start;
      }
    }

    // Fallback: return start of line if not found
    return new Position(definitionLine, 0);
  }

  /**
   * Finds predicate ranges in directives, handling multi-line directives and related predicate directives
   * @param doc The document containing the directive
   * @param startLine The line where the scope directive starts
   * @param predicateName The predicate name to find
   * @param predicateIndicator The full predicate indicator (name/arity)
   * @returns Array of ranges where the predicate name appears in directives
   */
  private findDirectivePredicateRanges(
    doc: TextDocument,
    startLine: number,
    predicateName: string,
    predicateIndicator: string
  ): Range[] {
    const ranges: Range[] = [];

    // Handle both predicate (name/arity) and non-terminal (name//arity) indicators
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const [name, arity] = predicateIndicator.split(separator);

    // First, handle the scope directive itself (may be multi-line)
    const scopeRanges = this.findPredicateInMultiLineDirective(doc, startLine, predicateName);
    ranges.push(...scopeRanges);

    // Then, look for related predicate directives that follow
    const relatedRanges = this.findRelatedDirectives(doc, startLine, name, arity, isNonTerminal);
    ranges.push(...relatedRanges);

    return ranges;
  }

  /**
   * Finds predicate names in a potentially multi-line directive
   * @param doc The document
   * @param startLine The starting line of the directive
   * @param predicateName The predicate name to find
   * @returns Array of ranges where the predicate appears
   */
  private findPredicateInMultiLineDirective(doc: TextDocument, startLine: number, predicateName: string): Range[] {
    const ranges: Range[] = [];
    let currentLine = startLine;
    let directiveText = '';
    let lineOffsets: number[] = [];

    // Read the complete directive (until we find the closing period or parenthesis)
    while (currentLine < doc.lineCount) {
      const lineText = doc.lineAt(currentLine).text;
      lineOffsets.push(directiveText.length);
      directiveText += lineText;

      // Check if this line completes the directive
      const trimmedLine = lineText.trim();
      if (trimmedLine.endsWith('.') ||
          (trimmedLine.includes(')') && this.isDirectiveComplete(directiveText))) {
        break;
      }

      directiveText += ' '; // Add space between lines
      currentLine++;
    }

    // Find predicate names in the complete directive text
    const predicateMatches = this.findPredicateRangesInText(directiveText, predicateName);

    // Convert text positions back to document positions
    for (const match of predicateMatches) {
      const docPosition = this.convertTextPositionToDocPosition(
        match.start, match.end, startLine, lineOffsets, doc
      );
      if (docPosition) {
        ranges.push(docPosition);
      }
    }

    return ranges;
  }

  /**
   * Finds related predicate directives that follow the scope directive
   * @param doc The document
   * @param scopeLine The line of the scope directive
   * @param predicateName The predicate name
   * @param arity The predicate arity
   * @param isNonTerminal Whether this is a non-terminal (uses //) or predicate (uses /)
   * @returns Array of ranges in related directives
   */
  private findRelatedDirectives(doc: TextDocument, scopeLine: number, predicateName: string, arity: string, isNonTerminal: boolean = false): Range[] {
    const ranges: Range[] = [];
    const separator = isNonTerminal ? '//' : '/';
    const predicateIndicator = `${predicateName}${separator}${arity}`;

    // Directives that use predicate indicators (name/arity or name//arity)
    const indicatorDirectives = [
      'info', 'dynamic', 'discontiguous', 'multifile', 'synchronized', 'coinductive'
    ];

    // Directives that use callable forms (name(args))
    const callableDirectives = [
      'mode', 'meta_predicate', 'meta_non_terminal'
    ];

    // Start searching from the line after the scope directive
    let currentLine = scopeLine + 1;

    // Search through all subsequent lines until we reach the end of the file
    // or encounter a boundary that indicates we've moved past related directives
    while (currentLine < doc.lineCount) {
      const lineText = doc.lineAt(currentLine).text;
      const trimmedLineText = lineText.trim();

      // Skip empty lines and comments, but continue searching
      if (trimmedLineText === '' || trimmedLineText.startsWith('%')) {
        currentLine++;
        continue;
      }

      // Stop if we hit a non-directive line (predicate clause, entity boundary, etc.)
      if (!trimmedLineText.startsWith(':-')) {
        break;
      }

      // This is a directive - check if it's for our predicate
      let isDirectiveForOurPredicate = false;
      let isRecognizedDirectiveType = false;
      let directiveRange: { start: number; end: number } | null = null;

      // Check for indicator-based directives
      for (const directiveType of indicatorDirectives) {
        if (trimmedLineText.includes(`${directiveType}(`)) {
          isRecognizedDirectiveType = true;
          directiveRange = PredicateUtils.getDirectiveRange(doc, currentLine);

          // Check if this directive contains our specific predicate indicator
          if (this.isDirectiveForPredicateIndicator(doc, directiveRange.start, directiveRange.end, predicateIndicator)) {
            isDirectiveForOurPredicate = true;

            // Find all occurrences of our predicate indicator in this directive
            const directiveRanges = this.findPredicateInDirectiveRange(doc, directiveRange.start, directiveRange.end, predicateIndicator);
            ranges.push(...directiveRanges);
          }
          break; // Found the directive type, no need to check others
        }
      }

      // Check for callable-based directives (only if not already found as indicator-based)
      if (!isRecognizedDirectiveType) {
        for (const directiveType of callableDirectives) {
          if (trimmedLineText.includes(`${directiveType}(`)) {
            isRecognizedDirectiveType = true;
            directiveRange = PredicateUtils.getDirectiveRange(doc, currentLine);

            // Check if this directive contains our predicate in callable form
            if (this.isDirectiveForPredicateCallable(doc, directiveRange.start, directiveRange.end, predicateName, parseInt(arity, 10))) {
              isDirectiveForOurPredicate = true;

              // Find all occurrences of our predicate name in this directive
              const directiveRanges = this.findPredicateNameInDirectiveRange(doc, directiveRange.start, directiveRange.end, predicateName, parseInt(arity, 10));
              ranges.push(...directiveRanges);
            }
            break; // Found the directive type, no need to check others
          }
        }
      }

      // Advance to the next line or directive
      if (directiveRange) {
        currentLine = directiveRange.end + 1;
      } else {
        break;
      }

      // If this is a recognized directive type but not for our predicate, stop searching
      // This indicates we've moved to directives for a different predicate
      if (!isRecognizedDirectiveType || !isDirectiveForOurPredicate) {
        break;
      }
    }

    return ranges;
  }



  /**
   * Checks if a directive range contains the specified predicate indicator
   * @param doc The document
   * @param startLine Start line of the directive
   * @param endLine End line of the directive
   * @param predicateIndicator The predicate indicator (name/arity or name//arity)
   * @returns true if the directive contains the predicate indicator
   */
  private isDirectiveForPredicateIndicator(
    doc: TextDocument,
    startLine: number,
    endLine: number,
    predicateIndicator: string
  ): boolean {
    // Extract predicate name from indicator
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const [predicateName] = predicateIndicator.split(separator);

    // Check each line in the directive range
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // Look for the exact predicate indicator first
      if (lineText.includes(predicateIndicator)) {
        return true;
      }

      // Also check for predicate name with arity validation
      if (lineText.includes(predicateName)) {
        // Validate that this occurrence has the correct arity
        const ranges = this.findPredicateRangesInLineWithArity(lineText, predicateIndicator, lineNum);
        if (ranges.length > 0) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Finds all occurrences of a predicate in a directive range
   * @param doc The document
   * @param startLine Start line of the directive
   * @param endLine End line of the directive
   * @param predicateIndicator The predicate indicator (name/arity or name//arity)
   * @returns Array of ranges where the predicate appears
   */
  private findPredicateInDirectiveRange(
    doc: TextDocument,
    startLine: number,
    endLine: number,
    predicateIndicator: string
  ): Range[] {
    const ranges: Range[] = [];

    // Search each line in the directive range
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const lineRanges = this.findPredicateRangesInLineWithArity(lineText, predicateIndicator, lineNum);
      ranges.push(...lineRanges);
    }

    return ranges;
  }

  /**
   * Checks if a directive range contains the specified predicate in callable form
   * @param doc The document
   * @param startLine Start line of the directive
   * @param endLine End line of the directive
   * @param predicateName The predicate name
   * @param expectedArity The expected arity
   * @returns true if the directive contains the predicate in callable form
   */
  private isDirectiveForPredicateCallable(
    doc: TextDocument,
    startLine: number,
    endLine: number,
    predicateName: string,
    expectedArity: number
  ): boolean {
    // Check each line in the directive range
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      if (expectedArity === 0) {
        // For zero-arity predicates, look for the predicate name NOT followed by opening parenthesis
        const namePattern = new RegExp(`\\b${this.escapeRegex(predicateName)}\\b`, 'g');
        let match: RegExpExecArray | null;

        while ((match = namePattern.exec(lineText)) !== null) {
          const startPos = match.index;
          const nameEndPos = startPos + predicateName.length;

          // Validate that this is a valid predicate context
          if (this.isValidPredicateContextInText(lineText, startPos, nameEndPos)) {
            // Check that it's NOT followed by opening parenthesis (zero-arity)
            const afterChar = nameEndPos < lineText.length ? lineText[nameEndPos] : '';
            if (afterChar !== '(') {
              return true;
            }
          }
        }
      } else {
        // For non-zero arity predicates, look for the predicate name followed by opening parenthesis
        const namePattern = new RegExp(`\\b${this.escapeRegex(predicateName)}\\(`, 'g');
        let match: RegExpExecArray | null;

        while ((match = namePattern.exec(lineText)) !== null) {
          const startPos = match.index;
          const nameEndPos = startPos + predicateName.length;

          // Validate that this is a valid predicate context
          if (this.isValidPredicateContextInText(lineText, startPos, nameEndPos)) {
            // Check if the arity matches by counting arguments
            const argCount = this.countArgumentsAfterPosition(lineText, nameEndPos);
            if (argCount === expectedArity) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Finds all occurrences of a predicate name in a directive range (for callable-based directives)
   * @param doc The document
   * @param startLine Start line of the directive
   * @param endLine End line of the directive
   * @param predicateName The predicate name
   * @param expectedArity The expected arity
   * @returns Array of ranges where the predicate name appears
   */
  private findPredicateNameInDirectiveRange(
    doc: TextDocument,
    startLine: number,
    endLine: number,
    predicateName: string,
    expectedArity: number
  ): Range[] {
    const ranges: Range[] = [];

    // Search each line in the directive range
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      if (expectedArity === 0) {
        // For zero-arity predicates, look for the predicate name NOT followed by opening parenthesis
        const namePattern = new RegExp(`\\b${this.escapeRegex(predicateName)}\\b`, 'g');
        let match: RegExpExecArray | null;

        while ((match = namePattern.exec(lineText)) !== null) {
          const startPos = match.index;
          const endPos = startPos + match[0].length;

          // Validate that this is a valid predicate context
          if (this.isValidPredicateContextInText(lineText, startPos, endPos)) {
            // Check that it's NOT followed by opening parenthesis (zero-arity)
            const afterChar = endPos < lineText.length ? lineText[endPos] : '';
            if (afterChar !== '(') {
              const range = new Range(
                new Position(lineNum, startPos),
                new Position(lineNum, endPos)
              );
              ranges.push(range);
            }
          }
        }
      } else {
        // For non-zero arity predicates, find the predicate name (will be part of callable form)
        const namePattern = new RegExp(`\\b${this.escapeRegex(predicateName)}\\b`, 'g');
        let match: RegExpExecArray | null;

        while ((match = namePattern.exec(lineText)) !== null) {
          const startPos = match.index;
          const endPos = startPos + match[0].length;

          // Validate that this is a valid predicate context
          if (this.isValidPredicateContextInText(lineText, startPos, endPos)) {
            // For non-zero arity, we want to find the name part of callable forms
            // Additional validation could be added here to ensure it's followed by parentheses
            const range = new Range(
              new Position(lineNum, startPos),
              new Position(lineNum, endPos)
            );
            ranges.push(range);
          }
        }
      }
    }

    return ranges;
  }

  /**
   * Validates if a location has valid line numbers
   * @param location The location to validate
   * @returns true if the location is valid
   */
  private isValidLocation(location: { uri: Uri; range: Range }): boolean {
    return location.range.start.line >= 0 &&
           location.range.end.line >= 0 &&
           location.range.start.character >= 0 &&
           location.range.end.character >= 0;
  }

  /**
   * Validates if a match is in a valid predicate context
   * @param lineText The text of the line
   * @param startChar Start character position of the match
   * @param endChar End character position of the match
   * @returns true if this is a valid predicate context
   */
  private isValidPredicateContext(lineText: string, startChar: number, endChar: number): boolean {
    // Skip if we're inside a comment
    const commentIndex = lineText.indexOf('%');
    if (commentIndex !== -1 && startChar >= commentIndex) {
      return false;
    }

    // Skip if we're inside a string literal (between double quotes)
    let inString = false;
    let escaped = false;
    for (let i = 0; i < startChar; i++) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (lineText[i] === '\\') {
        escaped = true;
        continue;
      }
      if (lineText[i] === '"') {
        inString = !inString;
      }
    }
    if (inString) {
      return false;
    }

    // Check what comes before and after the match
    const before = startChar > 0 ? lineText[startChar - 1] : '';
    const after = endChar < lineText.length ? lineText[endChar] : '';
    const matchedText = lineText.substring(startChar, endChar);

    // Get some context around the match
    const beforeContext = lineText.substring(Math.max(0, startChar - 30), startChar);
    const afterContext = lineText.substring(endChar, Math.min(lineText.length, endChar + 10));

    this.logger.debug(`Context check for "${matchedText}": before="${beforeContext.slice(-15)}", after="${afterContext.slice(0, 5)}"`);

    // Reject directive keywords themselves (like "mode" in ":- mode(...)")
    if (/:-\s*$/.test(beforeContext) && /\s*\(/.test(afterContext)) {
      this.logger.debug(`❌ Invalid: directive keyword "${matchedText}"`);
      return false;
    }

    // Valid contexts:
    // 1. In scope directives: :- public(predicate/arity)
    // 2. Predicate heads: predicate :- ...
    // 3. Predicate calls: ..., predicate, ...
    // 4. After operators: ->, ;, etc.

    // Check for scope directive context (including mode/info with predicate names)
    const inScopeDirective = /:-\s*(public|private|protected|meta_predicate|mode|info|dynamic|discontiguous|multifile)\s*\(\s*[^)]*$/.test(beforeContext);

    // Standard validation
    const validBefore = /^[\s,\(\[\{:-]$/.test(before) || startChar === 0 ||
                       lineText.substring(0, startChar).trim() === '' ||
                       inScopeDirective;

    const validAfter = /^[\s,\)\]\}\.:/]$/.test(after) || after === '' ||
                      !!lineText.substring(endChar).match(/^\s*[\(\/:]/);

    const isValid = validBefore && validAfter;
    this.logger.debug(`Context result for "${matchedText}": ${isValid ? '✅ Valid' : '❌ Invalid'} (before: ${validBefore}, after: ${validAfter})`);

    return isValid;
  }

  /**
   * Checks if a directive text is complete (has matching parentheses)
   * @param directiveText The directive text to check
   * @returns true if the directive is complete
   */
  private isDirectiveComplete(directiveText: string): boolean {
    let parenCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < directiveText.length; i++) {
      const char = directiveText[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"' || char === "'") {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '(') parenCount++;
        if (char === ')') parenCount--;
      }
    }

    return parenCount === 0;
  }

  /**
   * Finds predicate ranges in a text string
   * @param text The text to search
   * @param predicateName The predicate name to find
   * @returns Array of start/end positions
   */
  private findPredicateRangesInText(text: string, predicateName: string): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    const searchName = predicateName.startsWith("'") && predicateName.endsWith("'")
      ? predicateName.slice(1, -1)
      : predicateName;

    let pattern: RegExp;
    if (predicateName.startsWith("'") && predicateName.endsWith("'")) {
      pattern = new RegExp(`'${this.escapeRegex(searchName)}'`, 'g');
    } else {
      // Create a more precise pattern that matches the predicate name exactly
      // Use word boundaries but be more specific about what follows
      pattern = new RegExp(`\\b${this.escapeRegex(searchName)}\\b`, 'g');
    }

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // Additional validation to ensure this is a valid predicate context
      if (this.isValidPredicateContextInText(text, match.index, match.index + match[0].length)) {
        ranges.push({ start: match.index, end: match.index + match[0].length });
      }
    }

    return ranges;
  }

  /**
   * Finds predicate/non-terminal ranges in a text string with arity checking
   * @param text The text to search
   * @param predicateName The predicate/non-terminal name to find
   * @param expectedArity The expected arity of the predicate/non-terminal
   * @param isNonTerminal Whether we're searching for non-terminals
   * @param requireIndicatorFormat Whether to require explicit indicator format (name/arity)
   * @returns Array of start/end positions
   */
  private findPredicateRangesInTextWithArity(text: string, predicateName: string, expectedArity: number, isNonTerminal: boolean = false, requireIndicatorFormat: boolean = true): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    const searchName = predicateName.startsWith("'") && predicateName.endsWith("'")
      ? predicateName.slice(1, -1)
      : predicateName;

    let pattern: RegExp;
    if (predicateName.startsWith("'") && predicateName.endsWith("'")) {
      pattern = new RegExp(`'${this.escapeRegex(searchName)}'`, 'g');
    } else {
      pattern = new RegExp(`\\b${this.escapeRegex(searchName)}\\b`, 'g');
    }

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // Additional validation to ensure this is a valid predicate context
      if (this.isValidPredicateContextInText(text, match.index, match.index + match[0].length)) {
        // Check if the arity matches
        if (this.checkArityAtPosition(text, match.index + match[0].length, expectedArity, isNonTerminal, requireIndicatorFormat)) {
          ranges.push({ start: match.index, end: match.index + match[0].length });
        }
      }
    }

    return ranges;
  }

  /**
   * Checks if the predicate/non-terminal at the given position has the expected arity
   * @param text The full text
   * @param endPos End position of the predicate/non-terminal name
   * @param expectedArity The expected arity
   * @param isNonTerminal Whether we're checking a non-terminal indicator
   * @param requireIndicatorFormat Whether to require explicit indicator format (name/arity)
   * @returns true if the arity matches or cannot be determined
   */
  private checkArityAtPosition(text: string, endPos: number, expectedArity: number, isNonTerminal: boolean = false, requireIndicatorFormat: boolean = true): boolean {
    // Check what comes after the predicate/non-terminal name
    const after = endPos < text.length ? text[endPos] : '';

    // If followed by '/', this could be a predicate indicator (name/arity) or non-terminal indicator (name//arity)
    if (after === '/') {
      if (isNonTerminal) {
        // For non-terminals, expect '//' followed by arity
        const nonTerminalMatch = text.substring(endPos + 1).match(/^\/(\d+)/);
        if (nonTerminalMatch) {
          const arity = parseInt(nonTerminalMatch[1], 10);
          return arity === expectedArity;
        }
        return false; // Invalid non-terminal arity format
      } else {
        // For predicates, expect '/' followed by arity
        const arityMatch = text.substring(endPos + 1).match(/^(\d+)/);
        if (arityMatch) {
          const arity = parseInt(arityMatch[1], 10);
          return arity === expectedArity;
        }
        return false; // Invalid predicate arity format
      }
    }

    // If followed by '(', count the arguments
    if (after === '(') {
      const argCount = this.countArgumentsAfterPosition(text, endPos);
      return argCount === expectedArity;
    }

    // If not followed by '(' or '/', it might be a 0-arity predicate or in a different context
    // For 0-arity predicates, the behavior depends on whether we require indicator format
    if (expectedArity === 0) {
      if (requireIndicatorFormat) {
        // For indicator-based directives, we need explicit /0 format
        return false;
      } else {
        // For callable-based directives, standalone names are acceptable for zero-arity
        return true;
      }
    }

    // For non-zero arity predicates, we need parentheses, so this is not a match
    return false;
  }

  /**
   * Counts the number of arguments in a predicate call starting after the opening parenthesis
   * @param text The full text
   * @param openParenPos Position of the opening parenthesis
   * @returns Number of arguments, or -1 if cannot be determined
   */
  private countArgumentsAfterPosition(text: string, openParenPos: number): number {
    let pos = openParenPos + 1; // Start after the opening parenthesis
    let argCount = 0;
    let parenDepth = 0;
    let bracketDepth = 0; // Track square brackets for lists
    let inString = false;
    let escaped = false;
    let hasContent = false;

    while (pos < text.length) {
      const char = text[pos];

      if (escaped) {
        escaped = false;
        pos++;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        pos++;
        continue;
      }

      if (char === "'" && !inString) {
        inString = true;
        hasContent = true;
      } else if (char === "'" && inString) {
        inString = false;
      } else if (!inString) {
        if (char === '(') {
          parenDepth++;
          hasContent = true;
        } else if (char === ')') {
          if (parenDepth === 0) {
            // Found the closing parenthesis
            if (hasContent) {
              argCount++; // Count the last argument if there's content
            }
            return argCount;
          }
          parenDepth--;
        } else if (char === '[') {
          bracketDepth++;
          hasContent = true;
        } else if (char === ']') {
          bracketDepth--;
        } else if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
          // Only count commas that are at the top level (not inside parentheses or brackets)
          argCount++;
          hasContent = false; // Reset for next argument
        } else if (!char.match(/\s/)) {
          hasContent = true;
        }
      } else {
        hasContent = true;
      }

      pos++;
    }

    // If we reach here, the parentheses are not properly closed
    return -1;
  }

  /**
   * Finds all clauses of a predicate (since definition provider only returns first clause)
   * @param document The document where the predicate was selected
   * @param predicateIndicator The predicate indicator (name/arity)
   * @param existingLocations Already found locations to avoid duplicates
   * @returns Array of additional clause locations
   */
  private async findAllPredicateClauses(
    document: TextDocument,
    predicateIndicator: string,
    existingLocations: { uri: Uri; range: Range; origin: 'declaration' | 'definition' | 'implementation' | 'reference' }[]
  ): Promise<{ uri: Uri; range: Range }[]> {
    // Find the implementation/definition location to use as starting point
    // We need to distinguish between declaration locations and implementation locations
    const locationsInFile = existingLocations.filter(loc =>
      loc.uri.toString() === document.uri.toString()
    );

    // Look for an implementation location (not a declaration)
    let implementationLocation: { uri: Uri; range: Range } | undefined;

    for (const location of locationsInFile) {
      const lineText = document.lineAt(location.range.start.line).text.trim();

      // Skip declaration lines (directives starting with :-)
      if (lineText.startsWith(':-')) {
        this.logger.debug(`Skipping declaration line ${location.range.start.line + 1}: "${lineText}"`);
        continue;
      }

      // This should be an implementation location
      implementationLocation = location;
      this.logger.debug(`Found implementation location at line ${location.range.start.line + 1}: "${lineText}"`);
      break;
    }

    if (implementationLocation) {
      // Search for consecutive clauses starting from the implementation
      // Pass the full predicate indicator to enable arity checking
      return this.findConsecutivePredicateClauses(
        document,
        predicateIndicator,
        implementationLocation.range.start.line
      );
    }

    this.logger.debug(`No implementation location found for ${predicateIndicator} in ${document.uri.fsPath}`);
    return [];
  }

  /**
   * Finds consecutive predicate clauses or non-terminal rules starting from a known clause location
   * @param document The document to search
   * @param predicateIndicator The predicate/non-terminal indicator (name/arity or name//arity) to find
   * @param startLine The line number of a known clause (from definition provider)
   * @returns Array of locations where consecutive predicate clauses or non-terminal rules are defined
   */
  private findConsecutivePredicateClauses(
    document: TextDocument,
    predicateIndicator: string,
    startLine: number
  ): { uri: Uri; range: Range }[] {
    const locations: { uri: Uri; range: Range }[] = [];
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const [predicateName] = predicateIndicator.split(separator);

    this.logger.debug(`Starting consecutive ${isNonTerminal ? 'non-terminal rule' : 'clause'} search for ${predicateIndicator} from line ${startLine + 1} (first clause)`);

    // Determine the clause type from the starting line and dispatch to appropriate method
    const startLineText = document.lineAt(startLine).text;
    const isMultifileClauseType = this.isMultifilePredicateClause(startLineText, predicateName, isNonTerminal);
    this.logger.debug(`Clause type determined: ${isMultifileClauseType ? 'multifile' : 'regular'} from line ${startLine + 1}`);

    if (isMultifileClauseType) {
      return this.findConsecutiveMultifilePredicateClauses(document, predicateIndicator, startLine);
    } else {
      return this.findConsecutiveRegularPredicateClauses(document, predicateIndicator, startLine);
    }
  }

  /**
   * Finds consecutive regular predicate clauses starting from a known clause location
   * @param document The document to search
   * @param predicateIndicator The predicate/non-terminal indicator (name/arity or name//arity) to find
   * @param startLine The line number of a known clause (from definition provider)
   * @returns Array of locations where consecutive regular predicate clauses are defined
   */
  private findConsecutiveRegularPredicateClauses(
    document: TextDocument,
    predicateIndicator: string,
    startLine: number
  ): { uri: Uri; range: Range }[] {
    const locations: { uri: Uri; range: Range }[] = [];
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const [predicateName] = predicateIndicator.split(separator);

    this.logger.debug(`Starting consecutive regular ${isNonTerminal ? 'non-terminal rule' : 'clause'} search for ${predicateIndicator} from line ${startLine + 1}`);

    // Search forwards from startLine to find all consecutive regular clauses
    let lineNum = startLine;
    while (lineNum < document.lineCount) {
      const lineText = document.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      this.logger.debug(`Checking line ${lineNum + 1}: "${trimmedLine}"`);

      // Stop if we find a directive
      if (trimmedLine.startsWith(':-')) {
        this.logger.debug(`Stopping at directive: line ${lineNum + 1}`);
        break;
      }

      // Stop if we hit an entity boundary
      if (this.isEntityBoundary(trimmedLine)) {
        this.logger.debug(`Stopping at entity boundary: line ${lineNum + 1}`);
        break;
      }

      // Skip comments and empty lines, but continue searching
      if (trimmedLine.startsWith('%') || trimmedLine === '' ||
          trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.startsWith('*/')) {
        this.logger.debug(`Skipping comment/empty line: ${lineNum + 1}`);
        lineNum++;
        continue;
      }

      // Check if this is a regular clause/rule for our predicate/non-terminal
      if (this.isPredicateClause(lineText, predicateName, isNonTerminal)) {
        this.logger.debug(`Found regular ${isNonTerminal ? 'non-terminal rule' : 'clause'} for ${predicateName} at line ${lineNum + 1}`);
        // Find all occurrences of the predicate name in this clause (head + body)
        const clauseResult = this.findPredicateInClauseWithEndLine(document, lineNum, predicateIndicator);
        this.logger.debug(`Found ${clauseResult.ranges.length} ranges in clause at line ${lineNum + 1}, clause ends at line ${clauseResult.endLine + 1}`);
        locations.push(...clauseResult.ranges);
        // Skip ahead to after the end of this clause to avoid processing clause body lines
        lineNum = clauseResult.endLine + 1;
      } else {
        // Clause for some other predicate - stop searching
        this.logger.debug(`Stopping at a clause for a different predicate or non-terminal at line ${lineNum + 1}`);
        break;
      }
    }

    return locations;
  }

  /**
   * Finds consecutive multifile predicate clauses starting from a known clause location
   * @param document The document to search
   * @param predicateIndicator The predicate/non-terminal indicator (name/arity or name//arity) to find
   * @param startLine The line number of a known clause (from definition provider)
   * @returns Array of locations where consecutive multifile predicate clauses are defined
   */
  private findConsecutiveMultifilePredicateClauses(
    document: TextDocument,
    predicateIndicator: string,
    startLine: number
  ): { uri: Uri; range: Range }[] {
    const locations: { uri: Uri; range: Range }[] = [];
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const [predicateName] = predicateIndicator.split(separator);

    this.logger.debug(`Starting consecutive multifile ${isNonTerminal ? 'non-terminal rule' : 'clause'} search for ${predicateIndicator} from line ${startLine + 1}`);

    // Search forwards from startLine to find all consecutive multifile clauses
    let lineNum = startLine;
    while (lineNum < document.lineCount) {
      const lineText = document.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      this.logger.debug(`Checking line ${lineNum + 1}: "${trimmedLine}"`);

      // Stop if we find a directive
      if (trimmedLine.startsWith(':-')) {
        this.logger.debug(`Stopping at directive: line ${lineNum + 1}`);
        break;
      }

      // Stop if we hit an entity boundary
      if (this.isEntityBoundary(trimmedLine)) {
        this.logger.debug(`Stopping at entity boundary: line ${lineNum + 1}`);
        break;
      }

      // Skip comments and empty lines, but continue searching
      if (trimmedLine.startsWith('%') || trimmedLine === '' ||
          trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.startsWith('*/')) {
        this.logger.debug(`Skipping comment/empty line: ${lineNum + 1}`);
        lineNum++;
        continue;
      }

      // Check if this is a multifile clause/rule for our predicate/non-terminal
      if (this.isMultifilePredicateClause(lineText, predicateName, isNonTerminal)) {
        this.logger.debug(`Found multifile ${isNonTerminal ? 'non-terminal rule' : 'clause'} for ${predicateName} at line ${lineNum + 1}`);
        // Find all occurrences of the predicate name in this clause (head + body)
        const clauseResult = this.findPredicateInClauseWithEndLine(document, lineNum, predicateIndicator);
        this.logger.debug(`Found ${clauseResult.ranges.length} ranges in multifile clause at line ${lineNum + 1}, clause ends at line ${clauseResult.endLine + 1}`);
        locations.push(...clauseResult.ranges);

        // Skip ahead to after the end of this clause to avoid processing clause body lines
        lineNum = clauseResult.endLine + 1;
      } else {
        // Clause for some other predicate - stop searching
        this.logger.debug(`Stopping at a clause for a different predicate or non-terminal at line ${lineNum + 1}`);
        break;
      }
    }

    return locations;
  }

  /**
   * Finds consecutive entity clauses (multifile predicates) starting from a given line
   * @param document The document to search
   * @param startLine The line number where an entity clause was found
   * @param entityName The entity name to find
   * @param entityIndicator The entity indicator (name/arity)
   * @returns Array of ranges where consecutive entity clauses are found
   */
  private findConsecutiveEntityClauses(
    document: TextDocument,
    startLine: number,
    entityName: string,
    entityIndicator: string
  ): Range[] {
    const ranges: Range[] = [];

    this.logger.debug(`Starting consecutive entity clause search for ${entityName} from line ${startLine + 1}`);

    // Search forwards from startLine to find all consecutive entity clauses
    let lineNum = startLine;
    while (lineNum < document.lineCount) {
      const lineText = document.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      this.logger.debug(`Checking line ${lineNum + 1}: "${trimmedLine}"`);

      // Stop if we hit an entity boundary
      if (this.isEntityBoundary(trimmedLine)) {
        this.logger.debug(`Stopping at entity boundary: line ${lineNum + 1}`);
        break;
      }

      // Skip comments and empty lines, but continue searching
      if (trimmedLine.startsWith('%') || trimmedLine === '' ||
          trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.startsWith('*/')) {
        this.logger.debug(`Skipping comment/empty line: ${lineNum + 1}`);
        lineNum++;
        continue;
      }

      // Check if this line contains entity references
      const lineRanges = this.findEntityRangesInLine(lineText, entityName, lineNum, entityIndicator);

      if (lineRanges.length > 0) {
        this.logger.debug(`Found ${lineRanges.length} entity references for ${entityName} at line ${lineNum + 1}`);
        ranges.push(...lineRanges);
        lineNum++;
      } else {
        // Check if this line starts a different entity clause pattern
        if (this.isDifferentEntityClause(lineText, entityName)) {
          this.logger.debug(`Stopping at different entity clause: line ${lineNum + 1}`);
          break;
        }
        lineNum++;
      }
    }

    return ranges;
  }

  /**
   * Checks if a line starts a clause for a different entity
   * @param lineText The line text
   * @param entityName The entity name we're looking for
   * @returns true if this is a clause for a different entity
   */
  private isDifferentEntityClause(lineText: string, entityName: string): boolean {
    const trimmedLine = lineText.trim();

    // Check if this line contains an entity reference pattern (entity::predicate)
    const entityRefMatch = trimmedLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)::/);
    if (entityRefMatch) {
      const foundEntityName = entityRefMatch[1];
      // If it's a different entity, stop searching
      return foundEntityName !== entityName;
    }

    return false;
  }

  /**
   * Finds consecutive multifile predicate clauses for a specific entity starting from a given line
   * @param document The document to search
   * @param startLine The line number where a multifile clause was found
   * @param entityName The entity name to find
   * @param entityIndicator The entity indicator (name/arity) to validate arity
   * @returns Array of ranges where consecutive multifile clauses for the entity are found
   */
  private findConsecutiveMultifileClausesForEntity(
    document: TextDocument,
    startLine: number,
    entityName: string,
    entityIndicator: string
  ): Range[] {
    const ranges: Range[] = [];

    // Extract expected arity from entity indicator
    const expectedArity = parseInt(entityIndicator.split('/')[1], 10);
    this.logger.debug(`Starting consecutive multifile clause search for entity ${entityName}/${expectedArity} from line ${startLine + 1}`);

    // Search forwards from startLine to find all consecutive multifile clauses for this entity
    let lineNum = startLine;
    while (lineNum < document.lineCount) {
      const lineText = document.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Stop if we hit an entity boundary
      if (this.isEntityBoundary(trimmedLine)) {
        this.logger.debug(`Stopping at entity boundary: line ${lineNum + 1}`);
        break;
      }

      // Skip comments and empty/whitespace-only lines, but continue searching
      if (trimmedLine === '' || trimmedLine.startsWith('%') ||
          trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.startsWith('*/')) {
        lineNum++;
        continue;
      }

      // Check if this is a multifile clause for our entity
      // Handle both parametric and non-parametric entities
      const multifileResult = this.parseMultifileEntityClause(trimmedLine, entityName, expectedArity);
      if (multifileResult.isMatch) {
        if (multifileResult.entityName === entityName && multifileResult.arity === expectedArity) {
          // This is a multifile clause for our entity with correct arity
          this.logger.debug(`Found multifile clause for entity ${entityName}/${expectedArity} at line ${lineNum + 1}`);

          // Get the full clause range
          const clauseRange = PredicateUtils.getClauseRange(document, lineNum);
          ranges.push(new Range(
            new Position(clauseRange.start, 0),
            new Position(clauseRange.end, document.lineAt(clauseRange.end).text.length)
          ));

          // Skip ahead to after the end of this clause
          lineNum = clauseRange.end + 1;
        } else {
          // This is a multifile clause for a different entity or wrong arity, stop searching
          break;
        }
      } else {
        // Not a multifile clause, stop searching
        break;
      }
    }

    this.logger.debug(`Found ${ranges.length} consecutive multifile clauses for entity ${entityName}`);
    return ranges;
  }

  /**
   * Parses a line to check if it's a multifile entity clause and extracts entity info
   * @param lineText The line text to parse
   * @param targetEntityName The entity name we're looking for
   * @param expectedArity The expected arity for the entity
   * @returns Object with parsing results
   */
  private parseMultifileEntityClause(lineText: string, targetEntityName: string, expectedArity: number): {
    isMatch: boolean;
    entityName: string | null;
    arity: number;
  } {
    // Pattern to match Entity::Predicate or Entity(...)::Predicate
    const multifilePattern = /^([a-zA-Z_][a-zA-Z0-9_]*)(\(.+\))?::/;
    const match = lineText.match(multifilePattern);

    if (!match) {
      return { isMatch: false, entityName: null, arity: 0 };
    }

    const entityName = match[1];
    const argsString = match[2]; // Will be undefined for non-parametric entities

    let arity = 0;
    if (argsString) {
      // Remove parentheses and use robust argument parsing
      const args = argsString.slice(1, -1).trim();
      if (args === '') {
        arity = 0;
      } else {
        // Use ArgumentUtils for robust argument counting that handles nested structures
        const parsedArgs = ArgumentUtils.parseArguments(args);
        arity = parsedArgs.length;
      }
    }

    return {
      isMatch: true,
      entityName: entityName,
      arity: arity
    };
  }

  /**
   * Checks if a line represents an entity boundary
   * @param trimmedLine The trimmed line text
   * @returns true if this is an entity boundary
   */
  private isEntityBoundary(trimmedLine: string): boolean {
    return trimmedLine.startsWith(':- object(') ||
           trimmedLine.startsWith(':- protocol(') ||
           trimmedLine.startsWith(':- category(') ||
           trimmedLine.startsWith(':- end_object') ||
           trimmedLine.startsWith(':- end_protocol') ||
           trimmedLine.startsWith(':- end_category');
  }

  /**
   * Checks if a line is a clause for a different predicate or non-terminal
   * @param lineText The line text
   * @param predicateName The predicate/non-terminal name we're looking for
   * @param isNonTerminal Whether we're looking for non-terminal rules
   * @returns true if this is a clause for a different predicate/non-terminal
   */
  private isDifferentPredicateClause(lineText: string, predicateName: string, isNonTerminal: boolean = false): boolean {
    const trimmedLine = lineText.trim();

    // Skip comments, empty lines, and directives - these don't count as different predicates
    if (trimmedLine.startsWith('%') || trimmedLine === '' || trimmedLine.startsWith(':-') ||
        trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.startsWith('*/')) {
      return false;
    }

    // Skip lines that are clearly clause body content
    if (trimmedLine.startsWith(',') || trimmedLine.startsWith(';')) {
      return false;
    }

    // Skip lines with significant indentation (likely clause body content)
    // Predicate clauses typically start at column 0 or with minimal indentation (1-4 spaces)
    if (/^\s{8,}/.test(lineText)) {
      return false;
    }

    // Check if this starts a predicate clause or non-terminal rule
    if (isNonTerminal) {
      // For non-terminals, look for pattern: name(...) --> or name -->
      // No space allowed between name and ( for arguments
      const nonTerminalPattern = /^\s*([a-z][a-zA-Z0-9_]*|'[^']*')(\(.*\))?(\s*)-->/;
      const match = lineText.match(nonTerminalPattern);

      if (match) {
        const foundNonTerminalName = match[1];
        // Only return true if it's a different non-terminal (not our target non-terminal)
        return foundNonTerminalName !== predicateName;
      }
    } else {
      // For predicates, look for pattern:
      // - name( (predicates with arguments - no space before parenthesis)
      // - name :- (rules - space allowed before :-)
      // - name. (facts - space allowed before period)
      const clausePattern = /^\s*([a-z][a-zA-Z0-9_]*|'[^']*')(\(|(\s*(:-))|(\s*\.))/;
      const match = lineText.match(clausePattern);

      if (match) {
        const foundPredicateName = match[1];
        // Only return true if it's a different predicate (not our target predicate)
        return foundPredicateName !== predicateName;
      }
    }

    // If it doesn't match a predicate/non-terminal clause pattern, it's not a different one
    return false;
  }

  /**
   * Checks if a line is a clause for the specified predicate or non-terminal
   * @param lineText The line text
   * @param predicateName The predicate/non-terminal name to check for
   * @param isNonTerminal Whether we're looking for non-terminal rules
   * @returns true if this is a clause for the predicate/non-terminal
   */
  private isPredicateClause(lineText: string, predicateName: string, isNonTerminal: boolean = false): boolean {
    if (isNonTerminal) {
      // A non-terminal rule starts with the non-terminal name followed by optional ( and then -->
      // No space allowed between name and ( for arguments
      const nonTerminalPattern = new RegExp(`^\\s*${this.escapeRegex(predicateName)}(\\(.*\\))?\\s*-->`);
      return nonTerminalPattern.test(lineText);
    } else {
      // A predicate clause starts with the predicate name followed by:
      // - ( for predicates with arguments: foo(X) :- ... (no space before parenthesis)
      // - :- for rules: foo :- ... (space allowed before :-)
      // - . for zero-arity facts: foo. or foo . (space allowed before period)
      const clausePattern = new RegExp(`^\\s*${this.escapeRegex(predicateName)}(\\(|\\s*:-|\\s*\\.)`);
      return clausePattern.test(lineText);
    }
  }

  /**
   * Checks if a line is a multifile predicate clause (Entity::PredicateName format)
   * @param lineText The line text
   * @param predicateName The predicate/non-terminal name to check for
   * @param isNonTerminal Whether we're looking for non-terminal rules
   * @returns true if this is a multifile clause for the predicate/non-terminal
   */
  private isMultifilePredicateClause(lineText: string, predicateName: string, isNonTerminal: boolean = false): boolean {
    // Pattern to match Entity::PredicateName or Entity(...)::PredicateName
    // where Entity can be parametric or non-parametric
    const multifilePattern = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)(\(.+\))?::/;
    const match = lineText.match(multifilePattern);

    if (!match) {
      return false;
    }

    // Extract the part after :: to check if it's our predicate
    const afterDoubleColon = lineText.substring(lineText.indexOf('::') + 2);

    if (isNonTerminal) {
      // A multifile non-terminal rule: Entity::non_terminal_name(...) -->
      const nonTerminalPattern = new RegExp(`^\\s*${this.escapeRegex(predicateName)}(\\(.*\\))?\\s*-->`);
      return nonTerminalPattern.test(afterDoubleColon);
    } else {
      // A multifile predicate clause: Entity::predicate_name(...) :- or Entity::predicate_name(...)
      const clausePattern = new RegExp(`^\\s*${this.escapeRegex(predicateName)}(\\(|\\s*:-|\\s*\\.)`);
      return clausePattern.test(afterDoubleColon);
    }
  }

  /**
   * Finds the single occurrence of a predicate indicator or its callable form in a complete directive (may be multi-line)
   * Optimized version that assumes only one occurrence needs updating per directive
   * @param document The document
   * @param startLine The line where the directive starts
   * @param predicateIndicator The predicate indicator (name/arity) to find
   * @returns Object with ranges and the end line of the directive
   */
  private findPredicateInDirectiveWithEndLine(
    document: TextDocument,
    startLine: number,
    predicateIndicator: string
  ): { ranges: { uri: Uri; range: Range }[], endLine: number } {
    this.logger.debug(`Processing directive starting at line ${startLine + 1} for predicate ${predicateIndicator}`);

    // Use existing getDirectiveRange function to find the directive boundaries
    const directiveRange = PredicateUtils.getDirectiveRange(document, startLine);
    const endLine = directiveRange.end;

    // Read the complete directive text to determine its type
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text + '\n';
    }

    // Determine directive type
    const isAliasDirective = directiveText.includes('alias(');
    const isUsesDirective = directiveText.includes('uses(');

    this.logger.debug(`  Directive type: alias=${isAliasDirective}, uses=${isUsesDirective}`);

    // Search for the single occurrence in the directive
    // Since reference provider found this location, we expect exactly one match
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text;
      this.logger.debug(`  Checking line ${lineNum + 1}: "${lineText.trim()}"`);

      // First, try to find predicate indicators
      let lineRanges = this.findPredicateRangesInLineWithIndicatorFormat(lineText, predicateIndicator, lineNum);
      this.logger.debug(`  Found ${lineRanges.length} indicator ranges in line ${lineNum + 1}`);

      // If no indicators found and this is a uses/2 directive, try callable form
      if (lineRanges.length === 0 && isUsesDirective) {
        this.logger.debug(`  No indicators found, trying callable format for the uses/2 directive`);
        lineRanges = this.findPredicateRangesInLineWithArity(lineText, predicateIndicator, lineNum);
        this.logger.debug(`  Found ${lineRanges.length} callable ranges in line ${lineNum + 1}`);
      }

      // If we found the occurrence, return it immediately (optimization: only one expected)
      if (lineRanges.length > 0) {
        const locations = lineRanges.map(range => ({ uri: document.uri, range }));
        this.logger.debug(`Found predicate occurrence at line ${lineNum + 1}. Directive ended at line ${endLine + 1}`);
        return { ranges: locations, endLine };
      }
    }

    this.logger.debug(`No predicate occurrences found in directive. Directive ended at line ${endLine + 1}`);
    return { ranges: [], endLine };
  }

  /**
   * Finds all occurrences of a predicate name in a complete clause (head + body)
   * @param document The document
   * @param startLine The line where the clause starts
   * @param predicateIndicator The predicate indicator (name/arity) to find
   * @returns Object with ranges and the end line of the clause
   */
  private findPredicateInClauseWithEndLine(
    document: TextDocument,
    startLine: number,
    predicateIndicator: string
  ): { ranges: { uri: Uri; range: Range }[], endLine: number } {
    const locations: { uri: Uri; range: Range }[] = [];

    // Read the complete clause (may span multiple lines)
    let currentLine = startLine;
    let clauseComplete = false;

    this.logger.debug(`Processing clause starting at line ${startLine + 1} for predicate ${predicateIndicator}`);

    while (currentLine < document.lineCount && !clauseComplete) {
      const lineText = document.lineAt(currentLine).text;
      const trimmedLine = lineText.trim();

      this.logger.debug(`  Processing line ${currentLine + 1}: "${trimmedLine}"`);

      // Find predicate occurrences in this line with arity checking
      const lineRanges = this.findPredicateRangesInLineWithArity(lineText, predicateIndicator, currentLine);
      this.logger.debug(`  Found ${lineRanges.length} ranges in line ${currentLine + 1}`);

      locations.push(...lineRanges.map(range => ({ uri: document.uri, range })));

      // Check if clause is complete (ends with period)
      if (trimmedLine.endsWith('.')) {
        clauseComplete = true;
        this.logger.debug(`  Clause complete at line ${currentLine + 1}`);
      }

      currentLine++;
    }

    this.logger.debug(`Clause processing complete. Found ${locations.length} total ranges. Clause ended at line ${currentLine - 1 + 1}`);
    return { ranges: locations, endLine: currentLine - 1 };
  }

  /**
   * Validates if a match is in a valid predicate context within text
   * @param text The full text
   * @param startPos Start position of the match
   * @param endPos End position of the match
   * @returns true if this is a valid predicate context
   */
  private isValidPredicateContextInText(text: string, startPos: number, endPos: number): boolean {
    // Check what comes before and after the match
    const before = startPos > 0 ? text[startPos - 1] : '';
    const after = endPos < text.length ? text[endPos] : '';

    // Get some context around the match
    const beforeContext = text.substring(Math.max(0, startPos - 30), startPos);
    const afterContext = text.substring(endPos, Math.min(text.length, endPos + 10));

    // Get the matched text for debugging
    const matchedText = text.substring(startPos, endPos);

    // Valid contexts for predicate/non-terminal names:
    // 1. Predicate indicators: name/arity
    // 2. Non-terminal indicators: name//arity
    // 3. Predicate calls: name(args) or name
    // 4. In directives: public(name/arity), mode(name(...), ...)

    // Check for predicate indicator context (name/arity) or non-terminal indicator context (name//arity)
    if (after === '/') {
      return true;
    }

    // Check for predicate call context
    if (after === '(' || /^\s*[,\)\.]/.test(afterContext)) {
      return true;
    }

    // Check for mode/info directive context - be very specific
    // Pattern: :- mode(predicate_name(...), ...) or :- info(predicate_name/arity, ...)
    const modeInfoPattern = /:-\s*(mode|info)\s*\(/;
    if (modeInfoPattern.test(beforeContext) && (after === '(' || after === '/')) {
      this.logger.debug(`Valid mode/info context for "${matchedText}": before="${beforeContext.slice(-20)}", after="${after}"`);
      return true;
    }

    // Check for other directive contexts
    const inDirective = /:-\s*\w+\s*\([^)]*$/.test(beforeContext);
    if (inDirective && after === '/') {
      return true;
    }

    // Check for clause head context (start of line)
    if (/^\s*$/.test(beforeContext) || beforeContext.trim() === '') {
      return true;
    }

    // Reject if this looks like it's part of another word (e.g., "mode" in "modense")
    if (/[a-zA-Z0-9_]/.test(before) || /[a-zA-Z0-9_]/.test(after)) {
      this.logger.debug(`Rejected partial word match for "${matchedText}": before="${before}", after="${after}"`);
      return false;
    }

    return false;
  }

  /**
   * Converts text position to document position
   * @param startPos Start position in text
   * @param endPos End position in text
   * @param startLine Starting line number in document
   * @param lineOffsets Array of line start offsets in text
   * @param doc The document
   * @returns Range in document coordinates or null if invalid
   */
  private convertTextPositionToDocPosition(
    startPos: number,
    endPos: number,
    startLine: number,
    lineOffsets: number[],
    doc: TextDocument
  ): Range | null {
    // Find which line the start position is on
    let lineIndex = 0;
    for (let i = lineOffsets.length - 1; i >= 0; i--) {
      if (startPos >= lineOffsets[i]) {
        lineIndex = i;
        break;
      }
    }

    const docLine = startLine + lineIndex;
    if (docLine >= doc.lineCount) return null;

    const lineStartOffset = lineOffsets[lineIndex];
    const startChar = startPos - lineStartOffset;
    const endChar = endPos - lineStartOffset;

    // Validate character positions
    const lineText = doc.lineAt(docLine).text;
    if (startChar < 0 || endChar > lineText.length) return null;

    return new Range(
      new Position(docLine, startChar),
      new Position(docLine, endChar)
    );
  }

  /**
   * Escapes special regex characters in a string
   * @param str The string to escape
   * @returns The escaped string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
