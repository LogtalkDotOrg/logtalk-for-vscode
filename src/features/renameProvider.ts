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
import { LogtalkDeclarationProvider } from "./declarationProvider";
import { LogtalkDefinitionProvider } from "./definitionProvider";
import { LogtalkImplementationProvider } from "./implementationProvider";
import { LogtalkReferenceProvider } from "./referenceProvider";
import { DiagnosticsUtils } from "../utils/diagnostics";

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
   * Prepares the rename operation by validating the position and new name
   * @param document The document containing the symbol to rename
   * @param position The position of the symbol
   * @param newName The new name for the symbol
   * @param token Cancellation token
   * @returns Range of the symbol or null if rename is not possible
   */
  public async prepareRename(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Range | null> {
    // Check if we're in a comment
    const lineText = document.lineAt(position.line).text.trim();
    if (lineText.startsWith("%")) {
      return null;
    }

    // Get the predicate indicator under cursor
    const predicateIndicator = Utils.getCallUnderCursor(document, position);
    if (!predicateIndicator) {
      this.logger.debug("No predicate indicator found at position");
      return null;
    }

    this.logger.debug(`Found predicate indicator: ${predicateIndicator}`);

    // Get the word range for the predicate name (without arity)
    const predicateName = predicateIndicator.split('/')[0];

    // Use a more specific regex to match the predicate name
    // This handles both regular atoms and quoted atoms
    let wordRange: Range | undefined;

    if (predicateName.startsWith("'") && predicateName.endsWith("'")) {
      // For quoted atoms, include the quotes
      const escapedName = predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      wordRange = document.getWordRangeAtPosition(position, new RegExp(escapedName));
    } else {
      // For regular atoms, use word boundaries
      const escapedName = predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      wordRange = document.getWordRangeAtPosition(position, new RegExp(`\\b${escapedName}\\b`));
    }

    if (!wordRange) {
      this.logger.debug("Could not determine word range for predicate");
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
    // Validate the new name
    if (!this.isValidPredicateName(newName)) {
      window.showErrorMessage(
        `Invalid predicate name: "${newName}". ` +
        `Predicate names must start with a lowercase letter followed by letters, digits, and underscores, ` +
        `or be a quoted atom enclosed in single quotes.`
      );
      return null;
    }

    // Get the predicate indicator under cursor
    const predicateIndicator = Utils.getCallUnderCursor(document, position);
    if (!predicateIndicator) {
      this.logger.debug("No predicate indicator found at position");
      return null;
    }

    this.logger.debug(`Renaming predicate: ${predicateIndicator} to ${newName}`);

    // Extract the current predicate name and arity
    const [currentName, arity] = predicateIndicator.split('/');
    // const newPredicateIndicator = `${newName}/${arity}`;

    // Collect all locations where the predicate is used
    const allLocations: { uri: Uri; range: Range }[] = [];
    let declarationLocation: Location | null = null;
    let implementationLocations: any = null;

    try {
      // Step 1: Get declaration location from user click position
      declarationLocation = await this.declarationProvider.provideDeclaration(document, position, token);
      if (!declarationLocation || !this.isValidLocation(declarationLocation)) {
        window.showErrorMessage('Could not find declaration for the selected predicate');
        return null;
      }

      this.logger.debug(`Found declaration at: ${declarationLocation.uri.fsPath}:${declarationLocation.range.start.line + 1}`);

      // Step 2: Add the declaration location itself to the bag
      allLocations.push({ uri: declarationLocation.uri, range: declarationLocation.range });

      // Step 3: Use the declaration position to find all other locations
      const declarationDocument = await workspace.openTextDocument(declarationLocation.uri);
      const declarationPosition = this.findPredicatePositionInDeclaration(declarationDocument, declarationLocation.range.start.line, currentName);
      this.logger.debug(`declarationPosition: ${declarationPosition.line}:${declarationPosition.character}`);

      // Get definition location from declaration position
      const definitionLocation = await this.definitionProvider.provideDefinition(declarationDocument, declarationPosition, token);
      if (definitionLocation && this.isValidLocation(definitionLocation)) {
        allLocations.push({ uri: definitionLocation.uri, range: definitionLocation.range });
        this.logger.debug(`Found definition at: ${definitionLocation.uri.fsPath}:${definitionLocation.range.start.line + 1}`);
      }

      // Get implementation locations from declaration position
      this.logger.debug(`declarationDocument: ${declarationDocument.uri.fsPath}`);
      this.logger.debug(`declarationPosition: ${declarationPosition.line}:${declarationPosition.character}`);
      implementationLocations = await this.implementationProvider.provideImplementation(declarationDocument, declarationPosition, token);
      this.logger.debug(`Found implementations at: ${implementationLocations}`);
      if (implementationLocations && Array.isArray(implementationLocations)) {
        for (const location of implementationLocations) {
          if ('uri' in location && 'range' in location && this.isValidLocation(location)) {
            allLocations.push({ uri: location.uri, range: location.range });
            this.logger.debug(`Found implementation at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
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
            allLocations.push({ uri: location.uri, range: location.range });
            this.logger.debug(`Found reference at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
          }
        }
      }

      // Deduplicate allLocations to create a clean set before finding additional clauses
      const uniqueLocations = new Map<string, { uri: Uri; range: Range }>();
      for (const location of allLocations) {
        const key = `${location.uri.toString()}:${location.range.start.line}:${location.range.start.character}:${location.range.end.line}:${location.range.end.character}`;
        uniqueLocations.set(key, location);
      }
      allLocations.length = 0; // Clear the array
      allLocations.push(...uniqueLocations.values()); // Add back unique locations

      this.logger.debug(`After deduplication: ${allLocations.length} unique locations`);

      // Find all predicate clauses in files that have definitions/implementations
      // We need to check each file that has locations, not just the declaration file
      const filesWithLocations = new Set<string>();
      for (const location of allLocations) {
        filesWithLocations.add(location.uri.toString());
      }

      for (const fileUri of filesWithLocations) {
        const fileDocument = await workspace.openTextDocument(Uri.parse(fileUri));
        const allClauseLocations = await this.findAllPredicateClauses(fileDocument, predicateIndicator, allLocations);
        for (const location of allClauseLocations) {
          if (this.isValidLocation(location)) {
            allLocations.push(location);
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

    this.logger.debug(`Found ${uniqueLocations.length} unique locations to rename`);

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
          // Handle regular predicate references (use the specific location range)
          const lineText = doc.lineAt(location.range.start.line).text;

          // Use the specific location range instead of searching for all occurrences
          // This prevents duplicate edits for the same location
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
            this.logger.debug(`Created edit at ${uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character + 1} - "${doc.getText(location.range)}" → "${replacementText}"`);
          } else if (processedRanges.has(rangeKey)) {
            this.logger.debug(`Skipping duplicate range at ${uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character + 1}`);
          } else {
            this.logger.warn(`Skipping invalid range at ${uri.fsPath}:${location.range.start.line + 1}:${location.range.start.character + 1}`);
          }
        }
      }

      workspaceEdit.set(uri, textEdits);
      this.logger.debug(`Added ${textEdits.length} edits for file: ${uri.fsPath}`);
    }

    // Show preview information to user
    const totalEdits = uniqueLocations.length;
    const fileCount = locationsByFile.size;
    window.showInformationMessage(
      `Rename will update ${totalEdits} occurrence${totalEdits !== 1 ? 's' : ''} ` +
      `across ${fileCount} file${fileCount !== 1 ? 's' : ''}`
    );

    return workspaceEdit;
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
   * Finds all ranges where the predicate name appears in a line of text
   * @param lineText The text of the line
   * @param predicateName The predicate name to find
   * @param lineNumber The line number (0-based)
   * @returns Array of ranges where the predicate name appears
   */
  private findPredicateRangesInLine(lineText: string, predicateName: string, lineNumber: number): Range[] {
    const ranges: Range[] = [];

    // Remove quotes from predicate name for searching if it's a quoted atom
    const searchName = predicateName.startsWith("'") && predicateName.endsWith("'")
      ? predicateName.slice(1, -1)
      : predicateName;

    // Create regex patterns for different contexts where the predicate might appear
    const patterns: RegExp[] = [];

    if (predicateName.startsWith("'") && predicateName.endsWith("'")) {
      // For quoted atoms, search for the exact quoted form
      patterns.push(new RegExp(`'${this.escapeRegex(searchName)}'`, 'g'));
    } else {
      // For regular atoms, use a single comprehensive pattern with word boundaries
      patterns.push(new RegExp(`\\b${this.escapeRegex(searchName)}\\b`, 'g'));
    }

    // Search for each pattern
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(lineText)) !== null) {
        const startChar = match.index;
        const endChar = startChar + match[0].length;
        const matchedText = match[0];

        this.logger.debug(`Checking match "${matchedText}" at line ${lineNumber + 1}, chars ${startChar}-${endChar} in: "${lineText}"`);

        // Additional validation to ensure this is a valid predicate context
        if (this.isValidPredicateContext(lineText, startChar, endChar)) {
          // Validate character positions
          if (startChar >= 0 && endChar <= lineText.length && startChar < endChar) {
            // Create range for this occurrence
            const range = new Range(
              new Position(lineNumber, startChar),
              new Position(lineNumber, endChar)
            );

            // Avoid duplicates
            if (!ranges.some(r => r.isEqual(range))) {
              ranges.push(range);
              this.logger.debug(`✅ Found valid predicate range at line ${lineNumber + 1}, chars ${startChar}-${endChar}: "${matchedText}"`);
            } else {
              this.logger.debug(`Skipped duplicate range at line ${lineNumber + 1}, chars ${startChar}-${endChar}`);
            }
          } else {
            this.logger.warn(`Invalid character positions at line ${lineNumber + 1}: start=${startChar}, end=${endChar}, lineLength=${lineText.length}`);
          }
        } else {
          this.logger.debug(`❌ Skipped invalid context at line ${lineNumber + 1}, chars ${startChar}-${endChar}: "${matchedText}"`);
        }

        // Reset regex lastIndex to avoid infinite loop
        if (!pattern.global) break;
      }
    }

    return ranges;
  }

  /**
   * Finds predicate ranges in a line of text with arity checking
   * @param lineText The line text
   * @param predicateIndicator The predicate indicator (name/arity) to find
   * @param lineNumber The line number (0-based)
   * @returns Array of ranges
   */
  private findPredicateRangesInLineWithArity(lineText: string, predicateIndicator: string, lineNumber: number): Range[] {
    const ranges: Range[] = [];
    const [predicateName, arityStr] = predicateIndicator.split('/');
    const expectedArity = parseInt(arityStr, 10);

    const textRanges = this.findPredicateRangesInTextWithArity(lineText, predicateName, expectedArity);

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
   * Finds the exact position of a predicate name in a declaration line
   * @param doc The document
   * @param declarationLine The line number of the declaration
   * @param predicateName The predicate name to find
   * @returns Position of the predicate name
   */
  private findPredicatePositionInDeclaration(doc: TextDocument, declarationLine: number, predicateName: string): Position {
    const lineText = doc.lineAt(declarationLine).text;

    // Find the predicate name in the line
    const ranges = this.findPredicateRangesInLine(lineText, predicateName, declarationLine);

    if (ranges.length > 0) {
      return ranges[0].start;
    }

    // Fallback: return start of line if not found
    return new Position(declarationLine, 0);
  }

  /**
   * Finds predicate ranges in directives, handling multi-line directives and related mode/info directives
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
    const [name, arity] = predicateIndicator.split('/');

    // First, handle the scope directive itself (may be multi-line)
    const scopeRanges = this.findPredicateInMultiLineDirective(doc, startLine, predicateName);
    ranges.push(...scopeRanges);

    // Then, look for related mode/2 and info/2 directives that follow
    const relatedRanges = this.findRelatedDirectives(doc, startLine, name, arity);
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
   * Finds related mode/2 and info/2 directives that follow the scope directive
   * @param doc The document
   * @param scopeLine The line of the scope directive
   * @param predicateName The predicate name
   * @param arity The predicate arity
   * @returns Array of ranges in related directives
   */
  private findRelatedDirectives(doc: TextDocument, scopeLine: number, predicateName: string, arity: string): Range[] {
    const ranges: Range[] = [];
    const predicateIndicator = `${predicateName}/${arity}`;

    // Look at the next few lines for mode/2 and info/2 directives
    for (let line = scopeLine + 1; line < Math.min(doc.lineCount, scopeLine + 10); line++) {
      const lineText = doc.lineAt(line).text;
      const trimmedLineText = lineText.trim();

      // Stop if we hit a non-directive line (except comments and empty lines)
      if (!trimmedLineText.startsWith(':-') && !trimmedLineText.startsWith('%') && trimmedLineText !== '') {
        break;
      }

      // Check for mode/2 or info/2 directives
      if (trimmedLineText.includes('mode(') || trimmedLineText.includes('info(')) {
        // Check if this directive mentions our predicate
        if (trimmedLineText.includes(predicateName) || trimmedLineText.includes(predicateIndicator)) {
          const lineRanges = this.findPredicateRangesInLine(lineText, predicateName, line);
          ranges.push(...lineRanges);
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

    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Additional validation to ensure this is a valid predicate context
      if (this.isValidPredicateContextInText(text, match.index, match.index + match[0].length)) {
        ranges.push({ start: match.index, end: match.index + match[0].length });
      }
    }

    return ranges;
  }

  /**
   * Finds predicate ranges in a text string with arity checking
   * @param text The text to search
   * @param predicateName The predicate name to find
   * @param expectedArity The expected arity of the predicate
   * @returns Array of start/end positions
   */
  private findPredicateRangesInTextWithArity(text: string, predicateName: string, expectedArity: number): { start: number; end: number }[] {
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

    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Additional validation to ensure this is a valid predicate context
      if (this.isValidPredicateContextInText(text, match.index, match.index + match[0].length)) {
        // Check if the arity matches
        if (this.checkArityAtPosition(text, match.index + match[0].length, expectedArity)) {
          ranges.push({ start: match.index, end: match.index + match[0].length });
        }
      }
    }

    return ranges;
  }

  /**
   * Checks if the predicate at the given position has the expected arity
   * @param text The full text
   * @param endPos End position of the predicate name
   * @param expectedArity The expected arity
   * @returns true if the arity matches or cannot be determined
   */
  private checkArityAtPosition(text: string, endPos: number, expectedArity: number): boolean {
    // Check what comes after the predicate name
    const after = endPos < text.length ? text[endPos] : '';

    // If followed by '/', this is a predicate indicator (name/arity)
    if (after === '/') {
      const arityMatch = text.substring(endPos + 1).match(/^(\d+)/);
      if (arityMatch) {
        const arity = parseInt(arityMatch[1], 10);
        return arity === expectedArity;
      }
      return false; // Invalid arity format
    }

    // If followed by '(', count the arguments
    if (after === '(') {
      const argCount = this.countArgumentsAfterPosition(text, endPos);
      return argCount === expectedArity;
    }

    // If not followed by '(' or '/', it might be a 0-arity predicate or in a different context
    // For 0-arity predicates, accept if expected arity is 0
    if (expectedArity === 0) {
      return true;
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
        } else if (char === ',' && parenDepth === 0) {
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
    existingLocations: { uri: Uri; range: Range }[]
  ): Promise<{ uri: Uri; range: Range }[]> {
    // Find the definition location to use as starting point
    const definitionLocation = existingLocations.find(loc =>
      loc.uri.toString() === document.uri.toString()
    );

    if (definitionLocation) {
      // Search for consecutive clauses starting from the known definition
      // Pass the full predicate indicator to enable arity checking
      return this.findConsecutivePredicateClauses(
        document,
        predicateIndicator,
        definitionLocation.range.start.line
      );
    }

    return [];
  }

  /**
   * Finds consecutive predicate clauses starting from a known clause location
   * @param document The document to search
   * @param predicateIndicator The predicate indicator (name/arity) to find
   * @param startLine The line number of a known clause (from definition provider)
   * @returns Array of locations where consecutive predicate clauses are defined
   */
  private findConsecutivePredicateClauses(
    document: TextDocument,
    predicateIndicator: string,
    startLine: number
  ): { uri: Uri; range: Range }[] {
    const locations: { uri: Uri; range: Range }[] = [];
    const [predicateName] = predicateIndicator.split('/');

    this.logger.debug(`Starting consecutive clause search for ${predicateIndicator} from line ${startLine + 1} (first clause)`);

    // Start directly from the given startLine since Logtalk providers give us the first clause position

    // Search forwards from startLine to find all consecutive clauses
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

      // Stop if we hit a different predicate clause
      if (this.isDifferentPredicateClause(lineText, predicateName)) {
        this.logger.debug(`Stopping at different predicate clause: line ${lineNum + 1}`);
        break;
      }

      // Check if this is a clause for our predicate
      if (this.isPredicateClause(lineText, predicateName)) {
        this.logger.debug(`Found clause for ${predicateName} at line ${lineNum + 1}`);
        // Find all occurrences of the predicate name in this clause (head + body)
        const clauseResult = this.findPredicateInClauseWithEndLine(document, lineNum, predicateIndicator);
        this.logger.debug(`Found ${clauseResult.ranges.length} ranges in clause at line ${lineNum + 1}, clause ends at line ${clauseResult.endLine + 1}`);
        locations.push(...clauseResult.ranges);

        // Skip ahead to after the end of this clause to avoid processing clause body lines
        lineNum = clauseResult.endLine + 1;
      } else {
        this.logger.debug(`Line ${lineNum + 1} is not a clause for ${predicateName}`);
        lineNum++;
      }
    }

    return locations;
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
   * Checks if a line is a clause for a different predicate
   * @param lineText The line text
   * @param predicateName The predicate name we're looking for
   * @returns true if this is a clause for a different predicate
   */
  private isDifferentPredicateClause(lineText: string, predicateName: string): boolean {
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

    // Check if this starts a predicate clause (must start at beginning of line or minimal indentation)
    const clausePattern = /^\s{0,4}([a-z][a-zA-Z0-9_]*|'[^']*')\s*[\(:-]/;
    const match = lineText.match(clausePattern);

    if (match) {
      const foundPredicateName = match[1];
      // Only return true if it's a different predicate (not our target predicate)
      return foundPredicateName !== predicateName;
    }

    // If it doesn't match a predicate clause pattern, it's not a different predicate
    return false;
  }

  /**
   * Checks if a line is a clause for the specified predicate
   * @param lineText The line text
   * @param predicateName The predicate name to check for
   * @returns true if this is a clause for the predicate
   */
  private isPredicateClause(lineText: string, predicateName: string): boolean {
    // A predicate clause starts with the predicate name followed by ( or :-
    // This includes both facts and rules
    const clausePattern = new RegExp(`^\\s*${this.escapeRegex(predicateName)}\\s*[\\(:-]`);
    return clausePattern.test(lineText);
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

    // Valid contexts for predicate names:
    // 1. Predicate indicators: name/arity
    // 2. Predicate calls: name(args) or name
    // 3. In directives: public(name/arity), mode(name(...), ...)

    // Check for predicate indicator context (name/arity)
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
