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
import { PredicateUtils, PredicateTypeResult } from "../utils/predicateUtils";
import { ArgumentUtils } from "../utils/argumentUtils";
import { LogtalkDeclarationProvider } from "./declarationProvider";
import { LogtalkDefinitionProvider } from "./definitionProvider";
import { LogtalkImplementationProvider } from "./implementationProvider";
import { LogtalkReferenceProvider } from "./referenceProvider";
import { SymbolUtils, PatternSets, SymbolRegexes } from "../utils/symbols";
import LogtalkTerminal from "./logtalkTerminal";
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
    _context: CodeActionContext,
    token: CancellationToken
  ): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];

    // Check for include directive in selection (parse only once)
    const selection = range instanceof Selection ? range : new Selection(range.start, range.end);
    const includePosition = !selection.isEmpty ? this.containsIncludeDirective(document, selection) : null;

    // Check for cancellation after potentially expensive include directive parsing
    if (token.isCancellationRequested) {
      return actions;
    }

    if (!selection.isEmpty) {
      if (includePosition !== null) {
        // Selection contains include/1 directive - provide replace action
        const replaceIncludeAction = new CodeAction(
          "Replace include/1 directive with file contents",
          CodeActionKind.RefactorInline
        );
        replaceIncludeAction.command = {
          command: "logtalk.refactor.replaceIncludeByFileContents",
          title: "Replace include/1 directive with file contents",
          arguments: [document, includePosition, selection]
        };
        actions.push(replaceIncludeAction);
      } else if (selection.start.line !== selection.end.line ||
                 (selection.start.character === 0 &&
                  selection.end.character > document.lineAt(selection.end.line).text.length)) {
        // Selection spans multiple lines OR includes at least one complete line - provide extract actions
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

        const replaceWithIncludeAction = new CodeAction(
          "Replace with include/1 directive",
          CodeActionKind.RefactorExtract
        );
        replaceWithIncludeAction.command = {
          command: "logtalk.refactor.replaceWithInclude",
          title: "Replace with include/1 directive",
          arguments: [document, range]
        };
        actions.push(replaceWithIncludeAction);
      }
    }

    // Check for extract protocol action (works with cursor position or entity name selection)
    const entityInfo = this.detectEntityOpeningDirective(document, range);
    if (entityInfo && (entityInfo.type === 'object' || entityInfo.type === 'category')) {
      const extractProtocolAction = new CodeAction(
        "Extract protocol",
        CodeActionKind.RefactorExtract
      );
      extractProtocolAction.command = {
        command: "logtalk.refactor.extractProtocol",
        title: "Extract protocol",
        arguments: [document, range]
      };
      actions.push(extractProtocolAction);

      // Parameter refactorings for object/category
      const paramsCount = this.countEntityParameters(entityInfo.name);

      const addParameterAction = new CodeAction(
        "Add parameter to object/category",
        CodeActionKind.RefactorRewrite
      );
      addParameterAction.command = {
        command: "logtalk.refactor.addParameter",
        title: "Add parameter to object/category",
        arguments: [document, range]
      };
      actions.push(addParameterAction);

      if (paramsCount >= 2) {
        const reorderParametersAction = new CodeAction(
          "Reorder object/category parameters",
          CodeActionKind.RefactorRewrite
        );
        reorderParametersAction.command = {
          command: "logtalk.refactor.reorderParameters",
          title: "Reorder object/category parameters",
          arguments: [document, range]
        };
        actions.push(reorderParametersAction);
      }

      if (paramsCount >= 1) {
        const removeParameterAction = new CodeAction(
          "Remove parameter from object/category",
          CodeActionKind.RefactorRewrite
        );
        removeParameterAction.command = {
          command: "logtalk.refactor.removeParameter",
          title: "Remove parameter from object/category",
          arguments: [document, range]
        };
        actions.push(removeParameterAction);
      }
    }

    // Check for cancellation before potentially expensive predicate call analysis
    if (token.isCancellationRequested) {
      return actions;
    }

    // Check for replace magic number refactoring
    if (!selection.isEmpty) {
      const selectedText = document.getText(selection);
      const isNumeric = this.isNumericLiteral(selectedText);
      const isInRuleBody = this.isInsideRuleBody(document, selection.start);

      this.logger.debug(`Replace magic number check: selectedText="${selectedText}", isNumeric=${isNumeric}, isInRuleBody=${isInRuleBody}`);

      if (isNumeric && isInRuleBody) {
        const replaceMagicNumberAction = new CodeAction(
          "Replace magic number with predicate call",
          CodeActionKind.RefactorExtract
        );
        replaceMagicNumberAction.command = {
          command: "logtalk.refactor.replaceMagicNumber",
          title: "Replace magic number with predicate call",
          arguments: [document, selection]
        };
        actions.push(replaceMagicNumberAction);
        this.logger.debug(`Added replace magic number action for "${selectedText}"`);
      }
    }

    // Check if we're on a predicate reference for argument refactoring
    const position = range instanceof Selection ? range.active : range.start;
    const indicator = await this.isPredicateReference(document, position);
    if (indicator) {
      const addArgumentAction = new CodeAction(
        "Add argument to predicate/non-terminal",
        CodeActionKind.RefactorRewrite
      );
      addArgumentAction.command = {
        command: "logtalk.refactor.addArgument",
        title: "Add argument to predicate/non-terminal",
        arguments: [document, position, indicator]
      };
      actions.push(addArgumentAction);

      const separator = indicator.includes('//') ? '//' : '/';
      const parts = indicator.split(separator);
      const currentArity = parseInt(parts[1]);

      // Add reorder action if arity > 1
      if (currentArity > 1) {
        const reorderArgumentsAction = new CodeAction(
          "Reorder predicate/non-terminal arguments",
          CodeActionKind.RefactorRewrite
        );
        reorderArgumentsAction.command = {
          command: "logtalk.refactor.reorderArguments",
          title: "Reorder predicate/non-terminal arguments",
          arguments: [document, position, indicator]
        };
        actions.push(reorderArgumentsAction);
      }

      // Add remove argument action if arity >= 1
      if (currentArity >= 1) {
        const removeArgumentAction = new CodeAction(
          "Remove argument from predicate/non-terminal",
          CodeActionKind.RefactorRewrite
        );
        removeArgumentAction.command = {
          command: "logtalk.refactor.removeArgument",
          title: "Remove argument from predicate/non-terminal",
          arguments: [document, position, indicator]
        };
        actions.push(removeArgumentAction);
      }
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
   * Prompt user for predicate name
   */
  private async promptForPredicateName(): Promise<string | undefined> {
    return await window.showInputBox({
      prompt: "Enter the name for the predicate",
      placeHolder: "predicate_name",
      validateInput: (value: string) => {
        if (!value.trim()) {
          return "Predicate name cannot be empty";
        }
        // Basic validation for Logtalk atom names
        if (!/^[a-z][a-zA-Z0-9_]*$/.test(value.trim())) {
          return "Predicate name must start with lowercase letter and contain only letters, digits, and underscores";
        }
        return null;
      }
    });
  }

  /**
   * Convert predicate name to camelCase variable name
   */
  private toCamelCase(predicateName: string): string {
    // Split by underscores and capitalize each part except the first
    const parts = predicateName.split('_');
    if (parts.length === 1) {
      // No underscores, just capitalize first letter
      return predicateName.charAt(0).toUpperCase() + predicateName.slice(1);
    }

    // Multiple parts: capitalize first letter of each part except the first
    return parts.map((part, index) => {
      if (index === 0) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('');
  }

  /**
   * Find entity opening directive in the document
   */
  private findEntityOpeningDirective(document: TextDocument): { line: number; type: string } | null {
    for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      // Check for entity opening directives
      const entityMatch = SymbolUtils.matchFirst(lineText, PatternSets.entityOpening);
      if (entityMatch) {
        return {
          line: lineNum,
          type: entityMatch.type
        };
      }
    }
    return null;
  }

  /**
   * Find insertion point after entity opening directive and info/1 directive
   */
  private findInsertionPointAfterInfo(document: TextDocument, entityLine: number): number {
    let insertionLine = entityLine;

    // Skip the entity opening directive (may be multi-line)
    const entityRange = PredicateUtils.getDirectiveRange(document, entityLine);
    insertionLine = entityRange.end;

    // Look for info/1 directive after entity opening
    for (let lineNum = insertionLine + 1; lineNum < document.lineCount; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      // Skip empty lines and comments
      if (lineText === '' || lineText.startsWith('%')) {
        continue;
      }

      // Check if this is an info/1 directive
      if (lineText.match(/^:-\s*info\(\s*\[/)) {
        const infoRange = PredicateUtils.getDirectiveRange(document, lineNum);
        insertionLine = infoRange.end;
        break;
      } else {
        // Hit non-info directive or other content, stop looking
        break;
      }
    }

    return insertionLine + 1;
  }

  /**
   * Find the clause containing the given position
   */
  private findClauseContaining(document: TextDocument, position: Position): Range | null {
    const startLine = position.line;

    // Find the start of the clause by looking backwards for a clause head
    let clauseStart = startLine;
    for (let lineNum = startLine; lineNum >= 0; lineNum--) {
      const lineText = document.lineAt(lineNum).text.trim();

      // Skip empty lines and comments
      if (lineText === '' || lineText.startsWith('%')) {
        continue;
      }

      // Check if this looks like a clause rule head (predicate name followed by ( or :-)
      if (/^[a-z][a-zA-Z0-9_]+(\()?.*:-/.test(lineText)) {
        clauseStart = lineNum;
        break;
      }
    }

    // Find the end of the clause by looking for the terminating period
    const clauseRange = PredicateUtils.getClauseRange(document, clauseStart);

    return new Range(
      new Position(clauseRange.start, 0),
      new Position(clauseRange.end, document.lineAt(clauseRange.end).text.length)
    );
  }

  /**
   * Find the end of the clause head (position after :- or before .)
   */
  private findClauseHeadEnd(document: TextDocument, clauseStart: Position): Position | null {
    const clauseRange = PredicateUtils.getClauseRange(document, clauseStart.line);
    this.logger.debug(`Finding clause head end for clause range: lines ${clauseRange.start + 1}-${clauseRange.end + 1}`);

    // Look for :- operator in the clause
    for (let lineNum = clauseRange.start; lineNum <= clauseRange.end; lineNum++) {
      const lineText = document.lineAt(lineNum).text;
      const colonDashIndex = lineText.indexOf(':-');
      this.logger.debug(`  Checking line ${lineNum + 1}: "${lineText}", :- at index ${colonDashIndex}`);

      if (colonDashIndex !== -1) {
        // Found :- operator, return position at the end of this line
        // This is where we'll insert the predicate call (after the clause head)
        const position = new Position(lineNum, lineText.length);
        this.logger.debug(`  Found :- operator, returning position line ${lineNum + 1}, char ${lineText.length}`);
        return position;
      }
    }

    // No :- found, this is a fact, return null
    this.logger.debug(`  No :- found in clause, returning null`);
    return null;
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
   * Detect if the cursor is positioned on an entity name in an object or category opening directive
   * @param document The text document
   * @param range The cursor position or selected range
   * @returns Entity information if detected, null otherwise
   */
  private detectEntityOpeningDirective(document: TextDocument, range: Range | Selection): { type: string; name: string; nameWithoutParams: string; line: number } | null {
    const position = range instanceof Selection ? range.active : range.start;
    const lineText = document.lineAt(position.line).text;

    // Check if this line contains an entity opening directive
    const entityMatch = SymbolUtils.matchFirst(lineText.trim(), PatternSets.entityOpening);
    if (!entityMatch) {
      return null;
    }

    // Get the complete multi-line directive content
    const directiveRange = PredicateUtils.getDirectiveRange(document, position.line);
    let fullDirectiveText = '';

    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      if (lineNum < document.lineCount) {
        const line = document.lineAt(lineNum).text;
        fullDirectiveText += line + (lineNum < directiveRange.end ? ' ' : '');
      }
    }

    // Find the matching closing parenthesis for the directive to get the exact content
    const keyword = entityMatch.type.toLowerCase();
    const keywordStart = fullDirectiveText.indexOf(keyword);
    const openParenPos = fullDirectiveText.indexOf('(', keywordStart);
    const closeParenPos = ArgumentUtils.findMatchingCloseParen(fullDirectiveText, openParenPos);

    if (openParenPos < 0 || closeParenPos < 0) {
      return null;
    }

    // Extract the exact directive content between the parentheses
    const directiveContent = fullDirectiveText.substring(openParenPos + 1, closeParenPos);

    // Parse the directive arguments to get the entity identifier (first argument)
    // For directives like: object(entity(params), extends(parent))
    // This will correctly extract: entity(params) as the first argument
    const args = ArgumentUtils.parseArguments(directiveContent);

    if (args.length === 0) {
      return null;
    }

    const entityIdentifier = args[0]; // First argument is the entity identifier

    // Extract just the entity name without parameters
    const nameWithoutParams = entityIdentifier.split('(')[0].trim();

    // Check if the cursor is actually positioned on the entity name in the original line
    // (since the user clicked on a specific line, not the concatenated multi-line text)
    const entityNameStart = lineText.indexOf(nameWithoutParams);
    if (entityNameStart < 0) {
      return null;
    }

    const entityNameEnd = entityNameStart + nameWithoutParams.length;
    const cursorChar = position.character;

    // Cursor must be within the entity name bounds on the original line
    if (cursorChar < entityNameStart || cursorChar > entityNameEnd) {
      return null;
    }

    return {
      type: entityMatch.type,
      name: entityIdentifier,
      nameWithoutParams: nameWithoutParams,
      line: directiveRange.start  // Use the directive start line, not the cursor line
    };
  }

  /**
   * Extract protocol refactoring - extracts predicate declarations from object/category to new protocol
   */
  public async extractProtocol(document: TextDocument, range: Range | Selection): Promise<void> {
    try {
      this.logger.debug(`Extract protocol called with range: lines ${range.start.line + 1}-${range.end.line + 1}`);

      // Detect the entity opening directive
      const entityInfo = this.detectEntityOpeningDirective(document, range);
      this.logger.debug(`Entity info detected:`, entityInfo);

      if (!entityInfo || (entityInfo.type !== 'object' && entityInfo.type !== 'category')) {
        window.showErrorMessage("Extract protocol is only available for objects and categories.");
        return;
      }

      // Generate protocol name
      const protocolName = `${entityInfo.nameWithoutParams}_protocol`;
      this.logger.debug(`Generated protocol name: ${protocolName}`);

      // Ask user for file location and name
      const fileUri = await this.promptForFileSave(protocolName, document);
      if (!fileUri) {
        return; // User cancelled
      }

      // Create a range for the entire entity starting from the detected entity line
      const entityRange = new Range(
        new Position(entityInfo.line, 0),
        new Position(entityInfo.line, 0)
      );

      // Extract predicate declarations from the entity
      this.logger.debug(`Extracting predicate declarations...`);
      const declarations = await this.extractPredicateDeclarations(document, entityRange);
      this.logger.debug(`Found ${declarations.length} declarations`);

      if (declarations.length === 0) {
        window.showErrorMessage("No predicate declarations found to extract.");
        return;
      }

      // Get current date and user info
      const currentDate = new Date();
      const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      const author = await this.getAuthorName();

      // Adapt existing info/1 directive if present
      const adaptedInfo = await this.adaptEntityInfoDirective(document, entityRange, entityInfo.type);

      // Generate the protocol file content
      const protocolContent = this.generateProtocolFileContent(
        protocolName,
        declarations,
        author,
        dateString,
        adaptedInfo
      );

      // Create the new protocol file and remove declarations from original
      const edit = new WorkspaceEdit();
      edit.createFile(fileUri, { ignoreIfExists: false });
      edit.insert(fileUri, new Position(0, 0), protocolContent);

      // Modify the original entity opening directive to add implements(protocol_name)
      await this.addImplementsToEntityDirective(document, entityInfo, protocolName, edit);

      // Remove the extracted declarations from the original document
      // Sort declarations by line number in reverse order to avoid range shifting issues
      const sortedDeclarations = declarations.sort((a, b) => b.range.start.line - a.range.start.line);

      // Group consecutive declarations to handle empty lines properly
      const declarationGroups = this.groupConsecutiveDeclarations(sortedDeclarations);

      for (const group of declarationGroups) {
        // Create a range that encompasses the entire group including surrounding empty lines
        const groupStartLine = group[group.length - 1].range.start.line; // Last in group (lowest line number)
        const groupEndLine = group[0].range.end.line; // First in group (highest line number)

        const groupRange = new Range(
          new Position(groupStartLine, 0),
          new Position(groupEndLine, document.lineAt(groupEndLine).text.length)
        );

        // Extend to include surrounding empty lines
        const extendedRange = this.extendRangeToIncludeEmptyLines(document, groupRange);
        edit.delete(document.uri, extendedRange);
      }

      const success = await workspace.applyEdit(edit);
      if (success) {
        // Open the new file
        const newDocument = await workspace.openTextDocument(fileUri);
        await window.showTextDocument(newDocument);

        this.logger.info(`Successfully extracted protocol: ${fileUri.fsPath}`);
        window.showInformationMessage(`Protocol extracted to: ${path.basename(fileUri.fsPath)}. Declarations removed from source ${entityInfo.type}.`);
      } else {
        window.showErrorMessage("Failed to create the protocol file.");
      }
    } catch (error) {
      this.logger.error(`Error extracting protocol: ${error}`);
      window.showErrorMessage(`Error extracting protocol: ${error}`);
    }
  }

  /**
   * Extract predicate declarations from the entity
   * @param document The text document
   * @param range The selected range containing the entity
   * @returns Array of declaration ranges to extract
   */
  private async extractPredicateDeclarations(document: TextDocument, range: Range | Selection): Promise<{ range: Range; text: string }[]> {
    const declarations: { range: Range; text: string }[] = [];
    const startLine = range.start.line;

    // Find the end of the entity by looking for the closing directive
    let endLine = document.lineCount - 1;
    for (let lineNum = startLine + 1; lineNum < document.lineCount; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();
      if (SymbolUtils.matchFirst(lineText, PatternSets.entityEnding) !== null) {
        endLine = lineNum;
        break;
      }
    }

    this.logger.debug(`Extracting predicate declarations from lines ${startLine + 1} to ${endLine + 1} (entity boundary)`);

    // Find all scope directives and their consecutive directives within the entity
    for (let lineNum = startLine + 1; lineNum < endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Skip empty lines and comments
      if (trimmedLine === '' || trimmedLine.startsWith('%')) {
        continue;
      }

      this.logger.debug(`Checking line ${lineNum + 1}: "${trimmedLine}"`);

      // Check if this is any kind of scope directive (single predicate, non-terminal, or multi-predicate)
      const singleScopeMatch = SymbolUtils.matchFirst(trimmedLine, PatternSets.allScopes);
      const multiScopeMatch = SymbolUtils.matchFirst(trimmedLine, PatternSets.scopeOpenings);

      this.logger.debug(`  singleScopeMatch: ${singleScopeMatch ? singleScopeMatch.type : 'null'}`);
      this.logger.debug(`  multiScopeMatch: ${multiScopeMatch ? multiScopeMatch.type : 'null'}`);

      if (singleScopeMatch || multiScopeMatch) {
        this.logger.debug(`  Found scope directive, finding consecutive directives...`);
        // Find all consecutive directives for this scope
        const consecutiveRanges = await this.findConsecutiveDirectivesFromScope(document, lineNum);
        this.logger.debug(`  Found ${consecutiveRanges.length} consecutive directive ranges`);
        declarations.push(...consecutiveRanges);

        // Skip ahead to avoid processing the same directives again
        if (consecutiveRanges.length > 0) {
          const lastRange = consecutiveRanges[consecutiveRanges.length - 1];
          lineNum = lastRange.range.end.line;
          this.logger.debug(`  Skipping ahead to line ${lineNum + 1}`);
        }
      }
    }

    this.logger.debug(`Total declarations found: ${declarations.length}`);
    return declarations;
  }

  /**
   * Find all consecutive directives starting from a scope directive
   * @param document The text document
   * @param scopeLine The line number of the scope directive
   * @returns Array of directive ranges
   */
  private async findConsecutiveDirectivesFromScope(document: TextDocument, scopeLine: number): Promise<{ range: Range; text: string }[]> {
    const directives: { range: Range; text: string }[] = [];
    let currentLine = scopeLine;

    this.logger.debug(`Finding consecutive directives starting from line ${scopeLine + 1}`);

    while (currentLine < document.lineCount) {
      const lineText = document.lineAt(currentLine).text;
      const trimmedLine = lineText.trim();

      this.logger.debug(`  Checking line ${currentLine + 1}: "${trimmedLine}"`);

      // Stop if we hit an entity ending
      if (SymbolUtils.matchFirst(trimmedLine, PatternSets.entityEnding) !== null) {
        this.logger.debug(`  Hit entity ending, stopping`);
        break;
      }

      // Skip empty lines and comments, but continue searching
      if (trimmedLine === '' || trimmedLine.startsWith('%')) {
        this.logger.debug(`  Skipping empty line or comment`);
        currentLine++;
        continue;
      }

      // Check if this is a directive
      if (trimmedLine.startsWith(':-')) {
        // Check if this is a predicate-related directive
        if (this.isPredicateDirective(trimmedLine)) {
          this.logger.debug(`  Found predicate directive`);
          // Use existing getDirectiveRange function
          const range = PredicateUtils.getDirectiveRange(document, currentLine);
          this.logger.debug(`  Directive range: lines ${range.start + 1}-${range.end + 1}`);

          // Get the full directive text
          const directiveRange = new Range(
            new Position(range.start, 0),
            new Position(range.end, document.lineAt(range.end).text.length)
          );
          const directiveText = document.getText(directiveRange);

          directives.push({
            range: directiveRange,
            text: directiveText
          });

          // Move to the next line after this directive
          currentLine = range.end + 1;
          this.logger.debug(`  Moving to line ${currentLine + 1}`);
        } else {
          // This is a different type of directive, stop
          this.logger.debug(`  Found non-predicate directive, stopping`);
          break;
        }
      } else {
        // This is not a directive, stop
        this.logger.debug(`  Not a directive, stopping`);
        break;
      }
    }

    this.logger.debug(`Found ${directives.length} consecutive directives`);
    return directives;
  }

  /**
   * Group consecutive declarations to handle empty lines properly when deleting
   */
  private groupConsecutiveDeclarations(declarations: { range: Range; text: string }[]): { range: Range; text: string }[][] {
    if (declarations.length === 0) {
      return [];
    }

    const groups: { range: Range; text: string }[][] = [];
    let currentGroup: { range: Range; text: string }[] = [declarations[0]];

    for (let i = 1; i < declarations.length; i++) {
      const current = declarations[i];
      const previous = declarations[i - 1];

      // Check if current declaration is consecutive to the previous one
      // (allowing for a few lines gap for related directives)
      const lineGap = previous.range.start.line - current.range.end.line;

      if (lineGap <= 3) {
        // Consecutive or close enough - add to current group
        currentGroup.push(current);
      } else {
        // Gap too large - start new group
        groups.push(currentGroup);
        currentGroup = [current];
      }
    }

    // Add the last group
    groups.push(currentGroup);
    return groups;
  }

  /**
   * Group declarations by predicate to avoid empty lines between related directives
   */
  private groupDeclarationsByPredicate(declarations: { range: Range; text: string }[]): { range: Range; text: string }[][] {
    if (declarations.length === 0) {
      return [];
    }

    const groups: { range: Range; text: string }[][] = [];
    let currentGroup: { range: Range; text: string }[] = [declarations[0]];

    for (let i = 1; i < declarations.length; i++) {
      const current = declarations[i];
      const previous = declarations[i - 1];

      // Check if current declaration is consecutive to the previous one (same predicate group)
      // Allow for small gaps (1 line) for related directives like mode, info after scope
      const lineGap = current.range.start.line - previous.range.end.line;

      if (lineGap <= 1) {
        // Consecutive or very close - likely same predicate group
        currentGroup.push(current);
      } else {
        // Gap of 2+ lines - likely different predicate, start new group
        groups.push(currentGroup);
        currentGroup = [current];
      }
    }

    // Add the last group
    groups.push(currentGroup);
    return groups;
  }

  /**
   * Add implements(protocol_name) to the entity opening directive
   */
  private async addImplementsToEntityDirective(
    document: TextDocument,
    entityInfo: { type: string; name: string; line: number },
    protocolName: string,
    edit: WorkspaceEdit
  ): Promise<void> {
    // Get the range of the entity opening directive
    const directiveRange = PredicateUtils.getDirectiveRange(document, entityInfo.line);

    // Get the full directive text
    const directiveText = document.getText(new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    ));

    // Check if this is a single-line or multi-line directive
    const lines = directiveText.split('\n');

    if (lines.length === 1) {
      // Single-line directive: :- object(name) or :- object(name(params)).
      // Convert to: :- object(name,\n\timplements(protocol)) or :- object(name(params),\n\timplements(protocol)).
      const line = lines[0];

      // Parse the directive properly to handle parametric entities
      const directiveStart = line.indexOf(':-');
      const keyword = entityInfo.type.toLowerCase();
      const keywordStart = line.indexOf(keyword, directiveStart);
      const openParenPos = line.indexOf('(', keywordStart);

      if (openParenPos >= 0) {
        const closeParenPos = ArgumentUtils.findMatchingCloseParen(line, openParenPos);
        if (closeParenPos >= 0) {
          // Parse the directive arguments to get the entity identifier (first argument)
          const directiveContent = line.substring(openParenPos + 1, closeParenPos);
          const args = ArgumentUtils.parseArguments(directiveContent);

          if (args.length > 0) {
            const entityIdentifier = args[0]; // First argument is the entity identifier

            // Build the new directive with implements
            const beforeEntity = line.substring(0, openParenPos + 1);
            const afterEntity = line.substring(closeParenPos);
            const newDirective = `${beforeEntity}${entityIdentifier},\n\timplements(${protocolName})${afterEntity}`;

            const fullRange = new Range(
              new Position(directiveRange.start, 0),
              new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
            );
            edit.replace(document.uri, fullRange, newDirective);
          }
        }
      }
    } else {
      // Multi-line directive - insert implements after the entity name line
      // Find the first line (entity name line) and modify it to add comma if needed
      const firstLine = lines[0];
      const firstLineRange = new Range(
        new Position(directiveRange.start, 0),
        new Position(directiveRange.start, document.lineAt(directiveRange.start).text.length)
      );

      // Check if first line already ends with comma
      if (firstLine.trim().endsWith(',')) {
        // Already has comma, just insert implements line after it
        const insertPosition = new Position(directiveRange.start + 1, 0);
        edit.insert(document.uri, insertPosition, `\timplements(${protocolName}),\n`);
      } else {
        // Need to add comma to first line and insert implements
        const modifiedFirstLine = firstLine.replace(/\s*$/, ',');
        edit.replace(document.uri, firstLineRange, modifiedFirstLine);

        const insertPosition = new Position(directiveRange.start + 1, 0);
        edit.insert(document.uri, insertPosition, `\timplements(${protocolName}),\n`);
      }
    }
  }

  /**
   * Clean declaration text by removing only leading/trailing empty lines, preserving original formatting
   */
  private cleanDeclarationText(text: string): string {
    const lines = text.split('\n');

    // Remove leading empty lines
    while (lines.length > 0 && lines[0].trim() === '') {
      lines.shift();
    }

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }

    // Return as-is, preserving original formatting
    return lines.join('\n');
  }

  /**
   * Extend a range to include empty lines before and after
   */
  private extendRangeToIncludeEmptyLines(document: TextDocument, range: Range): Range {
    let startLine = range.start.line;
    let endLine = range.end.line;

    // Look for empty lines before the range
    while (startLine > 0) {
      const prevLine = startLine - 1;
      const lineText = document.lineAt(prevLine).text.trim();
      if (lineText === '') {
        startLine = prevLine;
      } else {
        break;
      }
    }

    // Look for empty lines after the range
    while (endLine < document.lineCount - 1) {
      const nextLine = endLine + 1;
      const lineText = document.lineAt(nextLine).text.trim();
      if (lineText === '') {
        endLine = nextLine;
      } else {
        break;
      }
    }

    return new Range(
      new Position(startLine, 0),
      new Position(endLine, document.lineAt(endLine).text.length)
    );
  }

  /**
   * Check if a directive is predicate-related
   */
  private isPredicateDirective(trimmedLine: string): boolean {
    const predicateDirectiveTypes = [
      'public', 'protected', 'private',
      'mode', 'info', 'meta_predicate', 'meta_non_terminal',
      'dynamic', 'discontiguous', 'multifile', 'synchronized', 'coinductive', 'uses'
    ];

    return predicateDirectiveTypes.some(type => trimmedLine.includes(`${type}(`));
  }

  /**
   * Adapt existing entity info/1 directive for protocol use
   * @param document The text document
   * @param range The selected range containing the entity
   * @param entityType The type of entity (object or category)
   * @returns Adapted info directive content or null if none found
   */
  private async adaptEntityInfoDirective(document: TextDocument, range: Range | Selection, entityType: string): Promise<string | null> {
    const startLine = range.start.line;
    const endLine = range.end.line;

    // Look for entity info/1 directive within the entity
    for (let lineNum = startLine + 1; lineNum < endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Check if this is an entity info directive
      if (trimmedLine.match(/^\s*:-\s*info\(\s*\[/)) {
        // Use existing getDirectiveRange function
        const range = PredicateUtils.getDirectiveRange(document, lineNum);
        const infoRange = new Range(
          new Position(range.start, 0),
          new Position(range.end, document.lineAt(range.end).text.length)
        );
        const infoText = document.getText(infoRange);

        // Adapt the comment to mention it's extracted from the original entity
        const adaptedInfo = infoText.replace(
          /comment\s+is\s+'([^']*)'/,
          `comment is 'Protocol extracted from ${entityType} $1'`
        );

        return adaptedInfo;
      }
    }

    return null;
  }

  /**
   * Generate the content for the new protocol file
   * @param protocolName The name of the protocol
   * @param declarations Array of predicate declarations
   * @param author Author name
   * @param date Date string
   * @param adaptedInfo Adapted info directive or null
   * @returns The complete protocol file content
   */
  private generateProtocolFileContent(
    protocolName: string,
    declarations: { range: Range; text: string }[],
    author: string,
    date: string,
    adaptedInfo: string | null
  ): string {
    const lines: string[] = [];

    // Protocol opening directive
    lines.push(`:- protocol(${protocolName}).`);
    lines.push('');

    // Info directive - use adapted info if available, otherwise create default
    if (adaptedInfo) {
      lines.push(adaptedInfo);
    } else {
      lines.push('\t:- info([');
      lines.push('\t\tversion is 1:0:0,');
      lines.push(`\t\tauthor is '${author}',`);
      lines.push(`\t\tdate is ${date},`);
      lines.push('\t\tcomment is \'Extracted protocol entity\'');
      lines.push('\t]).');
    }
    lines.push('');

    // Group declarations by predicate and add them with proper spacing
    const predicateGroups = this.groupDeclarationsByPredicate(declarations);

    for (let i = 0; i < predicateGroups.length; i++) {
      const group = predicateGroups[i];

      // Add each directive in the predicate group
      for (let j = 0; j < group.length; j++) {
        const declaration = group[j];
        const cleanedText = this.cleanDeclarationText(declaration.text);
        lines.push(cleanedText);
      }

      // Add empty line between predicate groups
      if (i < predicateGroups.length - 1) {
        lines.push('');
      }
    }

    // Add empty line after the last predicate group before the protocol ending
    if (predicateGroups.length > 0) {
      lines.push('');
    }

    // Protocol closing directive
    lines.push(':- end_protocol.');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Check if a string is a numeric literal (integer or float)
   */
  private isNumericLiteral(text: string): boolean {
    const trimmed = text.trim();
    // Match integers (positive, negative, or zero) and floats
    const numericPattern = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
    return numericPattern.test(trimmed);
  }

  /**
   * Check if a position is inside a rule body (after :- operator)
   */
  private isInsideRuleBody(document: TextDocument, position: Position): boolean {
    const currentLine = position.line;

    this.logger.debug(`Checking if position line ${currentLine + 1}, char ${position.character} is inside rule body`);

    // Look backwards from current position to find a line containing :-
    for (let lineNum = currentLine; lineNum >= 0; lineNum--) {
      const lineText = document.lineAt(lineNum).text;
      const trimmed = lineText.trim();

      this.logger.debug(`  Checking line ${lineNum + 1}: "${lineText}"`);

      // Skip empty lines and comments
      if (trimmed === '' || trimmed.startsWith('%')) {
        this.logger.debug(`    Skipping empty/comment line`);
        continue;
      }

      // Found a directive start, not in rule body
      if (trimmed.startsWith(':-')) {
        this.logger.debug(`    Found :- at start of line, not in rule body`);
        return false;
      }

      // Check if this line contains :- operator
      const colonDashIndex = lineText.indexOf(':-');
      if (colonDashIndex !== -1) {
        this.logger.debug(`    Found :- at position ${colonDashIndex}`);
        // Found :- operator, check if our position is after it
        if (lineNum === currentLine) {
          // Same line: check if position is after the :- operator
          const result = position.character > colonDashIndex + 1;
          this.logger.debug(`    Same line: position ${position.character} > ${colonDashIndex + 1} = ${result}`);
          return result;
        } else {
          // Different line: we're definitely after the :- operator
          this.logger.debug(`    Different line: definitely in rule body`);
          return true;
        }
      }
    }

    this.logger.debug(`  No :- found, not in rule body`);
    return false;
  }

  /**
   * Replace magic number refactoring
   */
  public async replaceMagicNumber(document: TextDocument, selection: Selection): Promise<void> {
    try {
      const selectedText = document.getText(selection);
      const magicNumber = selectedText.trim();

      // Ask user for predicate name
      const predicateName = await this.promptForPredicateName();
      if (!predicateName) {
        return; // User cancelled
      }

      // Ask user for predicate scope
      const predicateScope = await this.promptForPredicateScope();
      if (!predicateScope) {
        return; // User cancelled
      }

      // Generate variable name from predicate name (camelCase)
      const variableName = this.toCamelCase(predicateName);

      // Determine the mode type based on the magic number
      const modeType = this.getModeTypeForNumber(magicNumber);

      // Find the entity opening directive and info/1 directive
      const entityInfo = this.findEntityOpeningDirective(document);
      if (!entityInfo) {
        window.showErrorMessage("Could not find entity opening directive.");
        return;
      }

      // Find insertion point after entity opening and info/1 directive
      const insertionPoint = this.findInsertionPointAfterInfo(document, entityInfo.line);

      // Generate directives and fact predicate
      const directivesAndFact = this.generateDirectivesAndFact(
        predicateName,
        predicateScope,
        modeType,
        variableName,
        magicNumber
      );

      // Find the clause containing the magic number
      const clauseRange = this.findClauseContaining(document, selection.start);
      if (!clauseRange) {
        window.showErrorMessage("Could not find clause containing the magic number.");
        return;
      }

      // Create workspace edit
      const edit = new WorkspaceEdit();

      // Apply edits from bottom to top to avoid line number shifts affecting later edits

      // 1. Replace the magic number with the variable (do this first, it's at the bottom)
      edit.replace(document.uri, selection, variableName);

      // 2. Add predicate call before the selection line (do this before inserting fact at top)
      this.logger.debug(`Checking if clause is multi-line: ${clauseRange.start.line} !== ${selection.start.line}`);
      if (clauseRange.start.line !== selection.start.line) {
        // Multi-line clause: insert predicate call immediately before the selection line
        const indent = document.lineAt(selection.start.line).text.match(/^\s*/)[0];
        const callLine = `${indent}${predicateName}(${variableName}),\n`;
        this.logger.debug(`Inserting predicate call before selection line ${selection.start.line + 1}: "${callLine.trim()}"`);
        edit.insert(document.uri, new Position(selection.start.line, 0), callLine);
      } else {
        // Single-line clause: find the :- and insert after it
        const lineText = document.lineAt(clauseRange.start.line).text;
        const colonDashIndex = lineText.indexOf(':-');
        if (colonDashIndex !== -1) {
          const insertPosition = new Position(clauseRange.start.line, colonDashIndex + 2);
          const callLine = ` ${predicateName}(${variableName}),`;
          this.logger.debug(`Inserting predicate call after :- at position ${clauseRange.start.line + 1}:${colonDashIndex + 2}`);
          edit.insert(document.uri, insertPosition, callLine);
        } else {
          this.logger.warn(`Could not find :- in single-line clause at line ${clauseRange.start.line + 1}`);
        }
      }

      // 3. Insert the directives and fact predicate after entity opening and info directive (do this last, it's at the top)
      edit.insert(document.uri, new Position(insertionPoint, 0), `\n${directivesAndFact}\n`);

      const success = await workspace.applyEdit(edit);
      if (success) {
        window.showInformationMessage(`Magic number replaced with predicate ${predicateName}/1 and variable ${variableName}.`);
      } else {
        window.showErrorMessage("Failed to apply magic number replacement.");
      }
    } catch (error) {
      this.logger.error(`Error replacing magic number: ${error}`);
      window.showErrorMessage(`Error replacing magic number: ${error}`);
    }
  }

  /**
   * Prompt user for predicate scope
   */
  private async promptForPredicateScope(): Promise<string | undefined> {
    const options = [
      {
        label: "public",
        description: "Predicate will be publicly accessible"
      },
      {
        label: "protected",
        description: "Predicate will be accessible to descendants"
      },
      {
        label: "private",
        description: "Predicate will be private to this entity"
      },
      {
        label: "local",
        description: "No scope directive will be generated"
      }
    ];

    const selected = await window.showQuickPick(options, {
      placeHolder: "Select the scope for the new predicate",
      title: "Predicate Scope"
    });

    return selected?.label;
  }

  /**
   * Determine the mode type for a number (integer or float)
   */
  private getModeTypeForNumber(numberString: string): string {
    const trimmed = numberString.trim();
    // Check if it's a float (contains decimal point or scientific notation)
    if (trimmed.includes('.') || /[eE]/.test(trimmed)) {
      return '?float';
    }
    return '?integer';
  }

  /**
   * Generate scope, mode, info directives and fact predicate
   */
  private generateDirectivesAndFact(
    predicateName: string,
    scope: string,
    modeType: string,
    variableName: string,
    magicNumber: string
  ): string {
    const lines: string[] = [];

    // Generate scope directive (if not local)
    if (scope !== 'local') {
      lines.push(`\t:- ${scope}(${predicateName}/1).`);
    }

    // Generate mode directive (if not local)
    if (scope !== 'local') {
      lines.push(`\t:- mode(${predicateName}(${modeType}), zero_or_one).`);
    }

    // Generate info directive (if not local)
    if (scope !== 'local') {
      lines.push(`\t:- info(${predicateName}/1, [`);
      lines.push(`\t\tcomment is '',`);
      lines.push(`\t\targnames is ['${variableName}']`);
      lines.push(`\t]).`);
    }

    // Generate fact predicate
    lines.push(`\t${predicateName}(${magicNumber}).`);

    return lines.join('\n');
  }

  /**
   * Create edits for reordering parameters in entity
   */
  private async createReorderParametersEdits(
    workspaceEdit: WorkspaceEdit,
    document: TextDocument,
    entityInfo: any,
    newOrder: number[]
  ): Promise<void> {
    const { base, params } = this.parseEntityNameAndParams(entityInfo.name);
    const reorderedParams = this.reorderArray(params, newOrder);
    const newIdentifier = this.buildEntityIdentifier(base, reorderedParams);

    // Update entity opening directive
    const dirRange = PredicateUtils.getDirectiveRange(document, entityInfo.line);
    const fullDirRange = new Range(
      new Position(dirRange.start, 0),
      new Position(dirRange.end, document.lineAt(dirRange.end).text.length)
    );
    const dirText = document.getText(fullDirRange);
    const updatedDirText = this.replaceEntityOpeningIdentifierInDirectiveText(dirText, entityInfo.type, newIdentifier);
    workspaceEdit.replace(document.uri, fullDirRange, updatedDirText);

    // Update info/1 directive - reorder parnames and parameters entries
    const endLine = SymbolUtils.findEndEntityDirectivePosition(
      document,
      entityInfo.line,
      entityInfo.type === 'object' ? SymbolRegexes.endObject : (entityInfo.type === 'category' ? SymbolRegexes.endCategory : SymbolRegexes.endProtocol)
    );

    for (let i = entityInfo.line + 1; i <= endLine && i < document.lineCount; i++) {
      const lt = document.lineAt(i).text;

      // Multi-line parnames
      const mlParnames = lt.match(/^(\s*)parnames\s+is\s+\[([^\]]*)?$/);
      if (mlParnames) {
        const tempEdits: TextEdit[] = [];
        const endLineNum = this.reorderMultiLineParnames(document, i, newOrder, tempEdits);
        for (const te of tempEdits) workspaceEdit.replace(document.uri, te.range, te.newText);
        i = endLineNum;
        continue;
      }

      // Multi-line parameters (reuse arguments)
      const mlParameters = lt.match(/^(\s*)parameters\s+is\s+\[([^\]]*)?$/);
      if (mlParameters) {
        const tempEdits: TextEdit[] = [];
        const endLineNum = this.reorderMultiLineArguments(document, i, newOrder, tempEdits);
        for (const te of tempEdits) workspaceEdit.replace(document.uri, te.range, te.newText);
        i = endLineNum;
        continue;
      }

      let updated = this.updateParInfoLineForReorder(lt, 'parnames', newOrder);
      updated = this.updateParInfoLineForReorder(updated, 'parameters', newOrder);
      if (updated !== lt) {
        workspaceEdit.replace(document.uri, document.lineAt(i).range, updated);
      }
    }

    // Update references across workspace
    try {
      const token = { isCancellationRequested: false } as CancellationToken;
      const openingLineText = document.lineAt(entityInfo.line).text;
      const nameIdx = openingLineText.indexOf(entityInfo.nameWithoutParams);
      if (nameIdx >= 0) {
        const entityPos = new Position(entityInfo.line, nameIdx);
        const references = await this.referenceProvider.provideReferences(document, entityPos, { includeDeclaration: false }, token) || [];

        // Group by file
        const byFile = new Map<string, Location[]>();
        for (const loc of references) {
          const key = loc.uri.toString();
          if (!byFile.has(key)) byFile.set(key, []);
          byFile.get(key)!.push(loc);
        }

        for (const [uriStr, locs] of byFile) {
          const uri = Uri.parse(uriStr);
          const refDoc = await workspace.openTextDocument(uri);
          for (const loc of locs) {
            await this.updateEntityCallReferenceForReorder(workspaceEdit, refDoc, loc, entityInfo.nameWithoutParams, newOrder);
          }
        }
      }
    } catch (refErr) {
      this.logger.warn(`Reference updates for reorderParameters skipped/partial due to: ${refErr}`);
    }
  }

  /**
   * Create edits for removing parameter from entity
   */
  private async createRemoveParameterEdits(
    workspaceEdit: WorkspaceEdit,
    document: TextDocument,
    entityInfo: any,
    parameterPosition: number
  ): Promise<void> {
    const { base, params } = this.parseEntityNameAndParams(entityInfo.name);
    const idx = Math.min(Math.max(parameterPosition, 1), params.length) - 1;
    const newParams = params.slice(0, idx).concat(params.slice(idx + 1));
    const newIdentifier = this.buildEntityIdentifier(base, newParams);

    // Update entity opening directive
    const dirRange = PredicateUtils.getDirectiveRange(document, entityInfo.line);
    const fullDirRange = new Range(
      new Position(dirRange.start, 0),
      new Position(dirRange.end, document.lineAt(dirRange.end).text.length)
    );
    const dirText = document.getText(fullDirRange);
    const updatedDirText = this.replaceEntityOpeningIdentifierInDirectiveText(dirText, entityInfo.type, newIdentifier);
    workspaceEdit.replace(document.uri, fullDirRange, updatedDirText);

    // Update info/1 directive - remove parnames and parameters entries
    const endLine = SymbolUtils.findEndEntityDirectivePosition(
      document,
      entityInfo.line,
      entityInfo.type === 'object' ? SymbolRegexes.endObject : (entityInfo.type === 'category' ? SymbolRegexes.endCategory : SymbolRegexes.endProtocol)
    );

    for (let i = entityInfo.line + 1; i <= endLine && i < document.lineCount; i++) {
      const lt = document.lineAt(i).text;

      // Multi-line parnames
      const mlParnames = lt.match(/^(\s*)parnames\s+is\s+\[([^\]]*)?$/);
      if (mlParnames) {
        const tempEdits: TextEdit[] = [];
        const endLineNum = this.removeFromMultiLineParnames(document, i, parameterPosition, params.length, tempEdits);
        for (const te of tempEdits) workspaceEdit.replace(document.uri, te.range, te.newText);
        i = endLineNum;
        continue;
      }

      // Multi-line parameters (reuse arguments)
      const mlParameters = lt.match(/^(\s*)parameters\s+is\s+\[([^\]]*)?$/);
      if (mlParameters) {
        const tempEdits: TextEdit[] = [];
        const endLineNum = this.removeFromMultiLineArguments(document, i, parameterPosition, params.length, tempEdits);
        for (const te of tempEdits) workspaceEdit.replace(document.uri, te.range, te.newText);
        i = endLineNum;
        continue;
      }

      // Check if parnames line should be deleted (becomes empty)
      let updated = this.updateParInfoLineForRemove(lt, 'parnames', parameterPosition);
      if (updated === null) {
        // Delete the entire line (parnames became empty) and handle trailing comma
        this.deleteInfoLineAndHandleComma(document, workspaceEdit, i);
        continue;
      }

      // Check if parameters line should be deleted (becomes empty)
      updated = this.updateParInfoLineForRemove(updated, 'parameters', parameterPosition);
      if (updated === null) {
        // Delete the entire line (parameters became empty) and handle trailing comma
        this.deleteInfoLineAndHandleComma(document, workspaceEdit, i);
        continue;
      }

      // If line was modified but not deleted, replace it
      if (updated !== lt) {
        workspaceEdit.replace(document.uri, document.lineAt(i).range, updated);
      }
    }

    // Update references across workspace
    try {
      const token = { isCancellationRequested: false } as CancellationToken;
      const openingLineText = document.lineAt(entityInfo.line).text;
      const nameIdx = openingLineText.indexOf(entityInfo.nameWithoutParams);
      if (nameIdx >= 0) {
        const entityPos = new Position(entityInfo.line, nameIdx);
        const references = await this.referenceProvider.provideReferences(document, entityPos, { includeDeclaration: false }, token) || [];

        // Group by file
        const byFile = new Map<string, Location[]>();
        for (const loc of references) {
          const key = loc.uri.toString();
          if (!byFile.has(key)) byFile.set(key, []);
          byFile.get(key)!.push(loc);
        }

        for (const [uriStr, locs] of byFile) {
          const uri = Uri.parse(uriStr);
          const refDoc = await workspace.openTextDocument(uri);
          for (const loc of locs) {
            await this.updateEntityCallReferenceForRemove(workspaceEdit, refDoc, loc, entityInfo.nameWithoutParams, parameterPosition);
          }
        }
      }
    } catch (refErr) {
      this.logger.warn(`Reference updates for removeParameter skipped/partial due to: ${refErr}`);
    }
  }

  /**
   * Check if the current position is on a predicate reference and return the indicator
   * @returns The predicate/non-terminal indicator if valid for refactoring, null otherwise
   */
  private async isPredicateReference(document: TextDocument, position: Position): Promise<string | null> {
    // Check if we're in a comment
    const currentLineText = document.lineAt(position.line).text;
    if (currentLineText.trim().startsWith("%")) {
      return null;
    }

    // Use termType to ensure we're not in an entity directive (before expensive Utils calls)
    try {
      const termType = await Utils.termType(document.uri, position);
      // Exclude entity directives from predicate/non-terminal argument refactoring
      if (termType === 'entity_directive') {
        return null;
      }
    } catch (error) {
      this.logger.error(`Error checking term type: ${error}`);
      // Continue with indicator check if termType fails
    }

    // Check if we can find a predicate indicator or call at this position
    const indicator = Utils.getNonTerminalIndicatorUnderCursor(document, position) ||
                      Utils.getPredicateIndicatorUnderCursor(document, position) ||
                      Utils.getCallUnderCursor(document, position);

    return indicator || null;
  }

  /**
   * Check if the selection contains ONLY an include/1 directive (with optional comments)
   *
   * This function ensures that the selection contains only:
   * - Exactly one include/1 directive (uncommented)
   * - Optional comment lines before or after the include directive
   * - Optional empty lines
   * - No other code (predicates, other directives, etc.)
   *
   * This restriction ensures that the replace action is only available when the user
   * has specifically selected an include directive (possibly with surrounding comments),
   * not when they've selected mixed content that happens to contain an include.
   *
   * @param document The text document
   * @param selection The selected range
   * @returns Position of the include directive if it's the only code in selection, null otherwise
   */
  private containsIncludeDirective(document: TextDocument, selection: Selection): Position | null {
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    // Check for include directive pattern: :- include(...) or :-include(...)
    const includePattern = /^\s*:-\s*include\(/;
    const commentPattern = /^\s*%/;
    const emptyLinePattern = /^\s*$/;

    let includePosition: Position | null = null;
    let hasNonCommentNonIncludeCode = false;

    // Search through each line in the selection
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text;

      // Skip empty lines
      if (emptyLinePattern.test(lineText)) {
        continue;
      }

      // Skip commented lines
      if (commentPattern.test(lineText)) {
        continue;
      }

      // Check if this line contains an include directive
      if (includePattern.test(lineText)) {
        if (includePosition !== null) {
          // Multiple include directives found - not allowed
          return null;
        }
        // Store the position of the include directive (pointing to the ':' character)
        const colonIndex = lineText.indexOf(':-');
        if (colonIndex !== -1) {
          includePosition = new Position(lineNum, colonIndex);
        }
      } else {
        // Found non-comment, non-include code - not allowed
        hasNonCommentNonIncludeCode = true;
        break;
      }
    }

    // Return include position only if:
    // 1. Exactly one include directive was found
    // 2. No other non-comment code was found
    return (includePosition !== null && !hasNonCommentNonIncludeCode) ? includePosition : null;
  }

  /**
   * Replace include/1 directive with the contents of the included file
   *
   * This refactoring action replaces an include/1 directive with the actual contents
   * of the included file. It handles:
   * - Relative and absolute file paths
   * - Different quote styles ('file.lgt', "file.lgt")
   * - Files with or without extensions (tries .lgt, .logtalk, .pl, .prolog)
   * - Proper indentation preservation
   * - Error handling for missing files
   *
   * Note: The file argument must be quoted (an atom) in valid Logtalk syntax.
   * If no extension is provided, the system will try common Logtalk extensions.
   * The replacement preserves the indentation level of the original include directive,
   * applying it to all non-empty lines from the included file.
   */
  public async replaceIncludeByFileContents(document: TextDocument, position: Position, selection?: Selection): Promise<void> {
    try {
      const lineText = document.lineAt(position.line).text;

      // Parse the include directive to extract the file path
      const filePath = this.parseIncludeDirective(lineText);
      if (!filePath) {
        window.showErrorMessage("Could not parse include directive.");
        return;
      }

      // Resolve the file path (handle relative paths)
      const resolvedPath = this.resolveIncludePath(filePath, document.uri);
      if (!resolvedPath) {
        window.showErrorMessage(`Could not resolve include path: ${filePath}`);
        return;
      }

      // Read the included file contents
      const fileContents = await this.readIncludedFile(resolvedPath);
      if (fileContents === null) {
        window.showErrorMessage(`Could not read included file: ${resolvedPath}`);
        return;
      }

      // Replace the entire selection with the file contents
      await this.performIncludeReplacement(document, position, fileContents, selection);

      this.logger.info(`Successfully replaced include directive with contents from: ${resolvedPath}`);
      window.showInformationMessage(`Include directive replaced with file contents from: ${path.basename(resolvedPath)}`);

    } catch (error) {
      this.logger.error(`Error replacing include directive: ${error}`);
      window.showErrorMessage(`Error replacing include directive: ${error}`);
    }
  }

  /**
   * Parse the include directive to extract the file path
   */
  private parseIncludeDirective(lineText: string): string | null {
    // Match include directive pattern and extract the file path
    // Handles: :- include('file.lgt'). or :- include("file.lgt").
    // Note: The file argument must be quoted (an atom) in valid Logtalk syntax
    const includePattern = /^\s*:-\s*include\(\s*['"]([^'"()]*)['"]\s*\)/;
    const match = lineText.match(includePattern);

    if (match && match[1]) {
      return match[1].trim();
    }

    return null;
  }

  /**
   * Resolve include file path (handle relative paths and missing extensions)
   */
  private resolveIncludePath(filePath: string, documentUri: Uri): string | null {
    try {
      let basePath: string;

      // Resolve relative to absolute path first
      if (path.isAbsolute(filePath)) {
        basePath = filePath;
      } else {
        // For relative paths, resolve relative to the directory containing the current document
        const documentDir = path.dirname(documentUri.fsPath);
        basePath = path.resolve(documentDir, filePath);
      }

      // If the file already has an extension and exists, return it
      if (path.extname(basePath) && fs.existsSync(basePath)) {
        return basePath;
      }

      // If file has extension but doesn't exist, return the original path
      // (will be handled as an error in readIncludedFile)
      if (path.extname(basePath)) {
        return basePath;
      }

      // No extension - try the file as-is first, then with common extensions
      if (fs.existsSync(basePath)) {
        this.logger.debug(`Found include file without extension: ${basePath}`);
        return basePath;
      }

      // Try common Logtalk extensions
      const extensions = ['lgt', 'logtalk', 'pl', 'prolog'];

      for (const ext of extensions) {
        const pathWithExt = `${basePath}.${ext}`;
        if (fs.existsSync(pathWithExt)) {
          this.logger.debug(`Found include file with extension: ${pathWithExt}`);
          return pathWithExt;
        }
      }

      // No file found with any extension
      this.logger.warn(`Could not find include file with any common extension: ${basePath}`);
      return null;
    } catch (error) {
      this.logger.error(`Error resolving include path: ${error}`);
      return null;
    }
  }

  /**
   * Read the contents of the included file
   */
  private async readIncludedFile(filePath: string): Promise<string | null> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        this.logger.warn(`Include file does not exist: ${filePath}`);
        return null;
      }

      // Read file contents
      const fileContents = fs.readFileSync(filePath, 'utf8');
      this.logger.debug(`Successfully read include file: ${filePath} (${fileContents.length} characters)`);

      return fileContents;
    } catch (error) {
      this.logger.error(`Error reading include file ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Perform the actual replacement of include directive with file contents
   */
  private async performIncludeReplacement(document: TextDocument, position: Position, fileContents: string, selection?: Selection): Promise<void> {
    let replaceRange: Range;
    let referenceLineText: string;

    if (selection && !selection.isEmpty) {
      // Replace the entire selection (include directive + comments)
      replaceRange = new Range(selection.start, selection.end);
      referenceLineText = document.lineAt(position.line).text;
    } else {
      // Fallback: replace just the line containing the include directive
      const lineText = document.lineAt(position.line).text;
      replaceRange = new Range(
        new Position(position.line, 0),
        new Position(position.line, lineText.length)
      );
      referenceLineText = lineText;
    }

    // Process the file contents to preserve indentation from the include directive line
    const processedContents = this.processIncludeContents(fileContents, referenceLineText);

    // Create workspace edit
    const edit = new WorkspaceEdit();
    edit.replace(document.uri, replaceRange, processedContents);

    // Apply the edit
    const success = await workspace.applyEdit(edit);
    if (!success) {
      throw new Error("Failed to apply workspace edit");
    }
  }

  /**
   * Process include file contents to preserve indentation
   */
  private processIncludeContents(fileContents: string, originalLine: string): string {
    // Extract the indentation from the original include directive line
    const indentMatch = originalLine.match(/^(\s*)/);
    const baseIndent = indentMatch ? indentMatch[1] : '';

    // Split file contents into lines
    const lines = fileContents.split(/\r?\n/);

    // Apply base indentation to each line (except empty lines)
    const processedLines = lines.map(line => {
      if (line.trim() === '') {
        return line; // Keep empty lines as-is
      }
      return baseIndent + line;
    });

    return processedLines.join('\n');
  }

  /**
   * Replace selected code with include/1 directive
   *
   * This refactoring extracts the selected code to a new file and replaces
   * the selection with an include/1 directive pointing to the new file.
   * Uses relative paths when the new file is in the same directory or subdirectory,
   * otherwise uses absolute paths.
   */
  public async replaceWithInclude(document: TextDocument, range: Range): Promise<void> {
    try {
      // Get the selected text
      const selectedText = document.getText(range);

      // Get the directory of the current document
      const currentDocumentPath = document.uri.fsPath;
      const currentDir = path.dirname(currentDocumentPath);

      // Prompt user for the new file name
      const fileName = await window.showInputBox({
        prompt: "Enter the name for the new file (without extension)",
        placeHolder: "extracted_code",
        validateInput: (value) => {
          if (!value || value.trim() === '') {
            return "File name cannot be empty";
          }
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value.trim())) {
            return "File name must be a valid identifier (letters, numbers, underscores, starting with letter or underscore)";
          }
          return null;
        }
      });

      if (!fileName) {
        return; // User cancelled
      }

      // Create the new file path
      const newFileName = `${fileName.trim()}.lgt`;
      const newFilePath = path.join(currentDir, newFileName);

      // Check if file already exists
      if (fs.existsSync(newFilePath)) {
        const overwrite = await window.showWarningMessage(
          `File "${newFileName}" already exists. Overwrite?`,
          "Yes", "No"
        );
        if (overwrite !== "Yes") {
          return;
        }
      }

      // Process the selected content to remove base indentation
      const processedContent = this.processExtractedContent(selectedText);

      // Write the processed content to the new file
      await this.writeExtractedFile(newFilePath, processedContent);

      // Determine the include path (relative vs absolute)
      const includePath = this.determineIncludePath(currentDocumentPath, newFilePath);

      // Replace the selection with include directive
      await this.replaceSelectionWithInclude(document, range, includePath);

      this.logger.info(`Successfully extracted code to: ${newFilePath}`);
      window.showInformationMessage(`Code extracted to "${newFileName}" and replaced with include directive.`);

    } catch (error) {
      this.logger.error(`Error in replaceWithInclude: ${error}`);
      window.showErrorMessage(`Failed to extract code: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process extracted content to remove base indentation
   * This makes the refactoring symmetrical - when the include directive is later
   * replaced with file contents, the indentation will be properly restored.
   */
  private processExtractedContent(selectedText: string): string {
    const lines = selectedText.split(/\r?\n/);

    if (lines.length === 0) {
      return selectedText;
    }

    // Find the minimum indentation level (excluding empty lines)
    let minIndent = Infinity;
    for (const line of lines) {
      if (line.trim() !== '') {
        const indentMatch = line.match(/^(\s*)/);
        const indentLength = indentMatch ? indentMatch[1].length : 0;
        minIndent = Math.min(minIndent, indentLength);
      }
    }

    // If no indentation found, return as-is
    if (minIndent === Infinity || minIndent === 0) {
      return selectedText;
    }

    // Remove the minimum indentation from all non-empty lines
    const processedLines = lines.map(line => {
      if (line.trim() === '') {
        return line; // Keep empty lines as-is
      }
      // Remove the base indentation
      return line.substring(minIndent);
    });

    return processedLines.join('\n');
  }

  /**
   * Write extracted content to a new file
   */
  private async writeExtractedFile(filePath: string, content: string): Promise<void> {
    try {
      await fs.promises.writeFile(filePath, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Determine the appropriate include path (relative vs absolute)
   */
  private determineIncludePath(currentDocumentPath: string, newFilePath: string): string {
    const currentDir = path.dirname(currentDocumentPath);
    const newFileDir = path.dirname(newFilePath);
    const newFileName = path.basename(newFilePath, '.lgt'); // Remove .lgt extension

    // Check if the new file is in the same directory or a subdirectory
    const relativePath = path.relative(currentDir, newFilePath);

    // If the relative path doesn't start with '..' and doesn't contain path separators
    // that would indicate going up directories, use relative path
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      // For files in the same directory, just use the filename without extension
      if (newFileDir === currentDir) {
        return newFileName;
      }
      // For files in subdirectories, use relative path without extension
      return path.join(path.dirname(relativePath), path.basename(relativePath, '.lgt'));
    }

    // Use absolute path without extension for files outside the current directory tree
    return path.join(newFileDir, newFileName);
  }

  /**
   * Replace the selection with an include directive
   */
  private async replaceSelectionWithInclude(document: TextDocument, range: Range, includePath: string): Promise<void> {
    // Get the indentation of the first line in the selection
    const firstLineText = document.lineAt(range.start.line).text;
    const indentMatch = firstLineText.match(/^(\s*)/);
    const baseIndent = indentMatch ? indentMatch[1] : '';

    // Get the selected text to check for trailing empty lines
    const selectedText = document.getText(range);

    // Extract trailing newlines/empty lines from the selection
    const trailingNewlineMatch = selectedText.match(/(\n\s*)*$/);
    const preserveTrailingNewlines = (trailingNewlineMatch && trailingNewlineMatch[0]) ? trailingNewlineMatch[0] : '';

    // Create the include directive with proper indentation and preserved trailing newlines
    const includeDirective = `${baseIndent}:- include('${includePath}').${preserveTrailingNewlines}`;

    // Create workspace edit
    const edit = new WorkspaceEdit();
    edit.replace(document.uri, range, includeDirective);

    // Apply the edit
    const success = await workspace.applyEdit(edit);
    if (!success) {
      throw new Error("Failed to apply workspace edit");
    }
  }

  /**
   * Add argument to predicate refactoring operation
   */
  public async addArgument(document: TextDocument, position: Position, indicator: string): Promise<void> {
    this.logger.debug(`=== addArgument method called ===`);

    const sourceDir = path.resolve(path.dirname(document.uri.fsPath)).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(sourceDir);

    try {
      this.logger.debug(`Using predicate indicator: ${indicator}`);
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

      const predicateName = parts[0];
      const currentArity = parseInt(parts[1]);

      // Step 2: Ask user for argument name
      const argumentName = await this.promptForArgumentName();
      if (!argumentName) {
        return; // User cancelled
      }

      // Step 3: Determine argument position
      let position_input: number;
      if (currentArity === 0) {
        // No arguments - automatically add at position 1
        position_input = 1;
        this.logger.debug(`No arguments detected - automatically adding argument at position 1`);
      } else {
        // Has arguments - ask user for position
        const userPosition = await this.promptForArgumentPosition(currentArity);
        if (userPosition === undefined) {
          return; // User cancelled
        }
        position_input = userPosition;
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
   * Reorder arguments of predicate/non-terminal refactoring operation
   */
  public async reorderArguments(document: TextDocument, position: Position, indicator: string): Promise<void> {
    this.logger.debug(`=== reorderArguments method called ===`);

    const sourceDir = path.resolve(path.dirname(document.uri.fsPath)).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(sourceDir);

    try {
      this.logger.debug(`Using predicate indicator: ${indicator}`);
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
      const finalIsNonTerminal = typeResult.isNonTerminal;
      const separator = finalIsNonTerminal ? '//' : '/';
      const parts = typeResult.currentIndicator.split(separator);

      const predicateName = parts[0];
      const currentArity = parseInt(parts[1]);

      // Step 2: Determine argument order
      let newOrder: number[];
      if (currentArity === 2) {
        // For 2 arguments, automatically swap them (only one possible reordering)
        newOrder = [2, 1];
        this.logger.debug(`Automatically swapping 2 arguments: [2, 1]`);
      } else {
        // For 3+ arguments, ask user for new argument order
        const userOrder = await this.promptForArgumentOrder(currentArity);
        if (!userOrder) {
          return; // User cancelled
        }
        newOrder = userOrder;
      }

      // Step 3: Perform the refactoring
      await this.performReorderArgumentsRefactoring(
        document,
        position,
        predicateName,
        currentArity,
        finalIsNonTerminal,
        newOrder,
        typeResult.currentIndicator
      );

    } catch (error) {
      this.logger.error(`Error reordering arguments: ${error}`);
      window.showErrorMessage(`Error reordering arguments: ${error}`);
    }
  }

  /**
   * Remove argument from predicate/non-terminal refactoring operation
   */
  public async removeArgument(document: TextDocument, position: Position, indicator: string): Promise<void> {
    this.logger.debug(`=== removeArgument method called ===`);

    const sourceDir = path.resolve(path.dirname(document.uri.fsPath)).split(path.sep).join("/");
    LogtalkTerminal.checkCodeLoadedFromDirectory(sourceDir);

    try {
      this.logger.debug(`Using predicate indicator: ${indicator}`);
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
      const finalIsNonTerminal = typeResult.isNonTerminal;
      const separator = finalIsNonTerminal ? '//' : '/';
      const parts = typeResult.currentIndicator.split(separator);

      const predicateName = parts[0];
      const currentArity = parseInt(parts[1]);

      if (currentArity < 1) {
        window.showErrorMessage("Cannot remove arguments: predicate/non-terminal has no arguments.");
        return;
      }

      // Step 2: Determine argument position to remove
      let argumentPosition: number;
      if (currentArity === 1) {
        // Only one argument - no need to ask user, automatically remove it
        argumentPosition = 1;
        this.logger.debug(`Single argument detected - automatically removing argument at position 1`);
      } else {
        // Multiple arguments - ask user which one to remove
        const userPosition = await this.promptForArgumentPositionToRemove(currentArity);
        if (userPosition === undefined) {
          return; // User cancelled
        }
        argumentPosition = userPosition;
      }

      // Step 3: Perform the refactoring
      await this.performRemoveArgumentRefactoring(
        document,
        position,
        predicateName,
        currentArity,
        finalIsNonTerminal,
        argumentPosition,
        typeResult.currentIndicator
      );

    } catch (error) {
      this.logger.error(`Error removing argument: ${error}`);
      window.showErrorMessage(`Error removing argument: ${error}`);
    }
  }

  /**
   * Perform the remove argument refactoring operation
   */
  private async performRemoveArgumentRefactoring(
    document: TextDocument,
    position: Position,
    predicateName: string,
    currentArity: number,
    isNonTerminal: boolean,
    argumentPosition: number,
    currentIndicator: string
  ): Promise<void> {
    this.logger.debug(`=== performRemoveArgumentRefactoring ===`);
    this.logger.debug(`Predicate: ${predicateName}, Current Arity: ${currentArity}, Remove Position: ${argumentPosition}, Is Non-Terminal: ${isNonTerminal}`);

    const newArity = currentArity - 1;
    const separator = isNonTerminal ? '//' : '/';
    const newIndicator = `${predicateName}${separator}${newArity}`;

    this.logger.debug(`New indicator will be: ${newIndicator}`);

    // Find all locations that need to be updated
    const locationResult = await this.findAllLocationsToUpdate(document, position, currentIndicator, isNonTerminal);
    const uniqueLocations = locationResult.locations; // Already deduplicated
    const declarationLocation = locationResult.declarationLocation;
    this.logger.debug(`Found ${uniqueLocations.length} unique locations to update`);

    if (uniqueLocations.length === 0) {
      window.showWarningMessage("No locations found to update.");
      return;
    }

    // Create workspace edit
    const workspaceEdit = new WorkspaceEdit();
    await this.createRemoveArgumentEdits(
      workspaceEdit,
      uniqueLocations,
      declarationLocation,
      predicateName,
      currentIndicator,
      newIndicator,
      isNonTerminal,
      argumentPosition,
      currentArity
    );

    // Apply the edit
    const success = await workspace.applyEdit(workspaceEdit);
    if (success) {
      this.logger.debug(`Successfully removed argument ${argumentPosition} from ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName}`);
      window.showInformationMessage(`Successfully removed argument ${argumentPosition} from ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName}.`);
    } else {
      this.logger.error(`Failed to apply workspace edit for ${currentIndicator}`);
      window.showErrorMessage("Failed to remove argument.");
    }
  }

  /**
   * Create edits for removing argument from predicate/non-terminal
   */
  private async createRemoveArgumentEdits(
    workspaceEdit: WorkspaceEdit,
    locations: { uri: Uri; range: Range }[],
    declarationLocation: Location | null,
    predicateName: string,
    currentIndicator: string,
    newIndicator: string,
    isNonTerminal: boolean,
    argumentPosition: number,
    currentArity: number
  ): Promise<void> {
    this.logger.debug(`Creating remove argument edits for ${locations.length} locations`);

    // Group locations by file
    const locationsByFile = new Map<string, { uri: Uri; range: Range }[]>();

    for (const location of locations) {
      const key = location.uri.toString();
      if (!locationsByFile.has(key)) {
        locationsByFile.set(key, []);
      }
      locationsByFile.get(key)!.push(location);
    }

    // Process each file
    for (const [uriString, fileLocations] of locationsByFile) {
      const uri = Uri.parse(uriString);
      const doc = await workspace.openTextDocument(uri);
      const textEdits: TextEdit[] = [];

      for (const location of fileLocations) {
        const lineText = doc.lineAt(location.range.start.line).text;

        // Check if this is a declaration location (scope directive)
        const isDeclaration = declarationLocation &&
                             location.uri.toString() === declarationLocation.uri.toString() &&
                             location.range.start.line === declarationLocation.range.start.line;

        this.logger.debug(`Processing location at line ${location.range.start.line + 1}: isDeclaration=${isDeclaration}, lineText="${lineText.trim()}"`);

        if (isDeclaration) {
          // This is a scope directive - process it and all consecutive directives
          this.logger.debug(`Found scope directive at line ${location.range.start.line + 1}, processing with consecutive directives`);
          const consecutiveEdits = this.findAndUpdateConsecutiveDirectivesForRemoval(
            doc, location.range.start.line, predicateName, currentIndicator, newIndicator, argumentPosition, currentArity, isNonTerminal
          );
          this.logger.debug(`Consecutive directive processing returned ${consecutiveEdits.length} edits`);
          textEdits.push(...consecutiveEdits);
        } else {
          // Check if this location is within a directive (not a scope directive)
          const startLine = location.range.start.line;
          const lineText = doc.lineAt(startLine).text;
          const trimmedLine = lineText.trim();

          if (trimmedLine.startsWith(':-') && this.isPredicateDirective(trimmedLine)) {
            // This is a directive location - process it as a directive
            this.logger.debug(`Found directive location at line ${startLine + 1}, processing as directive`);
            const directiveRange = PredicateUtils.getDirectiveRange(doc, startLine);
            const directiveType = this.getDirectiveType(trimmedLine);

            if (directiveType) {
              const directiveEdits = this.processDirectiveRangeForRemoval(
                doc, directiveRange, predicateName, currentIndicator, newIndicator,
                argumentPosition, currentArity, isNonTerminal, directiveType
              );
              textEdits.push(...directiveEdits);
            }
          } else {
            // Handle predicate call/definition - remove the argument
            const targetArity = currentArity - 1; // Arity after removal
            const firstLineText = doc.lineAt(startLine).text;
            const clauseHeadMatch = this.findClauseHead(firstLineText, predicateName, isNonTerminal, currentArity);

            let clauseRange: { start: number; end: number };
            if (clauseHeadMatch) {
              // This is a definition location - find all consecutive clauses of the same predicate/non-terminal
              const endLine = this.findEndOfConsecutiveClauses(doc, startLine, predicateName, currentArity, isNonTerminal);
              clauseRange = { start: startLine, end: endLine };
            } else {
              // This is a call location - find the end of the current clause that contains the calls
              clauseRange = PredicateUtils.getClauseRange(doc, startLine);
            }

            const edits = this.createArgumentRemovalEdit(doc, clauseRange, argumentPosition, targetArity, isNonTerminal, predicateName);
            textEdits.push(...edits);
          }
        }
      }

      workspaceEdit.set(uri, textEdits);
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
   * Prompt user for entity parameter name with parameter variable syntax validation
   */
  private async promptForParameterName(): Promise<string | undefined> {
    return await window.showInputBox({
      prompt: "Enter the name for the new parameter",
      placeHolder: "_Foo_",
      validateInput: (value: string) => {
        if (!value.trim()) {
          return "Parameter name cannot be empty";
        }
        // Validate parameter variable syntax: _VariableName_
        if (!/^_[A-Z][a-zA-Z0-9]*_$/.test(value.trim())) {
          return "Parameter name must use parameter variable syntax: underscore + capitalized variable name + underscore (e.g., _Foo_)";
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
   * Prompt user for new argument order
   */
  private async promptForArgumentOrder(currentArity: number): Promise<number[] | undefined> {
    const result = await window.showInputBox({
      prompt: `Enter the new argument order as comma-separated positions (1 to ${currentArity})`,
      placeHolder: `e.g., for ${currentArity} arguments: ${Array.from({length: currentArity}, (_, i) => i + 1).reverse().join(',')}`,
      validateInput: (value: string) => {
        if (!value.trim()) {
          return "Argument order cannot be empty";
        }

        const positions = value.trim().split(',').map(p => p.trim());

        // Check that we have exactly currentArity positions
        if (positions.length !== currentArity) {
          return `Must specify exactly ${currentArity} positions`;
        }

        // Parse and validate each position
        const parsedPositions: number[] = [];
        for (const pos of positions) {
          const num = parseInt(pos);
          if (isNaN(num)) {
            return `"${pos}" is not a valid number`;
          }
          if (num < 1 || num > currentArity) {
            return `Position ${num} is out of range (must be 1-${currentArity})`;
          }
          parsedPositions.push(num);
        }

        // Check for duplicates
        const uniquePositions = new Set(parsedPositions);
        if (uniquePositions.size !== parsedPositions.length) {
          return "All positions must be unique (no repetitions)";
        }

        // Check that all positions from 1 to currentArity are present
        for (let i = 1; i <= currentArity; i++) {
          if (!uniquePositions.has(i)) {
            return `Missing position ${i}`;
          }
        }

        return null;
      }
    });

    if (!result) {
      return undefined;
    }

    return result.trim().split(',').map(p => parseInt(p.trim()));
  }

  /**
   * Prompt user for argument position to remove with validation
   */
  private async promptForArgumentPositionToRemove(currentArity: number): Promise<number | undefined> {
    const result = await window.showInputBox({
      prompt: `Enter position of argument to remove (1 to ${currentArity})`,
      placeHolder: "1",
      validateInput: (value: string) => {
        if (!value.trim()) {
          return "Argument position cannot be empty";
        }

        const num = parseInt(value.trim());
        if (isNaN(num)) {
          return `"${value}" is not a valid number`;
        }
        if (num < 1 || num > currentArity) {
          return `Position must be between 1 and ${currentArity}`;
        }

        return null;
      }
    });

    if (!result) {
      return undefined;
    }

    return parseInt(result.trim());
  }

  /**
   * Perform the actual reorder arguments refactoring
   */
  private async performReorderArgumentsRefactoring(
    document: TextDocument,
    position: Position,
    predicateName: string,
    currentArity: number,
    isNonTerminal: boolean,
    newOrder: number[],
    currentIndicator: string
  ): Promise<void> {
    try {
      this.logger.debug(`Reordering arguments for ${currentIndicator} with new order: [${newOrder.join(', ')}]`);

      // Find all locations that need to be updated
      const locationResult = await this.findAllLocationsToUpdate(document, position, currentIndicator, isNonTerminal);
      const uniqueLocations = locationResult.locations; // Already deduplicated
      const declarationLocation = locationResult.declarationLocation;

      this.logger.debug(`Total unique locations found: ${uniqueLocations.length}`);
      for (const loc of uniqueLocations) {
        this.logger.debug(`Location: ${loc.uri.fsPath}:${loc.range.start.line + 1}`);
      }

      // Step 3: Create workspace edit
      const workspaceEdit = new WorkspaceEdit();
      await this.createReorderArgumentsEdits(
        workspaceEdit,
        uniqueLocations,
        declarationLocation,
        predicateName,
        currentIndicator,
        isNonTerminal,
        newOrder,
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
        this.logger.info(`Successfully reordered arguments for ${currentIndicator}`);
        window.showInformationMessage(`Successfully reordered arguments for ${isNonTerminal ? 'non-terminal' : 'predicate'} ${currentIndicator}`);
      } else {
        this.logger.error(`Failed to apply workspace edit for ${currentIndicator}`);
        window.showErrorMessage("Failed to reorder arguments.");
      }

    } catch (error) {
      this.logger.error(`Error in performReorderArgumentsRefactoring: ${error}`);
      window.showErrorMessage(`Error reordering arguments: ${error}`);
    }
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

      // Find all locations that need to be updated
      const locationResult = await this.findAllLocationsToUpdate(document, position, finalCurrentIndicator2, isNonTerminal);
      const uniqueLocations = locationResult.locations; // Already deduplicated
      const declarationLocation = locationResult.declarationLocation;

      this.logger.debug(`Total unique locations found: ${uniqueLocations.length}`);
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
   * Check if a location is part of a multi-line scope directive
   * Returns the line number of the scope directive start if found, null otherwise
   */
  private findMultiLineScopeDirectiveStart(doc: TextDocument, lineNum: number, currentIndicator: string): number | null {
    this.logger.debug(`Checking if line ${lineNum + 1} is part of a multi-line scope directive for ${currentIndicator}`);

    // Check if the current line contains the scope directive keyword
    const currentLineText = doc.lineAt(lineNum).text;
    if (currentLineText.includes('public(') || currentLineText.includes('protected(') || currentLineText.includes('private(')) {
      // Check if this is a single-line directive (contains both keyword and closing parenthesis)
      if (currentLineText.includes(').')) {
        // This is a single-line directive, not multi-line
        return null;
      }
      // This line contains scope directive keyword but no closing - could be multi-line
      // Check if our predicate is in this multi-line directive by searching for it
      if (this.containsPredicateInMultiLineDirective(doc, lineNum, currentIndicator)) {
        return lineNum;
      }
      return null;
    }

    // Search backwards for a scope directive that might contain this predicate
    const maxLinesToSearch = 10; // Reasonable limit for multi-line directives
    for (let searchLine = lineNum - 1; searchLine >= Math.max(0, lineNum - maxLinesToSearch); searchLine--) {
      const searchLineText = doc.lineAt(searchLine).text.trim();

      // Check if this line starts a scope directive
      if (searchLineText.startsWith(':- public([') ||
          searchLineText.startsWith(':- protected([') ||
          searchLineText.startsWith(':- private([')) {

        // Found a potential multi-line scope directive start
        // Now check if our predicate indicator is within this directive
        if (this.isPredicateInMultiLineScopeDirective(doc, searchLine, lineNum, currentIndicator)) {
          this.logger.debug(`Found multi-line scope directive starting at line ${searchLine + 1} containing ${currentIndicator}`);
          return searchLine;
        }
      }

      // If we hit another directive or non-directive code, stop searching
      if (searchLineText.startsWith(':-') &&
          !(searchLineText.includes('public(') || searchLineText.includes('protected(') || searchLineText.includes('private('))) {
        break;
      }
    }

    return null;
  }

  /**
   * Check if a multi-line directive starting at the given line contains the predicate indicator
   */
  private containsPredicateInMultiLineDirective(
    doc: TextDocument,
    directiveStartLine: number,
    currentIndicator: string
  ): boolean {
    // Search from directive start until we find the closing bracket
    for (let lineNum = directiveStartLine; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if we've reached the end of the directive
      if (lineText.includes(').')) {
        // We've reached the end without finding the predicate
        return false;
      }

      // Check if this line contains our predicate indicator
      if (lineText.includes(currentIndicator)) {
        return true;
      }
    }

    // If we reach the end of the document without finding a closing bracket,
    // this is likely a malformed directive, so return false
    return false;
  }

  /**
   * Check if a predicate indicator is within a multi-line scope directive
   */
  private isPredicateInMultiLineScopeDirective(
    doc: TextDocument,
    directiveStartLine: number,
    predicateLine: number,
    currentIndicator: string
  ): boolean {
    // Search from directive start until we find the closing bracket
    let foundPredicate = false;

    for (let lineNum = directiveStartLine; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // If this is the predicate line, check if it contains our indicator
      if (lineNum === predicateLine && lineText.includes(currentIndicator)) {
        foundPredicate = true;
      }

      // Check if we've reached the end of the directive
      if (lineText.includes(').') || lineText.includes('].)')) {
        // Return true if we found the predicate before reaching the end
        return foundPredicate;
      }
    }

    // If we reach the end of the document without finding a closing bracket,
    // this is likely a malformed directive, so return false
    return false;
  }

  /**
   * Update a multi-line directive by replacing the current indicator with the new one
   * This works for any directive type (scope, info, mode, etc.)
   */
  private updateMultiLineDirective(
    doc: TextDocument,
    directiveStartLine: number,
    currentIndicator: string,
    newIndicator: string
  ): TextEdit[] {
    // Search from directive start until we find the closing bracket/parenthesis
    const edits: TextEdit[] = [];
    this.logger.debug(`updateMultiLineDirective: searching from line ${directiveStartLine + 1} for indicator "${currentIndicator}"`);

    for (let lineNum = directiveStartLine; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      this.logger.debug(`updateMultiLineDirective: line ${lineNum + 1}: "${lineText.trim()}"`);

      // Check if we've reached the end of the directive
      if (lineText.includes(').')) {
        this.logger.debug(`updateMultiLineDirective: found end of directive at line ${lineNum + 1}`);
        // Check if this line contains our indicator and update it
        if (lineText.includes(currentIndicator)) {
          this.logger.debug(`updateMultiLineDirective: updating indicator on final line ${lineNum + 1}`);
          const updatedLine = lineText.replace(
            new RegExp(currentIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            newIndicator
          );
          edits.push(TextEdit.replace(
            new Range(new Position(lineNum, 0), new Position(lineNum, lineText.length)),
            updatedLine
          ));
        }
        // We've reached the end of the directive
        break;
      }

      // Check if this line contains our indicator and update it
      if (lineText.includes(currentIndicator)) {
        this.logger.debug(`updateMultiLineDirective: updating indicator on line ${lineNum + 1}`);
        const updatedLine = lineText.replace(
          new RegExp(currentIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          newIndicator
        );
        edits.push(TextEdit.replace(
          new Range(new Position(lineNum, 0), new Position(lineNum, lineText.length)),
          updatedLine
        ));
      }
    }

    this.logger.debug(`updateMultiLineDirective: returning ${edits.length} edits`);
    return edits;
  }

  /**
   * Update a multi-line scope directive by replacing the current indicator with the new one
   */
  private updateMultiLineScopeDirective(
    doc: TextDocument,
    directiveStartLine: number,
    currentIndicator: string,
    newIndicator: string
  ): TextEdit[] {
    const edits: TextEdit[] = [];
    const maxLinesToSearch = Math.min(directiveStartLine + 10, doc.lineCount);

    this.logger.debug(`Updating multi-line scope directive starting at line ${directiveStartLine + 1}: ${currentIndicator} → ${newIndicator}`);

    for (let lineNum = directiveStartLine; lineNum < maxLinesToSearch; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if we've reached the end of the directive
      if (lineText.includes(').') || lineText.includes('].)')) {
        // Check this line for the indicator and update if found
        if (lineText.includes(currentIndicator)) {
          const updatedLine = lineText.replace(new RegExp(currentIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newIndicator);
          edits.push(TextEdit.replace(
            new Range(new Position(lineNum, 0), new Position(lineNum, lineText.length)),
            updatedLine
          ));
          this.logger.debug(`Updated indicator in multi-line directive at line ${lineNum + 1}`);
        }
        break;
      }

      // Check if this line contains our indicator and update it
      if (lineText.includes(currentIndicator)) {
        const updatedLine = lineText.replace(new RegExp(currentIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newIndicator);
        edits.push(TextEdit.replace(
          new Range(new Position(lineNum, 0), new Position(lineNum, lineText.length)),
          updatedLine
        ));
        this.logger.debug(`Updated indicator in multi-line directive at line ${lineNum + 1}`);
      }
    }

    return edits;
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

      for (const location of locations) {
        const lineText = doc.lineAt(location.range.start.line).text;

        // Check if this is a declaration location (scope directive)
        const isDeclaration = declarationLocation &&
                             location.uri.toString() === declarationLocation.uri.toString() &&
                             location.range.start.line === declarationLocation.range.start.line;

        this.logger.debug(`Processing location at line ${location.range.start.line + 1}: isDeclaration=${isDeclaration}, lineText="${lineText.trim()}"`);

        if (isDeclaration) {
          // This is a scope directive - process it and all consecutive directives
          this.logger.debug(`Found scope directive at line ${location.range.start.line + 1}, processing with consecutive directives`);
          const consecutiveEdits = this.findAndUpdateConsecutiveDirectivesForAdding(
            doc, location.range.start.line, predicateName, currentIndicator, newIndicator, argumentName, argumentPosition, currentArity, isNonTerminal
          );
          this.logger.debug(`Consecutive directive processing returned ${consecutiveEdits.length} edits`);
          textEdits.push(...consecutiveEdits);
        } else {
          // Check if this location is within a directive (not a scope directive)
          const startLine = location.range.start.line;
          const lineText = doc.lineAt(startLine).text;
          const trimmedLine = lineText.trim();

          if (trimmedLine.startsWith(':-') && this.isPredicateDirective(trimmedLine)) {
            // This is a directive location - process it as a directive
            this.logger.debug(`Found directive location at line ${startLine + 1}, processing as directive`);
            const directiveRange = PredicateUtils.getDirectiveRange(doc, startLine);
            const directiveType = this.getDirectiveType(trimmedLine);

            if (directiveType) {
              const directiveEdits = this.processDirectiveRangeForAdding(
                doc, directiveRange, predicateName, currentIndicator, newIndicator,
                argumentName, argumentPosition, currentArity, isNonTerminal, directiveType
              );
              textEdits.push(...directiveEdits);
            }
          } else {
            // Handle predicate call/definition - add the argument
            const firstLineText = doc.lineAt(startLine).text;
            const clauseHeadMatch = this.findClauseHead(firstLineText, predicateName, isNonTerminal, currentArity);

            let clauseRange: { start: number; end: number };
            if (clauseHeadMatch) {
              // This is a definition location - find all consecutive clauses of the same predicate/non-terminal
              const endLine = this.findEndOfConsecutiveClauses(doc, startLine, predicateName, currentArity, isNonTerminal);
              clauseRange = { start: startLine, end: endLine };
            } else {
              // This is a call location - find the end of the current clause that contains the calls
              clauseRange = PredicateUtils.getClauseRange(doc, startLine);
            }

            const edits = this.createArgumentAdditionEdit(doc, clauseRange, argumentName, argumentPosition, currentArity, isNonTerminal, predicateName);
            textEdits.push(...edits);
          }
        }
      }

      workspaceEdit.set(uri, textEdits);
    }
  }

  /**
   * Create workspace edits for reordering arguments
   */
  private async createReorderArgumentsEdits(
    workspaceEdit: WorkspaceEdit,
    allLocations: { uri: Uri; range: Range }[],
    declarationLocation: Location | null,
    predicateName: string,
    currentIndicator: string,
    isNonTerminal: boolean,
    newOrder: number[],
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

      for (const location of locations) {
        const lineText = doc.lineAt(location.range.start.line).text;

        // Check if this is a declaration location (scope directive)
        const isDeclaration = declarationLocation &&
                             location.uri.toString() === declarationLocation.uri.toString() &&
                             location.range.start.line === declarationLocation.range.start.line;

        this.logger.debug(`Processing location at line ${location.range.start.line + 1}: isDeclaration=${isDeclaration}, lineText="${lineText.trim()}"`);

        if (isDeclaration) {
          // This is a scope directive - process it and all consecutive directives
          this.logger.debug(`Found scope directive at line ${location.range.start.line + 1}, processing with consecutive directives`);
          const consecutiveEdits = this.findAndUpdateConsecutiveDirectivesForReorder(
            doc, location.range.start.line, predicateName, currentIndicator, newOrder, currentArity, isNonTerminal
          );
          this.logger.debug(`Consecutive directive processing returned ${consecutiveEdits.length} edits`);
          textEdits.push(...consecutiveEdits);
        } else {
          // Check if this location is within a directive (not a scope directive)
          const startLine = location.range.start.line;
          const lineText = doc.lineAt(startLine).text;
          const trimmedLine = lineText.trim();

          if (trimmedLine.startsWith(':-') && this.isPredicateDirective(trimmedLine)) {
            // This is a directive location - process it as a directive
            this.logger.debug(`Found directive location at line ${startLine + 1}, processing as directive`);
            const directiveRange = PredicateUtils.getDirectiveRange(doc, startLine);
            const directiveType = this.getDirectiveType(trimmedLine);

            if (directiveType) {
              const directiveEdits = this.processDirectiveRangeForArgumentsReorder(
                doc, directiveRange, predicateName, currentIndicator, newOrder,
                currentArity, isNonTerminal, directiveType
              );
              textEdits.push(...directiveEdits);
            }
          } else {
            // Handle predicate call/definition - reorder the arguments
            const firstLineText = doc.lineAt(startLine).text;
            const clauseHeadMatch = this.findClauseHead(firstLineText, predicateName, isNonTerminal, currentArity);

            let clauseRange: { start: number; end: number };
            if (clauseHeadMatch) {
              // This is a definition location - find all consecutive clauses of the same predicate/non-terminal
              const endLine = this.findEndOfConsecutiveClauses(doc, startLine, predicateName, currentArity, isNonTerminal);
              clauseRange = { start: startLine, end: endLine };
            } else {
              // This is a call location - find the end of the current clause that contains the calls
              clauseRange = PredicateUtils.getClauseRange(doc, startLine);
            }

            const edits = this.createArgumentsReorderEdit(doc, clauseRange, newOrder, isNonTerminal, predicateName);
            textEdits.push(...edits);
          }
        }
      }

      workspaceEdit.set(uri, textEdits);
    }
  }

  /**
   * Find and update consecutive directives that follow a scope directive
   */
  /**
   * Determine if a directive is relevant for predicate refactoring
   * @param trimmedLine The trimmed line text to check
   * @param isNonTerminal Whether we're working with a non-terminal
   * @returns The directive type if relevant, null otherwise
   */
  private isRelevantPredicateDirective(trimmedLine: string, isNonTerminal: boolean): string | null {
    if (trimmedLine.includes('info(')) {
      return 'info';
    } else if (trimmedLine.includes('mode(')) {
      return 'mode';
    } else if (!isNonTerminal && trimmedLine.includes('meta_predicate(')) {
      return 'meta_predicate';
    } else if (isNonTerminal && trimmedLine.includes('meta_non_terminal(')) {
      return 'meta_non_terminal';
    } else if (trimmedLine.includes('synchronized(')) {
      return 'synchronized';
    } else if (trimmedLine.includes('coinductive(')) {
      return 'coinductive';
    } else if (trimmedLine.includes('multifile(')) {
      return 'multifile';
    } else if (trimmedLine.includes('dynamic(')) {
      return 'dynamic';
    } else if (trimmedLine.includes('discontiguous(')) {
      return 'discontiguous';
    } else if (trimmedLine.includes('uses(')) {
      return 'uses';
    }

    return null;
  }

  /**
   * Get the directive type from a directive line
   */
  private getDirectiveType(trimmedLine: string): string | null {
    const directiveTypes = [
      'public', 'protected', 'private',
      'mode', 'info', 'meta_predicate', 'meta_non_terminal',
      'dynamic', 'discontiguous', 'multifile', 'synchronized', 'coinductive', 'uses'
    ];

    for (const directiveType of directiveTypes) {
      if (trimmedLine.includes(`${directiveType}(`)) {
        return directiveType;
      }
    }

    return null;
  }



  /**
   * Process a directive range and create edits for indicator/callable form updates
   */
  private processDirectiveRangeForAdding(
    doc: TextDocument,
    range: { start: number; end: number },
    predicateName: string,
    currentIndicator: string,
    newIndicator: string,
    argumentName: string,
    argumentPosition: number,
    currentArity: number,
    _isNonTerminal: boolean,
    directiveType: string
  ): TextEdit[] {
    const edits: TextEdit[] = [];
    let foundArgnamesInAnyInfo = false;
    let infoDirectiveToAddArgnames: { start: number, end: number } | null = null;

    this.logger.debug(`Processing ${directiveType} directive range lines ${range.start + 1}-${range.end + 1}`);

    let lineNum = range.start;
    while (lineNum <= range.end) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();
      let updatedLine = lineText;
      let hasChanges = false;

      // Update indicator if present
      if (trimmedLine.includes(currentIndicator)) {
        this.logger.debug(`Found indicator "${currentIndicator}" at line ${lineNum + 1}`);
        updatedLine = updatedLine.replace(new RegExp(currentIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newIndicator);
        hasChanges = true;
      }

      // Update callable form if present (for mode, meta_predicate, etc.)
      // For mode directives, also check for predicates without parentheses (zero-arity predicates)
      const hasCallableForm = trimmedLine.includes(predicateName + '(');

      // For zero-arity mode directives, use regex to match predicate name followed by whitespace and comma
      let hasZeroArityForm = false;
      if (directiveType === 'mode' && currentArity === 0) {
        // Match: mode(...predicateName...) where predicateName is followed by optional whitespace and a comma, not parenthesis
        const zeroArityPattern = new RegExp(`mode\\(\\s*${predicateName}\\s*,`);
        hasZeroArityForm = zeroArityPattern.test(trimmedLine);
        this.logger.debug(`Zero-arity form match for "${predicateName}" at line ${lineNum + 1}: ${hasZeroArityForm}`);
      }

      if (hasCallableForm || hasZeroArityForm) {
        this.logger.debug(`Found ${hasCallableForm ? 'callable' : 'zero-arity'} form "${predicateName}" at line ${lineNum + 1}`);
        if (directiveType === 'mode') {
          updatedLine = this.updateModeDirectiveForArgumentAdding(updatedLine, predicateName, currentArity, argumentPosition);
          hasChanges = true;
        } else if (directiveType === 'meta_predicate' || directiveType === 'meta_non_terminal') {
          updatedLine = this.updateMetaDirectiveForArgumentAdding(updatedLine, predicateName, argumentPosition, directiveType);
          hasChanges = true;
        }
      }

      // Special handling for uses/2 directive
      if (directiveType === 'uses') {
        // For uses/2 directives, we only need to update the indicator, no special argument handling
        // The indicator update is already handled above
        this.logger.debug(`Processing uses/2 directive line ${lineNum + 1}`);
      }

      // Special handling for info directive argnames/arguments
      if (directiveType === 'info') {
        // Check if this is an info/2 directive for our predicate
        const isOurPredicateInfo = trimmedLine.includes(`info(${predicateName}/`) ||
                                   trimmedLine.includes(`info(${predicateName}//`);

        if (isOurPredicateInfo && !infoDirectiveToAddArgnames) {
          // Track the first info/2 directive for this predicate
          const infoRange = PredicateUtils.getDirectiveRange(doc, lineNum);
          infoDirectiveToAddArgnames = infoRange;
        }

        const newLineNum = this.updateInfoDirectiveArgumentsForAdding(
          doc, lineNum, updatedLine, predicateName, currentArity, argumentName, argumentPosition, edits
        );

        // Check if argnames was found in this info directive
        if (isOurPredicateInfo && (this as any)._lastFoundArgnames) {
          foundArgnamesInAnyInfo = true;
        }

        if (newLineNum !== lineNum) {
          // Multi-line structure was processed, jump to the new line
          lineNum = newLineNum;
          continue;
        }
      }

      if (hasChanges) {
        const edit = TextEdit.replace(
          new Range(new Position(lineNum, 0), new Position(lineNum, lineText.length)),
          updatedLine
        );
        edits.push(edit);
      }

      lineNum++;
    }

    // If we found an info/2 directive for this predicate but no argnames, and the predicate currently has no arguments,
    // add an argnames line to the info/2 directive
    if (infoDirectiveToAddArgnames && !foundArgnamesInAnyInfo && currentArity === 0) {
      this.addArgnamesLineToInfo2Directive(doc, edits, infoDirectiveToAddArgnames, argumentName);
    }

    return edits;
  }

  /**
   * Process a directive range and create edits for reordering arguments
   */
  private processDirectiveRangeForArgumentsReorder(
    doc: TextDocument,
    range: { start: number; end: number },
    predicateName: string,
    _currentIndicator: string,
    newOrder: number[],
    currentArity: number,
    _isNonTerminal: boolean,
    directiveType: string
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    this.logger.debug(`Processing ${directiveType} directive range for reordering: lines ${range.start + 1}-${range.end + 1}`);

    let lineNum = range.start;
    while (lineNum <= range.end) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();
      let updatedLine = lineText;
      let hasChanges = false;

      // Update callable form if present (for mode, meta_predicate, etc.)
      if (trimmedLine.includes(predicateName + '(')) {
        this.logger.debug(`Found callable form "${predicateName}(" at line ${lineNum + 1}`);
        if (directiveType === 'mode') {
          updatedLine = this.updateModeDirectiveForArgumentsReorder(updatedLine, predicateName, newOrder);
          hasChanges = true;
        } else if (directiveType === 'meta_predicate' || directiveType === 'meta_non_terminal') {
          updatedLine = this.updateMetaDirectiveForArgumentsReorder(updatedLine, predicateName, newOrder, directiveType);
          hasChanges = true;
        }
      }

      // Special handling for info directive argnames/arguments
      if (directiveType === 'info') {
        const newLineNum = this.updateInfoDirectiveArgumentsForReorder(
          doc, lineNum, updatedLine, predicateName, currentArity, newOrder, edits
        );
        if (newLineNum !== lineNum) {
          // Multi-line structure was processed, jump to the new line
          lineNum = newLineNum;
          continue;
        }
      }

      if (hasChanges) {
        const edit = TextEdit.replace(
          new Range(new Position(lineNum, 0), new Position(lineNum, lineText.length)),
          updatedLine
        );
        edits.push(edit);
      }

      lineNum++;
    }

    return edits;
  }

  /**
   * Process a directive range and create edits for removing arguments
   */
  private processDirectiveRangeForRemoval(
    doc: TextDocument,
    range: { start: number; end: number },
    predicateName: string,
    currentIndicator: string,
    newIndicator: string,
    argumentPosition: number,
    currentArity: number,
    isNonTerminal: boolean,
    directiveType: string
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    this.logger.debug(`Processing ${directiveType} directive range for removal: lines ${range.start + 1}-${range.end + 1}`);

    let lineNum = range.start;
    while (lineNum <= range.end) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();
      let updatedLine = lineText;
      let hasChanges = false;

      // Update indicator if present
      if (trimmedLine.includes(currentIndicator)) {
        this.logger.debug(`Found indicator "${currentIndicator}" at line ${lineNum + 1}, updating to "${newIndicator}"`);
        updatedLine = updatedLine.replace(new RegExp(currentIndicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newIndicator);
        hasChanges = true;
      }

      // Update callable form if present (for mode, meta_predicate, etc.)
      if (trimmedLine.includes(predicateName + '(')) {
        this.logger.debug(`Found callable form "${predicateName}(" at line ${lineNum + 1}`);
        if (directiveType === 'mode') {
          updatedLine = this.updateModeDirectiveForArgumentRemoval(updatedLine, predicateName, argumentPosition, currentArity);
          hasChanges = true;
        } else if (directiveType === 'meta_predicate' || directiveType === 'meta_non_terminal') {
          updatedLine = this.updateMetaDirectiveForArgumentRemoval(updatedLine, predicateName, argumentPosition, currentArity, isNonTerminal);
          hasChanges = true;
        }
      }

      // Special handling for info directive argnames/arguments
      if (directiveType === 'info') {
        const newLineNum = this.updateInfoDirectiveArgumentsForRemoval(
          doc, lineNum, updatedLine, predicateName, argumentPosition, currentArity, edits
        );
        if (newLineNum !== lineNum) {
          // Multi-line structure was processed, jump to the new line
          lineNum = newLineNum;
          continue;
        }
      }

      if (hasChanges) {
        const edit = TextEdit.replace(
          new Range(new Position(lineNum, 0), new Position(lineNum, lineText.length)),
          updatedLine
        );
        edits.push(edit);
      }

      lineNum++;
    }

    return edits;
  }

  private findAndUpdateConsecutiveDirectivesForAdding(
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

    this.logger.debug(`findAndUpdateConsecutiveDirectives: processing scope directive at line ${scopeLine + 1} and consecutive directives`);
    this.logger.debug(`findAndUpdateConsecutiveDirectives: looking for predicateName="${predicateName}", currentIndicator="${currentIndicator}"`);

    // First, process the scope directive itself
    this.logger.debug(`Processing scope directive at line ${scopeLine + 1}`);
    const scopeRange = PredicateUtils.getDirectiveRange(doc, scopeLine);
    this.logger.debug(`Scope directive range: lines ${scopeRange.start + 1}-${scopeRange.end + 1}`);
    const scopeEdits = this.processDirectiveRangeForAdding(
      doc, scopeRange, predicateName, currentIndicator, newIndicator,
      argumentName, argumentPosition, currentArity, isNonTerminal, 'scope'
    );
    edits.push(...scopeEdits);

    // Start searching for consecutive directives from the line after the scope directive
    let lineNum = scopeRange.end + 1;
    while (lineNum < totalLines) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      this.logger.debug(`findAndUpdateConsecutiveDirectives: line ${lineNum + 1}: "${trimmedLine}"`);

      // Skip empty lines and comments
      if (trimmedLine === '' || trimmedLine.startsWith('%')) {
        this.logger.debug(`Skipping ${trimmedLine === '' ? 'empty line' : 'comment'} at line ${lineNum + 1}`);
        lineNum++;
        continue;
      }

      // Stop if we hit another scope directive
      if (trimmedLine.startsWith(':-') &&
          (trimmedLine.includes('public(') || trimmedLine.includes('protected(') || trimmedLine.includes('private('))) {
        this.logger.debug(`Stopping consecutive directive search at scope directive line ${lineNum + 1}`);
        break;
      }

      // Check if this starts a directive
      if (trimmedLine.startsWith(':-')) {
        const directiveType = this.isRelevantPredicateDirective(trimmedLine, isNonTerminal);

        if (directiveType) {
          this.logger.debug(`Found consecutive ${directiveType} directive at line ${lineNum + 1}`);

          // Get the range of this directive
          const range = PredicateUtils.getDirectiveRange(doc, lineNum);
          this.logger.debug(`Directive range: lines ${range.start + 1}-${range.end + 1}`);

          // Check if this directive actually references our predicate/non-terminal
          let containsOurPredicate = false;
          for (let checkLine = range.start; checkLine <= range.end; checkLine++) {
            const checkText = doc.lineAt(checkLine).text;
            if (checkText.includes(currentIndicator) || checkText.includes(predicateName + '(')) {
              containsOurPredicate = true;
              break;
            }

            // For mode directives with zero-arity predicates, also check for predicate name without parentheses
            if (directiveType === 'mode' && currentArity === 0) {
              const zeroArityPattern = new RegExp(`mode\\(\\s*${predicateName}\\s*,`);
              if (zeroArityPattern.test(checkText)) {
                containsOurPredicate = true;
                break;
              }
            }
          }

          if (containsOurPredicate) {
            this.logger.debug(`Directive contains our predicate, processing range`);
            // Process the entire directive range
            const directiveEdits = this.processDirectiveRangeForAdding(
              doc, range, predicateName, currentIndicator, newIndicator,
              argumentName, argumentPosition, currentArity, isNonTerminal, directiveType
            );
            edits.push(...directiveEdits);
          } else {
            this.logger.debug(`Directive does not contain our predicate, skipping`);
          }

          // Skip to the end of this directive
          lineNum = range.end + 1;
          continue;
        } else {
          // This is some other directive not relevant to our predicate, stop searching
          this.logger.debug(`Stopping consecutive directive search at unrelated directive line ${lineNum + 1}: "${trimmedLine}"`);
          break;
        }
      } else {
        // This is not a directive, stop searching
        this.logger.debug(`Stopping consecutive directive search at non-directive line ${lineNum + 1}`);
        break;
      }
    }

    return edits;
  }

  /**
   * Construct multi-line arguments list with new argument inserted at correct position
   */
  private constructMultiLineArguments(doc: TextDocument, startLineNum: number, argumentName: string, argumentPosition: number): { edits: TextEdit[], endLineNum: number } {
    this.logger.debug(`constructMultiLineArguments called: startLine=${startLineNum + 1}, argumentName='${argumentName}', position=${argumentPosition}`);
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
        this.logger.debug(`Found argument line ${lineNum + 1}: "${trimmedLine}"`);
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
    // Don't add comma if inserting at the last position (after all existing arguments)
    const isLastPosition = argumentPosition - 1 >= argumentLines.length;
    const comma = isLastPosition ? '' : ',';
    const newArgumentLine = `${indent}'${argumentName}' - ''${comma}\n`;

    this.logger.debug(`Constructing multi-line arguments: inserting new argument at position ${argumentPosition} (line ${insertLineNum + 1})`);
    this.logger.debug(`Found ${argumentLines.length} existing argument lines`);
    this.logger.debug(`New argument line: "${newArgumentLine.trim()}"`);
    this.logger.debug(`Is last position: ${isLastPosition}`);

    // If inserting at the last position, we need to add a comma to the previous last element
    if (isLastPosition && argumentLines.length > 0) {
      const lastArgLine = argumentLines[argumentLines.length - 1];
      const lastLineText = lastArgLine.text;

      // Check if the last line doesn't already have a comma
      if (!lastLineText.trim().endsWith(',')) {
        // Add comma to the previous last element
        const commaEdit = TextEdit.replace(
          new Range(
            new Position(lastArgLine.lineNum, lastLineText.length),
            new Position(lastArgLine.lineNum, lastLineText.length)
          ),
          ','
        );
        edits.push(commaEdit);
        this.logger.debug(`Added comma to previous last argument at line ${lastArgLine.lineNum + 1}`);
      }
    }

    // Insert the new argument at the calculated position
    edits.push(TextEdit.insert(
      new Position(insertLineNum, 0),
      newArgumentLine
    ));

    this.logger.debug(`Created ${edits.length} edits for multi-line arguments`);
    return { edits, endLineNum };
  }

  /**
   * Construct multi-line examples list with new argument
   */
  private constructMultiLineExamples(doc: TextDocument, startLineNum: number, predicateName: string, currentArity: number, argumentName: string, argumentPosition: number): { edits: TextEdit[], endLineNum: number } {
    this.logger.debug(`constructMultiLineExamples called: startLine=${startLineNum + 1}, argumentName=${argumentName}, position=${argumentPosition}`);
    const edits: TextEdit[] = [];
    const exampleLines: { lineNum: number; text: string; indent: string }[] = [];
    let endLineNum = startLineNum;

    // Find the end of the multi-line examples list and collect all example lines
    for (let lineNum = startLineNum + 1; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Check if this is the closing bracket
      if (trimmedLine === ']' || trimmedLine.startsWith(']')) {
        endLineNum = lineNum;
        this.logger.debug(`Found multi-line examples list ending at line ${lineNum + 1}`);
        break;
      }

      // If this line contains an example (usually quoted strings or callable forms), collect it
      if (trimmedLine.length > 0 && !trimmedLine.startsWith('%')) {
        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '    ';
        exampleLines.push({ lineNum, text: lineText, indent });
        this.logger.debug(`Found example line ${lineNum + 1}: "${trimmedLine}"`);
      }

      // Stop if we hit another directive
      if (trimmedLine.startsWith(':-')) {
        this.logger.debug(`Hit another directive at line ${lineNum + 1}, stopping examples list search`);
        break;
      }
    }

    this.logger.debug(`Found ${exampleLines.length} example lines to update`);

    // Update each example line that contains callable forms
    for (const exampleLine of exampleLines) {
      const updatedExampleText = this.updateExampleLineForAdding(exampleLine.text, predicateName, currentArity, argumentName, argumentPosition);
      if (updatedExampleText !== exampleLine.text) {
        const edit = TextEdit.replace(
          new Range(
            new Position(exampleLine.lineNum, 0),
            new Position(exampleLine.lineNum, exampleLine.text.length)
          ),
          updatedExampleText
        );
        edits.push(edit);
        this.logger.debug(`Updated example at line ${exampleLine.lineNum + 1}`);
      }
    }

    this.logger.debug(`Created ${edits.length} edits for multi-line examples`);
    return { edits, endLineNum };
  }

  /**
   * Update an example line by adding an argument to callable forms
   */
  private updateExampleLineForAdding(lineText: string, predicateName: string, currentArity: number, argumentName: string, argumentPosition: number): string {
    // Examples contain unquoted callable forms like:
    // process_file(File, Options)
    // analyze_data(Dataset, Parameters, Output)

    // Find all callable forms in the line (predicate_name followed by parentheses)
    const callablePattern = /(\w+)\(([^)]*)\)/g;
    let updatedLine = lineText;
    let match: RegExpExecArray | null;
    let offset = 0;

    // Process all matches from left to right
    while ((match = callablePattern.exec(lineText)) !== null) {
      const fullMatch = match[0];
      const foundPredicateName = match[1];
      const currentArgs = match[2].trim();

      // Parse the current arguments
      let args: string[] = [];
      if (currentArgs) {
        args = ArgumentUtils.parseArguments(currentArgs);
      }

      // Only update if this matches the predicate being refactored (same name and arity)
      if (foundPredicateName === predicateName && args.length === currentArity) {
        // Insert the new argument at the specified position
        const newArgs = [...args];
        const insertIndex = Math.min(argumentPosition - 1, newArgs.length);
        newArgs.splice(insertIndex, 0, argumentName);

        // Reconstruct the callable form
        const newCallableForm = `${predicateName}(${newArgs.join(', ')})`;

        // Replace in the updated line (accounting for previous replacements)
        const matchStart = match.index + offset;
        const matchEnd = matchStart + fullMatch.length;
        updatedLine = updatedLine.substring(0, matchStart) + newCallableForm + updatedLine.substring(matchEnd);

        // Update offset for next replacement
        offset += newCallableForm.length - fullMatch.length;

        this.logger.debug(`Updated callable form: ${fullMatch} → ${newCallableForm}`);
      }
    }

    return updatedLine;
  }

  /**
   * Update an example line by removing an argument from callable forms
   */
  private updateExampleLineForRemoval(lineText: string, predicateName: string, argumentPosition: number, currentArity: number): string {
    // Examples contain unquoted callable forms like:
    // process_file(File, Options)
    // analyze_data(Dataset, Parameters, Output)

    // Find all callable forms in the line (predicate_name followed by parentheses)
    const callablePattern = /(\w+)\(([^)]*)\)/g;
    let updatedLine = lineText;
    let match: RegExpExecArray | null;
    let offset = 0;

    // Process all matches from left to right
    while ((match = callablePattern.exec(lineText)) !== null) {
      const fullMatch = match[0];
      const foundPredicateName = match[1];
      const currentArgs = match[2].trim();

      // Parse the current arguments
      let args: string[] = [];
      if (currentArgs) {
        args = ArgumentUtils.parseArguments(currentArgs);
      }

      // Only update if this matches the predicate being refactored (same name and arity)
      if (foundPredicateName === predicateName && args.length === currentArity) {
        // Remove the argument at the specified position
        const newArgs = [...args];
        if (argumentPosition > 0 && argumentPosition <= newArgs.length) {
          newArgs.splice(argumentPosition - 1, 1);
        }

        // Reconstruct the callable form
        const newCallableForm = `${predicateName}(${newArgs.join(', ')})`;

        // Replace in the updated line (accounting for previous replacements)
        const matchStart = match.index + offset;
        const matchEnd = matchStart + fullMatch.length;
        updatedLine = updatedLine.substring(0, matchStart) + newCallableForm + updatedLine.substring(matchEnd);

        // Update offset for next replacement
        offset += newCallableForm.length - fullMatch.length;

        this.logger.debug(`Updated callable form: ${fullMatch} → ${newCallableForm}`);
      }
    }

    return updatedLine;
  }

  /**
   * Update an example line by reordering arguments in callable forms
   */
  private updateExampleLineForArgumentsReorder(lineText: string, predicateName: string, currentArity: number, newOrder: number[]): string {
    // Examples contain unquoted callable forms like:
    // process_file(File, Options)
    // analyze_data(Dataset, Parameters, Output)

    // Find all callable forms in the line (predicate_name followed by parentheses)
    const callablePattern = /(\w+)\(([^)]*)\)/g;
    let updatedLine = lineText;
    let match: RegExpExecArray | null;
    let offset = 0;

    // Process all matches from left to right
    while ((match = callablePattern.exec(lineText)) !== null) {
      const fullMatch = match[0];
      const foundPredicateName = match[1];
      const currentArgs = match[2].trim();

      // Parse the current arguments
      let args: string[] = [];
      if (currentArgs) {
        args = ArgumentUtils.parseArguments(currentArgs);
      }

      // Only update if this matches the predicate being refactored (same name and arity)
      if (foundPredicateName === predicateName && args.length === currentArity) {
        // Reorder the arguments
        const reorderedArgs: string[] = [];
        for (let i = 0; i < newOrder.length; i++) {
          const sourceIndex = newOrder[i] - 1; // Convert to 0-based
          if (sourceIndex >= 0 && sourceIndex < args.length) {
            reorderedArgs.push(args[sourceIndex]);
          }
        }

        // Reconstruct the callable form
        const newCallableForm = `${predicateName}(${reorderedArgs.join(', ')})`;

        // Replace in the updated line (accounting for previous replacements)
        const matchStart = match.index + offset;
        const matchEnd = matchStart + fullMatch.length;
        updatedLine = updatedLine.substring(0, matchStart) + newCallableForm + updatedLine.substring(matchEnd);

        // Update offset for next replacement
        offset += newCallableForm.length - fullMatch.length;

        this.logger.debug(`Updated callable form: ${fullMatch} → ${newCallableForm}`);
      }
    }

    return updatedLine;
  }

  /**
   * Remove argument from multi-line arguments list
   */
  private removeFromMultiLineArguments(doc: TextDocument, startLineNum: number, argumentPosition: number, currentArity: number, edits: TextEdit[]): number {
    this.logger.debug(`removeFromMultiLineArguments called: startLine=${startLineNum + 1}, position=${argumentPosition}, currentArity=${currentArity}`);
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
        this.logger.debug(`Found argument line ${lineNum + 1}: "${trimmedLine}"`);
      }

      // Stop if we hit another directive
      if (trimmedLine.startsWith(':-')) {
        this.logger.debug(`Hit another directive at line ${lineNum + 1}, stopping arguments list search`);
        break;
      }
    }

    this.logger.debug(`Found ${argumentLines.length} argument lines for removal`);

    if (currentArity === 1) {
      // Remove the entire multi-line arguments structure
      this.logger.debug(`Removing entire multi-line arguments structure (last argument)`);

      // Check if we need to remove trailing comma from previous line
      if (startLineNum > 0) {
        const prevLineText = doc.lineAt(startLineNum - 1).text;
        if (prevLineText.trim().endsWith(',')) {
          const commaIndex = prevLineText.lastIndexOf(',');
          const prevLineEdit = TextEdit.replace(
            new Range(
              new Position(startLineNum - 1, commaIndex),
              new Position(startLineNum - 1, commaIndex + 1)
            ),
            ''
          );
          edits.push(prevLineEdit);
          this.logger.debug(`Removed trailing comma from previous line ${startLineNum}`);
        }
      }

      // Remove from start line to end line (inclusive)
      const removeEdit = TextEdit.replace(
        new Range(
          new Position(startLineNum, 0),
          new Position(endLineNum + 1, 0)
        ),
        ''
      );
      edits.push(removeEdit);

      return endLineNum; // Return the line after the removed structure
    } else if (argumentPosition <= argumentLines.length) {
      // Remove specific argument from the multi-line structure
      const targetArgLine = argumentLines[argumentPosition - 1];
      this.logger.debug(`Removing argument at position ${argumentPosition} from line ${targetArgLine.lineNum + 1}`);

      // If removing the last argument and it's not the only argument,
      // we need to remove the comma from the new last argument
      const isRemovingLastArg = argumentPosition === argumentLines.length;
      if (isRemovingLastArg && argumentLines.length > 1) {
        const newLastArgLine = argumentLines[argumentLines.length - 2]; // Previous to last
        const newLastLineText = newLastArgLine.text;

        // Remove comma from the new last argument if it has one
        if (newLastLineText.trim().endsWith(',')) {
          const commaIndex = newLastLineText.lastIndexOf(',');
          const commaRemoveEdit = TextEdit.replace(
            new Range(
              new Position(newLastArgLine.lineNum, commaIndex),
              new Position(newLastArgLine.lineNum, commaIndex + 1)
            ),
            ''
          );
          edits.push(commaRemoveEdit);
          this.logger.debug(`Removed comma from new last argument at line ${newLastArgLine.lineNum + 1}`);
        }
      }

      // Remove the target argument line
      const removeEdit = TextEdit.replace(
        new Range(
          new Position(targetArgLine.lineNum, 0),
          new Position(targetArgLine.lineNum + 1, 0)
        ),
        ''
      );
      edits.push(removeEdit);

      return endLineNum; // Return the line after the structure
    }

    return endLineNum;
  }

  /**
   * Remove argument from multi-line examples list
   */
  private removeFromMultiLineExamples(doc: TextDocument, startLineNum: number, predicateName: string, currentArity: number, argumentPosition: number, edits: TextEdit[]): number {
    this.logger.debug(`removeFromMultiLineExamples called: startLine=${startLineNum + 1}, position=${argumentPosition}, currentArity=${currentArity}`);
    const exampleLines: { lineNum: number; text: string; indent: string }[] = [];
    let endLineNum = startLineNum;

    // Find the end of the multi-line examples list and collect all example lines
    for (let lineNum = startLineNum + 1; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Check if this is the closing bracket
      if (trimmedLine === ']' || trimmedLine.startsWith(']')) {
        endLineNum = lineNum;
        this.logger.debug(`Found multi-line examples list ending at line ${lineNum + 1}`);
        break;
      }

      // If this line contains an example (usually quoted strings or callable forms), collect it
      if (trimmedLine.length > 0 && !trimmedLine.startsWith('%')) {
        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '    ';
        exampleLines.push({ lineNum, text: lineText, indent });
        this.logger.debug(`Found example line ${lineNum + 1}: "${trimmedLine}"`);
      }

      // Stop if we hit another directive
      if (trimmedLine.startsWith(':-')) {
        this.logger.debug(`Hit another directive at line ${lineNum + 1}, stopping examples list search`);
        break;
      }
    }

    this.logger.debug(`Found ${exampleLines.length} example lines for removal`);

    // Update each example line that contains callable forms
    for (const exampleLine of exampleLines) {
      const updatedExampleText = this.updateExampleLineForRemoval(exampleLine.text, predicateName, argumentPosition, currentArity);
      if (updatedExampleText !== exampleLine.text) {
        const edit = TextEdit.replace(
          new Range(
            new Position(exampleLine.lineNum, 0),
            new Position(exampleLine.lineNum, exampleLine.text.length)
          ),
          updatedExampleText
        );
        edits.push(edit);
        this.logger.debug(`Updated example at line ${exampleLine.lineNum + 1}`);
      }
    }

    return endLineNum;
  }

  /**
   * Reorder arguments in multi-line arguments list
   */
  private reorderMultiLineArguments(doc: TextDocument, startLineNum: number, newOrder: number[], edits: TextEdit[]): number {
    this.logger.debug(`reorderMultiLineArguments called: startLine=${startLineNum + 1}, newOrder=[${newOrder.join(',')}]`);
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
        this.logger.debug(`Found argument line ${lineNum + 1}: "${trimmedLine}"`);
      }

      // Stop if we hit another directive
      if (trimmedLine.startsWith(':-')) {
        this.logger.debug(`Hit another directive at line ${lineNum + 1}, stopping arguments list search`);
        break;
      }
    }

    this.logger.debug(`Found ${argumentLines.length} argument lines for reordering`);

    if (argumentLines.length > 0 && newOrder.length === argumentLines.length) {
      // Create reordered content with proper comma handling
      const reorderedLines: string[] = [];
      for (let i = 0; i < newOrder.length; i++) {
        const sourceIndex = newOrder[i] - 1; // Convert to 0-based
        if (sourceIndex >= 0 && sourceIndex < argumentLines.length) {
          const sourceLine = argumentLines[sourceIndex];
          let lineText = sourceLine.text;

          // Remove any existing comma from the source line
          if (lineText.trim().endsWith(',')) {
            const commaIndex = lineText.lastIndexOf(',');
            lineText = lineText.substring(0, commaIndex) + lineText.substring(commaIndex + 1);
          }

          // Add comma if this is not the last line
          if (i < newOrder.length - 1) {
            // Find the position to insert comma (before any trailing whitespace/newline)
            const trimmedLine = lineText.trimEnd();
            const trailingWhitespace = lineText.substring(trimmedLine.length);
            lineText = trimmedLine + ',' + trailingWhitespace;
          }

          reorderedLines.push(lineText);
        }
      }

      // Replace all argument lines with reordered content
      if (argumentLines.length > 0) {
        const firstArgLine = argumentLines[0].lineNum;
        const lastArgLine = argumentLines[argumentLines.length - 1].lineNum;

        const replaceEdit = TextEdit.replace(
          new Range(
            new Position(firstArgLine, 0),
            new Position(lastArgLine + 1, 0)
          ),
          reorderedLines.join('\n') + '\n'
        );
        edits.push(replaceEdit);
        this.logger.debug(`Reordered ${argumentLines.length} argument lines with proper comma handling`);
      }
    }

    return endLineNum;
  }

  /**
   * Reorder arguments in multi-line examples list
   */
  private reorderMultiLineExamples(doc: TextDocument, startLineNum: number, predicateName: string, currentArity: number, newOrder: number[], edits: TextEdit[]): number {
    this.logger.debug(`reorderMultiLineExamples called: startLine=${startLineNum + 1}, newOrder=[${newOrder.join(',')}]`);
    const exampleLines: { lineNum: number; text: string; indent: string }[] = [];
    let endLineNum = startLineNum;

    // Find the end of the multi-line examples list and collect all example lines
    for (let lineNum = startLineNum + 1; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      // Check if this is the closing bracket
      if (trimmedLine === ']' || trimmedLine.startsWith(']')) {
        endLineNum = lineNum;
        this.logger.debug(`Found multi-line examples list ending at line ${lineNum + 1}`);
        break;
      }

      // If this line contains an example (usually quoted strings or callable forms), collect it
      if (trimmedLine.length > 0 && !trimmedLine.startsWith('%')) {
        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '    ';
        exampleLines.push({ lineNum, text: lineText, indent });
        this.logger.debug(`Found example line ${lineNum + 1}: "${trimmedLine}"`);
      }

      // Stop if we hit another directive
      if (trimmedLine.startsWith(':-')) {
        this.logger.debug(`Hit another directive at line ${lineNum + 1}, stopping examples list search`);
        break;
      }
    }

    this.logger.debug(`Found ${exampleLines.length} example lines for reordering`);

    // Update each example line that contains callable forms
    for (const exampleLine of exampleLines) {
      const updatedExampleText = this.updateExampleLineForArgumentsReorder(exampleLine.text, predicateName, currentArity, newOrder);
      if (updatedExampleText !== exampleLine.text) {
        const edit = TextEdit.replace(
          new Range(
            new Position(exampleLine.lineNum, 0),
            new Position(exampleLine.lineNum, exampleLine.text.length)
          ),
          updatedExampleText
        );
        edits.push(edit);
        this.logger.debug(`Updated example at line ${exampleLine.lineNum + 1}`);
      }
    }

    return endLineNum;
  }


  /**
   * Construct multi-line parnames list inserting at position
   */
  private constructMultiLineParnames(doc: TextDocument, startLineNum: number, paramName: string, paramPosition: number): { edits: TextEdit[], endLineNum: number } {
    const edits: TextEdit[] = [];
    const nameLines: { lineNum: number; text: string; indent: string }[] = [];
    let endLineNum = startLineNum;

    for (let lineNum = startLineNum + 1; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmed = lineText.trim();
      if (trimmed === ']' || trimmed.startsWith(']')) { endLineNum = lineNum; break; }
      if (trimmed.length && (trimmed.startsWith("'") || trimmed.startsWith('"'))) {
        const indent = (lineText.match(/^(\s*)/)?.[1]) ?? '    ';
        nameLines.push({ lineNum, text: lineText, indent });
      }
      if (trimmed.startsWith(':-')) break;
    }

    let insertLineNum: number;
    let indent: string;
    if (nameLines.length === 0) { insertLineNum = startLineNum + 1; indent = '    '; }
    else if (paramPosition - 1 >= nameLines.length) { insertLineNum = nameLines[nameLines.length - 1].lineNum + 1; indent = nameLines[nameLines.length - 1].indent; }
    else { const target = nameLines[paramPosition - 1]; insertLineNum = target.lineNum; indent = target.indent; }

    const isLast = paramPosition - 1 >= nameLines.length;
    if (isLast && nameLines.length > 0) {
      const last = nameLines[nameLines.length - 1];
      if (!last.text.trim().endsWith(',')) {
        edits.push(TextEdit.insert(new Position(last.lineNum, last.text.length), ','));
      }
    }

    edits.push(TextEdit.insert(new Position(insertLineNum, 0), `${indent}'${paramName}'${isLast ? '' : ','}\n`));
    return { edits, endLineNum };
  }

  /** Reorder multi-line parnames */
  private reorderMultiLineParnames(doc: TextDocument, startLineNum: number, newOrder: number[], edits: TextEdit[]): number {
    const nameLines: { lineNum: number; text: string; indent: string }[] = [];
    let endLineNum = startLineNum;
    for (let lineNum = startLineNum + 1; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmed = lineText.trim();
      if (trimmed === ']' || trimmed.startsWith(']')) { endLineNum = lineNum; break; }
      if (trimmed.length && (trimmed.startsWith("'") || trimmed.startsWith('"'))) {
        const indent = (lineText.match(/^(\s*)/)?.[1]) ?? '    ';
        nameLines.push({ lineNum, text: lineText, indent });
      }
      if (trimmed.startsWith(':-')) break;
    }
    if (nameLines.length === 0 || newOrder.length !== nameLines.length) return endLineNum;
    const linesOnly = nameLines.map(l => l.text.trim());
    const reordered = newOrder.map(i => linesOnly[i - 1]);
    for (let i = 0; i < reordered.length; i++) {
      let t = reordered[i];


      if (i < reordered.length - 1 && !t.endsWith(',')) t = t + ',';
      if (i === reordered.length - 1 && t.endsWith(',')) t = t.slice(0, -1);
      reordered[i] = t;
    }
    const first = nameLines[0].lineNum;
    const last = nameLines[nameLines.length - 1].lineNum;
    const newBlock = reordered.map((t, idx) => `${nameLines[idx].indent}${t}\n`).join('');
    edits.push(TextEdit.replace(new Range(new Position(first, 0), new Position(last + 1, 0)), newBlock));
    return endLineNum;

  }

  /**
   * Construct multi-line parameters list inserting at position (reuse arguments handler)
   */
  private constructMultiLineParameters(doc: TextDocument, startLineNum: number, paramName: string, paramPosition: number): { edits: TextEdit[], endLineNum: number } {
    return this.constructMultiLineArguments(doc, startLineNum, paramName, paramPosition);
  }


  /** Remove from multi-line parnames */
  private removeFromMultiLineParnames(doc: TextDocument, startLineNum: number, position: number, currentCount: number, edits: TextEdit[]): number {
    const nameLines: { lineNum: number; text: string; indent: string }[] = [];
    let endLineNum = startLineNum;
    for (let lineNum = startLineNum + 1; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmed = lineText.trim();
      if (trimmed === ']' || trimmed.startsWith(']')) { endLineNum = lineNum; break; }
      if (trimmed.length && (trimmed.startsWith("'") || trimmed.startsWith('"'))) {
        const indent = (lineText.match(/^(\s*)/)?.[1]) ?? '    ';
        nameLines.push({ lineNum, text: lineText, indent });
      }
      if (trimmed.startsWith(':-')) break;
    }
    if (currentCount === 1) {
      const remove = TextEdit.replace(new Range(new Position(startLineNum, 0), new Position(endLineNum + 1, 0)), '');
      edits.push(remove);
      return endLineNum;
    }
    if (position <= nameLines.length) {
      const target = nameLines[position - 1];
      if (position === nameLines.length && nameLines.length > 1) {
        const prev = nameLines[nameLines.length - 2];
        if (prev.text.trim().endsWith(',')) {
          const commaIdx = prev.text.lastIndexOf(',');
          edits.push(TextEdit.replace(new Range(new Position(prev.lineNum, commaIdx), new Position(prev.lineNum, commaIdx + 1)), ''));
        }
      }
      edits.push(TextEdit.replace(new Range(new Position(target.lineNum, 0), new Position(target.lineNum + 1, 0)), ''));
    }
    return endLineNum;
  }


  /**
   * Update info directive arguments (argnames and arguments lists)
   */
  private updateInfoDirectiveArgumentsForAdding(
    doc: TextDocument,
    lineNum: number,
    lineText: string,
    predicateName: string,
    currentArity: number,
    argumentName: string,
    argumentPosition: number,
    edits: TextEdit[]
  ): number {
    let updatedLine = lineText;
    let foundArgnames = false;

    // Handle multi-line arguments lists FIRST
    // Detect 'arguments is [' without ']' on the same line
    const multiLineArgumentsPattern = /^(\s*)arguments\s+is\s+\[([^\]]*)?$/;
    const multiLineArgumentsMatch = lineText.match(multiLineArgumentsPattern);
    if (multiLineArgumentsMatch) {
      this.logger.debug(`Detected multi-line arguments list starting at line ${lineNum + 1}`);
      const { edits: multiLineEdits, endLineNum } = this.constructMultiLineArguments(doc, lineNum, argumentName, argumentPosition);
      edits.push(...multiLineEdits);
      return endLineNum; // Return line after multi-line structure
    }

    // Handle multi-line examples lists
    // Detect 'examples is [' without ']' on the same line
    const multiLineExamplesPattern = /^(\s*)examples\s+is\s+\[([^\]]*)?$/;
    const multiLineExamplesMatch = lineText.match(multiLineExamplesPattern);
    if (multiLineExamplesMatch) {
      this.logger.debug(`Detected multi-line examples list starting at line ${lineNum + 1}`);
      const { edits: multiLineEdits, endLineNum } = this.constructMultiLineExamples(doc, lineNum, predicateName, currentArity, argumentName, argumentPosition);
      edits.push(...multiLineEdits);
      return endLineNum; // Return line after multi-line structure
    }

    // Update argnames is List pattern
    // Example:     argnames is [Image, Final] -> argnames is [NewArg, Image, Final] (if position = 1)
    // Capture leading whitespace to preserve indentation
    const argnamesPattern = /^(\s*)argnames\s+is\s+(\[[^\]]*\])(.*)/;
    const argnamesMatch = updatedLine.match(argnamesPattern);
    if (argnamesMatch) {
      foundArgnames = true;
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

    // If the line was updated, create an edit
    if (updatedLine !== lineText) {
      this.logger.debug(`Updated argnames/arguments at line ${lineNum + 1}`);
      const edit = TextEdit.replace(
        new Range(
          new Position(lineNum, 0),
          new Position(lineNum, lineText.length)
        ),
        updatedLine
      );
      edits.push(edit);
    }

    // Store whether we found argnames for potential use by caller
    (this as any)._lastFoundArgnames = foundArgnames;

    return lineNum; // Return current line number
  }

  /**
   * Update mode directive to add the new argument
   */
  private updateModeDirectiveForArgumentAdding(
    lineText: string,
    predicateName: string,
    currentArity: number,
    argumentPosition: number
  ): string {
    // Pattern: mode(predicate_name(arg1, arg2), mode_info) or mode(predicate_name, mode_info)
    // We need to handle nested parentheses in arguments like ?list(integer)

    // First check for callable form: predicate_name(args)
    const predicateStart = lineText.indexOf(`${predicateName}(`);
    if (predicateStart !== -1) {
      // Find the opening parenthesis after the predicate name
      const openParenPos = predicateStart + predicateName.length;
      if (lineText[openParenPos] === '(') {
        // Find the matching closing parenthesis using proper nesting
        const closeParenPos = ArgumentUtils.findMatchingCloseParen(lineText, openParenPos);
        if (closeParenPos !== -1) {
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
      }
    }

    // Check for zero-arity form: mode(predicate_name, mode_info) or mode(predicate_name)
    if (currentArity === 0) {
      // Use a more robust regex that matches word boundaries and handles various whitespace
      const zeroArityPattern = new RegExp(`(mode\\s*\\([^)]*)\\b${predicateName}\\b(\\s*[,)])`, 'g');
      const match = zeroArityPattern.exec(lineText);

      if (match) {
        // Replace predicate_name with predicate_name(?)
        const before = match[1];
        const after = match[2];
        return lineText.replace(zeroArityPattern, `${before}${predicateName}(?)${after}`);
      }
    }

    return lineText;
  }

  /**
   * Update meta_predicate or meta_non_terminal directive
   */
  private updateMetaDirectiveForArgumentAdding(
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
    clauseRange: { start: number; end: number },
    argumentName: string,
    argumentPosition: number,
    currentArity: number,
    isNonTerminal: boolean,
    predicateName: string
  ): TextEdit[] {
    this.logger.debug(`createArgumentAdditionEdit: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} from line ${clauseRange.start + 1} to ${clauseRange.end + 1}`);
    const edits: TextEdit[] = [];

    // Process each line in the range
    let lineNum = clauseRange.start;
    while (lineNum <= clauseRange.end) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if this line contains a clause head (predicate definition)
      const clauseHeadMatch = this.findClauseHead(lineText, predicateName, isNonTerminal, currentArity);

      if (clauseHeadMatch) {
        // This is a clause head - process the entire clause
        lineNum = this.processClauseRangeForAdding(
          doc, lineNum, predicateName, argumentName, argumentPosition, currentArity, isNonTerminal, edits
        );
      } else {
        // No clause head found - this means we're processing calls/references
        const lineEdits = this.findAndAddPredicateCallArgumentInLine(lineText, lineNum, predicateName, currentArity, argumentName, argumentPosition, isNonTerminal);
        edits.push(...lineEdits);
        lineNum++;
      }
    }

    return edits;
  }

  /**
   * Find clause head in a line with specific arity
   */
  private findClauseHead(lineText: string, predicateName: string, isNonTerminal: boolean, expectedArity: number): { fullMatch: string; arguments: string; startIndex: number; endIndex: number } | null {
    const trimmedLine = lineText.trim();

    // Skip directive lines
    if (trimmedLine.startsWith(':-')) {
      return null;
    }

    // Handle both zero-arity (no parentheses) and non-zero arity (with parentheses) predicates/non-terminals
    let clausePattern: RegExp;
    let match: RegExpExecArray | null;
    let result: { fullMatch: string; arguments: string; terminator?: string; startIndex: number; endIndex: number } | null = null;

    if (expectedArity === 0) {
      // Zero arity: look for predicate_name :- or predicate_name. or predicate_name -->
      clausePattern = isNonTerminal
        ? new RegExp(`^\\s*${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*((?:-->|:-))`, 'g')
        : new RegExp(`^\\s*${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*((?::-|\\.))`, 'g');

      match = clausePattern.exec(lineText);
      if (match) {
        result = {
          fullMatch: match[0],
          arguments: '', // No arguments for zero arity
          terminator: match[1], // :- or --> or .
          startIndex: match.index,
          endIndex: match.index + match[0].length
        };
      }
    } else {
      // Non-zero arity: look for predicate_name(...) :- or predicate_name(...). or predicate_name(...) -->
      clausePattern = isNonTerminal
        ? new RegExp(`^\\s*${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([^)]*)\\)\\s*((?:-->|:-))`, 'g')
        : new RegExp(`^\\s*${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([^)]*)\\)\\s*((?::-|\\.))`, 'g');

      match = clausePattern.exec(lineText);
      if (match) {
        result = {
          fullMatch: match[0],
          arguments: match[1],
          terminator: match[2], // :- or --> or .
          startIndex: match.index,
          endIndex: match.index + match[0].length
        };

        // Check if the arity matches
        const actualArity = this.countArguments(result.arguments);
        if (actualArity !== expectedArity) {
          return null; // Arity doesn't match
        }
      }
    }

    return result;
  }

  /**
   * Count arguments in a comma-separated argument string
   */
  private countArguments(argumentString: string): number {
    if (!argumentString || argumentString.trim() === '') {
      return 0;
    }

    // Use ArgumentUtils for proper argument parsing
    const args = ArgumentUtils.parseArguments(argumentString);
    return args.length;
  }

  /**
   * Update clause head by adding argument
   */
  private updateClauseHeadForArgumentAdding(
    _lineText: string,
    lineNum: number,
    clauseHead: { fullMatch: string; arguments: string; startIndex: number; endIndex: number },
    argumentName: string,
    argumentPosition: number,
    _isNonTerminal: boolean
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    // Parse existing arguments
    const existingArgs = clauseHead.arguments.trim() === '' ? [] :
      ArgumentUtils.parseArguments(clauseHead.arguments);

    // Insert new argument at specified position
    const newArgs = [...existingArgs];
    newArgs.splice(argumentPosition - 1, 0, argumentName);

    // Create the updated clause head
    let newClauseHead: string;

    if (existingArgs.length === 0) {
      // Zero arity -> adding first argument: predicate_name. -> predicate_name(arg).
      const zeroArityMatch = clauseHead.fullMatch.match(/^(\s*)(\w+)(\s*)((?:-->|:-|\.).*)$/);
      if (zeroArityMatch) {
        const [/* fullMatch */, leadingSpace, predName, /* spacing */, terminator] = zeroArityMatch;
        newClauseHead = `${leadingSpace}${predName}(${newArgs.join(', ')})${terminator.startsWith('.') ? terminator : ' ' + terminator}`;
      } else {
        return edits; // Failed to parse zero-arity clause head
      }
    } else {
      // Non-zero arity -> adding argument: predicate_name(args). -> predicate_name(newArgs).
      const nonZeroArityMatch = clauseHead.fullMatch.match(/^(\s*)(\w+)(\()([^)]*)(\)\s*(?:-->|:-|\.).*)$/);
      if (nonZeroArityMatch) {
        const [/* fullMatch */, leadingSpace, predName, openParen, /* arguments */, closingAndRest] = nonZeroArityMatch;
        newClauseHead = `${leadingSpace}${predName}${openParen}${newArgs.join(', ')}${closingAndRest}`;
      } else {
        return edits; // Failed to parse non-zero-arity clause head
      }
    }

    const edit = TextEdit.replace(
      new Range(
        new Position(lineNum, clauseHead.startIndex),
        new Position(lineNum, clauseHead.endIndex)
      ),
      newClauseHead
    );
    edits.push(edit);

    return edits;
  }

  /**
   * Find and add predicate call argument in clause body (after :- or -->)
   */
  private findAndAddPredicateCallArgumentInClauseBody(
    lineText: string,
    lineNum: number,
    predicateName: string,
    arity: number,
    argumentName: string,
    argumentPosition: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    // Find the body part (after :- or -->)
    const bodyStartMatch = lineText.match(/(:-|-->)/);
    if (!bodyStartMatch) {
      return []; // No body found
    }

    const bodyStartIndex = bodyStartMatch.index! + bodyStartMatch[0].length;
    const bodyText = lineText.substring(bodyStartIndex);

    // Find predicate calls in the body with arity checking
    const bodyEdits = this.findAndAddPredicateCallArgumentInLine(bodyText, lineNum, predicateName, arity, argumentName, argumentPosition, isNonTerminal);

    // Adjust edit positions to account for body offset
    return bodyEdits.map((edit: TextEdit) => {
      const adjustedRange = new Range(
        new Position(edit.range.start.line, edit.range.start.character + bodyStartIndex),
        new Position(edit.range.end.line, edit.range.end.character + bodyStartIndex)
      );
      return TextEdit.replace(adjustedRange, edit.newText);
    });
  }

  /**
   * Find and add predicate call argument in a line
   */
  private findAndAddPredicateCallArgumentInLine(
    lineText: string,
    lineNum: number,
    predicateName: string,
    arity: number,
    argumentName: string,
    argumentPosition: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndAddPredicateCallArgumentInLine: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} with arity ${arity} in line: "${lineText}"`);
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
            const currentArity = args.length;

            // Only update if current arity matches expected arity (since we're adding one argument)
            if (currentArity === arity) {
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
              this.logger.debug(`Added argument to non-terminal with matching arity ${currentArity}: "${newArgsText}"`);
            } else {
              this.logger.debug(`Skipping non-terminal with different arity (${currentArity} vs expected ${arity})`);
            }
          }
        } else {
          // No arguments: predicateName - only update if expected arity is 0
          if (arity === 0) {
            edits.push(TextEdit.insert(
              new Position(lineNum, nameEndPos),
              `(${argumentName})`
            ));
            this.logger.debug(`Added argument to non-terminal without args (expected arity 0): "(${argumentName})"`);
          } else {
            this.logger.debug(`Skipping non-terminal without args (expected arity ${arity} != 0)`);
          }
        }
      }

    } else {
      // Handle predicate facts: predicateName.
      const factPattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\.`, 'g');
      let factMatch: RegExpExecArray | null;
      while ((factMatch = factPattern.exec(lineText)) !== null) {
        // Only update facts if expected arity is 0
        if (arity === 0) {
          this.logger.debug(`Found fact at line ${lineNum + 1}, column ${factMatch.index}: ${predicateName}`);
          const insertPos = factMatch.index + predicateName.length;
          edits.push(TextEdit.insert(
            new Position(lineNum, insertPos),
            `(${argumentName})`
          ));
        } else {
          this.logger.debug(`Skipping fact with expected arity ${arity} != 0`);
        }
      }

      // Handle zero-arity predicate calls: predicateName (no parentheses, no dot)
      const zeroArityCallPattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?!\\s*[(.])`, 'g');
      let zeroArityMatch: RegExpExecArray | null;
      while ((zeroArityMatch = zeroArityCallPattern.exec(lineText)) !== null) {
        // Skip if this is inside a comment
        const beforeMatch = lineText.substring(0, zeroArityMatch.index);
        if (beforeMatch.includes('%')) {
          const commentPos = beforeMatch.lastIndexOf('%');
          if (commentPos > beforeMatch.lastIndexOf('\n')) {
            continue;
          }
        }

        // Only update zero-arity calls if expected arity is 0
        if (arity === 0) {
          this.logger.debug(`Found zero-arity call at line ${lineNum + 1}, column ${zeroArityMatch.index}: ${predicateName}`);
          const insertPos = zeroArityMatch.index + predicateName.length;
          edits.push(TextEdit.insert(
            new Position(lineNum, insertPos),
            `(${argumentName})`
          ));
        } else {
          this.logger.debug(`Skipping zero-arity call with expected arity ${arity} != 0`);
        }
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
            // Extract current arguments
            const argsText = lineText.substring(openParenPos + 1, closeParenPos);
            const args = ArgumentUtils.parseArguments(argsText);
            const currentArity = args.length;

            // Only update if current arity matches expected arity (since we're adding one argument)
            if (currentArity === arity) {
              this.logger.debug(`Found predicate call at line ${lineNum + 1}, column ${callMatch.index}: ${predicateName}(...) with matching arity ${currentArity}`);

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
            } else {
              this.logger.debug(`Skipping predicate call with different arity (${currentArity} vs expected ${arity})`);
            }
          }
        }
      }
    }

    return edits;
  }

  /**
   * Find and reorder predicate call arguments in a line with arity checking
   */
  private findAndReorderPredicateCallArgumentsInLine(
    lineText: string,
    lineNum: number,
    predicateName: string,
    newOrder: number[],
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndReorderPredicateCallArgumentsInLine: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} in line: "${lineText}"`);
    const edits: TextEdit[] = [];
    const targetArity = newOrder.length;

    if (isNonTerminal) {
      // For non-terminals, find all occurrences of the non-terminal name
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
        const startPos = match.index;
        const nameEndPos = startPos + predicateName.length;

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
            const currentArity = args.length;

            // Only update if current arity matches target arity
            if (currentArity === targetArity) {
              // Reorder arguments according to newOrder
              const reorderedArgs = this.reorderArray(args, newOrder);
              const newArgsText = reorderedArgs.join(', ');

              edits.push(TextEdit.replace(
                new Range(
                  new Position(lineNum, openParenPos + 1),
                  new Position(lineNum, closeParenPos)
                ),
                newArgsText
              ));
              this.logger.debug(`Reordered arguments for non-terminal with matching arity ${currentArity}: "${newArgsText}"`);
            } else {
              this.logger.debug(`Skipping non-terminal with different arity (${currentArity} vs expected ${targetArity})`);
            }
          }
        } else {
          // No arguments: predicateName - only update if target arity is 0
          if (targetArity === 0) {
            this.logger.debug(`Non-terminal without args matches target arity 0`);
            // No changes needed for arity 0
          } else {
            this.logger.debug(`Skipping non-terminal without args (target arity ${targetArity} != 0)`);
          }
        }
      }

    } else {
      // For predicates, find all occurrences of the predicate name
      const predicatePattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`, 'g');
      let match: RegExpExecArray | null;

      while ((match = predicatePattern.exec(lineText)) !== null) {
        // Skip if this is inside a comment
        const beforeMatch = lineText.substring(0, match.index);
        if (beforeMatch.includes('%')) {
          const commentPos = beforeMatch.lastIndexOf('%');
          if (commentPos > beforeMatch.lastIndexOf('\n')) {
            continue;
          }
        }

        const startPos = match.index;
        const openParenPos = lineText.indexOf('(', startPos);

        if (openParenPos !== -1) {
          const closeParenPos = ArgumentUtils.findMatchingCloseParen(lineText, openParenPos);

          if (closeParenPos !== -1) {
            // Extract current arguments
            const argsText = lineText.substring(openParenPos + 1, closeParenPos);
            const args = ArgumentUtils.parseArguments(argsText);
            const currentArity = args.length;

            // Only update if current arity matches target arity
            if (currentArity === targetArity) {
              this.logger.debug(`Found predicate call at line ${lineNum + 1}, column ${startPos}: ${predicateName}(...) with matching arity ${currentArity}`);

              // Reorder arguments according to newOrder
              const reorderedArgs = this.reorderArray(args, newOrder);
              const newArgsText = reorderedArgs.join(', ');

              edits.push(TextEdit.replace(
                new Range(
                  new Position(lineNum, openParenPos + 1),
                  new Position(lineNum, closeParenPos)
                ),
                newArgsText
              ));
            } else {
              this.logger.debug(`Skipping predicate call with different arity (${currentArity} vs expected ${targetArity})`);
            }
          }
        }
      }
    }

    return edits;
  }

  /**
   * Find and remove predicate call argument in a line with exact arity checking
   */
  private findAndRemovePredicateCallArgumentInLine(
    lineText: string,
    lineNum: number,
    predicateName: string,
    argumentPosition: number,
    targetArity: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndRemovePredicateCallArgumentInLine: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} in line: "${lineText}", target arity: ${targetArity}`);
    const edits: TextEdit[] = [];

    if (isNonTerminal) {
      // For non-terminals, find all occurrences of the non-terminal name
      const nonTerminalPattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      let match: RegExpExecArray | null;

      while ((match = nonTerminalPattern.exec(lineText)) !== null) {
        const startPos = match.index;
        const nameEndPos = startPos + predicateName.length;

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
            const currentArity = args.length;

            // Only update if current arity is one more than target arity (for removal)
            if (currentArity === targetArity + 1) {
              // Remove argument at specified position
              const newArgs = [...args];
              newArgs.splice(argumentPosition - 1, 1);

              if (newArgs.length === 0) {
                // Remove parentheses entirely when no arguments remain
                edits.push(TextEdit.replace(
                  new Range(
                    new Position(lineNum, openParenPos),
                    new Position(lineNum, closeParenPos + 1)
                  ),
                  ''
                ));
                this.logger.debug(`Removed all arguments and parentheses from non-terminal with arity ${currentArity} -> ${targetArity}`);
              } else {
                const newArgsText = newArgs.join(', ');
                edits.push(TextEdit.replace(
                  new Range(
                    new Position(lineNum, openParenPos + 1),
                    new Position(lineNum, closeParenPos)
                  ),
                  newArgsText
                ));
                this.logger.debug(`Removed argument ${argumentPosition} from non-terminal with arity ${currentArity} -> ${targetArity}: "${newArgsText}"`);
              }
            } else {
              this.logger.debug(`Skipping non-terminal with different arity (${currentArity} vs target ${targetArity}, expected ${targetArity + 1})`);
            }
          }
        } else {
          // No arguments: predicateName - only update if target arity is 0
          if (targetArity === 0) {
            this.logger.debug(`Non-terminal without args matches target arity 0 - no changes needed`);
          } else {
            this.logger.debug(`Skipping non-terminal without args (target arity ${targetArity} != 0)`);
          }
        }
      }

    } else {
      // For predicates, find all occurrences of the predicate name
      const predicatePattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`, 'g');
      let match: RegExpExecArray | null;

      while ((match = predicatePattern.exec(lineText)) !== null) {
        const startPos = match.index;
        const openParenPos = lineText.indexOf('(', startPos);

        if (openParenPos !== -1) {
          const closeParenPos = ArgumentUtils.findMatchingCloseParen(lineText, openParenPos);

          if (closeParenPos !== -1) {
            // Extract current arguments
            const argsText = lineText.substring(openParenPos + 1, closeParenPos);
            const args = ArgumentUtils.parseArguments(argsText);
            const currentArity = args.length;

            // Only update if current arity is one more than target arity (for removal)
            if (currentArity === targetArity + 1) {
              this.logger.debug(`Found predicate call at line ${lineNum + 1}, column ${startPos}: ${predicateName}(...) with arity ${currentArity} -> ${targetArity}`);

              // Remove argument at specified position
              const newArgs = [...args];
              newArgs.splice(argumentPosition - 1, 1);

              if (newArgs.length === 0) {
                // Remove parentheses entirely when no arguments remain
                edits.push(TextEdit.replace(
                  new Range(
                    new Position(lineNum, openParenPos),
                    new Position(lineNum, closeParenPos + 1)
                  ),
                  ''
                ));
                this.logger.debug(`Removed all arguments and parentheses from predicate call with arity ${currentArity} -> ${targetArity}`);
              } else {
                const newArgsText = newArgs.join(', ');
                edits.push(TextEdit.replace(
                  new Range(
                    new Position(lineNum, openParenPos + 1),
                    new Position(lineNum, closeParenPos)
                  ),
                  newArgsText
                ));
                this.logger.debug(`Removed argument ${argumentPosition} from predicate call with arity ${currentArity} -> ${targetArity}: "${newArgsText}"`);
              }
            } else {
              this.logger.debug(`Skipping predicate call with different arity (${currentArity} vs target ${targetArity}, expected ${targetArity + 1})`);
            }
          }
        }
      }
    }

    return edits;
  }

  /**
   * Update clause head by reordering arguments
   */
  private updateClauseHeadForArgumentsReorder(
    _lineText: string,
    lineNum: number,
    clauseHead: { fullMatch: string; arguments: string; startIndex: number; endIndex: number },
    newOrder: number[],
    _isNonTerminal: boolean
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    // Parse existing arguments
    const existingArgs = clauseHead.arguments.trim() === '' ? [] :
      ArgumentUtils.parseArguments(clauseHead.arguments);

    // Reorder arguments according to newOrder
    const reorderedArgs = this.reorderArray(existingArgs, newOrder);

    // Create the updated clause head
    const predicateNameMatch = clauseHead.fullMatch.match(/^(\s*)(\w+)(\()([^)]*)(\)\s*(?:-->|:-|\.).*)$/);
    if (predicateNameMatch) {
      const [/* fullMatch */, leadingSpace, predName, openParen, /* arguments */, closingAndRest] = predicateNameMatch;
      const newClauseHead = `${leadingSpace}${predName}${openParen}${reorderedArgs.join(', ')}${closingAndRest}`;

      const edit = TextEdit.replace(
        new Range(
          new Position(lineNum, clauseHead.startIndex),
          new Position(lineNum, clauseHead.endIndex)
        ),
        newClauseHead
      );
      edits.push(edit);
    }

    return edits;
  }

  /**
   * Update clause head by removing argument
   */
  private updateClauseHeadForArgumentRemoval(
    _lineText: string,
    lineNum: number,
    clauseHead: { fullMatch: string; arguments: string; startIndex: number; endIndex: number },
    argumentPosition: number,
    _isNonTerminal: boolean
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    // Parse existing arguments
    const existingArgs = clauseHead.arguments.trim() === '' ? [] :
      ArgumentUtils.parseArguments(clauseHead.arguments);

    // Remove argument at specified position
    const newArgs = [...existingArgs];
    newArgs.splice(argumentPosition - 1, 1);

    // Create the updated clause head
    const predicateNameMatch = clauseHead.fullMatch.match(/^(\s*)(\w+)(\()([^)]*)(\)\s*(?:-->|:-|\.).*)$/);
    if (predicateNameMatch) {
      const [/* fullMatch */, leadingSpace, predName, openParen, /* arguments */, closingAndRest] = predicateNameMatch;

      // If no arguments remain, remove parentheses entirely
      let newClauseHead: string;
      if (newArgs.length === 0) {
        // Extract the part after the closing parenthesis (e.g., " :- body" or " --> body" or ".")
        const afterParenMatch = closingAndRest.match(/^\)\s*((?:-->|:-|\.).*)$/);
        const afterParen = afterParenMatch ? afterParenMatch[1] : closingAndRest.replace(/^\)\s*/, '');
        newClauseHead = `${leadingSpace}${predName}${afterParen.startsWith('.') ? afterParen : ' ' + afterParen}`;
      } else {
        newClauseHead = `${leadingSpace}${predName}${openParen}${newArgs.join(', ')}${closingAndRest}`;
      }

      const edit = TextEdit.replace(
        new Range(
          new Position(lineNum, clauseHead.startIndex),
          new Position(lineNum, clauseHead.endIndex)
        ),
        newClauseHead
      );
      edits.push(edit);
    }

    return edits;
  }

  /**
   * Find and reorder predicate call arguments in clause body (after :- or -->)
   */
  private findAndReorderPredicateCallArgumentsInClauseBody(
    lineText: string,
    lineNum: number,
    predicateName: string,
    newOrder: number[],
    isNonTerminal: boolean
  ): TextEdit[] {
    // Find the body part (after :- or -->)
    const bodyStartMatch = lineText.match(/(:-|-->)/);
    if (!bodyStartMatch) {
      return []; // No body found
    }

    const bodyStartIndex = bodyStartMatch.index! + bodyStartMatch[0].length;
    const bodyText = lineText.substring(bodyStartIndex);

    // Find predicate calls in the body with arity checking
    const bodyEdits = this.findAndReorderPredicateCallArgumentsInLine(bodyText, lineNum, predicateName, newOrder, isNonTerminal);

    // Adjust edit positions to account for body offset
    return bodyEdits.map((edit: TextEdit) => {
      const adjustedRange = new Range(
        new Position(edit.range.start.line, edit.range.start.character + bodyStartIndex),
        new Position(edit.range.end.line, edit.range.end.character + bodyStartIndex)
      );
      return TextEdit.replace(adjustedRange, edit.newText);
    });
  }

  /**
   * Find and remove predicate call argument in clause body (after :- or -->) with exact arity checking
   */
  private findAndRemovePredicateCallArgumentInClauseBody(
    lineText: string,
    lineNum: number,
    predicateName: string,
    argumentPosition: number,
    targetArity: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    // Find the body part (after :- or -->)
    const bodyStartMatch = lineText.match(/(:-|-->)/);
    if (!bodyStartMatch) {
      return []; // No body found
    }

    const bodyStartIndex = bodyStartMatch.index! + bodyStartMatch[0].length;
    const bodyText = lineText.substring(bodyStartIndex);

    // Find predicate calls in the body with exact arity checking
    const bodyEdits = this.findAndRemovePredicateCallArgumentInLine(bodyText, lineNum, predicateName, argumentPosition, targetArity, isNonTerminal);

    // Adjust edit positions to account for body offset
    return bodyEdits.map((edit: TextEdit) => {
      const adjustedRange = new Range(
        new Position(edit.range.start.line, edit.range.start.character + bodyStartIndex),
        new Position(edit.range.end.line, edit.range.end.character + bodyStartIndex)
      );
      return TextEdit.replace(adjustedRange, edit.newText);
    });
  }

  /**
   * Update info directive arguments for reordering
   */
  private updateInfoDirectiveArgumentsForReorder(
    doc: TextDocument,
    lineNum: number,
    lineText: string,
    predicateName: string,
    currentArity: number,
    newOrder: number[],
    edits: TextEdit[]
  ): number {
    let updatedLine = lineText;

    // Handle multi-line arguments lists FIRST
    // Detect 'arguments is [' without ']' on the same line
    const multiLineArgumentsPattern = /^(\s*)arguments\s+is\s+\[([^\]]*)?$/;
    const multiLineArgumentsMatch = lineText.match(multiLineArgumentsPattern);
    if (multiLineArgumentsMatch) {
      this.logger.debug(`Detected multi-line arguments list starting at line ${lineNum + 1} for reordering`);
      const endLineNum = this.reorderMultiLineArguments(doc, lineNum, newOrder, edits);
      return endLineNum; // Return line after multi-line structure
    }

    // Handle multi-line examples lists
    // Detect 'examples is [' without ']' on the same line
    const multiLineExamplesPattern = /^(\s*)examples\s+is\s+\[([^\]]*)?$/;
    const multiLineExamplesMatch = lineText.match(multiLineExamplesPattern);
    if (multiLineExamplesMatch) {
      this.logger.debug(`Detected multi-line examples list starting at line ${lineNum + 1} for reordering`);
      const endLineNum = this.reorderMultiLineExamples(doc, lineNum, predicateName, currentArity, newOrder, edits);
      return endLineNum; // Return line after multi-line structure
    }

    // Update argnames is List pattern
    const argnamesPattern = /^(\s*)argnames\s+is\s+(\[[^\]]*\])(.*)/;
    const argnamesMatch = updatedLine.match(argnamesPattern);
    if (argnamesMatch) {
      const leadingWhitespace = argnamesMatch[1];
      const currentList = argnamesMatch[2];
      const trailingContent = argnamesMatch[3];

      if (currentList !== '[]') {
        // Parse existing arguments and reorder them
        const listContent = currentList.slice(1, -1); // Remove [ and ]
        const args = ArgumentUtils.parseArguments(listContent);
        const reorderedArgs = this.reorderArray(args, newOrder);
        const newList = `[${reorderedArgs.join(', ')}]`;
        updatedLine = `${leadingWhitespace}argnames is ${newList}${trailingContent}`;
        this.logger.debug(`Reordered argnames list: ${currentList} → ${newList}`);
      }
    }

    // Update arguments is Pairs pattern (single-line only)
    const argumentsPattern = /^(\s*)arguments\s+is\s+(\[[^\]]*\])(.*)/;
    const argumentsMatch = updatedLine.match(argumentsPattern);
    if (argumentsMatch) {
      const leadingWhitespace = argumentsMatch[1];
      const currentList = argumentsMatch[2];
      const trailingContent = argumentsMatch[3];

      if (currentList !== '[]') {
        // Parse existing arguments and reorder them
        const listContent = currentList.slice(1, -1); // Remove [ and ]
        const args = ArgumentUtils.parseArguments(listContent);
        const reorderedArgs = this.reorderArray(args, newOrder);
        const newList = `[${reorderedArgs.join(', ')}]`;
        updatedLine = `${leadingWhitespace}arguments is ${newList}${trailingContent}`;
        this.logger.debug(`Reordered single-line arguments list: ${currentList} → ${newList}`);
      }
    }

    // If the line was updated, create an edit
    if (updatedLine !== lineText) {
      this.logger.debug(`Updated argnames/arguments for reordering at line ${lineNum + 1}`);
      const edit = TextEdit.replace(
        new Range(
          new Position(lineNum, 0),
          new Position(lineNum, lineText.length)
        ),
        updatedLine
      );
      edits.push(edit);
    }

    return lineNum; // Return current line number
  }

  /**
   * Update mode directive for argument reordering
   */
  private updateModeDirectiveForArgumentsReorder(
    lineText: string,
    predicateName: string,
    newOrder: number[]
  ): string {
    // Pattern: mode(predicate_name(arg1, arg2), mode_info)
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
      // No current arguments
      newArgs = '';
    } else {
      // Parse arguments properly handling nested structures
      const argList = ArgumentUtils.parseArguments(currentArgs);
      const reorderedArgs = this.reorderArray(argList, newOrder);
      newArgs = reorderedArgs.join(', ');
    }

    // Replace the arguments part
    const beforeArgs = lineText.substring(0, openParenPos + 1);
    const afterArgs = lineText.substring(closeParenPos);
    return beforeArgs + newArgs + afterArgs;
  }

  /**
   * Update meta_predicate or meta_non_terminal directive for reordering
   */
  private updateMetaDirectiveForArgumentsReorder(
    lineText: string,
    predicateName: string,
    newOrder: number[],
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
        newTemplate = '';
      } else {
        // Split current template and reorder meta arguments
        const templateArgs = ArgumentUtils.parseArguments(currentTemplate);
        const reorderedArgs = this.reorderArray(templateArgs, newOrder);
        newTemplate = reorderedArgs.join(', ');
      }

      const updatedLine = lineText.replace(metaPattern, `${directiveType}(${predicateName}(${newTemplate}))`);
      this.logger.debug(`Reordered ${directiveType} template: ${currentTemplate} → ${newTemplate}`);
      return updatedLine;
    }

    return lineText;
  }

  /**
   * Reorder an array according to the new order specification
   */
  private reorderArray(originalArray: string[], newOrder: number[]): string[] {
    const reordered: string[] = new Array(originalArray.length);
    for (let i = 0; i < newOrder.length; i++) {
      const sourceIndex = newOrder[i] - 1; // Convert from 1-based to 0-based
      if (sourceIndex >= 0 && sourceIndex < originalArray.length) {
        reordered[i] = originalArray[sourceIndex];
      }
    }
    return reordered;
  }

  /**
   * Create edit for reordering arguments in a predicate call or definition
   */
  private createArgumentsReorderEdit(
    doc: TextDocument,
    clauseRange: { start: number; end: number },
    newOrder: number[],
    isNonTerminal: boolean,
    predicateName: string
  ): TextEdit[] {
    this.logger.debug(`createArgumentsReorderEdit: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} from line ${clauseRange.start + 1} to ${clauseRange.end + 1}`);
    const edits: TextEdit[] = [];
    const currentArity = newOrder.length;

    // Process each line in the range
    let lineNum = clauseRange.start;
    while (lineNum <= clauseRange.end) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if this line contains a clause head (predicate definition)
      const clauseHeadMatch = this.findClauseHead(lineText, predicateName, isNonTerminal, currentArity);

      if (clauseHeadMatch) {
        // This is a clause head - process the entire clause
        lineNum = this.processClauseRangeForArgumentsReorder(
          doc, lineNum, predicateName, newOrder, currentArity, isNonTerminal, edits
        );
      } else {
        // No clause head found - this means we're processing calls/references
        const lineEdits = this.findAndReorderPredicateCallArgumentsInLine(lineText, lineNum, predicateName, newOrder, isNonTerminal);
        edits.push(...lineEdits);
        lineNum++;
      }
    }

    return edits;
  }

  /**
   * Create edit for removing argument from a predicate call or definition
   */
  private createArgumentRemovalEdit(
    doc: TextDocument,
    clauseRange: { start: number; end: number },
    argumentPosition: number,
    targetArity: number,
    isNonTerminal: boolean,
    predicateName: string
  ): TextEdit[] {
    this.logger.debug(`createArgumentRemovalEdit: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} from line ${clauseRange.start + 1} to ${clauseRange.end + 1}, removing position ${argumentPosition}`);
    const edits: TextEdit[] = [];

    // Process each line in the range
    let lineNum = clauseRange.start;
    while (lineNum <= clauseRange.end) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if this line contains a clause head (predicate definition)
      const clauseHeadMatch = this.findClauseHead(lineText, predicateName, isNonTerminal, targetArity + 1);

      if (clauseHeadMatch) {
        // This is a clause head - process the entire clause
        lineNum = this.processClauseRangeForArgumentRemoval(
          doc, lineNum, predicateName, argumentPosition, targetArity, isNonTerminal, edits
        );
      } else {
        // No clause head found - this means we're processing calls/references
        // Use the target arity from the method parameter (determined from predicate indicator)
        const lineEdits = this.findAndRemovePredicateCallArgumentInLine(lineText, lineNum, predicateName, argumentPosition, targetArity, isNonTerminal);
        edits.push(...lineEdits);
        lineNum++;
      }
    }

    return edits;
  }

  /**
   * Process a complete clause range for argument reordering
   * Returns the next line number to process
   */
  private processClauseRangeForArgumentsReorder(
    doc: TextDocument,
    startLine: number,
    predicateName: string,
    newOrder: number[],
    currentArity: number,
    isNonTerminal: boolean,
    edits: TextEdit[]
  ): number {
    const clauseRange = PredicateUtils.getClauseRange(doc, startLine);
    this.logger.debug(`Processing clause from line ${clauseRange.start + 1} to ${clauseRange.end + 1} for ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName}`);

    // Process each line in the clause
    for (let lineNum = clauseRange.start; lineNum <= clauseRange.end; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      if (lineNum === clauseRange.start) {
        // This is the clause head line
        const clauseHeadMatch = this.findClauseHead(lineText, predicateName, isNonTerminal, currentArity);
        if (clauseHeadMatch) {
          const headArity = this.countArguments(clauseHeadMatch.arguments);
          this.logger.debug(`Found clause head with arity ${headArity}, target arity: ${currentArity} at line ${lineNum + 1}`);

          if (headArity === currentArity) {
            // Update the clause head (reorder arguments)
            this.logger.debug(`Updating clause head: ${clauseHeadMatch.fullMatch}`);
            const headEdits = this.updateClauseHeadForArgumentsReorder(lineText, lineNum, clauseHeadMatch, newOrder, isNonTerminal);
            edits.push(...headEdits);
          } else {
            this.logger.debug(`Skipping clause head with different arity (${headArity} vs ${currentArity})`);
          }

          // Also check for calls in the clause body part (after :- or -->)
          const bodyEdits = this.findAndReorderPredicateCallArgumentsInClauseBody(lineText, lineNum, predicateName, newOrder, isNonTerminal);
          edits.push(...bodyEdits);
        }
      } else {
        // This is a clause body line - check for recursive calls
        const bodyEdits = this.findAndReorderPredicateCallArgumentsInLine(lineText, lineNum, predicateName, newOrder, isNonTerminal);
        edits.push(...bodyEdits);
      }
    }

    // Return the next line to process (after this clause)
    return clauseRange.end + 1;
  }

  /**
   * Process a complete clause range for argument adding
   * Returns the next line number to process
   */
  private processClauseRangeForAdding(
    doc: TextDocument,
    startLine: number,
    predicateName: string,
    argumentName: string,
    argumentPosition: number,
    currentArity: number,
    isNonTerminal: boolean,
    edits: TextEdit[]
  ): number {
    const clauseRange = PredicateUtils.getClauseRange(doc, startLine);
    this.logger.debug(`Processing clause from line ${clauseRange.start + 1} to ${clauseRange.end + 1} for ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName}`);

    // Process each line in the clause
    for (let lineNum = clauseRange.start; lineNum <= clauseRange.end; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      if (lineNum === clauseRange.start) {
        // This is the clause head line
        const clauseHeadMatch = this.findClauseHead(lineText, predicateName, isNonTerminal, currentArity);
        if (clauseHeadMatch) {
          const headArity = this.countArguments(clauseHeadMatch.arguments);
          this.logger.debug(`Found clause head with arity ${headArity}, target arity: ${currentArity} at line ${lineNum + 1}`);

          if (headArity === currentArity) {
            // Update the clause head (add argument)
            this.logger.debug(`Updating clause head: ${clauseHeadMatch.fullMatch}`);
            const headEdits = this.updateClauseHeadForArgumentAdding(lineText, lineNum, clauseHeadMatch, argumentName, argumentPosition, isNonTerminal);
            edits.push(...headEdits);
          } else {
            this.logger.debug(`Skipping clause head with different arity (${headArity} vs ${currentArity})`);
          }

          // Also check for calls in the clause body part (after :- or -->)
          const bodyEdits = this.findAndAddPredicateCallArgumentInClauseBody(lineText, lineNum, predicateName, currentArity, argumentName, argumentPosition, isNonTerminal);
          edits.push(...bodyEdits);
        }
      } else {
        // This is a clause body line - check for recursive calls
        const bodyEdits = this.findAndAddPredicateCallArgumentInLine(lineText, lineNum, predicateName, currentArity, argumentName, argumentPosition, isNonTerminal);
        edits.push(...bodyEdits);
      }
    }

    // Return the next line to process (after this clause)
    return clauseRange.end + 1;
  }

  /**
   * Process a complete clause range for argument removal
   * Returns the next line number to process
   */
  private processClauseRangeForArgumentRemoval(
    doc: TextDocument,
    startLine: number,
    predicateName: string,
    argumentPosition: number,
    targetArity: number,
    isNonTerminal: boolean,
    edits: TextEdit[]
  ): number {
    const clauseRange = PredicateUtils.getClauseRange(doc, startLine);
    this.logger.debug(`Processing clause from line ${clauseRange.start + 1} to ${clauseRange.end + 1} for ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName}`);

    // Process each line in the clause
    for (let lineNum = clauseRange.start; lineNum <= clauseRange.end; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      if (lineNum === clauseRange.start) {
        // This is the clause head line
        const clauseHeadMatch = this.findClauseHead(lineText, predicateName, isNonTerminal, targetArity + 1);
        if (clauseHeadMatch) {
          const headArity = this.countArguments(clauseHeadMatch.arguments);
          this.logger.debug(`Found clause head with arity ${headArity} at line ${lineNum + 1}`);

          if (headArity > 0) {
            // Update the clause head (remove argument)
            this.logger.debug(`Updating clause head: ${clauseHeadMatch.fullMatch}`);
            const headEdits = this.updateClauseHeadForArgumentRemoval(lineText, lineNum, clauseHeadMatch, argumentPosition, isNonTerminal);
            edits.push(...headEdits);
          } else {
            this.logger.debug(`Skipping clause head with no arguments`);
          }

          // Also check for calls in the clause body part (after :- or -->)
          const bodyEdits = this.findAndRemovePredicateCallArgumentInClauseBody(lineText, lineNum, predicateName, argumentPosition, targetArity, isNonTerminal);
          edits.push(...bodyEdits);
        }
      } else {
        // This is a clause body line - check for recursive calls
        const bodyEdits = this.findAndRemovePredicateCallArgumentInLine(lineText, lineNum, predicateName, argumentPosition, targetArity, isNonTerminal);
        edits.push(...bodyEdits);
      }
    }

    // Return the next line to process (after this clause)
    return clauseRange.end + 1;
  }

  /**
   * Find the end line of all consecutive clauses of the same predicate/non-terminal with the same arity
   */
  private findEndOfConsecutiveClauses(
    doc: TextDocument,
    startLine: number,
    predicateName: string,
    targetArity: number,
    isNonTerminal: boolean
  ): number {
    let currentLine = startLine;
    let lastClauseEndLine = startLine;

    while (currentLine < doc.lineCount) {
      const lineText = doc.lineAt(currentLine).text;
      const trimmedLine = lineText.trim();

      // Skip empty lines and comments
      if (trimmedLine === '' || trimmedLine.startsWith('%')) {
        currentLine++;
        continue;
      }

      // Check if this line starts a clause of our predicate/non-terminal
      const clauseHeadMatch = this.findClauseHead(lineText, predicateName, isNonTerminal, targetArity);

      if (clauseHeadMatch) {
        // This is a clause of our predicate/non-terminal with the correct arity
        // (arity was already checked by findClauseHead)
        // Find the end of this clause
        const clauseRange = PredicateUtils.getClauseRange(doc, currentLine);
        lastClauseEndLine = clauseRange.end;
        currentLine = clauseRange.end + 1;
      } else if (trimmedLine.startsWith(':-')) {
        // This is a directive, stop here
        break;
      } else if (this.isPredicateOrNonTerminalClause(lineText)) {
        // This is a clause of a different predicate/non-terminal, stop here
        break;
      } else {
        // Continue to next line
        currentLine++;
      }
    }

    return lastClauseEndLine;
  }



  /**
   * Check if a line contains a predicate or non-terminal clause
   */
  private isPredicateOrNonTerminalClause(lineText: string): boolean {
    const trimmedLine = lineText.trim();

    // Skip empty lines, comments, and directives
    if (trimmedLine === '' || trimmedLine.startsWith('%') || trimmedLine.startsWith(':-')) {
      return false;
    }

    // Check if it looks like a predicate clause (contains :- or ends with .)
    // or a non-terminal clause (contains -->)
    return trimmedLine.includes(':-') || trimmedLine.includes('-->') || /\.\s*(?:%.*)?$/.test(trimmedLine);
  }



  /**
   * Find and update consecutive directives for reordering
   */
  private findAndUpdateConsecutiveDirectivesForReorder(
    doc: TextDocument,
    scopeLine: number,
    predicateName: string,
    currentIndicator: string,
    newOrder: number[],
    currentArity: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    const edits: TextEdit[] = [];
    const totalLines = doc.lineCount;

    this.logger.debug(`findAndUpdateConsecutiveDirectivesForReorder: processing scope directive at line ${scopeLine + 1} and consecutive directives`);
    this.logger.debug(`findAndUpdateConsecutiveDirectivesForReorder: looking for predicateName="${predicateName}", currentIndicator="${currentIndicator}"`);

    // First, process the scope directive itself (for reorder, scope directive doesn't change)
    this.logger.debug(`Processing scope directive at line ${scopeLine + 1} (no changes needed for reorder)`);
    const scopeRange = PredicateUtils.getDirectiveRange(doc, scopeLine);
    this.logger.debug(`Scope directive range: lines ${scopeRange.start + 1}-${scopeRange.end + 1}`);

    // Start searching for consecutive directives from the line after the scope directive
    let lineNum = scopeRange.end + 1;
    while (lineNum < totalLines) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      this.logger.debug(`findAndUpdateConsecutiveDirectivesForReorder: line ${lineNum + 1}: "${trimmedLine}"`);

      // Skip empty lines and comments
      if (trimmedLine === '' || trimmedLine.startsWith('%')) {
        this.logger.debug(`Skipping ${trimmedLine === '' ? 'empty line' : 'comment'} at line ${lineNum + 1}`);
        lineNum++;
        continue;
      }

      // Stop if we hit another scope directive
      if (trimmedLine.startsWith(':-') &&
          (trimmedLine.includes('public(') || trimmedLine.includes('protected(') || trimmedLine.includes('private('))) {
        this.logger.debug(`Stopping consecutive directive search at scope directive line ${lineNum + 1}`);
        break;
      }

      // Check if this starts a directive
      if (trimmedLine.startsWith(':-')) {
        const directiveType = this.isRelevantPredicateDirective(trimmedLine, isNonTerminal);

        if (directiveType) {
          this.logger.debug(`Found ${directiveType} directive at line ${lineNum + 1}`);

          // Get the complete directive range
          const range = PredicateUtils.getDirectiveRange(doc, lineNum);
          this.logger.debug(`${directiveType} directive range: lines ${range.start + 1}-${range.end + 1}`);

          // Check if this directive contains our predicate
          let containsOurPredicate = false;
          for (let checkLine = range.start; checkLine <= range.end; checkLine++) {
            const checkText = doc.lineAt(checkLine).text;
            if (checkText.includes(currentIndicator) || checkText.includes(predicateName + '(')) {
              containsOurPredicate = true;
              break;
            }

            // For mode directives with zero-arity predicates, also check for predicate name without parentheses
            if (directiveType === 'mode' && currentArity === 0) {
              const zeroArityPattern = new RegExp(`mode\\(\\s*${predicateName}\\s*,`);
              if (zeroArityPattern.test(checkText)) {
                containsOurPredicate = true;
                break;
              }
            }
          }

          if (containsOurPredicate) {
            this.logger.debug(`${directiveType} directive contains our predicate, processing range`);
            const directiveEdits = this.processDirectiveRangeForArgumentsReorder(
              doc, range, predicateName, currentIndicator, newOrder,
              currentArity, isNonTerminal, directiveType
            );
            edits.push(...directiveEdits);
          } else {
            this.logger.debug(`${directiveType} directive does not contain our predicate, skipping`);
          }

          // Skip to the end of this directive
          lineNum = range.end + 1;
          continue;
        } else {
          // This is some other directive not relevant to our predicate, stop searching
          this.logger.debug(`Stopping consecutive directive search at unrelated directive line ${lineNum + 1}: "${trimmedLine}"`);
          break;
        }
      } else {
        // This is not a directive, stop searching
        this.logger.debug(`Stopping consecutive directive search at non-directive line ${lineNum + 1}: "${trimmedLine}"`);
        break;
      }

      lineNum++;
    }

    return edits;
  }

  /**
   * Find all locations that need to be updated
   */
  private async findAllLocationsToUpdate(
    document: TextDocument,
    position: Position,
    currentIndicator: string,
    isNonTerminal: boolean
  ): Promise<{
    locations: { uri: Uri; range: Range }[],
    declarationLocation: Location | null
  }> {
    const allLocations: { uri: Uri; range: Range }[] = [];
    const token = { isCancellationRequested: false } as CancellationToken;

    // Find declaration location (if exists)
    const declarationLocation = await this.declarationProvider.provideDeclaration(document, position, token);

    if (declarationLocation && this.isValidLocation(declarationLocation)) {
      // Add declaration location so that we can process related directives that follow it
      allLocations.push({ uri: declarationLocation.uri, range: declarationLocation.range });
      this.logger.debug(`Found declaration at: ${declarationLocation.uri.fsPath}:${declarationLocation.range.start.line + 1}`);

      // Find definition and references from declaration position
      const declarationDocument = await workspace.openTextDocument(declarationLocation.uri);
      const declarationPosition = this.findPredicatePositionInDeclaration(declarationDocument, declarationLocation.range.start.line, currentIndicator);

      // Get definition location
      const definitionLocation = await this.definitionProvider.provideDefinition(declarationDocument, declarationPosition, token);
      if (definitionLocation && this.isValidLocation(definitionLocation)) {
        allLocations.push({ uri: definitionLocation.uri, range: definitionLocation.range });
        this.logger.debug(`Found definition at: ${definitionLocation.uri.fsPath}:${definitionLocation.range.start.line + 1}`);
      }

      // Get implementation locations
      const implementationLocations = await this.implementationProvider.provideImplementation(declarationDocument, declarationPosition, token);
      if (implementationLocations) {
        const implArray = Array.isArray(implementationLocations) ? implementationLocations : [implementationLocations];
        for (const implLoc of implArray) {
          const location = 'targetUri' in implLoc ?
            { uri: implLoc.targetUri, range: implLoc.targetRange } :
            { uri: implLoc.uri, range: implLoc.range };

          if (this.isValidLocation(location)) {
            allLocations.push(location);
            this.logger.debug(`Found implementation at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
          }
        }
      }

      // Get reference locations
      const referenceLocations = await this.referenceProvider.provideReferences(
        declarationDocument,
        declarationPosition,
        { includeDeclaration: false },
        token
      );

      if (referenceLocations) {
        for (const refLoc of referenceLocations) {
          allLocations.push({ uri: refLoc.uri, range: refLoc.range });
          this.logger.debug(`Found reference at: ${refLoc.uri.fsPath}:${refLoc.range.start.line + 1}`);
        }
      }
    } else {
      // No declaration found - find definition and references from current position
      const definitionLocation = await this.definitionProvider.provideDefinition(document, position, token);
      if (definitionLocation && this.isValidLocation(definitionLocation)) {
        allLocations.push({ uri: definitionLocation.uri, range: definitionLocation.range });
        this.logger.debug(`Found definition at: ${definitionLocation.uri.fsPath}:${definitionLocation.range.start.line + 1}`);

        // Use the definition location to find implementations and references
        const definitionDocument = await workspace.openTextDocument(definitionLocation.uri);
        const definitionPosition = this.findPredicatePositionInDefinition(definitionDocument, definitionLocation.range.start.line, currentIndicator, isNonTerminal);

        // Get implementation locations
        const implementationLocations = await this.implementationProvider.provideImplementation(definitionDocument, definitionPosition, token);
        if (implementationLocations) {
          const implArray = Array.isArray(implementationLocations) ? implementationLocations : [implementationLocations];
          for (const implLoc of implArray) {
            const location = 'targetUri' in implLoc ?
              { uri: implLoc.targetUri, range: implLoc.targetRange } :
              { uri: implLoc.uri, range: implLoc.range };

            if (this.isValidLocation(location)) {
              allLocations.push(location);
              this.logger.debug(`Found implementation at: ${location.uri.fsPath}:${location.range.start.line + 1}`);
            }
          }
        }

        // Get reference locations
        const referenceLocations = await this.referenceProvider.provideReferences(
          definitionDocument,
          definitionPosition,
          { includeDeclaration: false },
          token
        );

        if (referenceLocations && referenceLocations.length > 0) {
          for (const refLoc of referenceLocations) {
            allLocations.push({ uri: refLoc.uri, range: refLoc.range });
            this.logger.debug(`Found reference at: ${refLoc.uri.fsPath}:${refLoc.range.start.line + 1}:${refLoc.range.start.character}-${refLoc.range.end.character}`);
          }
        }
      }
    }

    // Remove duplicates by creating a unique set based on URI and line number
    const uniqueLocations = this.deduplicateLocations(allLocations);

    return {
      locations: uniqueLocations,
      declarationLocation: declarationLocation && this.isValidLocation(declarationLocation) ? declarationLocation : null
    };
  }

  /**
   * Update info directive arguments for removal
   */
  private updateInfoDirectiveArgumentsForRemoval(
    doc: TextDocument,
    lineNum: number,
    lineText: string,
    predicateName: string,
    argumentPosition: number,
    currentArity: number,
    edits: TextEdit[]
  ): number {
    let updatedLine = lineText;

    // Handle multi-line arguments lists FIRST
    // Detect 'arguments is [' without ']' on the same line
    const multiLineArgumentsPattern = /^(\s*)arguments\s+is\s+\[([^\]]*)?$/;
    const multiLineArgumentsMatch = lineText.match(multiLineArgumentsPattern);
    if (multiLineArgumentsMatch) {
      this.logger.debug(`Detected multi-line arguments list starting at line ${lineNum + 1} for removal`);
      // For removal, we need to find the multi-line structure and remove the argument
      const endLineNum = this.removeFromMultiLineArguments(doc, lineNum, argumentPosition, currentArity, edits);
      return endLineNum; // Return line after multi-line structure
    }

    // Handle multi-line examples lists
    // Detect 'examples is [' without ']' on the same line
    const multiLineExamplesPattern = /^(\s*)examples\s+is\s+\[([^\]]*)?$/;
    const multiLineExamplesMatch = lineText.match(multiLineExamplesPattern);
    if (multiLineExamplesMatch) {
      this.logger.debug(`Detected multi-line examples list starting at line ${lineNum + 1} for removal`);
      const endLineNum = this.removeFromMultiLineExamples(doc, lineNum, predicateName, currentArity, argumentPosition, edits);
      return endLineNum; // Return line after multi-line structure
    }

    // Handle argnames and arguments lists
    if (lineText.includes('argnames') || lineText.includes('arguments')) {
      // If removing the last argument and it would result in an empty list, remove the entire line
      if (currentArity === 1) {
        this.logger.debug(`Removing entire argnames/arguments line at line ${lineNum + 1} (last argument)`);

        // Check if the next line contains the closing directive (]).
        let removeTrailingComma = false;
        if (lineNum + 1 < doc.lineCount) {
          const nextLineText = doc.lineAt(lineNum + 1).text.trim();
          if (nextLineText.includes(']).')) {
            removeTrailingComma = true;
          }
        }

        // If we need to remove trailing comma, also check the previous line
        if (removeTrailingComma && lineNum > 0) {
          const prevLineText = doc.lineAt(lineNum - 1).text;
          if (prevLineText.trim().endsWith(',')) {
            // Remove trailing comma from previous line
            const commaIndex = prevLineText.lastIndexOf(',');
            const prevLineEdit = TextEdit.replace(
              new Range(
                new Position(lineNum - 1, commaIndex),
                new Position(lineNum - 1, commaIndex + 1)
              ),
              ''
            );
            edits.push(prevLineEdit);
            this.logger.debug(`Removed trailing comma from previous line ${lineNum}`);
          }
        }

        // Remove the entire argnames/arguments line
        const edit = TextEdit.replace(
          new Range(
            new Position(lineNum, 0),
            new Position(lineNum + 1, 0)  // Include the newline to remove the entire line
          ),
          ''
        );
        edits.push(edit);
        return lineNum; // Return current line, no multi-line processing
      }

      // Find the list and remove the specified argument
      const listMatch = lineText.match(/\[(.*?)\]/);
      if (listMatch) {
        const listContent = listMatch[1];
        const args = listContent.split(',').map(arg => arg.trim().replace(/^['"]|['"]$/g, ''));

        if (args.length >= argumentPosition) {
          args.splice(argumentPosition - 1, 1); // Remove the argument (convert to 0-based)
          const newListContent = args.map(arg => `'${arg}'`).join(', ');
          updatedLine = updatedLine.replace(/\[.*?\]/, `[${newListContent}]`);
        }
      }
    }

    // If the line was updated, create an edit
    if (updatedLine !== lineText) {
      this.logger.debug(`Updated argnames/arguments for removal at line ${lineNum + 1}`);
      const edit = TextEdit.replace(
        new Range(
          new Position(lineNum, 0),
          new Position(lineNum, lineText.length)
        ),
        updatedLine
      );
      edits.push(edit);
    }

    return lineNum; // Return current line number
  }

  /**
   * Find and update consecutive directives for removal
   */
  private findAndUpdateConsecutiveDirectivesForRemoval(
    doc: TextDocument,
    scopeLine: number,
    predicateName: string,
    currentIndicator: string,
    newIndicator: string,
    argumentPosition: number,
    currentArity: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    const edits: TextEdit[] = [];
    const totalLines = doc.lineCount;

    this.logger.debug(`findAndUpdateConsecutiveDirectivesForRemoval: processing scope directive at line ${scopeLine + 1} and consecutive directives`);
    this.logger.debug(`findAndUpdateConsecutiveDirectivesForRemoval: looking for predicateName="${predicateName}", currentIndicator="${currentIndicator}"`);

    // First, process the scope directive itself
    this.logger.debug(`Processing scope directive at line ${scopeLine + 1}`);
    const scopeRange = PredicateUtils.getDirectiveRange(doc, scopeLine);
    this.logger.debug(`Scope directive range: lines ${scopeRange.start + 1}-${scopeRange.end + 1}`);

    const scopeEdits = this.processDirectiveRangeForRemoval(
      doc, scopeRange, predicateName, currentIndicator, newIndicator,
      argumentPosition, currentArity, isNonTerminal, 'scope'
    );
    edits.push(...scopeEdits);

    // Start searching for consecutive directives from the line after the scope directive
    let lineNum = scopeRange.end + 1;
    while (lineNum < totalLines) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmedLine = lineText.trim();

      this.logger.debug(`findAndUpdateConsecutiveDirectivesForRemoval: line ${lineNum + 1}: "${trimmedLine}"`);

      // Skip empty lines and comments
      if (trimmedLine === '' || trimmedLine.startsWith('%')) {
        this.logger.debug(`Skipping ${trimmedLine === '' ? 'empty line' : 'comment'} at line ${lineNum + 1}`);
        lineNum++;
        continue;
      }

      // Stop if we hit another scope directive
      if (trimmedLine.startsWith(':-') &&
          (trimmedLine.includes('public(') || trimmedLine.includes('protected(') || trimmedLine.includes('private('))) {
        this.logger.debug(`Stopping consecutive directive search at scope directive line ${lineNum + 1}`);
        break;
      }

      // Check if this starts a directive
      if (trimmedLine.startsWith(':-')) {
        const directiveType = this.isRelevantPredicateDirective(trimmedLine, isNonTerminal);

        if (directiveType) {
          this.logger.debug(`Found ${directiveType} directive at line ${lineNum + 1}`);

          // Get the complete directive range
          const range = PredicateUtils.getDirectiveRange(doc, lineNum);
          this.logger.debug(`${directiveType} directive range: lines ${range.start + 1}-${range.end + 1}`);

          // Check if this directive contains our predicate
          let containsOurPredicate = false;
          for (let checkLine = range.start; checkLine <= range.end; checkLine++) {
            const checkText = doc.lineAt(checkLine).text;
            if (checkText.includes(currentIndicator) || checkText.includes(predicateName + '(')) {
              containsOurPredicate = true;
              break;
            }

            // For mode directives with zero-arity predicates, also check for predicate name without parentheses
            if (directiveType === 'mode' && currentArity === 0) {
              const zeroArityPattern = new RegExp(`mode\\(\\s*${predicateName}\\s*,`);
              if (zeroArityPattern.test(checkText)) {
                containsOurPredicate = true;
                break;
              }
            }
          }

          if (containsOurPredicate) {
            this.logger.debug(`${directiveType} directive contains our predicate, processing range`);
            const directiveEdits = this.processDirectiveRangeForRemoval(
              doc, range, predicateName, currentIndicator, newIndicator,
              argumentPosition, currentArity, isNonTerminal, directiveType
            );
            edits.push(...directiveEdits);
          } else {
            this.logger.debug(`${directiveType} directive does not contain our predicate, skipping`);
          }

          // Skip to the end of this directive
          lineNum = range.end + 1;
          continue;
        } else {
          // This is some other directive not relevant to our predicate, stop searching
          this.logger.debug(`Stopping consecutive directive search at unrelated directive line ${lineNum + 1}: "${trimmedLine}"`);
          break;
        }
      } else {
        // This is not a directive, stop searching
        this.logger.debug(`Stopping consecutive directive search at non-directive line ${lineNum + 1}: "${trimmedLine}"`);
        break;
      }

      lineNum++;
    }

    return edits;
  }

  /**
   * Update mode directive for argument removal
   */
  private updateModeDirectiveForArgumentRemoval(
    lineText: string,
    predicateName: string,
    argumentPosition: number,
    _currentArity: number
  ): string {
    // Pattern: mode(predicate_name(arg1, arg2), mode_info)
    // We need to handle nested parentheses in arguments like +list(callable)
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
      // No current arguments - nothing to remove
      return lineText;
    } else {
      // Parse arguments properly handling nested structures
      const argList = ArgumentUtils.parseArguments(currentArgs);
      if (argList.length >= argumentPosition) {
        argList.splice(argumentPosition - 1, 1); // Remove the argument (convert to 0-based)

        if (argList.length === 0) {
          // No arguments remain - remove parentheses entirely
          const beforePredicate = lineText.substring(0, predicateStart);
          const afterCloseParen = lineText.substring(closeParenPos + 1);
          return beforePredicate + predicateName + afterCloseParen;
        } else {
          newArgs = argList.join(', ');
        }
      } else {
        // Invalid argument position
        return lineText;
      }
    }

    // Replace the arguments part
    const beforeArgs = lineText.substring(0, openParenPos + 1);
    const afterArgs = lineText.substring(closeParenPos);
    return beforeArgs + newArgs + afterArgs;
  }

  /**
   * Update meta directive for argument removal
   */
  private updateMetaDirectiveForArgumentRemoval(
    lineText: string,
    predicateName: string,
    argumentPosition: number,
    _currentArity: number,
    isNonTerminal: boolean
  ): string {
    const directiveType = isNonTerminal ? 'meta_non_terminal' : 'meta_predicate';

    // Pattern: meta_predicate(predicate_name(template1, template2)) or meta_non_terminal(name(template1, template2))
    // We need to handle nested parentheses in templates
    const predicateStart = lineText.indexOf(`${predicateName}(`);
    if (predicateStart === -1) {
      return lineText;
    }

    // Also check that this is actually within the correct directive type
    if (!lineText.includes(`${directiveType}(`)) {
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

    // Extract current template arguments
    const currentArgs = lineText.substring(openParenPos + 1, closeParenPos).trim();
    let newArgs: string;

    if (currentArgs === '') {
      // No current arguments - nothing to remove
      return lineText;
    } else {
      // Parse arguments properly handling nested structures
      const argList = ArgumentUtils.parseArguments(currentArgs);
      if (argList.length >= argumentPosition) {
        argList.splice(argumentPosition - 1, 1); // Remove the argument (convert to 0-based)

        if (argList.length === 0) {
          // No arguments remain - remove parentheses entirely
          const beforePredicate = lineText.substring(0, predicateStart);
          const afterCloseParen = lineText.substring(closeParenPos + 1);
          return beforePredicate + predicateName + afterCloseParen;
        } else {
          newArgs = argList.join(', ');
        }
      } else {
        // Invalid argument position
        return lineText;
      }
    }

    // Replace the arguments part
    const beforeArgs = lineText.substring(0, openParenPos + 1);
    const afterArgs = lineText.substring(closeParenPos);
    return beforeArgs + newArgs + afterArgs;
  }

  /**
   * Dispose of the refactor provider and clean up resources
   */
  public dispose(): void {
    // Currently no resources to dispose, but this method provides
    // consistency with other providers and allows for future cleanup
    this.logger.debug('LogtalkRefactorProvider disposed');
  }


  /**
   * Count parameters in an entity identifier like name(P1,P2)
   */
  private countEntityParameters(identifier: string): number {
    const open = identifier.indexOf('(');
    if (open < 0) return 0;
    const close = identifier.lastIndexOf(')');
    if (close < 0 || close <= open) return 0;
    const inner = identifier.substring(open + 1, close).trim();
    if (!inner) return 0;
    return ArgumentUtils.parseArguments(inner).length;
  }

  /**
   * Parse entity identifier into base name and parameters array
   */
  private parseEntityNameAndParams(identifier: string): { base: string, params: string[] } {
    const open = identifier.indexOf('(');
    if (open < 0) return { base: identifier.trim(), params: [] };
    const base = identifier.substring(0, open).trim();
    const close = identifier.lastIndexOf(')');
    const inner = close > open ? identifier.substring(open + 1, close).trim() : '';
    const params = inner ? ArgumentUtils.parseArguments(inner) : [];
    return { base, params };
  }

  private buildEntityIdentifier(base: string, params: string[]): string {
    if (!params.length) return base;
    return `${base}(${params.join(', ')})`;
  }

  /**
   * Replace the captured identifier part in an entity opening directive line
   */
  private replaceEntityOpeningIdentifierLine(lineText: string, type: 'object'|'category'|'protocol', newIdentifier: string): string {
    try {
      const kw = type === 'object' ? 'object' : (type === 'category' ? 'category' : 'protocol');
      // Find the opening parenthesis of the directive allowing optional whitespace: ":- object ("
      const re = new RegExp(`:\-\s*${kw}\s*\(`);
      const m = re.exec(lineText);
      if (!m) return lineText;
      const openParenPos = lineText.indexOf('(', m.index);
      if (openParenPos < 0) return lineText;

      // Find matching close paren for the directive (within this single line)
      const closeParenPos = ArgumentUtils.findMatchingCloseParen(lineText, openParenPos);
      if (closeParenPos < 0) return lineText;

      // Replace only the first argument inside the directive (the entity identifier)
      const start = openParenPos + 1;
      let end = closeParenPos; // default if only one argument
      let depth = 0;
      let inDq = false, inSq = false, esc = false;
      for (let i = start; i < closeParenPos; i++) {
        const ch = lineText[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"' && !inSq) { inDq = !inDq; continue; }
        if (ch === "'" && !inDq) { inSq = !inSq; continue; }
        if (inDq || inSq) continue;
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) { end = i; break; }
      }

      return lineText.substring(0, start) + newIdentifier + lineText.substring(end);
    } catch (e) {
      this.logger.warn(`replaceEntityOpeningIdentifierLine failed, falling back to regex: ${e}`);
      const regex = type === 'object' ? SymbolRegexes.object : (type === 'category' ? SymbolRegexes.category : SymbolRegexes.protocol);
      const mm = lineText.match(regex);
      if (!mm || !mm[1]) return lineText;
      return lineText.replace(mm[1], newIdentifier);
    }
  }

  // Multi-line safe: replace the first directive argument (entity identifier) across the full directive text
  private replaceEntityOpeningIdentifierInDirectiveText(
    directiveText: string,
    type: 'object'|'category'|'protocol',
    newIdentifier: string
  ): string {
    this.logger.debug(`replaceEntityOpeningIdentifierInDirectiveText called with:`);
    this.logger.debug(`  directiveText: "${directiveText}"`);
    this.logger.debug(`  type: ${type}`);
    this.logger.debug(`  newIdentifier: "${newIdentifier}"`);

    try {
      const kw = type === 'object' ? 'object' : (type === 'category' ? 'category' : 'protocol');

      // Find the directive opening: ":- object("
      const directiveStart = directiveText.indexOf(`:-`);
      if (directiveStart < 0) return directiveText;

      const kwStart = directiveText.indexOf(kw, directiveStart);
      if (kwStart < 0) return directiveText;

      const openParenPos = directiveText.indexOf('(', kwStart);
      if (openParenPos < 0) return directiveText;

      // Find the matching close parenthesis for the directive
      const closeParenPos = ArgumentUtils.findMatchingCloseParen(directiveText, openParenPos);
      if (closeParenPos < 0) return directiveText;

      // Parse the directive arguments to find where the entity identifier ends
      const directiveContent = directiveText.substring(openParenPos + 1, closeParenPos);
      const args = ArgumentUtils.parseArguments(directiveContent);

      if (args.length === 0) {
        // No arguments - just insert the new identifier
        const before = directiveText.substring(0, openParenPos + 1);
        const after = directiveText.substring(closeParenPos);
        return before + newIdentifier + after;
      }

      // Replace the first argument (entity identifier) with the new identifier
      const oldIdentifier = args[0];
      this.logger.debug(`  oldIdentifier: "${oldIdentifier}"`);
      this.logger.debug(`  args: [${args.map(a => `"${a}"`).join(', ')}]`);

      // We need to find the exact boundaries of the first argument in the original text
      // The ArgumentUtils.parseArguments gives us the content, but we need to find where it starts/ends

      // Start right after the opening parenthesis
      let searchStart = openParenPos + 1;

      // Skip any leading whitespace
      while (searchStart < closeParenPos && /\s/.test(directiveText[searchStart])) {
        searchStart++;
      }

      // Find where the first argument ends by looking for the first top-level comma or the closing paren
      let identifierEnd = closeParenPos; // default to end of directive if only one argument
      let depth = 0;
      let inQuotes = false;
      let inSingleQuotes = false;
      let escapeNext = false;

      for (let i = searchStart; i < closeParenPos; i++) {
        const ch = directiveText[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (ch === '\\') {
          escapeNext = true;
          continue;
        }

        if (ch === '"' && !inSingleQuotes) {
          inQuotes = !inQuotes;
          continue;
        }

        if (ch === "'" && !inQuotes) {
          inSingleQuotes = !inSingleQuotes;
          continue;
        }

        if (inQuotes || inSingleQuotes) {
          continue;
        }

        if (ch === '(') {
          depth++;
        } else if (ch === ')') {
          depth--;
        } else if (ch === ',' && depth === 0) {
          // Found the end of the first argument
          identifierEnd = i;
          break;
        }
      }

      this.logger.debug(`  searchStart: ${searchStart}, identifierEnd: ${identifierEnd}`);
      this.logger.debug(`  extractedIdentifier: "${directiveText.substring(searchStart, identifierEnd)}"`);

      // The issue is that we need to replace the ENTIRE first argument, not just insert after it
      // So we replace from searchStart to identifierEnd with the newIdentifier
      const beforeIdentifier = directiveText.substring(0, searchStart);
      const afterIdentifier = directiveText.substring(identifierEnd);

      this.logger.debug(`  beforeIdentifier: "${beforeIdentifier}"`);
      this.logger.debug(`  afterIdentifier: "${afterIdentifier}"`);

      const result = beforeIdentifier + newIdentifier + afterIdentifier;
      this.logger.debug(`  result: "${result}"`);

      return result;
    } catch (e) {
      this.logger.warn(`replaceEntityOpeningIdentifierInDirectiveText failed: ${e}`);
      return directiveText;
    }
  }

  /**
   * Update single-line parnames/parameters info entries by adding at position
   */
  private updateParInfoLineForAdd(lineText: string, key: 'parnames'|'parameters', name: string, position: number): string {
    const pattern = new RegExp(`^(\\s*)${key}\\s+is\\s+(\\[[^\\]]*\\])(.*)`);
    const m = lineText.match(pattern);
    if (!m) return lineText;
    const leading = m[1];
    const list = m[2];
    const trailing = m[3];
    const content = list.slice(1, -1);
    const items = content.trim() ? ArgumentUtils.parseArguments(content) : [];
    const insertAt = Math.min(Math.max(position, 1), items.length + 1) - 1;
    const newItem = key === 'parnames' ? `'${name}'` : `'${name}'-''`;
    items.splice(insertAt, 0, newItem);
    return `${leading}${key} is [${items.join(', ')}]${trailing}`;
  }

  /**
   * Update single-line parnames/parameters info entries by reordering
   */
  private updateParInfoLineForReorder(lineText: string, key: 'parnames'|'parameters', newOrder: number[]): string {
    const pattern = new RegExp(`^(\\s*)${key}\\s+is\\s+(\\[[^\\]]*\\])(.*)`);
    const m = lineText.match(pattern);
    if (!m) return lineText;
    const leading = m[1];
    const list = m[2];
    const trailing = m[3];
    const content = list.slice(1, -1);
    const items = content.trim() ? ArgumentUtils.parseArguments(content) : [];
    if (items.length !== newOrder.length) return lineText;
    const reordered = this.reorderArray(items, newOrder);
    return `${leading}${key} is [${reordered.join(', ')}]${trailing}`;
  }

  /**
   * Update single-line parnames/parameters info entries by removing at position
   * Returns null if the line should be deleted (when list becomes empty)
   */
  private updateParInfoLineForRemove(lineText: string, key: 'parnames'|'parameters', position: number): string | null {
    const pattern = new RegExp(`^(\\s*)${key}\\s+is\\s+(\\[[^\\]]*\\])(.*)`);
    const m = lineText.match(pattern);
    if (!m) return lineText;
    const leading = m[1];
    const list = m[2];
    const trailing = m[3];
    const content = list.slice(1, -1);
    const items = content.trim() ? ArgumentUtils.parseArguments(content) : [];
    const idx = Math.min(Math.max(position, 1), items.length) - 1;
    if (items.length === 0) return lineText;
    items.splice(idx, 1);

    // If the list becomes empty, return null to indicate the line should be deleted
    if (items.length === 0) {
      return null;
    }

    return `${leading}${key} is [${items.join(', ')}]${trailing}`;
  }

  /**
   * Delete an info directive line and handle trailing comma removal
   */
  private deleteInfoLineAndHandleComma(document: TextDocument, edit: WorkspaceEdit, lineNum: number): void {
    // Check if we need to remove trailing comma from previous line
    if (lineNum > 0) {
      const prevLineText = document.lineAt(lineNum - 1).text;
      if (prevLineText.trim().endsWith(',')) {
        // Remove trailing comma from previous line
        const commaIndex = prevLineText.lastIndexOf(',');
        edit.replace(document.uri, new Range(
          new Position(lineNum - 1, commaIndex),
          new Position(lineNum - 1, commaIndex + 1)
        ), '');
      }
    }

    // Delete the entire line
    edit.delete(document.uri, new Range(
      new Position(lineNum, 0),
      new Position(lineNum + 1, 0)  // Include newline
    ));
  }

  /**
   * Add a parnames line to an info/1 directive that doesn't have one
   */
  private addParnamesLineToInfoDirective(
    document: TextDocument,
    edit: WorkspaceEdit,
    infoRange: { start: number, end: number },
    paramName: string
  ): void {
    // Find the last line before the closing ]) of the info directive
    let insertLine = infoRange.end;
    let insertIndent = '\t\t';
    let needsComma = false;

    // Look for the line with the closing bracket
    for (let i = infoRange.end; i >= infoRange.start; i--) {
      const lineText = document.lineAt(i).text;
      const trimmed = lineText.trim();

      if (trimmed === ']).' || trimmed === ']') {
        // This is the closing line - insert before it
        insertLine = i;

        // Check if the previous line needs a comma
        if (i > infoRange.start) {
          const prevLineText = document.lineAt(i - 1).text;
          const prevTrimmed = prevLineText.trim();
          if (prevTrimmed && !prevTrimmed.endsWith(',') && !prevTrimmed.endsWith('[')) {
            needsComma = true;
          }
        }

        // Get indentation from the previous content line
        for (let j = i - 1; j >= infoRange.start; j--) {
          const contentLine = document.lineAt(j).text;
          if (contentLine.trim() && !contentLine.trim().startsWith(':-') && !contentLine.trim().startsWith('[')) {
            const indentMatch = contentLine.match(/^(\s*)/);
            if (indentMatch) {
              insertIndent = indentMatch[1];
            }
            break;
          }
        }
        break;
      }
    }

    // Add comma to previous line if needed
    if (needsComma && insertLine > infoRange.start) {
      const prevLineText = document.lineAt(insertLine - 1).text;
      edit.replace(document.uri, new Range(
        new Position(insertLine - 1, prevLineText.length),
        new Position(insertLine - 1, prevLineText.length)
      ), ',');
    }

    // Insert the parnames line
    const parnamesLine = `${insertIndent}parnames is ['${paramName}']\n`;
    edit.insert(document.uri, new Position(insertLine, 0), parnamesLine);
  }

  /**
   * Add an argnames line to an info/2 directive that doesn't have one
   */
  private addArgnamesLineToInfo2Directive(
    document: TextDocument,
    edits: TextEdit[],
    infoRange: { start: number, end: number },
    argumentName: string
  ): void {
    // Find the last line before the closing ]) of the info directive
    let insertLine = infoRange.end;
    let insertIndent = '\t\t';
    let needsComma = false;

    // Look for the line with the closing bracket
    for (let i = infoRange.end; i >= infoRange.start; i--) {
      const lineText = document.lineAt(i).text;
      const trimmed = lineText.trim();

      if (trimmed === ']).' || trimmed === ']') {
        // This is the closing line - insert before it
        insertLine = i;

        // Check if the previous line needs a comma
        if (i > infoRange.start) {
          const prevLineText = document.lineAt(i - 1).text;
          const prevTrimmed = prevLineText.trim();
          if (prevTrimmed && !prevTrimmed.endsWith(',') && !prevTrimmed.endsWith('[')) {
            needsComma = true;
          }
        }

        // Get indentation from the previous content line
        for (let j = i - 1; j >= infoRange.start; j--) {
          const contentLine = document.lineAt(j).text;
          if (contentLine.trim() && !contentLine.trim().startsWith(':-') && !contentLine.trim().startsWith('[')) {
            const indentMatch = contentLine.match(/^(\s*)/);
            if (indentMatch) {
              insertIndent = indentMatch[1];
            }
            break;
          }
        }
        break;
      }
    }

    // Add comma to previous line if needed
    if (needsComma && insertLine > infoRange.start) {
      const prevLineText = document.lineAt(insertLine - 1).text;
      edits.push(TextEdit.replace(
        new Range(
          new Position(insertLine - 1, prevLineText.length),
          new Position(insertLine - 1, prevLineText.length)
        ),
        ','
      ));
    }

    // Insert the argnames line
    const argnamesLine = `${insertIndent}argnames is ['${argumentName}']\n`;
    edits.push(TextEdit.insert(new Position(insertLine, 0), argnamesLine));
  }

  /**
   * Update an entity call reference, handling both single-line and multi-line cases
   */
  private async updateEntityCallReference(
    edit: WorkspaceEdit,
    refDoc: TextDocument,
    loc: Location,
    entityNameWithoutParams: string,
    newParamName: string,
    insertPosition: number
  ): Promise<void> {
    const startLine = loc.range.start.line;
    const startChar = loc.range.start.character;
    const firstLineText = refDoc.lineAt(startLine).text;

    // Determine if this is a directive or clause and get the appropriate range
    let searchRange: Range;
    if (firstLineText.trim().startsWith(':-')) {
      // This is a directive - use directive range
      const dirRange = PredicateUtils.getDirectiveRange(refDoc, startLine);
      searchRange = new Range(new Position(dirRange.start, 0), new Position(dirRange.end, refDoc.lineAt(dirRange.end).text.length));
    } else {
      // This is a clause - use clause range
      const clauseRange = PredicateUtils.getClauseRange(refDoc, startLine);
      searchRange = new Range(new Position(clauseRange.start, 0), new Position(clauseRange.end, refDoc.lineAt(clauseRange.end).text.length));
    }

    if (firstLineText.trim().startsWith(':-')) {
      // For directives, there's typically only one entity occurrence - find and update it directly
      const base = entityNameWithoutParams;
      const rangeText = refDoc.getText(searchRange);
      const entityIdx = rangeText.indexOf(base);

      if (entityIdx >= 0) {
        // Convert the index back to line/character position
        const beforeText = rangeText.substring(0, entityIdx);
        const lineOffset = (beforeText.match(/\n/g) || []).length;
        const lastNewlineIdx = beforeText.lastIndexOf('\n');
        const charOffset = lastNewlineIdx >= 0 ? entityIdx - lastNewlineIdx - 1 : entityIdx;

        const entityLine = searchRange.start.line + lineOffset;
        const entityChar = lineOffset === 0 ? searchRange.start.character + charOffset : charOffset;

        await this.updateSingleEntityOccurrence(
          edit,
          refDoc,
          entityLine,
          entityChar,
          base,
          newParamName,
          insertPosition,
          searchRange
        );
      }
    } else {
      // For clauses, there might be multiple entity occurrences - find and update all
      const rangeText = refDoc.getText(searchRange);
      const rangeStartPos = searchRange.start;
      const base = entityNameWithoutParams;
      const entityOccurrences: { line: number, char: number }[] = [];

      const lines = rangeText.split('\n');
      for (let lineOffset = 0; lineOffset < lines.length; lineOffset++) {
        const lineText = lines[lineOffset];
        let searchStart = 0;

        while (true) {
          const idx = lineText.indexOf(base, searchStart);
          if (idx < 0) break;

          // Check if this is a word boundary (not part of a larger identifier)
          const beforeChar = idx > 0 ? lineText[idx - 1] : ' ';
          const afterChar = idx + base.length < lineText.length ? lineText[idx + base.length] : ' ';

          if (!/\w/.test(beforeChar) && (!/\w/.test(afterChar) || afterChar === '(')) {
            entityOccurrences.push({
              line: rangeStartPos.line + lineOffset,
              char: rangeStartPos.character + (lineOffset === 0 ? idx : idx)
            });
          }

          searchStart = idx + 1;
        }
      }

      // Update each entity occurrence
      for (const occurrence of entityOccurrences) {
        await this.updateSingleEntityOccurrence(
          edit,
          refDoc,
          occurrence.line,
          occurrence.char,
          base,
          newParamName,
          insertPosition,
          searchRange
        );
      }
    }
  }

  /**
   * Update a single entity occurrence within the given range
   */
  private async updateSingleEntityOccurrence(
    edit: WorkspaceEdit,
    refDoc: TextDocument,
    line: number,
    char: number,
    entityName: string,
    newParamName: string,
    insertPosition: number,
    searchRange: Range
  ): Promise<void> {
    // Look for opening parenthesis after the entity name within the search range
    let searchLine = line;
    let searchChar = char + entityName.length;
    let foundOpenParen = false;
    let openParenLine = line;
    let openParenChar = 0;

    // Search for opening parenthesis within the range
    // We need to be more careful about when to stop searching
    let foundNonWhitespaceNonParen = false;

    while (searchLine <= searchRange.end.line && !foundNonWhitespaceNonParen) {
      const lineText = refDoc.lineAt(searchLine).text;
      const searchStart = searchLine === line ? searchChar : 0;
      const searchEnd = searchLine === searchRange.end.line ? searchRange.end.character : lineText.length;

      // Skip whitespace and look for opening parenthesis
      for (let i = searchStart; i < searchEnd; i++) {
        const ch = lineText[i];
        if (/\s/.test(ch)) {
          continue; // Skip whitespace
        } else if (ch === '(') {
          foundOpenParen = true;
          openParenLine = searchLine;
          openParenChar = i;
          break;
        } else {
          // Found non-whitespace, non-parenthesis character
          // This means the entity name is not followed by parameters
          foundNonWhitespaceNonParen = true;
          break;
        }
      }

      if (foundOpenParen || foundNonWhitespaceNonParen) {
        break;
      }

      searchLine++;
      searchChar = 0;
    }

    if (foundOpenParen) {
      // Find the matching closing parenthesis within the search range
      const openParenPos = new Position(openParenLine, openParenChar);
      const { closingPosition, argumentsText } = this.findMultiLineArgumentsInRange(refDoc, openParenPos, searchRange);

      if (closingPosition) {
        // Parse existing arguments and insert new parameter
        const args = argumentsText.trim() ? ArgumentUtils.parseArguments(argumentsText) : [];
        const insertAt = Math.min(Math.max(insertPosition, 1), args.length + 1) - 1;
        args.splice(insertAt, 0, newParamName);
        const newArgs = args.join(', ');

        // Replace the arguments between the parentheses
        const replaceRange = new Range(
          new Position(openParenLine, openParenChar + 1),
          closingPosition
        );
        edit.replace(refDoc.uri, replaceRange, newArgs);
      }
    } else {
      // No parentheses found - add them with the new parameter
      const insertPos = new Position(line, char + entityName.length);
      edit.insert(refDoc.uri, insertPos, `(${newParamName})`);
    }
  }

  /**
   * Update an entity call reference for parameter reordering, handling both single-line and multi-line cases
   */
  private async updateEntityCallReferenceForReorder(
    edit: WorkspaceEdit,
    refDoc: TextDocument,
    loc: Location,
    entityNameWithoutParams: string,
    newOrder: number[]
  ): Promise<void> {
    const startLine = loc.range.start.line;
    const firstLineText = refDoc.lineAt(startLine).text;

    // Determine if this is a directive or clause and get the appropriate range
    let searchRange: Range;
    if (firstLineText.trim().startsWith(':-')) {
      // This is a directive - use directive range
      const dirRange = PredicateUtils.getDirectiveRange(refDoc, startLine);
      searchRange = new Range(new Position(dirRange.start, 0), new Position(dirRange.end, refDoc.lineAt(dirRange.end).text.length));
    } else {
      // This is a clause - use clause range
      const clauseRange = PredicateUtils.getClauseRange(refDoc, startLine);
      searchRange = new Range(new Position(clauseRange.start, 0), new Position(clauseRange.end, refDoc.lineAt(clauseRange.end).text.length));
    }

    if (firstLineText.trim().startsWith(':-')) {
      // For directives, there's typically only one entity occurrence - find and update it directly
      const base = entityNameWithoutParams;
      const rangeText = refDoc.getText(searchRange);
      const entityIdx = rangeText.indexOf(base);

      if (entityIdx >= 0) {
        // Convert the index back to line/character position
        const beforeText = rangeText.substring(0, entityIdx);
        const lineOffset = (beforeText.match(/\n/g) || []).length;
        const lastNewlineIdx = beforeText.lastIndexOf('\n');
        const charOffset = lastNewlineIdx >= 0 ? entityIdx - lastNewlineIdx - 1 : entityIdx;

        const entityLine = searchRange.start.line + lineOffset;
        const entityChar = lineOffset === 0 ? searchRange.start.character + charOffset : charOffset;

        await this.updateSingleEntityOccurrenceForReorder(
          edit,
          refDoc,
          entityLine,
          entityChar,
          base,
          newOrder,
          searchRange
        );
      }
    } else {
      // For clauses, there might be multiple entity occurrences - find and update all
      const rangeText = refDoc.getText(searchRange);
      const rangeStartPos = searchRange.start;
      const base = entityNameWithoutParams;
      const entityOccurrences: { line: number, char: number }[] = [];

      const lines = rangeText.split('\n');
      for (let lineOffset = 0; lineOffset < lines.length; lineOffset++) {
        const lineText = lines[lineOffset];
        let searchStart = 0;

        while (true) {
          const idx = lineText.indexOf(base, searchStart);
          if (idx < 0) break;

          // Check if this is a word boundary (not part of a larger identifier)
          const beforeChar = idx > 0 ? lineText[idx - 1] : ' ';
          const afterChar = idx + base.length < lineText.length ? lineText[idx + base.length] : ' ';

          if (!/\w/.test(beforeChar) && (!/\w/.test(afterChar) || afterChar === '(')) {
            entityOccurrences.push({
              line: rangeStartPos.line + lineOffset,
              char: rangeStartPos.character + (lineOffset === 0 ? idx : idx)
            });
          }

          searchStart = idx + 1;
        }
      }

      // Update each entity occurrence
      for (const occurrence of entityOccurrences) {
        await this.updateSingleEntityOccurrenceForReorder(
          edit,
          refDoc,
          occurrence.line,
          occurrence.char,
          base,
          newOrder,
          searchRange
        );
      }
    }
  }

  /**
   * Update a single entity occurrence for parameter reordering within the given range
   */
  private async updateSingleEntityOccurrenceForReorder(
    edit: WorkspaceEdit,
    refDoc: TextDocument,
    line: number,
    char: number,
    entityName: string,
    newOrder: number[],
    searchRange: Range
  ): Promise<void> {
    // Look for opening parenthesis after the entity name within the search range
    let searchLine = line;
    let searchChar = char + entityName.length;
    let foundOpenParen = false;
    let openParenLine = line;
    let openParenChar = 0;

    // Search for opening parenthesis within the range
    while (searchLine <= searchRange.end.line) {
      const lineText = refDoc.lineAt(searchLine).text;
      const searchStart = searchLine === line ? searchChar : 0;
      const searchEnd = searchLine === searchRange.end.line ? searchRange.end.character : lineText.length;

      // Skip whitespace and look for opening parenthesis
      for (let i = searchStart; i < searchEnd; i++) {
        const ch = lineText[i];
        if (/\s/.test(ch)) {
          continue; // Skip whitespace
        } else if (ch === '(') {
          foundOpenParen = true;
          openParenLine = searchLine;
          openParenChar = i;
          break;
        } else {
          // Found non-whitespace, non-parenthesis character - no parameters
          return;
        }
      }

      if (foundOpenParen) {
        break;
      }

      searchLine++;
      searchChar = 0;
    }

    if (foundOpenParen) {
      // Find the matching closing parenthesis within the search range
      const openParenPos = new Position(openParenLine, openParenChar);
      const { closingPosition, argumentsText } = this.findMultiLineArgumentsInRange(refDoc, openParenPos, searchRange);

      if (closingPosition) {
        // Parse existing arguments and reorder them
        const args = argumentsText.trim() ? ArgumentUtils.parseArguments(argumentsText) : [];
        if (args.length > 0) {
          const reorderedArgs = this.reorderArray(args, newOrder);
          const newArgs = reorderedArgs.join(', ');

          // Replace the arguments between the parentheses
          const replaceRange = new Range(
            new Position(openParenLine, openParenChar + 1),
            closingPosition
          );
          edit.replace(refDoc.uri, replaceRange, newArgs);
        }
      }
    }
    // If no parentheses found, there are no parameters to reorder
  }

  /**
   * Update an entity call reference for parameter removal, handling both single-line and multi-line cases
   */
  private async updateEntityCallReferenceForRemove(
    edit: WorkspaceEdit,
    refDoc: TextDocument,
    loc: Location,
    entityNameWithoutParams: string,
    removePosition: number
  ): Promise<void> {
    const startLine = loc.range.start.line;
    const firstLineText = refDoc.lineAt(startLine).text;

    // Determine if this is a directive or clause and get the appropriate range
    let searchRange: Range;
    if (firstLineText.trim().startsWith(':-')) {
      // This is a directive - use directive range
      const dirRange = PredicateUtils.getDirectiveRange(refDoc, startLine);
      searchRange = new Range(new Position(dirRange.start, 0), new Position(dirRange.end, refDoc.lineAt(dirRange.end).text.length));
    } else {
      // This is a clause - use clause range
      const clauseRange = PredicateUtils.getClauseRange(refDoc, startLine);
      searchRange = new Range(new Position(clauseRange.start, 0), new Position(clauseRange.end, refDoc.lineAt(clauseRange.end).text.length));
    }

    if (firstLineText.trim().startsWith(':-')) {
      // For directives, there's typically only one entity occurrence - find and update it directly
      const base = entityNameWithoutParams;
      const rangeText = refDoc.getText(searchRange);
      const entityIdx = rangeText.indexOf(base);

      if (entityIdx >= 0) {
        // Convert the index back to line/character position
        const beforeText = rangeText.substring(0, entityIdx);
        const lineOffset = (beforeText.match(/\n/g) || []).length;
        const lastNewlineIdx = beforeText.lastIndexOf('\n');
        const charOffset = lastNewlineIdx >= 0 ? entityIdx - lastNewlineIdx - 1 : entityIdx;

        const entityLine = searchRange.start.line + lineOffset;
        const entityChar = lineOffset === 0 ? searchRange.start.character + charOffset : charOffset;

        await this.updateSingleEntityOccurrenceForRemove(
          edit,
          refDoc,
          entityLine,
          entityChar,
          base,
          removePosition,
          searchRange
        );
      }
    } else {
      // For clauses, there might be multiple entity occurrences - find and update all
      const rangeText = refDoc.getText(searchRange);
      const rangeStartPos = searchRange.start;
      const base = entityNameWithoutParams;
      const entityOccurrences: { line: number, char: number }[] = [];

      const lines = rangeText.split('\n');
      for (let lineOffset = 0; lineOffset < lines.length; lineOffset++) {
        const lineText = lines[lineOffset];
        let searchStart = 0;

        while (true) {
          const idx = lineText.indexOf(base, searchStart);
          if (idx < 0) break;

          // Check if this is a word boundary (not part of a larger identifier)
          const beforeChar = idx > 0 ? lineText[idx - 1] : ' ';
          const afterChar = idx + base.length < lineText.length ? lineText[idx + base.length] : ' ';

          if (!/\w/.test(beforeChar) && (!/\w/.test(afterChar) || afterChar === '(')) {
            entityOccurrences.push({
              line: rangeStartPos.line + lineOffset,
              char: rangeStartPos.character + (lineOffset === 0 ? idx : idx)
            });
          }

          searchStart = idx + 1;
        }
      }

      // Update each entity occurrence
      for (const occurrence of entityOccurrences) {
        await this.updateSingleEntityOccurrenceForRemove(
          edit,
          refDoc,
          occurrence.line,
          occurrence.char,
          base,
          removePosition,
          searchRange
        );
      }
    }
  }

  /**
   * Update a single entity occurrence for parameter removal within the given range
   */
  private async updateSingleEntityOccurrenceForRemove(
    edit: WorkspaceEdit,
    refDoc: TextDocument,
    line: number,
    char: number,
    entityName: string,
    removePosition: number,
    searchRange: Range
  ): Promise<void> {
    // Look for opening parenthesis after the entity name within the search range
    let searchLine = line;
    let searchChar = char + entityName.length;
    let foundOpenParen = false;
    let openParenLine = line;
    let openParenChar = 0;

    // Search for opening parenthesis within the range
    while (searchLine <= searchRange.end.line) {
      const lineText = refDoc.lineAt(searchLine).text;
      const searchStart = searchLine === line ? searchChar : 0;
      const searchEnd = searchLine === searchRange.end.line ? searchRange.end.character : lineText.length;

      // Skip whitespace and look for opening parenthesis
      for (let i = searchStart; i < searchEnd; i++) {
        const ch = lineText[i];
        if (/\s/.test(ch)) {
          continue; // Skip whitespace
        } else if (ch === '(') {
          foundOpenParen = true;
          openParenLine = searchLine;
          openParenChar = i;
          break;
        } else {
          // Found non-whitespace, non-parenthesis character - no parameters
          return;
        }
      }

      if (foundOpenParen) {
        break;
      }

      searchLine++;
      searchChar = 0;
    }

    if (foundOpenParen) {
      // Find the matching closing parenthesis within the search range
      const openParenPos = new Position(openParenLine, openParenChar);
      const { closingPosition, argumentsText } = this.findMultiLineArgumentsInRange(refDoc, openParenPos, searchRange);

      if (closingPosition) {
        // Parse existing arguments and remove the specified parameter
        const args = argumentsText.trim() ? ArgumentUtils.parseArguments(argumentsText) : [];
        if (args.length > 0 && removePosition >= 1 && removePosition <= args.length) {
          const idx = removePosition - 1; // Convert to 0-based index
          args.splice(idx, 1);

          if (args.length === 0) {
            // No arguments left - remove the parentheses entirely
            const replaceRange = new Range(
              new Position(openParenLine, openParenChar),
              new Position(closingPosition.line, closingPosition.character + 1)
            );
            edit.replace(refDoc.uri, replaceRange, '');
          } else {
            // Replace with remaining arguments
            const newArgs = args.join(', ');
            const replaceRange = new Range(
              new Position(openParenLine, openParenChar + 1),
              closingPosition
            );
            edit.replace(refDoc.uri, replaceRange, newArgs);
          }
        }
      }
    }
    // If no parentheses found, there are no parameters to remove
  }

  /**
   * Find the closing parenthesis and extract arguments text for a multi-line term within a specific range
   */
  private findMultiLineArgumentsInRange(document: TextDocument, openParenPos: Position, searchRange: Range): { closingPosition: Position | null, argumentsText: string } {
    let currentLine = openParenPos.line;
    let currentChar = openParenPos.character + 1; // Start after opening parenthesis
    let depth = 1;
    let argumentsText = '';
    let inDoubleQuotes = false;
    let inSingleQuotes = false;
    let escapeNext = false;

    while (currentLine <= searchRange.end.line && depth > 0) {
      const lineText = document.lineAt(currentLine).text;
      const startChar = currentLine === openParenPos.line ? currentChar : 0;
      const endChar = currentLine === searchRange.end.line ? Math.min(searchRange.end.character, lineText.length) : lineText.length;

      for (let i = startChar; i < endChar && depth > 0; i++) {
        const ch = lineText[i];

        if (escapeNext) {
          escapeNext = false;
          argumentsText += ch;
          continue;
        }

        if (ch === '\\') {
          escapeNext = true;
          argumentsText += ch;
          continue;
        }

        if (ch === '"' && !inSingleQuotes) {
          inDoubleQuotes = !inDoubleQuotes;
          argumentsText += ch;
          continue;
        }

        if (ch === "'" && !inDoubleQuotes) {
          inSingleQuotes = !inSingleQuotes;
          argumentsText += ch;
          continue;
        }

        if (inDoubleQuotes || inSingleQuotes) {
          argumentsText += ch;
          continue;
        }

        if (ch === '(') {
          depth++;
          argumentsText += ch;
        } else if (ch === ')') {
          depth--;
          if (depth === 0) {
            // Found the closing parenthesis
            return {
              closingPosition: new Position(currentLine, i),
              argumentsText: argumentsText
            };
          } else {
            argumentsText += ch;
          }
        } else {
          argumentsText += ch;
        }
      }

      // If we haven't found the closing paren and there are more lines in range, add a space and continue
      if (depth > 0 && currentLine < searchRange.end.line) {
        currentLine++;
        currentChar = 0;
        argumentsText += ' '; // Add space between lines
      } else {
        break;
      }
    }

    // Didn't find matching closing parenthesis within range
    return { closingPosition: null, argumentsText: '' };
  }

  /**
   * Find the closing parenthesis and extract arguments text for a multi-line term
   */
  private findMultiLineArguments(document: TextDocument, openParenPos: Position): { closingPosition: Position | null, argumentsText: string } {
    let currentLine = openParenPos.line;
    let currentChar = openParenPos.character + 1; // Start after opening parenthesis
    let depth = 1;
    let argumentsText = '';
    let inDoubleQuotes = false;
    let inSingleQuotes = false;
    let escapeNext = false;

    while (currentLine < document.lineCount && depth > 0) {
      const lineText = document.lineAt(currentLine).text;
      const startChar = currentLine === openParenPos.line ? currentChar : 0;

      for (let i = startChar; i < lineText.length && depth > 0; i++) {
        const ch = lineText[i];

        if (escapeNext) {
          escapeNext = false;
          argumentsText += ch;
          continue;
        }

        if (ch === '\\') {
          escapeNext = true;
          argumentsText += ch;
          continue;
        }

        if (ch === '"' && !inSingleQuotes) {
          inDoubleQuotes = !inDoubleQuotes;
          argumentsText += ch;
          continue;
        }

        if (ch === "'" && !inDoubleQuotes) {
          inSingleQuotes = !inSingleQuotes;
          argumentsText += ch;
          continue;
        }

        if (inDoubleQuotes || inSingleQuotes) {
          argumentsText += ch;
          continue;
        }

        if (ch === '(') {
          depth++;
          argumentsText += ch;
        } else if (ch === ')') {
          depth--;
          if (depth === 0) {
            // Found the closing parenthesis
            return {
              closingPosition: new Position(currentLine, i),
              argumentsText: argumentsText
            };
          } else {
            argumentsText += ch;
          }
        } else {
          argumentsText += ch;
        }
      }

      // If we haven't found the closing paren and there are more lines, add a space and continue
      if (depth > 0) {
        currentLine++;
        currentChar = 0;
        if (currentLine < document.lineCount) {
          argumentsText += ' '; // Add space between lines
        }
      }
    }

    // Didn't find matching closing parenthesis
    return { closingPosition: null, argumentsText: '' };
  }

  public async addParameter(document: TextDocument, range: Range): Promise<void> {
    try {
      const info = await this.detectEntityOpeningDirective(document, range);
      if (!info || (info.type !== 'object' && info.type !== 'category')) {
        window.showWarningMessage('Place the selection on an object/category opening directive (entity name).');
        return;
      }
      this.logger.debug(`Original info.name: "${info.name}"`);
      const { base, params } = this.parseEntityNameAndParams(info.name);
      this.logger.debug(`Parsed entity: base="${base}", params=[${params.map(p => `"${p}"`).join(', ')}]`);

      const newName = await this.promptForParameterName();
      if (!newName) return;
      this.logger.debug(`New parameter name: "${newName}"`);

      let pos = 1;
      if (params.length > 0) {
        const p = await this.promptForArgumentPosition(params.length);
        if (p === undefined) return;
        pos = p;
      }
      this.logger.debug(`Insert position: ${pos}`);

      const newParams = [...params];
      newParams.splice(Math.min(Math.max(pos,1), newParams.length+1)-1, 0, newName);
      this.logger.debug(`New params: [${newParams.map(p => `"${p}"`).join(', ')}]`);

      const newIdentifier = this.buildEntityIdentifier(base, newParams);
      this.logger.debug(`Built identifier: "${newIdentifier}"`);

      const edit = new WorkspaceEdit();
      // Replace opening directive (single or multi-line) using full directive range
      const dirRange = PredicateUtils.getDirectiveRange(document, info.line);
      const fullDirRange = new Range(
        new Position(dirRange.start, 0),
        new Position(dirRange.end, document.lineAt(dirRange.end).text.length)
      );
      const dirText = document.getText(fullDirRange);
      const updatedDirText = this.replaceEntityOpeningIdentifierInDirectiveText(dirText, info.type, newIdentifier);
      edit.replace(document.uri, fullDirRange, updatedDirText);

      // Update info/1 parnames/parameters single-line entries within entity block
      const endLine = SymbolUtils.findEndEntityDirectivePosition(
        document,
        info.line,
        info.type === 'object' ? SymbolRegexes.endObject : (info.type === 'category' ? SymbolRegexes.endCategory : SymbolRegexes.endProtocol)
      );

      // Track if we found any existing parnames/parameters
      let foundParnames = false;
      let foundParameters = false;
      let infoDirectiveRange: { start: number, end: number } | null = null;

      for (let i = info.line + 1; i <= endLine && i < document.lineCount; i++) {
        const lt = document.lineAt(i).text;

        // Check if this is an info/1 directive
        if (lt.match(/^(\s*):-\s*info\(\s*\[/)) {
          const dirRange = PredicateUtils.getDirectiveRange(document, i);
          infoDirectiveRange = dirRange;
          // Continue processing within this directive
        }

        // Multi-line parnames is [ ...
        const mlParnames = lt.match(/^(\s*)parnames\s+is\s+\[([^\]]*)?$/);
        if (mlParnames) {
          foundParnames = true;
          const { edits, endLineNum } = this.constructMultiLineParnames(document, i, newName, pos);
          for (const te of edits) edit.replace(document.uri, te.range, te.newText);
          i = endLineNum;
          break;
        }

        // Multi-line parameters is [ ... (reuse arguments handler)
        const mlParameters = lt.match(/^(\s*)parameters\s+is\s+\[([^\]]*)?$/);
        if (mlParameters) {
          foundParameters = true;
          const { edits, endLineNum } = this.constructMultiLineParameters(document, i, newName, pos);
          for (const te of edits) edit.replace(document.uri, te.range, te.newText);
          i = endLineNum;
          break;
        }

        // Single-line updates
        let updated = this.updateParInfoLineForAdd(lt, 'parnames', newName, pos);
        if (updated !== lt) {
          foundParnames = true;
          edit.replace(document.uri, document.lineAt(i).range, updated);
          break;
        }

        updated = this.updateParInfoLineForAdd(updated, 'parameters', newName, pos);
        if (updated !== lt) {
          foundParameters = true;
          edit.replace(document.uri, document.lineAt(i).range, updated);
          break;
        }
      }

      // If we found an info/1 directive but no parnames or parameters, add parnames line
      if (infoDirectiveRange && !foundParnames && !foundParameters && params.length === 0) {
        this.addParnamesLineToInfoDirective(document, edit, infoDirectiveRange, newName);
      }

      // Update references across workspace: insert the new parameter name at each call site
      try {
        const token = { isCancellationRequested: false } as CancellationToken;
        // Compute a stable position on the entity name in the opening line
        const openingLineText = document.lineAt(info.line).text;
        const nameIdx = openingLineText.indexOf(info.nameWithoutParams);
        if (nameIdx >= 0) {
          const entityPos = new Position(info.line, nameIdx);
          const references = await this.referenceProvider.provideReferences(document, entityPos, { includeDeclaration: false }, token) || [];

          // Group by file
          const byFile = new Map<string, Location[]>();
          for (const loc of references) {
            const key = loc.uri.toString();
            if (!byFile.has(key)) byFile.set(key, []);
            byFile.get(key)!.push(loc);
          }

          for (const [uriStr, locs] of byFile) {
            const uri = Uri.parse(uriStr);
            const refDoc = await workspace.openTextDocument(uri);
            for (const loc of locs) {
              await this.updateEntityCallReference(edit, refDoc, loc, info.nameWithoutParams, newName, pos);
            }
          }
        }
      } catch (refErr) {
        this.logger.warn(`Reference updates for addParameter skipped/partial due to: ${refErr}`);
      }

      await workspace.applyEdit(edit);
    } catch (e) {
      this.logger.error(`Error adding parameter: ${e}`);
      window.showErrorMessage(`Error adding parameter: ${e}`);
    }
  }

  public async reorderParameters(document: TextDocument, range: Range): Promise<void> {
    try {
      const info = await this.detectEntityOpeningDirective(document, range);
      if (!info || (info.type !== 'object' && info.type !== 'category')) return;
      const { params } = this.parseEntityNameAndParams(info.name);
      if (params.length < 2) return;
      let newOrder: number[];
      if (params.length === 2) {
        newOrder = [2,1];
      } else {
        const order = await this.promptForArgumentOrder(params.length);
        if (!order) return;
        newOrder = order.map(x => parseInt(`${x}`,10));
      }

      const edit = new WorkspaceEdit();

      // Use the shared method for full operation
      await this.createReorderParametersEdits(edit, document, info, newOrder);

      await workspace.applyEdit(edit);
    } catch (e) {
      this.logger.error(`Error reordering parameters: ${e}`);
      window.showErrorMessage(`Error reordering parameters: ${e}`);
    }
  }

  public async removeParameter(document: TextDocument, range: Range): Promise<void> {
    try {
      const info = await this.detectEntityOpeningDirective(document, range);
      if (!info || (info.type !== 'object' && info.type !== 'category')) return;
      const { params } = this.parseEntityNameAndParams(info.name);
      if (params.length < 1) return;
      let pos = 1;
      if (params.length > 1) {
        const p = await this.promptForArgumentPositionToRemove(params.length);
        if (p === undefined) return;
        pos = p;
      }

      const edit = new WorkspaceEdit();

      // Use the shared method for full operation
      await this.createRemoveParameterEdits(edit, document, info, pos);

      await workspace.applyEdit(edit);
    } catch (e) {
      this.logger.error(`Error removing parameter: ${e}`);
      window.showErrorMessage(`Error removing parameter: ${e}`);
    }
  }

}
