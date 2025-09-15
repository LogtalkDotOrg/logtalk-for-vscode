"use strict";

import {
  CodeActionProvider,
  CodeAction,
  CodeActionKind,
  CodeActionContext,
  Range,
  Selection,
  TextDocument,
  CancellationToken,
  WorkspaceEdit,
  Uri,
  window,
  workspace,
  QuickPickItem,
  SaveDialogOptions,
  Position,
  TextEdit,
  Location
} from "vscode";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import { SymbolUtils } from "../utils/symbols";
import { PredicateUtils, PredicateTypeResult } from "../utils/predicateUtils";
import { ArgumentUtils } from "../utils/argumentUtils";
import { LogtalkDeclarationProvider } from "./declarationProvider";
import { LogtalkDefinitionProvider } from "./definitionProvider";
import { LogtalkImplementationProvider } from "./implementationProvider";
import { LogtalkReferenceProvider } from "./referenceProvider";
import * as path from "path";
import * as fs from "fs";

interface EntityTypeOption extends QuickPickItem {
  entityType: 'object' | 'protocol' | 'category';
  directive: string;
  endDirective: string;
}

export class LogtalkRefactorProvider implements CodeActionProvider {
  private logger = getLogger();
  private declarationProvider = new LogtalkDeclarationProvider();
  private definitionProvider = new LogtalkDefinitionProvider();
  private implementationProvider = new LogtalkImplementationProvider();
  private referenceProvider = new LogtalkReferenceProvider();

  public async provideCodeActions(
    document: TextDocument,
    range: Range | Selection,
    context: CodeActionContext,
    token: CancellationToken
  ): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];

    // Only provide extract actions if there's a selection
    if (range instanceof Selection && !range.isEmpty) {
      // Extract to new entity action
      const extractToEntityAction = new CodeAction(
        "Extract to new Logtalk entity",
        CodeActionKind.RefactorExtract
      );
      extractToEntityAction.command = {
        command: "logtalk.refactor.extractToEntity",
        title: "Extract to new Logtalk entity",
        arguments: [document, range]
      };
      actions.push(extractToEntityAction);

      // Extract to new file action
      const extractToFileAction = new CodeAction(
        "Extract to new Logtalk file",
        CodeActionKind.RefactorExtract
      );
      extractToFileAction.command = {
        command: "logtalk.refactor.extractToFile",
        title: "Extract to new Logtalk file",
        arguments: [document, range]
      };
      actions.push(extractToFileAction);
    }

    // Check if we're on a predicate call for add argument refactoring
    const position = range instanceof Selection ? range.active : range.start;
    if (this.isPredicateCall(document, position)) {
      const addArgumentAction = new CodeAction(
        "Add argument to predicate/non-terminal",
        CodeActionKind.Refactor
      );
      addArgumentAction.command = {
        command: "logtalk.refactor.addArgument",
        title: "Add argument to predicate/non-terminal",
        arguments: [document, position]
      };
      actions.push(addArgumentAction);
    }

    return actions;
  }

  /**
   * Extract selected code to a new Logtalk file (verbatim copy)
   */
  public async extractToFile(document: TextDocument, selection: Selection): Promise<void> {
    try {
      const selectedText = document.getText(selection);
      if (!selectedText.trim()) {
        window.showErrorMessage("No code selected for extraction.");
        return;
      }

      // Process the selected code (trim empty lines)
      const processedCode = this.processSelectedCode(selectedText);

      // Ask user for filename
      const fileName = await this.promptForFileName();
      if (!fileName) {
        return; // User cancelled
      }

      // Ask user for file location
      const fileUri = await this.promptForFileDirectory(fileName, document);
      if (!fileUri) {
        return; // User cancelled
      }

      // Create the new file with verbatim code and remove from original
      const edit = new WorkspaceEdit();
      edit.createFile(fileUri, { ignoreIfExists: false });
      edit.insert(fileUri, new Position(0, 0), processedCode);

      // Remove the selected code from the original document
      edit.delete(document.uri, selection);

      const success = await workspace.applyEdit(edit);
      if (success) {
        // Open the new file
        const newDocument = await workspace.openTextDocument(fileUri);
        await window.showTextDocument(newDocument);

        this.logger.info(`Successfully extracted code to new file: ${fileUri.fsPath}`);
        window.showInformationMessage(`Code extracted to new file: ${path.basename(fileUri.fsPath)}. Original code removed from source file.`);
      } else {
        window.showErrorMessage("Failed to create the new file.");
      }
    } catch (error) {
      this.logger.error(`Error extracting to file: ${error}`);
      window.showErrorMessage(`Error extracting to file: ${error}`);
    }
  }

  /**
   * Extract selected code to a new Logtalk entity in a new file
   */
  public async extractToEntity(document: TextDocument, selection: Selection): Promise<void> {
    try {
      const selectedText = document.getText(selection);
      if (!selectedText.trim()) {
        window.showErrorMessage("No code selected for extraction.");
        return;
      }

      // Ask user for entity type
      const entityType = await this.promptForEntityType();
      if (!entityType) {
        return; // User cancelled
      }

      // Ask user for entity name
      const entityName = await this.promptForEntityName();
      if (!entityName) {
        return; // User cancelled
      }

      // Ask user for file location and name
      const fileUri = await this.promptForFileSave(entityName, document);
      if (!fileUri) {
        return; // User cancelled
      }

      // Get current date and user info
      const currentDate = new Date();
      const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      
      // Try to get author from git config or use a default
      const author = await this.getAuthorName();

      // Process the selected code (trim empty lines and preserve indentation)
      const processedCode = this.processSelectedCode(selectedText);

      // Generate the new file content
      const newFileContent = this.generateEntityFileContent(
        entityType,
        entityName,
        processedCode,
        author,
        dateString
      );

      // Create the new file and remove from original
      const edit = new WorkspaceEdit();
      edit.createFile(fileUri, { ignoreIfExists: false });
      edit.insert(fileUri, new Position(0, 0), newFileContent);

      // Remove the selected code from the original document
      edit.delete(document.uri, selection);

      const success = await workspace.applyEdit(edit);
      if (success) {
        // Open the new file
        const newDocument = await workspace.openTextDocument(fileUri);
        await window.showTextDocument(newDocument);

        this.logger.info(`Successfully extracted code to new ${entityType.entityType}: ${fileUri.fsPath}`);
        window.showInformationMessage(`Code extracted to new ${entityType.entityType}: ${path.basename(fileUri.fsPath)}. Original code removed from source file.`);
      } else {
        window.showErrorMessage("Failed to create the new file.");
      }
    } catch (error) {
      this.logger.error(`Error extracting to entity: ${error}`);
      window.showErrorMessage(`Error extracting to entity: ${error}`);
    }
  }

  /**
   * Prompt user to select entity type
   */
  private async promptForEntityType(): Promise<EntityTypeOption | undefined> {
    const options: EntityTypeOption[] = [
      {
        label: "Object",
        description: "Create a new object entity",
        entityType: "object",
        directive: ":- object",
        endDirective: ":- end_object."
      },
      {
        label: "Protocol", 
        description: "Create a new protocol entity",
        entityType: "protocol",
        directive: ":- protocol",
        endDirective: ":- end_protocol."
      },
      {
        label: "Category",
        description: "Create a new category entity", 
        entityType: "category",
        directive: ":- category",
        endDirective: ":- end_category."
      }
    ];

    return await window.showQuickPick(options, {
      placeHolder: "Select the type of Logtalk entity to create",
      title: "Extract to New Entity"
    });
  }

  /**
   * Prompt user for entity name
   */
  private async promptForEntityName(): Promise<string | undefined> {
    return await window.showInputBox({
      prompt: "Enter the name for the new entity",
      placeHolder: "entity_name",
      validateInput: (value: string) => {
        if (!value.trim()) {
          return "Entity name cannot be empty";
        }
        // Basic validation for Logtalk atom names
        if (!/^[a-z][a-zA-Z0-9_]*$/.test(value.trim())) {
          return "Entity name must start with lowercase letter and contain only letters, digits, and underscores";
        }
        return null;
      }
    });
  }

  /**
   * Prompt user for filename (for extract to file)
   */
  private async promptForFileName(): Promise<string | undefined> {
    return await window.showInputBox({
      prompt: "Enter the filename (without extension)",
      placeHolder: "filename",
      validateInput: (value: string) => {
        if (!value.trim()) {
          return "Filename cannot be empty";
        }
        // Basic validation for valid filename
        if (!/^[a-zA-Z0-9_\-\.]+$/.test(value.trim())) {
          return "Filename contains invalid characters";
        }
        return null;
      }
    });
  }

  /**
   * Prompt user for directory and create file URI (for extract to file)
   */
  private async promptForFileDirectory(fileName: string, document: TextDocument): Promise<Uri | undefined> {
    try {
      // Get the directory of the current document as the default directory
      let defaultDirectory: Uri;

      if (document.uri.scheme === 'file') {
        // Use the directory of the current document
        defaultDirectory = Uri.file(path.dirname(document.uri.fsPath));
      } else {
        // Fallback to workspace folder
        const workspaceFolders = workspace.workspaceFolders;
        defaultDirectory = workspaceFolders && workspaceFolders.length > 0
          ? workspaceFolders[0].uri
          : Uri.file('.');
      }

      // Create default URI with the filename
      const defaultPath = path.join(defaultDirectory.fsPath, `${fileName}.lgt`);
      const defaultUri = Uri.file(defaultPath);

      const options: SaveDialogOptions = {
        defaultUri: defaultUri,
        filters: {
          'Logtalk Files': ['lgt', 'logtalk'],
          'All Files': ['*']
        },
        saveLabel: "Save",
        title: "Save new Logtalk file"
      };

      this.logger.debug(`File save dialog - Directory: ${defaultDirectory.fsPath}`);
      this.logger.debug(`File save dialog - Filename: ${fileName}`);
      this.logger.debug(`File save dialog - Default path: ${defaultPath}`);
      this.logger.debug(`File save dialog - Default URI: ${defaultUri.toString()}`);

      const result = await window.showSaveDialog(options);
      this.logger.debug(`File save dialog result: ${result?.toString()}`);

      return result;
    } catch (error) {
      this.logger.error(`Error in promptForFileDirectory: ${error}`);
      window.showErrorMessage(`Error opening save dialog: ${error}`);
      return undefined;
    }
  }

  /**
   * Prompt user for file save location using save dialog
   */
  private async promptForFileSave(entityName: string, document: TextDocument): Promise<Uri | undefined> {
    try {
      // First, let user optionally edit the filename
      const finalEntityName = await window.showInputBox({
        prompt: "Confirm or edit the filename (without extension)",
        value: entityName,
        placeHolder: "filename",
        validateInput: (value: string) => {
          if (!value.trim()) {
            return "Filename cannot be empty";
          }
          // Basic validation for valid filename
          if (!/^[a-zA-Z0-9_\-\.]+$/.test(value.trim())) {
            return "Filename contains invalid characters";
          }
          return null;
        }
      });

      if (!finalEntityName) {
        return undefined; // User cancelled
      }

      // Get the directory of the current document as the default directory
      let defaultDirectory: Uri;

      if (document.uri.scheme === 'file') {
        // Use the directory of the current document
        defaultDirectory = Uri.file(path.dirname(document.uri.fsPath));
      } else {
        // Fallback to workspace folder
        const workspaceFolders = workspace.workspaceFolders;
        defaultDirectory = workspaceFolders && workspaceFolders.length > 0
          ? workspaceFolders[0].uri
          : Uri.file('.');
      }

      // Create default URI with the confirmed filename
      const defaultPath = path.join(defaultDirectory.fsPath, `${finalEntityName}.lgt`);
      const defaultUri = Uri.file(defaultPath);

      const options: SaveDialogOptions = {
        defaultUri: defaultUri,
        filters: {
          'Logtalk Files': ['lgt', 'logtalk'],
          'All Files': ['*']
        },
        saveLabel: "Save",
        title: "Save new Logtalk entity file"
      };

      this.logger.debug(`Save dialog - Directory: ${defaultDirectory.fsPath}`);
      this.logger.debug(`Save dialog - Final filename: ${finalEntityName}`);
      this.logger.debug(`Save dialog - Default path: ${defaultPath}`);
      this.logger.debug(`Save dialog - Default URI: ${defaultUri.toString()}`);

      const result = await window.showSaveDialog(options);
      this.logger.debug(`Save dialog result: ${result?.toString()}`);

      return result;
    } catch (error) {
      this.logger.error(`Error in promptForFileSave: ${error}`);
      window.showErrorMessage(`Error opening save dialog: ${error}`);
      return undefined;
    }
  }

  /**
   * Process selected code: trim empty lines at top and bottom, preserve indentation
   */
  private processSelectedCode(selectedText: string): string {
    if (!selectedText.trim()) {
      return selectedText;
    }

    const lines = selectedText.split('\n');

    // Find first non-empty line
    let startIndex = 0;
    while (startIndex < lines.length && lines[startIndex].trim() === '') {
      startIndex++;
    }

    // Find last non-empty line
    let endIndex = lines.length - 1;
    while (endIndex >= 0 && lines[endIndex].trim() === '') {
      endIndex--;
    }

    // If all lines are empty, return empty string
    if (startIndex > endIndex) {
      return '';
    }

    // Extract the trimmed lines
    const trimmedLines = lines.slice(startIndex, endIndex + 1);

    return trimmedLines.join('\n');
  }

  /**
   * Try to get author name from git config
   */
  private async getAuthorName(): Promise<string> {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec('git config user.name', (error: any, stdout: string) => {
          if (error) {
            resolve('Author');
          } else {
            resolve(stdout.trim() || 'Author');
          }
        });
      });
    } catch {
      return 'Author';
    }
  }

  /**
   * Generate the content for the new entity file
   */
  private generateEntityFileContent(
    entityType: EntityTypeOption,
    entityName: string,
    selectedCode: string,
    author: string,
    date: string
  ): string {
    const lines: string[] = [];
    
    // Entity opening directive
    lines.push(`${entityType.directive}(${entityName}).`);
    lines.push('');
    
    // Info directive
    lines.push('\t:- info([');
    lines.push('\t\tversion is 1:0:0,');
    lines.push(`\t\tauthor is '${author}',`);
    lines.push(`\t\tdate is ${date},`);
    lines.push(`\t\tcomment is 'Extracted ${entityType.entityType} entity'`);
    lines.push('\t]).');
    lines.push('');
    
    // Selected code (preserve original indentation exactly as is)
    lines.push(selectedCode);
    lines.push('');
    
    // Entity closing directive
    lines.push(entityType.endDirective);
    lines.push('');
    
    return lines.join('\n');
  }

  /**
   * Check if the current position is on a predicate call
   */
  private isPredicateCall(document: TextDocument, position: Position): boolean {
    // Check if we're in a comment
    const currentLineText = document.lineAt(position.line).text;
    if (currentLineText.trim().startsWith("%")) {
      return false;
    }

    // Check if we can find a predicate indicator or call at this position
    const indicator = Utils.getNonTerminalIndicatorUnderCursor(document, position) ||
                      Utils.getPredicateIndicatorUnderCursor(document, position) ||
                      Utils.getCallUnderCursor(document, position);

    return indicator !== null;
  }

  /**
   * Add argument to predicate refactoring operation
   */
  public async addArgument(document: TextDocument, position: Position): Promise<void> {
    this.logger.debug(`=== addArgument method called ===`);
    try {
      // Step 1: Validate that we're on a predicate call
      this.logger.debug(`Looking for predicate indicator at cursor position...`);
      const indicator = Utils.getNonTerminalIndicatorUnderCursor(document, position) ||
                        Utils.getPredicateIndicatorUnderCursor(document, position) ||
                        Utils.getCallUnderCursor(document, position);

      if (!indicator) {
        this.logger.debug(`No predicate indicator found at cursor position`);
        window.showErrorMessage("No predicate found at cursor position.");
        return;
      }

      this.logger.debug(`Found predicate indicator: ${indicator}`);

      // Extract predicate name and arity - use proper type determination
      const token = { isCancellationRequested: false } as CancellationToken;
      this.logger.debug(`Initial indicator from cursor: "${indicator}"`);
      this.logger.debug(`About to call PredicateUtils.determinePredicateType...`);

      let typeResult: PredicateTypeResult;
      try {
        typeResult = await PredicateUtils.determinePredicateType(
          document,
          position,
          indicator,
          this.declarationProvider,
          token
        );
        this.logger.debug(`Type determination completed successfully`);
      } catch (error) {
        this.logger.error(`Type determination failed: ${error}`);
        window.showErrorMessage(`Type determination failed: ${error}`);
        return;
      }

      this.logger.debug(`Type determination result: isNonTerminal=${typeResult.isNonTerminal}, currentIndicator="${typeResult.currentIndicator}", newIndicator="${typeResult.newIndicator}"`);
      const finalIsNonTerminal = typeResult.isNonTerminal;  // Use the definitive determination
      const separator = finalIsNonTerminal ? '//' : '/';
      const parts = typeResult.currentIndicator.split(separator);

      if (parts.length !== 2) {
        window.showErrorMessage("Invalid predicate indicator format.");
        return;
      }

      const predicateName = parts[0];
      const currentArity = parseInt(parts[1]);

      if (isNaN(currentArity)) {
        window.showErrorMessage("Invalid arity in predicate indicator.");
        return;
      }

      // Step 2: Ask user for argument name
      const argumentName = await this.promptForArgumentName();
      if (!argumentName) {
        return; // User cancelled
      }

      // Step 3: Ask user for argument position
      const position_input = await this.promptForArgumentPosition(currentArity);
      if (position_input === undefined) {
        return; // User cancelled
      }

      // Step 4: Perform the refactoring
      await this.performAddArgumentRefactoring(
        document,
        position,
        predicateName,
        currentArity,
        finalIsNonTerminal,  // Use the definitive determination
        argumentName,
        position_input,
        typeResult.currentIndicator,  // Pass the correct current indicator
        typeResult.newIndicator       // Pass the correct new indicator
      );

    } catch (error) {
      this.logger.error(`Error adding argument to predicate: ${error}`);
      window.showErrorMessage(`Error adding argument to predicate: ${error}`);
    }
  }

  /**
   * Prompt user for argument name with validation
   */
  private async promptForArgumentName(): Promise<string | undefined> {
    return await window.showInputBox({
      prompt: "Enter the name for the new argument",
      placeHolder: "Variable",
      validateInput: (value: string) => {
        if (!value.trim()) {
          return "Argument name cannot be empty";
        }
        // Validate that it's a valid Logtalk variable name
        if (!/^[A-Z_][a-zA-Z0-9_]*$/.test(value.trim())) {
          return "Argument name must be a valid Logtalk variable (start with uppercase letter or underscore)";
        }
        return null;
      }
    });
  }

  /**
   * Prompt user for argument position
   */
  private async promptForArgumentPosition(currentArity: number): Promise<number | undefined> {
    const maxPosition = currentArity + 1;
    const result = await window.showInputBox({
      prompt: `Enter the position for the new argument (1 to ${maxPosition})`,
      placeHolder: `1-${maxPosition}`,
      validateInput: (value: string) => {
        if (!value.trim()) {
          return "Position cannot be empty";
        }
        const position = parseInt(value.trim());
        if (isNaN(position)) {
          return "Position must be a number";
        }
        if (position < 1 || position > maxPosition) {
          return `Position must be between 1 and ${maxPosition}`;
        }
        return null;
      }
    });

    return result ? parseInt(result.trim()) : undefined;
  }

  /**
   * Perform the actual add argument refactoring
   */
  private async performAddArgumentRefactoring(
    document: TextDocument,
    position: Position,
    predicateName: string,
    currentArity: number,
    isNonTerminal: boolean,
    argumentName: string,
    argumentPosition: number,
    currentIndicator?: string,  // Optional: use provided indicator if available
    newIndicator?: string       // Optional: use provided indicator if available
  ): Promise<void> {
    try {
      // Use provided indicators or construct them (for backward compatibility)
      const separator = isNonTerminal ? '//' : '/';
      const finalCurrentIndicator2 = currentIndicator || `${predicateName}${separator}${currentArity}`;
      const finalNewIndicator2 = newIndicator || `${predicateName}${separator}${currentArity + 1}`;

      this.logger.debug(`Adding argument '${argumentName}' at position ${argumentPosition} to ${finalCurrentIndicator2}`);

      // Step 1: Find declaration location (if exists)
      const token = { isCancellationRequested: false } as CancellationToken;
      const declarationLocation = await this.declarationProvider.provideDeclaration(document, position, token);

      // Step 2: Find all locations that need to be updated
      const allLocations: { uri: Uri; range: Range }[] = [];

      if (declarationLocation && this.isValidLocation(declarationLocation)) {
        // Add declaration location
        allLocations.push({ uri: declarationLocation.uri, range: declarationLocation.range });
        this.logger.debug(`Found declaration at: ${declarationLocation.uri.fsPath}:${declarationLocation.range.start.line + 1}`);

        // Find definition and references from declaration position
        const declarationDocument = await workspace.openTextDocument(declarationLocation.uri);
        const declarationPosition = this.findPredicatePositionInDeclaration(declarationDocument, declarationLocation.range.start.line, finalCurrentIndicator2);
        this.logger.debug(`Declaration position found at: ${declarationPosition.line}:${declarationPosition.character}`);

        // Get definition location (first predicate clause)
        this.logger.debug(`Calling definition provider from declaration position...`);
        const definitionLocation = await this.definitionProvider.provideDefinition(declarationDocument, declarationPosition, token);
        if (definitionLocation && this.isValidLocation(definitionLocation)) {
          allLocations.push({ uri: definitionLocation.uri, range: definitionLocation.range });
          this.logger.debug(`Found definition at: ${definitionLocation.uri.fsPath}:${definitionLocation.range.start.line + 1}`);
        }

        // Get implementation locations (all predicate clauses)
        this.logger.debug(`Calling implementation provider from declaration position...`);
        const implementationLocations = await this.implementationProvider.provideImplementation(declarationDocument, declarationPosition, token);
        if (implementationLocations) {
          const implArray = Array.isArray(implementationLocations) ? implementationLocations : [implementationLocations];
          for (const implLoc of implArray) {
            // Handle both Location and LocationLink types
            const location = 'targetUri' in implLoc ?
              { uri: implLoc.targetUri, range: implLoc.targetRange } :
              { uri: implLoc.uri, range: implLoc.range };

            if (this.isValidLocation(location)) {
              allLocations.push(location);
              this.logger.debug(`Found implementation at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
            }
          }
        }

        // Get reference locations (calls to the predicate)
        this.logger.debug(`Calling reference provider from declaration position...`);
        const referenceLocations = await this.referenceProvider.provideReferences(
          declarationDocument,
          declarationPosition,
          { includeDeclaration: false }, // Don't include declaration since we already have it
          token
        );

        this.logger.debug(`Reference provider returned ${referenceLocations ? referenceLocations.length : 0} locations`);
        if (referenceLocations) {
          for (const refLoc of referenceLocations) {
            allLocations.push({ uri: refLoc.uri, range: refLoc.range });
            this.logger.debug(`Found reference at: ${refLoc.uri.fsPath}:${refLoc.range.start.line + 1}`);
          }
        }
      } else {
        // No declaration found - find definition and references from current position
        this.logger.debug(`No declaration found for: ${currentIndicator}. Finding definition and references...`);

        this.logger.debug(`Calling definition provider from current position...`);
        const definitionLocation = await this.definitionProvider.provideDefinition(document, position, token);
        if (definitionLocation && this.isValidLocation(definitionLocation)) {
          allLocations.push({ uri: definitionLocation.uri, range: definitionLocation.range });
          this.logger.debug(`Found definition at: ${definitionLocation.uri.fsPath}:${definitionLocation.range.start.line + 1}`);

          // Use the definition location to find implementations and references
          const definitionDocument = await workspace.openTextDocument(definitionLocation.uri);
          this.logger.debug(`Definition location range: ${definitionLocation.range.start.line}:${definitionLocation.range.start.character}-${definitionLocation.range.end.line}:${definitionLocation.range.end.character}`);
          const definitionPosition = this.findPredicatePositionInDefinition(definitionDocument, definitionLocation.range.start.line, finalCurrentIndicator2, isNonTerminal);
          this.logger.debug(`Definition position found at: ${definitionPosition.line}:${definitionPosition.character}`);

          // Get implementation locations (all predicate clauses)
          this.logger.debug(`Calling implementation provider from definition position...`);
          const implementationLocations = await this.implementationProvider.provideImplementation(definitionDocument, definitionPosition, token);
          if (implementationLocations) {
            const implArray = Array.isArray(implementationLocations) ? implementationLocations : [implementationLocations];
            for (const implLoc of implArray) {
              // Handle both Location and LocationLink types
              const location = 'targetUri' in implLoc ?
                { uri: implLoc.targetUri, range: implLoc.targetRange } :
                { uri: implLoc.uri, range: implLoc.range };

              if (this.isValidLocation(location)) {
                allLocations.push(location);
                this.logger.debug(`Found implementation at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
              }
            }
          }

          this.logger.debug(`Calling reference provider from definition position...`);
          const referenceLocations = await this.referenceProvider.provideReferences(
            definitionDocument,
            definitionPosition,
            { includeDeclaration: false }, // Don't include declaration since we don't have one
            token
          );

          this.logger.debug(`Reference provider returned ${referenceLocations ? referenceLocations.length : 0} locations`);
          if (referenceLocations && referenceLocations.length > 0) {
            for (const refLoc of referenceLocations) {
              allLocations.push({ uri: refLoc.uri, range: refLoc.range });
              this.logger.debug(`Found reference at: ${refLoc.uri.fsPath}:${refLoc.range.start.line + 1}:${refLoc.range.start.character}-${refLoc.range.end.character}`);
            }
          } else {
            this.logger.debug(`Reference provider returned ${referenceLocations ? '0 locations' : 'null'} - will rely on definition/implementation locations for local ${isNonTerminal ? 'non-terminal' : 'predicate'}`);
            // Note: For local predicates/non-terminals, we rely on the definition and implementation
            // providers to find all clauses. The reference provider may not find calls in some contexts.
          }
        } else {
          this.logger.debug(`No definition found for: ${currentIndicator}`);
        }
      }

      // Remove duplicates by creating a unique set based on URI and line number
      const uniqueLocations = this.deduplicateLocations(allLocations);

      this.logger.debug(`Total locations found: ${allLocations.length}, unique: ${uniqueLocations.length}`);
      for (const loc of uniqueLocations) {
        this.logger.debug(`Location: ${loc.uri.fsPath}:${loc.range.start.line + 1}`);
      }

      // Step 3: Create workspace edit
      const workspaceEdit = new WorkspaceEdit();
      await this.createAddArgumentEdits(
        workspaceEdit,
        uniqueLocations,
        declarationLocation,
        predicateName,
        finalCurrentIndicator2,
        finalNewIndicator2,
        isNonTerminal,
        argumentName,
        argumentPosition,
        currentArity
      );

      // Step 4: Apply the edit
      this.logger.debug(`Applying workspace edit with ${workspaceEdit.size} files...`);
      for (const [uri, edits] of workspaceEdit.entries()) {
        this.logger.debug(`File: ${uri.fsPath} - ${edits.length} edits`);
        for (const edit of edits) {
          this.logger.debug(`  Edit: ${edit.range.start.line + 1}:${edit.range.start.character + 1} - "${edit.newText}"`);
        }
      }

      const success = await workspace.applyEdit(workspaceEdit);
      if (success) {
        this.logger.info(`Successfully added argument '${argumentName}' to ${finalCurrentIndicator2}`);
        window.showInformationMessage(`Successfully added argument '${argumentName}' to ${isNonTerminal ? 'non-terminal' : 'predicate'} ${finalCurrentIndicator2}`);
      } else {
        this.logger.error(`Failed to apply workspace edit for ${finalCurrentIndicator2}`);
        window.showErrorMessage("Failed to add argument to predicate/non-terminal.");
      }

    } catch (error) {
      this.logger.error(`Error in performAddArgumentRefactoring: ${error}`);
      window.showErrorMessage(`Error adding argument to predicate: ${error}`);
    }
  }

  /**
   * Check if a location is valid
   */
  private isValidLocation(location: Location | { uri: Uri; range: Range } | null): boolean {
    return location !== null && location.uri !== undefined && location.range !== undefined;
  }

  /**
   * Remove duplicate locations based on URI and line number
   */
  private deduplicateLocations(locations: { uri: Uri; range: Range }[]): { uri: Uri; range: Range }[] {
    const seen = new Set<string>();
    const unique: { uri: Uri; range: Range }[] = [];

    for (const location of locations) {
      const key = `${location.uri.toString()}:${location.range.start.line}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(location);
        this.logger.debug(`Added unique location: ${location.uri.fsPath}:${location.range.start.line + 1} (range: ${location.range.start.character}-${location.range.end.character})`);
      } else {
        this.logger.debug(`Skipped duplicate location: ${location.uri.fsPath}:${location.range.start.line + 1} (range: ${location.range.start.character}-${location.range.end.character})`);
      }
    }

    return unique;
  }

  /**
   * Find predicate position in declaration line
   */
  private findPredicatePositionInDeclaration(doc: TextDocument, declarationLine: number, predicateIndicator: string): Position {
    const isNonTerminal = predicateIndicator.includes('//');
    const separator = isNonTerminal ? '//' : '/';
    const [predicateName] = predicateIndicator.split(separator);

    // First try to find the predicate on the declaration line itself
    const lineText = doc.lineAt(declarationLine).text;

    // Look for the predicate indicator (name/arity or name//arity)
    const indicatorPattern = new RegExp(predicateIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const indicatorMatch = lineText.match(indicatorPattern);

    if (indicatorMatch && indicatorMatch.index !== undefined) {
      return new Position(declarationLine, indicatorMatch.index);
    }

    // If not found, look for just the predicate name
    const namePattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const nameMatch = lineText.match(namePattern);

    if (nameMatch && nameMatch.index !== undefined) {
      return new Position(declarationLine, nameMatch.index);
    }

    // If not found on the declaration line, this might be a multi-line directive
    // Search the next few lines for the predicate indicator
    const maxLinesToSearch = 10; // Reasonable limit for multi-line directives
    for (let lineNum = declarationLine + 1; lineNum < Math.min(declarationLine + maxLinesToSearch, doc.lineCount); lineNum++) {
      const searchLineText = doc.lineAt(lineNum).text;

      // Stop if we've reached the end of the directive
      if (searchLineText.includes(').') || searchLineText.includes('].)')) {
        break;
      }

      // Look for the predicate indicator in this line
      const searchIndicatorMatch = searchLineText.match(indicatorPattern);
      if (searchIndicatorMatch && searchIndicatorMatch.index !== undefined) {
        this.logger.debug(`Found predicate "${predicateIndicator}" in multi-line directive at line ${lineNum + 1}:${searchIndicatorMatch.index + 1}`);
        return new Position(lineNum, searchIndicatorMatch.index);
      }

      // Look for just the predicate name in this line
      const searchNameMatch = searchLineText.match(namePattern);
      if (searchNameMatch && searchNameMatch.index !== undefined) {
        this.logger.debug(`Found predicate name "${predicateName}" in multi-line directive at line ${lineNum + 1}:${searchNameMatch.index + 1}`);
        return new Position(lineNum, searchNameMatch.index);
      }
    }

    // Fallback: return start of line if not found
    this.logger.debug(`Predicate "${predicateIndicator}" not found in declaration, using fallback position`);
    return new Position(declarationLine, 0);
  }

  /**
   * Find predicate position in definition line
   */
  private findPredicatePositionInDefinition(doc: TextDocument, definitionLine: number, predicateIndicator: string, isNonTerminal: boolean): Position {
    const lineText = doc.lineAt(definitionLine).text;
    const separator = isNonTerminal ? '//' : '/';
    const [predicateName] = predicateIndicator.split(separator);
    const expectedOperator = isNonTerminal ? '-->' : ':-';
    this.logger.debug(`findPredicatePositionInDefinition: Looking for "${predicateName}" (from ${predicateIndicator}) expecting "${expectedOperator}" on line ${definitionLine + 1}: "${lineText}"`);

    // Look for the predicate name at the start of the line (for definitions)
    const namePattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    let match: RegExpExecArray | null;
    let pos = 0;

    while ((match = namePattern.exec(lineText.substring(pos))) !== null) {
      const actualPos = pos + match.index;

      // Check if this occurrence is followed by the expected operator or is a fact
      const afterMatch = lineText.substring(actualPos + match[0].length);
      const operatorMatch = afterMatch.match(/^\s*(\(.*?\))?\s*(-->|:-)/);
      const factMatch = afterMatch.match(/^\s*(\(.*?\))?\s*\./);

      if (operatorMatch && operatorMatch[2] === expectedOperator) {
        // Found predicate/non-terminal with expected operator
        return new Position(definitionLine, actualPos);
      } else if (!isNonTerminal && factMatch) {
        // Found predicate fact (no operator, just arguments and period)
        return new Position(definitionLine, actualPos);
      }

      pos = actualPos + match[0].length;
    }

    // Fallback: return start of line if not found
    return new Position(definitionLine, 0);
  }

  /**
   * Create workspace edits for adding argument to predicate
   */
  private async createAddArgumentEdits(
    workspaceEdit: WorkspaceEdit,
    allLocations: { uri: Uri; range: Range }[],
    declarationLocation: Location | null,
    predicateName: string,
    currentIndicator: string,
    newIndicator: string,
    isNonTerminal: boolean,
    argumentName: string,
    argumentPosition: number,
    currentArity: number
  ): Promise<void> {
    // Group locations by file
    const locationsByFile = new Map<string, { uri: Uri; range: Range }[]>();

    for (const location of allLocations) {
      const key = location.uri.toString();
      if (!locationsByFile.has(key)) {
        locationsByFile.set(key, []);
      }
      locationsByFile.get(key)!.push(location);
    }

    // Process each file
    for (const [uriString, locations] of locationsByFile) {
      const uri = Uri.parse(uriString);
      const doc = await workspace.openTextDocument(uri);
      const textEdits: TextEdit[] = [];

      // Track scope directive locations to search for consecutive directives
      const scopeDirectiveLines = new Set<number>();

      for (const location of locations) {
        const lineText = doc.lineAt(location.range.start.line).text;

        // Check if this is a declaration location (scope directive)
        const isDeclaration = declarationLocation &&
                             location.uri.toString() === declarationLocation.uri.toString() &&
                             location.range.start.line === declarationLocation.range.start.line;

        // Check if this line contains a directive (scope, mode, info)
        const isDirective = lineText.trim().startsWith(':-');

        // Check if this directive is related to our predicate
        const isRelatedDirective = isDirective && (
          lineText.includes(currentIndicator) ||  // info(process_image/2, ...) or info(parse//2, ...)
          lineText.includes(predicateName + '(') || // mode(process_image(...), ...) or mode(parse(...), ...)
          (lineText.includes('public(') && lineText.includes(currentIndicator)) ||  // public(process_image/2) or public(parse//2)
          (lineText.includes('protected(') && lineText.includes(currentIndicator)) ||  // protected(process_image/2) or protected(parse//2)
          (lineText.includes('private(') && lineText.includes(currentIndicator))  // private(process_image/2) or private(parse//2)
        );

        if (isDeclaration || isRelatedDirective) {
          // Handle directive - update indicators and predicate calls in directives
          this.logger.debug(`Processing directive at line ${location.range.start.line + 1}: "${lineText.trim()}"`);
          let updatedLine = lineText;

          // Track scope directives for consecutive directive search
          if (isDeclaration || ((lineText.includes('public(') || lineText.includes('protected(') || lineText.includes('private(')) &&
              lineText.includes(currentIndicator))) {
            scopeDirectiveLines.add(location.range.start.line);
            this.logger.debug(`Found scope directive at line ${location.range.start.line + 1}, will search for consecutive directives`);
          }

          // Update predicate indicators (name/arity) - for info directives
          if (lineText.includes(currentIndicator)) {
            this.logger.debug(`Updating indicator in info/scope directive: ${currentIndicator} → ${newIndicator}`);
            updatedLine = updatedLine.replace(new RegExp(currentIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newIndicator);

            // Also update argnames and arguments lists in info directives
            if (lineText.includes('info(')) {
              updatedLine = this.updateInfoDirectiveArguments(updatedLine, argumentName, argumentPosition);
            }
          }

          // Update mode directives: mode(predicate_name(args), mode_info)
          if (lineText.includes('mode(') && lineText.includes(predicateName + '(')) {
            this.logger.debug(`Updating mode directive for predicate: ${predicateName}`);
            updatedLine = this.updateModeDirective(updatedLine, predicateName, argumentName, argumentPosition, currentArity);
          }

          // Update scope directives: public/protected/private(predicate_name/arity)
          if ((lineText.includes('public(') || lineText.includes('protected(') || lineText.includes('private(')) &&
              lineText.includes(currentIndicator)) {
            this.logger.debug(`Updating scope directive: ${currentIndicator} → ${newIndicator}`);
            updatedLine = updatedLine.replace(new RegExp(currentIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newIndicator);
          }

          const edit = TextEdit.replace(
            new Range(
              new Position(location.range.start.line, 0),
              new Position(location.range.start.line, lineText.length)
            ),
            updatedLine
          );
          textEdits.push(edit);
        } else {
          // Handle predicate call/definition - add the argument
          const edits = this.createArgumentAdditionEdit(doc, location, argumentName, argumentPosition, currentArity, isNonTerminal, predicateName);
          textEdits.push(...edits);
        }
      }

      // Search for consecutive directives after each scope directive
      for (const scopeLine of scopeDirectiveLines) {
        this.logger.debug(`Searching for consecutive directives after scope directive at line ${scopeLine + 1}`);
        const consecutiveEdits = this.findAndUpdateConsecutiveDirectives(
          doc, scopeLine, predicateName, currentIndicator, newIndicator, argumentName, argumentPosition, currentArity, isNonTerminal
        );
        textEdits.push(...consecutiveEdits);
      }

      workspaceEdit.set(uri, textEdits);
    }
  }

  /**
   * Find and update consecutive directives that follow a scope directive
   */
  private findAndUpdateConsecutiveDirectives(
    doc: TextDocument,
    scopeLine: number,
    predicateName: string,
    currentIndicator: string,
    newIndicator: string,
    argumentName: string,
    argumentPosition: number,
    currentArity: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    const edits: TextEdit[] = [];
    const totalLines = doc.lineCount;
    let insideInfoDirective = false;
    let infoDirectiveStartLine = -1;

    // Start searching from the line after the scope directive
    let lineNum = scopeLine + 1;
    while (lineNum < totalLines) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Stop if we hit an empty line (unless we're inside an info directive)
      if (trimmedLine === '' && !insideInfoDirective) {
        this.logger.debug(`Stopping consecutive directive search at empty line ${lineNum + 1}`);
        break;
      }

      // Stop if we hit another scope directive (unless we're inside an info directive)
      if (!insideInfoDirective && trimmedLine.startsWith(':-') &&
          (trimmedLine.includes('public(') || trimmedLine.includes('protected(') || trimmedLine.includes('private('))) {
        this.logger.debug(`Stopping consecutive directive search at scope directive line ${lineNum + 1}`);
        break;
      }

      // Check if this starts a new directive
      if (trimmedLine.startsWith(':-')) {
        let updatedLine = lineText;
        let hasChanges = false;

        // Update info directives: info(predicate_name/arity, ...)
        if (trimmedLine.includes('info(') && trimmedLine.includes(currentIndicator)) {
          this.logger.debug(`Found consecutive info directive at line ${lineNum + 1}: "${trimmedLine}"`);
          updatedLine = updatedLine.replace(new RegExp(currentIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newIndicator);
          hasChanges = true;

          // Mark that we're inside an info directive
          insideInfoDirective = true;
          infoDirectiveStartLine = lineNum;

          // Also check this line for argnames/arguments patterns
          const argnamesUpdated = this.updateInfoDirectiveArguments(updatedLine, argumentName, argumentPosition);
          if (argnamesUpdated !== updatedLine) {
            updatedLine = argnamesUpdated;
          }
        }

        // Update mode directives: mode(predicate_name(args), mode_info)
        // Note: mode directives use predicate name without // even for non-terminals
        if (trimmedLine.includes('mode(') && trimmedLine.includes(predicateName + '(')) {
          this.logger.debug(`Found consecutive mode directive at line ${lineNum + 1}: "${trimmedLine}"`);
          updatedLine = this.updateModeDirective(updatedLine, predicateName, argumentName, argumentPosition, currentArity);
          hasChanges = true;
        }

        // Update meta_predicate directives: meta_predicate(predicate_name(meta_template))
        // Note: meta_predicate directives use predicate name without //
        if (!isNonTerminal && trimmedLine.includes('meta_predicate(') && trimmedLine.includes(predicateName + '(')) {
          this.logger.debug(`Found consecutive meta_predicate directive at line ${lineNum + 1}: "${trimmedLine}"`);
          updatedLine = this.updateMetaDirective(updatedLine, predicateName, argumentPosition, 'meta_predicate');
          hasChanges = true;
        }

        // Update meta_non_terminal directives: meta_non_terminal(predicate_name(meta_template))
        // Note: meta_non_terminal directives use predicate name without // in the template
        if (isNonTerminal && trimmedLine.includes('meta_non_terminal(') && trimmedLine.includes(predicateName + '(')) {
          this.logger.debug(`Found consecutive meta_non_terminal directive at line ${lineNum + 1}: "${trimmedLine}"`);
          updatedLine = this.updateMetaDirective(updatedLine, predicateName, argumentPosition, 'meta_non_terminal');
          hasChanges = true;
        }

        if (hasChanges) {
          const edit = TextEdit.replace(
            new Range(
              new Position(lineNum, 0),
              new Position(lineNum, lineText.length)
            ),
            updatedLine
          );
          edits.push(edit);
        }
      } else if (insideInfoDirective) {
        // We're inside an info directive, check for argnames/arguments patterns
        const argnamesUpdated = this.updateInfoDirectiveArguments(lineText, argumentName, argumentPosition);
        if (argnamesUpdated !== lineText) {
          this.logger.debug(`Found argnames/arguments pattern at line ${lineNum + 1}: "${trimmedLine}"`);

          // The updateInfoDirectiveArguments method preserves the original line structure,
          // so we can replace the entire line
          const edit = TextEdit.replace(
            new Range(
              new Position(lineNum, 0),
              new Position(lineNum, lineText.length)
            ),
            argnamesUpdated
          );
          edits.push(edit);
        }

        // Check for multi-line arguments list start and handle it immediately
        if (trimmedLine.includes('arguments is [') && !trimmedLine.includes(']')) {
          this.logger.debug(`Found multi-line arguments list start at line ${lineNum + 1}, constructing full multi-line arguments`);

          // Handle the entire multi-line arguments list construction
          const multiLineEdits = this.constructMultiLineArguments(doc, lineNum, argumentName, argumentPosition);
          edits.push(...multiLineEdits);

          // Skip ahead past the multi-line arguments list to avoid processing it again
          // Find the closing bracket
          let skipToLine = lineNum + 1;
          while (skipToLine < totalLines) {
            const skipLineText = doc.lineAt(skipToLine).text;
            const skipTrimmedLine = skipLineText.trim();
            if (skipTrimmedLine === ']' || skipTrimmedLine.startsWith(']')) {
              break;
            }
            skipToLine++;
          }
          lineNum = skipToLine; // Skip to the closing bracket line
        }

        // Multi-line arguments lists are now handled proactively when we detect 'arguments is ['
        // so we don't need to handle closing brackets here anymore

        // Check if this line ends the info directive (contains closing bracket and period)
        if (trimmedLine.includes(']).')) {
          this.logger.debug(`Info directive ends at line ${lineNum + 1}`);
          insideInfoDirective = false;
          infoDirectiveStartLine = -1;
        }
      } else if (trimmedLine.startsWith(':-')) {
        // This is some other directive, continue searching
        lineNum++;
        continue;
      } else {
        // This is not a directive and we're not inside an info directive, stop searching
        this.logger.debug(`Stopping consecutive directive search at non-directive line ${lineNum + 1}`);
        break;
      }

      lineNum++;
    }

    return edits;
  }

  /**
   * Construct multi-line arguments list with new argument inserted at correct position
   */
  private constructMultiLineArguments(doc: TextDocument, startLineNum: number, argumentName: string, argumentPosition: number): TextEdit[] {
    const edits: TextEdit[] = [];
    const argumentLines: { lineNum: number; text: string; indent: string }[] = [];
    let endLineNum = startLineNum;

    // Find the end of the multi-line arguments list and collect all argument lines
    for (let lineNum = startLineNum + 1; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Check if this is the closing bracket
      if (trimmedLine === ']' || trimmedLine.startsWith(']')) {
        endLineNum = lineNum;
        this.logger.debug(`Found multi-line arguments list ending at line ${lineNum + 1}`);
        break;
      }

      // If this line contains an argument pair, collect it
      if (trimmedLine.includes('-') && (trimmedLine.includes("'") || trimmedLine.includes('"'))) {
        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '    ';
        argumentLines.push({ lineNum, text: lineText, indent });
      }

      // Stop if we hit another directive
      if (trimmedLine.startsWith(':-')) {
        this.logger.debug(`Hit another directive at line ${lineNum + 1}, stopping arguments list search`);
        break;
      }
    }

    // Determine where to insert the new argument based on position
    let insertLineNum: number;
    let indent: string;

    if (argumentLines.length === 0) {
      // No existing arguments, insert after the opening line
      insertLineNum = startLineNum + 1;
      indent = '    '; // Default indentation
    } else if (argumentPosition - 1 >= argumentLines.length) {
      // Insert at the end (after the last argument)
      insertLineNum = argumentLines[argumentLines.length - 1].lineNum + 1;
      indent = argumentLines[argumentLines.length - 1].indent;
    } else {
      // Insert at the specified position
      const targetArgLine = argumentLines[argumentPosition - 1];
      insertLineNum = targetArgLine.lineNum;
      indent = targetArgLine.indent;
    }

    // Create the new argument line
    const newArgumentLine = `${indent}'${argumentName}' - '',\n`;

    this.logger.debug(`Constructing multi-line arguments: inserting new argument at position ${argumentPosition} (line ${insertLineNum + 1})`);

    // Insert the new argument at the calculated position
    edits.push(TextEdit.insert(
      new Position(insertLineNum, 0),
      newArgumentLine
    ));

    return edits;
  }

  /**
   * Update info directive arguments (argnames and arguments lists)
   */
  private updateInfoDirectiveArguments(lineText: string, argumentName: string, argumentPosition: number): string {
    let updatedLine = lineText;

    // Update argnames is List pattern
    // Example:     argnames is [Image, Final] -> argnames is [NewArg, Image, Final] (if position = 1)
    // Capture leading whitespace to preserve indentation
    const argnamesPattern = /^(\s*)argnames\s+is\s+(\[[^\]]*\])(.*)/;
    const argnamesMatch = updatedLine.match(argnamesPattern);
    if (argnamesMatch) {
      const leadingWhitespace = argnamesMatch[1];
      const currentList = argnamesMatch[2];
      const trailingContent = argnamesMatch[3];
      let newList: string;

      if (currentList === '[]') {
        // Empty list
        newList = `['${argumentName}']`;
      } else {
        // Parse existing arguments and insert at correct position
        const listContent = currentList.slice(1, -1); // Remove [ and ]
        const args = ArgumentUtils.parseArguments(listContent);
        args.splice(argumentPosition - 1, 0, `'${argumentName}'`);
        newList = `[${args.join(', ')}]`;
      }

      updatedLine = `${leadingWhitespace}argnames is ${newList}${trailingContent}`;
      this.logger.debug(`Updated argnames list at position ${argumentPosition}: ${currentList} → ${newList}`);
    }

    // Update arguments is Pairs pattern (single-line only)
    // Example:     arguments is [Image-atom, Final-compound] -> arguments is [NewArg-'', Image-atom, Final-compound] (if position = 1)
    // Capture leading whitespace to preserve indentation
    // Only match if the list is closed on the same line (single-line format)
    const argumentsPattern = /^(\s*)arguments\s+is\s+(\[[^\]]*\])(.*)/;
    const argumentsMatch = updatedLine.match(argumentsPattern);
    if (argumentsMatch) {
      const leadingWhitespace = argumentsMatch[1];
      const currentList = argumentsMatch[2];
      const trailingContent = argumentsMatch[3];
      let newList: string;

      if (currentList === '[]') {
        // Empty list
        newList = `['${argumentName}' - '']`;
      } else {
        // Parse existing arguments and insert at correct position
        const listContent = currentList.slice(1, -1); // Remove [ and ]
        const args = ArgumentUtils.parseArguments(listContent);
        args.splice(argumentPosition - 1, 0, `'${argumentName}'-''`);
        newList = `[${args.join(', ')}]`;
      }

      updatedLine = `${leadingWhitespace}arguments is ${newList}${trailingContent}`;
      this.logger.debug(`Updated single-line arguments list at position ${argumentPosition}: ${currentList} → ${newList}`);
    }

    // Multi-line arguments lists are now handled directly in the while loop
    // when we detect 'arguments is [' without ']' on the same line

    return updatedLine;
  }

  /**
   * Update mode directive to add the new argument
   */
  private updateModeDirective(
    lineText: string,
    predicateName: string,
    argumentName: string,
    argumentPosition: number,
    currentArity: number
  ): string {
    // Pattern: mode(predicate_name(arg1, arg2), mode_info)
    // We need to handle nested parentheses in arguments like ?list(integer)
    const predicateStart = lineText.indexOf(`${predicateName}(`);
    if (predicateStart === -1) {
      return lineText;
    }

    // Find the opening parenthesis after the predicate name
    const openParenPos = predicateStart + predicateName.length;
    if (lineText[openParenPos] !== '(') {
      return lineText;
    }

    // Find the matching closing parenthesis using proper nesting
    const closeParenPos = ArgumentUtils.findMatchingCloseParen(lineText, openParenPos);
    if (closeParenPos === -1) {
      return lineText;
    }

    // Extract current arguments
    const currentArgs = lineText.substring(openParenPos + 1, closeParenPos).trim();
    let newArgs: string;

    if (currentArgs === '') {
      // No current arguments - add ? for unknown mode
      newArgs = '?';
    } else {
      // Parse arguments properly handling nested structures
      const argList = ArgumentUtils.parseArguments(currentArgs);
      argList.splice(argumentPosition - 1, 0, '?');  // Use ? for unknown mode
      newArgs = argList.join(', ');
    }

    // Replace the arguments part
    const beforeArgs = lineText.substring(0, openParenPos + 1);
    const afterArgs = lineText.substring(closeParenPos);
    return beforeArgs + newArgs + afterArgs;
  }

  /**
   * Update meta_predicate or meta_non_terminal directive
   */
  private updateMetaDirective(
    lineText: string,
    predicateName: string,
    argumentPosition: number,
    directiveType: 'meta_predicate' | 'meta_non_terminal'
  ): string {
    // Pattern: meta_predicate(predicate_name(meta_template)) or meta_non_terminal(predicate_name(meta_template))
    const metaPattern = new RegExp(`${directiveType}\\s*\\(\\s*${predicateName}\\s*\\(([^)]*)\\)\\s*\\)`);
    const match = lineText.match(metaPattern);

    if (match) {
      const currentTemplate = match[1];
      this.logger.debug(`Found ${directiveType} template: ${currentTemplate}`);

      let newTemplate: string;
      if (currentTemplate.trim() === '') {
        // No current template arguments
        newTemplate = '*';
      } else {
        // Split current template and insert new meta argument
        const templateArgs = ArgumentUtils.parseArguments(currentTemplate);
        templateArgs.splice(argumentPosition - 1, 0, '*');
        newTemplate = templateArgs.join(', ');
      }

      const updatedLine = lineText.replace(metaPattern, `${directiveType}(${predicateName}(${newTemplate}))`);
      this.logger.debug(`Updated ${directiveType} template: ${currentTemplate} → ${newTemplate}`);
      return updatedLine;
    }

    return lineText;
  }

  /**
   * Create edit for adding argument to a predicate call or definition
   */
  private createArgumentAdditionEdit(
    doc: TextDocument,
    location: { uri: Uri; range: Range },
    argumentName: string,
    argumentPosition: number,
    currentArity: number,
    isNonTerminal: boolean,
    predicateName: string
  ): TextEdit[] {
    this.logger.debug(`createArgumentAdditionEdit: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} at line ${location.range.start.line + 1}`);
    const edits: TextEdit[] = [];
    const startLine = location.range.start.line;

    // Find the end of the clause by looking for the terminating period
    let endLine = startLine;
    let foundTerminator = false;

    for (let lineNum = startLine; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if this line contains a period that terminates the clause
      // We need to be careful about periods inside strings or comments
      if (lineText.includes('.')) {
        // Simple heuristic: if the line ends with a period (possibly followed by whitespace/comments)
        // then this is likely the end of the clause
        if (/\.\s*(?:%.*)?$/.test(lineText)) {
          endLine = lineNum;
          foundTerminator = true;
          break;
        }
      }
    }

    if (!foundTerminator) {
      // If we didn't find a terminator, just process the single line
      endLine = startLine;
    }

    this.logger.debug(`Processing clause from line ${startLine + 1} to ${endLine + 1} for ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName}`);

    // Process each line in the clause to find predicate calls
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const lineEdits = this.findAndUpdatePredicateCallsInLine(
        lineText, lineNum, predicateName, argumentName, argumentPosition, isNonTerminal
      );
      edits.push(...lineEdits);
    }

    return edits;
  }

  /**
   * Find and update all predicate calls in a single line
   */
  private findAndUpdatePredicateCallsInLine(
    lineText: string,
    lineNum: number,
    predicateName: string,
    argumentName: string,
    argumentPosition: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndUpdatePredicateCallsInLine: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} in line: "${lineText}"`);
    const edits: TextEdit[] = [];

    if (isNonTerminal) {
      // For non-terminals, find all occurrences of the non-terminal name
      // This includes both rule heads (with -->) and calls (without -->)
      const nonTerminalPattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      let match: RegExpExecArray | null;
      while ((match = nonTerminalPattern.exec(lineText)) !== null) {
        // Skip if this is inside a comment
        const beforeMatch = lineText.substring(0, match.index);
        if (beforeMatch.includes('%')) {
          const commentPos = beforeMatch.lastIndexOf('%');
          if (commentPos > beforeMatch.lastIndexOf('\n')) {
            continue;
          }
        }

        this.logger.debug(`Found non-terminal occurrence at line ${lineNum + 1}, column ${match.index}: ${predicateName}`);
        const nameEndPos = match.index + predicateName.length;

        // Check if it has arguments: predicateName(args)
        const afterName = lineText.substring(nameEndPos);
        const argsMatch = afterName.match(/^\s*\(([^)]*)\)/);

        if (argsMatch) {
          // Already has arguments: predicateName(arg1, arg2)
          const openParenPos = nameEndPos + afterName.indexOf('(');
          const closeParenPos = ArgumentUtils.findMatchingCloseParen(lineText, openParenPos);
          if (closeParenPos !== -1) {
            const argsText = lineText.substring(openParenPos + 1, closeParenPos);
            const args = ArgumentUtils.parseArguments(argsText);

            // Insert new argument at specified position
            args.splice(argumentPosition - 1, 0, argumentName);
            const newArgsText = args.join(', ');

            edits.push(TextEdit.replace(
              new Range(
                new Position(lineNum, openParenPos + 1),
                new Position(lineNum, closeParenPos)
              ),
              newArgsText
            ));
            this.logger.debug(`Added argument to non-terminal with args: "${newArgsText}"`);
          }
        } else {
          // No arguments: predicateName
          edits.push(TextEdit.insert(
            new Position(lineNum, nameEndPos),
            `(${argumentName})`
          ));
          this.logger.debug(`Added argument to non-terminal without args: "(${argumentName})"`);
        }
      }

    } else {
      // Handle predicate facts: predicateName.
      const factPattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\.`, 'g');
      let factMatch: RegExpExecArray | null;
      while ((factMatch = factPattern.exec(lineText)) !== null) {
        this.logger.debug(`Found fact at line ${lineNum + 1}, column ${factMatch.index}: ${predicateName}`);
        const insertPos = factMatch.index + predicateName.length;
        edits.push(TextEdit.insert(
          new Position(lineNum, insertPos),
          `(${argumentName})`
        ));
      }

      // Look for predicate calls with arguments
      const callPattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`, 'g');
      let callMatch: RegExpExecArray | null;
      while ((callMatch = callPattern.exec(lineText)) !== null) {
        const startPos = callMatch.index + predicateName.length;
        const openParenPos = lineText.indexOf('(', startPos);

        if (openParenPos !== -1) {
          const closeParenPos = ArgumentUtils.findMatchingCloseParen(lineText, openParenPos);

          if (closeParenPos !== -1) {
            this.logger.debug(`Found predicate call at line ${lineNum + 1}, column ${callMatch.index}: ${predicateName}(...)`);

            // Extract current arguments
            const argsText = lineText.substring(openParenPos + 1, closeParenPos);
            const args = ArgumentUtils.parseArguments(argsText);

            // Insert new argument at specified position
            args.splice(argumentPosition - 1, 0, argumentName);
            const newArgsText = args.join(', ');

            edits.push(TextEdit.replace(
              new Range(
                new Position(lineNum, openParenPos + 1),
                new Position(lineNum, closeParenPos)
              ),
              newArgsText
            ));
          }
        }
      }
    }

    return edits;
  }

  /**
   * Find matching closing parenthesis
   */
  private findMatchingCloseParen(text: string, openPos: number): number {
    let depth = 1;
    let pos = openPos + 1;

    while (pos < text.length && depth > 0) {
      if (text[pos] === '(') {
        depth++;
      } else if (text[pos] === ')') {
        depth--;
      }
      pos++;
    }

    return depth === 0 ? pos - 1 : -1;
  }

  /**
   * Parse arguments handling nested structures
   */
  private parseArguments(argsText: string): string[] {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let inQuotes = false;

    for (let i = 0; i < argsText.length; i++) {
      const char = argsText[i];

      if (char === "'" && (i === 0 || argsText[i-1] !== '\\')) {
        inQuotes = !inQuotes;
      }

      if (!inQuotes) {
        if (char === '(' || char === '[') {
          depth++;
        } else if (char === ')' || char === ']') {
          depth--;
        } else if (char === ',' && depth === 0) {
          args.push(current.trim());
          current = '';
          continue;
        }
      }

      current += char;
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return args;
  }

  /**
   * Dispose of the refactor provider and clean up resources
   */
  public dispose(): void {
    // Currently no resources to dispose, but this method provides
    // consistency with other providers and allows for future cleanup
    this.logger.debug('LogtalkRefactorProvider disposed');
  }
}
