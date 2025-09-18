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
      } else {
        // Selection doesn't contain include directive - provide extract actions
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

    // Check for cancellation before potentially expensive predicate call analysis
    if (token.isCancellationRequested) {
      return actions;
    }

    // Check if we're on a predicate call for add argument refactoring
    const position = range instanceof Selection ? range.active : range.start;
    const indicator = await this.isPredicateCall(document, position);
    if (indicator) {
      const addArgumentAction = new CodeAction(
        "Add argument to predicate/non-terminal",
        CodeActionKind.Refactor
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
          CodeActionKind.Refactor
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
          CodeActionKind.Refactor
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
   * Check if the current position is on a predicate call and return the indicator
   * @returns The predicate/non-terminal indicator if valid for refactoring, null otherwise
   */
  private async isPredicateCall(document: TextDocument, position: Position): Promise<string | null> {
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
    const includePattern = /^\s*:-\s*include\s*\(/;
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
    const includePattern = /^\s*:-\s*include\s*\(\s*['"]([^'"()]*)['"]\s*\)/;
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
   * Reorder arguments of predicate/non-terminal refactoring operation
   */
  public async reorderArguments(document: TextDocument, position: Position, indicator: string): Promise<void> {
    this.logger.debug(`=== reorderArguments method called ===`);
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

      if (currentArity < 2) {
        window.showErrorMessage("Cannot reorder arguments: predicate/non-terminal must have at least 2 arguments.");
        return;
      }

      // Step 2: Ask user for new argument order
      const newOrder = await this.promptForArgumentOrder(currentArity);
      if (!newOrder) {
        return; // User cancelled
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
          // Handle predicate call/definition - remove the argument
          const edits = this.createArgumentRemovalEdit(doc, location, argumentPosition, currentArity, isNonTerminal, predicateName);
          textEdits.push(...edits);
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
          // Handle predicate call/definition - add the argument
          const edits = this.createArgumentAdditionEdit(doc, location, argumentName, argumentPosition, currentArity, isNonTerminal, predicateName);
          textEdits.push(...edits);
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
          // Handle predicate call/definition - reorder the arguments
          const edits = this.createArgumentReorderEdit(doc, location, newOrder, isNonTerminal, predicateName);
          textEdits.push(...edits);
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
    }

    return null;
  }

  /**
   * Get the range (start and end line) of a directive starting at the given line
   */
  private getDirectiveRange(doc: TextDocument, startLine: number): { start: number; end: number } {
    const totalLines = doc.lineCount;
    let endLine = startLine;

    // Find the end of the directive by looking for the closing ).
    // Only match when ). is followed by whitespace and/or line comment
    for (let lineNum = startLine; lineNum < totalLines; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;
      // Match ). followed by optional whitespace and optional line comment
      if (/\)\.(\s*(%.*)?)?$/.test(lineText)) {
        endLine = lineNum;
        break;
      }
    }

    return { start: startLine, end: endLine };
  }

  /**
   * Process a directive range and create edits for indicator/callable form updates
   */
  private processDirectiveRange(
    doc: TextDocument,
    range: { start: number; end: number },
    predicateName: string,
    currentIndicator: string,
    newIndicator: string,
    argumentName: string,
    argumentPosition: number,
    currentArity: number,
    isNonTerminal: boolean,
    directiveType: string
  ): TextEdit[] {
    const edits: TextEdit[] = [];

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
      if (trimmedLine.includes(predicateName + '(')) {
        this.logger.debug(`Found callable form "${predicateName}(" at line ${lineNum + 1}`);
        if (directiveType === 'mode') {
          updatedLine = this.updateModeDirective(updatedLine, predicateName, argumentName, argumentPosition, currentArity);
          hasChanges = true;
        } else if (directiveType === 'meta_predicate' || directiveType === 'meta_non_terminal') {
          updatedLine = this.updateMetaDirective(updatedLine, predicateName, argumentPosition, directiveType);
          hasChanges = true;
        }
      }

      // Special handling for info directive argnames/arguments
      if (directiveType === 'info') {
        const newLineNum = this.updateInfoDirectiveArgumentsForAdding(
          doc, lineNum, updatedLine, argumentName, argumentPosition, edits
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
   * Process a directive range and create edits for reordering arguments
   */
  private processDirectiveRangeForReorder(
    doc: TextDocument,
    range: { start: number; end: number },
    predicateName: string,
    currentIndicator: string,
    newOrder: number[],
    currentArity: number,
    isNonTerminal: boolean,
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
          updatedLine = this.updateModeDirectiveForReorder(updatedLine, predicateName, newOrder);
          hasChanges = true;
        } else if (directiveType === 'meta_predicate' || directiveType === 'meta_non_terminal') {
          updatedLine = this.updateMetaDirectiveForReorder(updatedLine, predicateName, newOrder, directiveType);
          hasChanges = true;
        }
      }

      // Special handling for info directive argnames/arguments
      if (directiveType === 'info') {
        const newLineNum = this.updateInfoDirectiveArgumentsForReorder(
          doc, lineNum, updatedLine, newOrder, edits
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
          updatedLine = this.updateModeDirectiveForRemoval(updatedLine, predicateName, argumentPosition, currentArity);
          hasChanges = true;
        } else if (directiveType === 'meta_predicate' || directiveType === 'meta_non_terminal') {
          updatedLine = this.updateMetaDirectiveForRemoval(updatedLine, predicateName, argumentPosition, currentArity, isNonTerminal);
          hasChanges = true;
        }
      }

      // Special handling for info directive argnames/arguments
      if (directiveType === 'info') {
        const newLineNum = this.updateInfoDirectiveArgumentsForRemoval(
          doc, lineNum, updatedLine, argumentPosition, currentArity, edits
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
    const scopeRange = this.getDirectiveRange(doc, scopeLine);
    this.logger.debug(`Scope directive range: lines ${scopeRange.start + 1}-${scopeRange.end + 1}`);

    const scopeEdits = this.processDirectiveRange(
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
          const range = this.getDirectiveRange(doc, lineNum);
          this.logger.debug(`Directive range: lines ${range.start + 1}-${range.end + 1}`);

          // Check if this directive actually references our predicate/non-terminal
          let containsOurPredicate = false;
          for (let checkLine = range.start; checkLine <= range.end; checkLine++) {
            const checkText = doc.lineAt(checkLine).text;
            if (checkText.includes(currentIndicator) || checkText.includes(predicateName + '(')) {
              containsOurPredicate = true;
              break;
            }
          }

          if (containsOurPredicate) {
            this.logger.debug(`Directive contains our predicate, processing range`);
            // Process the entire directive range
            const directiveEdits = this.processDirectiveRange(
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
   * Update info directive arguments (argnames and arguments lists)
   */
  private updateInfoDirectiveArgumentsForAdding(
    doc: TextDocument,
    lineNum: number,
    lineText: string,
    argumentName: string,
    argumentPosition: number,
    edits: TextEdit[]
  ): number {
    let updatedLine = lineText;

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

    return lineNum; // Return current line number
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

    // Find all consecutive clauses of the same predicate/non-terminal
    let endLine = this.findEndOfConsecutiveClauses(doc, startLine, predicateName, isNonTerminal);

    this.logger.debug(`Processing consecutive clauses from line ${startLine + 1} to ${endLine + 1} for ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName}`);

    // Process each line in all consecutive clauses
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if this line contains a clause head (predicate definition)
      const clauseHeadMatch = this.findClauseHead(lineText, predicateName, isNonTerminal);

      if (clauseHeadMatch) {
        // This line contains a clause head - only update if arity matches exactly
        const headArity = this.countArguments(clauseHeadMatch.arguments);
        this.logger.debug(`Found clause head with arity ${headArity}, target arity: ${currentArity} at line ${lineNum + 1}`);

        if (headArity === currentArity) {
          // Update the clause head
          this.logger.debug(`Updating clause head: ${clauseHeadMatch.fullMatch}`);
          const headEdits = this.updateClauseHead(lineText, lineNum, clauseHeadMatch, argumentName, argumentPosition, isNonTerminal);
          edits.push(...headEdits);
        } else {
          this.logger.debug(`Skipping clause head with different arity (${headArity} vs ${currentArity})`);
        }

        // Always check for calls in the clause body (after :- or -->)
        const bodyEdits = this.findAndAddPredicateCallsInClauseBody(lineText, lineNum, predicateName, argumentName, argumentPosition, isNonTerminal);
        edits.push(...bodyEdits);
      } else {
        // No clause head found - update all predicate calls in the line
        const lineEdits = this.findAndAddPredicateCallsInLine(lineText, lineNum, predicateName, argumentName, argumentPosition, isNonTerminal);
        edits.push(...lineEdits);
      }
    }

    return edits;
  }

  /**
   * Find clause head in a line
   */
  private findClauseHead(lineText: string, predicateName: string, isNonTerminal: boolean): { fullMatch: string; arguments: string; startIndex: number; endIndex: number } | null {
    const trimmedLine = lineText.trim();

    // Skip directive lines
    if (trimmedLine.startsWith(':-')) {
      return null;
    }

    // For non-terminals, look for predicate_name(...) --> or predicate_name(...) :-
    // For predicates, look for predicate_name(...) :-
    const clausePattern = isNonTerminal
      ? new RegExp(`^\\s*${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([^)]*)\\)\\s*(?:-->|:-)`, 'g')
      : new RegExp(`^\\s*${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([^)]*)\\)\\s*:-`, 'g');

    const match = clausePattern.exec(lineText);
    if (match) {
      return {
        fullMatch: match[0],
        arguments: match[1],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      };
    }

    return null;
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
  private updateClauseHead(
    lineText: string,
    lineNum: number,
    clauseHead: { fullMatch: string; arguments: string; startIndex: number; endIndex: number },
    argumentName: string,
    argumentPosition: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    // Parse existing arguments
    const existingArgs = clauseHead.arguments.trim() === '' ? [] :
      ArgumentUtils.parseArguments(clauseHead.arguments);

    // Insert new argument at specified position
    const newArgs = [...existingArgs];
    newArgs.splice(argumentPosition - 1, 0, argumentName);

    // Create the updated clause head
    const predicateNameMatch = clauseHead.fullMatch.match(/^(\s*)(\w+)(\s*\()([^)]*)(\)\s*(?:-->|:-).*)$/);
    if (predicateNameMatch) {
      const [, leadingSpace, predName, openParen, , closingAndRest] = predicateNameMatch;
      const newClauseHead = `${leadingSpace}${predName}${openParen}${newArgs.join(', ')}${closingAndRest}`;

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
   * Find and add predicate calls in clause body (after :- or -->)
   */
  private findAndAddPredicateCallsInClauseBody(
    lineText: string,
    lineNum: number,
    predicateName: string,
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
    const bodyEdits = this.findAndAddPredicateCallsInLineWithArityCheck(bodyText, lineNum, predicateName, argumentName, argumentPosition, isNonTerminal);

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
   * Find and add predicate calls in a line
   */
  private findAndAddPredicateCallsInLine(
    lineText: string,
    lineNum: number,
    predicateName: string,
    argumentName: string,
    argumentPosition: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndAddPredicateCallsInLine: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} in line: "${lineText}"`);
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
   * Find and add predicate calls in a line with arity checking
   */
  private findAndAddPredicateCallsInLineWithArityCheck(
    lineText: string,
    lineNum: number,
    predicateName: string,
    argumentName: string,
    argumentPosition: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndAddPredicateCallsInLineWithArityCheck: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} in line: "${lineText}"`);
    const edits: TextEdit[] = [];
    const targetArity = argumentPosition; // After adding, the arity will be argumentPosition (since we're adding at that position)

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

            // Only update if current arity matches target arity - 1 (since we're adding one argument)
            if (currentArity === targetArity - 1) {
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
              this.logger.debug(`Skipping non-terminal with different arity (${currentArity} vs expected ${targetArity - 1})`);
            }
          }
        } else {
          // No arguments: predicateName - only update if target arity is 1
          if (targetArity === 1) {
            edits.push(TextEdit.insert(
              new Position(lineNum, nameEndPos),
              `(${argumentName})`
            ));
            this.logger.debug(`Added argument to non-terminal without args (target arity 1): "(${argumentName})"`);
          } else {
            this.logger.debug(`Skipping non-terminal without args (target arity ${targetArity} != 1)`);
          }
        }
      }

    } else {
      // Handle predicate facts: predicateName.
      const factPattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\.`, 'g');
      let factMatch: RegExpExecArray | null;
      while ((factMatch = factPattern.exec(lineText)) !== null) {
        // Only update facts if target arity is 1
        if (targetArity === 1) {
          this.logger.debug(`Found fact at line ${lineNum + 1}, column ${factMatch.index}: ${predicateName}`);
          const insertPos = factMatch.index + predicateName.length;
          edits.push(TextEdit.insert(
            new Position(lineNum, insertPos),
            `(${argumentName})`
          ));
        } else {
          this.logger.debug(`Skipping fact with target arity ${targetArity} != 1`);
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

            // Only update if current arity matches target arity - 1 (since we're adding one argument)
            if (currentArity === targetArity - 1) {
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
              this.logger.debug(`Skipping predicate call with different arity (${currentArity} vs expected ${targetArity - 1})`);
            }
          }
        }
      }
    }

    return edits;
  }

  /**
   * Find and reorder predicate calls in a line with arity checking
   */
  private findAndReorderPredicateCallsInLineWithArityCheck(
    lineText: string,
    lineNum: number,
    predicateName: string,
    newOrder: number[],
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndReorderPredicateCallsInLineWithArityCheck: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} in line: "${lineText}"`);
    const edits: TextEdit[] = [];
    const targetArity = newOrder.length;

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

            // Only update if current arity matches target arity
            if (currentArity === targetArity) {
              // Reorder arguments according to newOrder
              const reorderedArgs = newOrder.map(pos => args[pos - 1]);
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
              const reorderedArgs = newOrder.map(pos => args[pos - 1]);
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
   * Find and remove predicate calls in a line with arity checking
   */
  private findAndRemovePredicateCallsInLineWithArityCheck(
    lineText: string,
    lineNum: number,
    predicateName: string,
    argumentPosition: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndRemovePredicateCallsInLineWithArityCheck: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} in line: "${lineText}"`);
    const edits: TextEdit[] = [];

    // We need to determine the target arity (before removal)
    // This should be passed from the calling context, but for now we need to infer it
    // The target arity is the arity of the predicate we're removing an argument from
    // We'll get this from the clause head or use a reasonable assumption

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

            // Only update if current arity has the argument position we want to remove
            // and the argument position is valid
            if (currentArity >= argumentPosition && argumentPosition > 0) {
              // Remove argument at specified position
              const newArgs = [...args];
              newArgs.splice(argumentPosition - 1, 1);
              const newArgsText = newArgs.join(', ');

              edits.push(TextEdit.replace(
                new Range(
                  new Position(lineNum, openParenPos + 1),
                  new Position(lineNum, closeParenPos)
                ),
                newArgsText
              ));
              this.logger.debug(`Removed argument ${argumentPosition} from non-terminal with arity ${currentArity}: "${newArgsText}"`);
            } else {
              this.logger.debug(`Skipping non-terminal with arity ${currentArity} (argument position ${argumentPosition} not valid)`);
            }
          }
        } else {
          this.logger.debug(`Skipping non-terminal without args (cannot remove from arity 0)`);
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

            // Only update if current arity has the argument position we want to remove
            // and the argument position is valid
            if (currentArity >= argumentPosition && argumentPosition > 0) {
              this.logger.debug(`Found predicate call at line ${lineNum + 1}, column ${startPos}: ${predicateName}(...) with arity ${currentArity}`);

              // Remove argument at specified position
              const newArgs = [...args];
              newArgs.splice(argumentPosition - 1, 1);
              const newArgsText = newArgs.join(', ');

              edits.push(TextEdit.replace(
                new Range(
                  new Position(lineNum, openParenPos + 1),
                  new Position(lineNum, closeParenPos)
                ),
                newArgsText
              ));
            } else {
              this.logger.debug(`Skipping predicate call with arity ${currentArity} (argument position ${argumentPosition} not valid)`);
            }
          }
        }
      }
    }

    return edits;
  }

  /**
   * Find and remove predicate calls in a line with exact arity checking
   */
  private findAndRemovePredicateCallsInLineWithExactArity(
    lineText: string,
    lineNum: number,
    predicateName: string,
    argumentPosition: number,
    targetArity: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndRemovePredicateCallsInLineWithExactArity: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} in line: "${lineText}", target arity: ${targetArity}`);
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

            // Only update if current arity matches target arity exactly
            if (currentArity === targetArity) {
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
                this.logger.debug(`Removed all arguments and parentheses from non-terminal with exact arity ${currentArity}`);
              } else {
                const newArgsText = newArgs.join(', ');
                edits.push(TextEdit.replace(
                  new Range(
                    new Position(lineNum, openParenPos + 1),
                    new Position(lineNum, closeParenPos)
                  ),
                  newArgsText
                ));
                this.logger.debug(`Removed argument ${argumentPosition} from non-terminal with exact arity ${currentArity}: "${newArgsText}"`);
              }
            } else {
              this.logger.debug(`Skipping non-terminal with different arity (${currentArity} vs target ${targetArity})`);
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

            // Only update if current arity matches target arity exactly
            if (currentArity === targetArity) {
              this.logger.debug(`Found predicate call at line ${lineNum + 1}, column ${startPos}: ${predicateName}(...) with exact arity ${currentArity}`);

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
                this.logger.debug(`Removed all arguments and parentheses from predicate call with exact arity ${currentArity}`);
              } else {
                const newArgsText = newArgs.join(', ');
                edits.push(TextEdit.replace(
                  new Range(
                    new Position(lineNum, openParenPos + 1),
                    new Position(lineNum, closeParenPos)
                  ),
                  newArgsText
                ));
                this.logger.debug(`Removed argument ${argumentPosition} from predicate call with exact arity ${currentArity}: "${newArgsText}"`);
              }
            } else {
              this.logger.debug(`Skipping predicate call with different arity (${currentArity} vs target ${targetArity})`);
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
  private updateClauseHeadForReorder(
    lineText: string,
    lineNum: number,
    clauseHead: { fullMatch: string; arguments: string; startIndex: number; endIndex: number },
    newOrder: number[],
    isNonTerminal: boolean
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    // Parse existing arguments
    const existingArgs = clauseHead.arguments.trim() === '' ? [] :
      ArgumentUtils.parseArguments(clauseHead.arguments);

    // Reorder arguments according to newOrder
    const reorderedArgs = newOrder.map(pos => existingArgs[pos - 1]);

    // Create the updated clause head
    const predicateNameMatch = clauseHead.fullMatch.match(/^(\s*)(\w+)(\s*\()([^)]*)(\)\s*(?:-->|:-).*)$/);
    if (predicateNameMatch) {
      const [, leadingSpace, predName, openParen, , closingAndRest] = predicateNameMatch;
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
  private updateClauseHeadForRemoval(
    lineText: string,
    lineNum: number,
    clauseHead: { fullMatch: string; arguments: string; startIndex: number; endIndex: number },
    argumentPosition: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    // Parse existing arguments
    const existingArgs = clauseHead.arguments.trim() === '' ? [] :
      ArgumentUtils.parseArguments(clauseHead.arguments);

    // Remove argument at specified position
    const newArgs = [...existingArgs];
    newArgs.splice(argumentPosition - 1, 1);

    // Create the updated clause head
    const predicateNameMatch = clauseHead.fullMatch.match(/^(\s*)(\w+)(\s*\()([^)]*)(\)\s*(?:-->|:-).*)$/);
    if (predicateNameMatch) {
      const [, leadingSpace, predName, openParen, , closingAndRest] = predicateNameMatch;

      // If no arguments remain, remove parentheses entirely
      let newClauseHead: string;
      if (newArgs.length === 0) {
        // Extract the part after the closing parenthesis (e.g., " :- body" or " --> body")
        const afterParenMatch = closingAndRest.match(/^\)\s*((?:-->|:-).*)$/);
        const afterParen = afterParenMatch ? afterParenMatch[1] : closingAndRest.replace(/^\)\s*/, '');
        newClauseHead = `${leadingSpace}${predName} ${afterParen}`;
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
   * Find and reorder predicate calls in clause body (after :- or -->)
   */
  private findAndReorderPredicateCallsInClauseBody(
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
    const bodyEdits = this.findAndReorderPredicateCallsInLineWithArityCheck(bodyText, lineNum, predicateName, newOrder, isNonTerminal);

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
   * Find and remove predicate calls in clause body (after :- or -->) with exact arity checking
   */
  private findAndRemovePredicateCallsInClauseBodyWithArity(
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
    const bodyEdits = this.findAndRemovePredicateCallsInLineWithExactArity(bodyText, lineNum, predicateName, argumentPosition, targetArity, isNonTerminal);

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
   * Find and remove predicate calls in clause body (after :- or -->)
   */
  private findAndRemovePredicateCallsInClauseBody(
    lineText: string,
    lineNum: number,
    predicateName: string,
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
    const bodyEdits = this.findAndRemovePredicateCallsInLineWithArityCheck(bodyText, lineNum, predicateName, argumentPosition, isNonTerminal);

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
   * Update info directive arguments for reordering
   */
  private updateInfoDirectiveArgumentsForReorder(
    doc: TextDocument,
    lineNum: number,
    lineText: string,
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
   * Update mode directive for reordering
   */
  private updateModeDirectiveForReorder(
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
  private updateMetaDirectiveForReorder(
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
  private createArgumentReorderEdit(
    doc: TextDocument,
    location: { uri: Uri; range: Range },
    newOrder: number[],
    isNonTerminal: boolean,
    predicateName: string
  ): TextEdit[] {
    this.logger.debug(`createArgumentReorderEdit: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} at line ${location.range.start.line + 1}`);
    const edits: TextEdit[] = [];
    const startLine = location.range.start.line;

    // Find all consecutive clauses of the same predicate/non-terminal
    let endLine = this.findEndOfConsecutiveClauses(doc, startLine, predicateName, isNonTerminal);

    this.logger.debug(`Processing consecutive clauses from line ${startLine + 1} to ${endLine + 1} for ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName}`);
    const currentArity = newOrder.length;

    // Process each line in all consecutive clauses
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if this line contains a clause head (predicate definition)
      const clauseHeadMatch = this.findClauseHead(lineText, predicateName, isNonTerminal);

      if (clauseHeadMatch) {
        // This line contains a clause head - only update if arity matches exactly
        const headArity = this.countArguments(clauseHeadMatch.arguments);
        this.logger.debug(`Found clause head with arity ${headArity}, target arity: ${currentArity} at line ${lineNum + 1}`);

        if (headArity === currentArity) {
          // Update the clause head
          this.logger.debug(`Updating clause head: ${clauseHeadMatch.fullMatch}`);
          const headEdits = this.updateClauseHeadForReorder(lineText, lineNum, clauseHeadMatch, newOrder, isNonTerminal);
          edits.push(...headEdits);
        } else {
          this.logger.debug(`Skipping clause head with different arity (${headArity} vs ${currentArity})`);
        }

        // Always check for calls in the clause body (after :- or -->)
        const bodyEdits = this.findAndReorderPredicateCallsInClauseBody(lineText, lineNum, predicateName, newOrder, isNonTerminal);
        edits.push(...bodyEdits);
      } else {
        // No clause head found - update all predicate calls in the line
        const lineEdits = this.findAndReorderPredicateCallsInLine(lineText, lineNum, predicateName, newOrder, isNonTerminal);
        edits.push(...lineEdits);
      }
    }

    return edits;
  }

  /**
   * Create edit for removing argument from a predicate call or definition
   */
  private createArgumentRemovalEdit(
    doc: TextDocument,
    location: { uri: Uri; range: Range },
    argumentPosition: number,
    targetArity: number,
    isNonTerminal: boolean,
    predicateName: string
  ): TextEdit[] {
    this.logger.debug(`createArgumentRemovalEdit: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} at line ${location.range.start.line + 1}, removing position ${argumentPosition}`);
    const edits: TextEdit[] = [];
    const startLine = location.range.start.line;

    // Find all consecutive clauses of the same predicate/non-terminal
    let endLine = this.findEndOfConsecutiveClauses(doc, startLine, predicateName, isNonTerminal);

    this.logger.debug(`Processing consecutive clauses from line ${startLine + 1} to ${endLine + 1} for ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName}`);

    // Process each line in all consecutive clauses
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if this line contains a clause head (predicate definition)
      const clauseHeadMatch = this.findClauseHead(lineText, predicateName, isNonTerminal);

      if (clauseHeadMatch) {
        // This line contains a clause head - only update if arity matches exactly
        const headArity = this.countArguments(clauseHeadMatch.arguments);
        // For removal, the current arity is headArity, target arity is headArity - 1
        this.logger.debug(`Found clause head with arity ${headArity} at line ${lineNum + 1}`);

        if (headArity > 0) {
          // Update the clause head (remove argument)
          this.logger.debug(`Updating clause head: ${clauseHeadMatch.fullMatch}`);
          const headEdits = this.updateClauseHeadForRemoval(lineText, lineNum, clauseHeadMatch, argumentPosition, isNonTerminal);
          edits.push(...headEdits);
        } else {
          this.logger.debug(`Skipping clause head with no arguments`);
        }

        // Always check for calls in the clause body (after :- or -->)
        // For remove operations, we use the target arity (before removal)
        const bodyEdits = this.findAndRemovePredicateCallsInClauseBodyWithArity(lineText, lineNum, predicateName, argumentPosition, targetArity, isNonTerminal);
        edits.push(...bodyEdits);
      } else {
        // No clause head found - this means we're processing calls/references
        // Use the target arity from the method parameter (determined from predicate indicator)
        const lineEdits = this.findAndRemovePredicateCallsInLineWithExactArity(lineText, lineNum, predicateName, argumentPosition, targetArity, isNonTerminal);
        edits.push(...lineEdits);
      }
    }

    return edits;
  }

  /**
   * Find the end line of all consecutive clauses of the same predicate/non-terminal
   */
  private findEndOfConsecutiveClauses(
    doc: TextDocument,
    startLine: number,
    predicateName: string,
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
      const namePattern = new RegExp(`^\\s*${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`);

      if (namePattern.test(lineText)) {
        // This is a clause of our predicate/non-terminal
        // Find the end of this clause
        let clauseEndLine = this.findEndOfSingleClause(doc, currentLine);
        lastClauseEndLine = clauseEndLine;
        currentLine = clauseEndLine + 1;
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
   * Find the end of a single clause (until the terminating period)
   */
  private findEndOfSingleClause(doc: TextDocument, startLine: number): number {
    for (let lineNum = startLine; lineNum < doc.lineCount; lineNum++) {
      const lineText = doc.lineAt(lineNum).text;

      // Check if this line contains a period that terminates the clause
      if (lineText.includes('.')) {
        // Simple heuristic: if the line ends with a period (possibly followed by whitespace/comments)
        if (/\.\s*(?:%.*)?$/.test(lineText)) {
          return lineNum;
        }
      }
    }

    // If no terminator found, return the start line
    return startLine;
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
   * Find and reorder all predicate calls in a single line
   */
  private findAndReorderPredicateCallsInLine(
    lineText: string,
    lineNum: number,
    predicateName: string,
    newOrder: number[],
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndReorderPredicateCallsInLine: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} in line: "${lineText}"`);
    const edits: TextEdit[] = [];

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

            if (args.length === newOrder.length) {
              // Reorder arguments
              const reorderedArgs = this.reorderArray(args, newOrder);
              const newArgsText = reorderedArgs.join(', ');

              edits.push(TextEdit.replace(
                new Range(
                  new Position(lineNum, openParenPos + 1),
                  new Position(lineNum, closeParenPos)
                ),
                newArgsText
              ));
              this.logger.debug(`Reordered non-terminal args: "${newArgsText}"`);
            }
          }
        }
      }

    } else {
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

            if (args.length === newOrder.length) {
              // Reorder arguments
              const reorderedArgs = this.reorderArray(args, newOrder);
              const newArgsText = reorderedArgs.join(', ');

              edits.push(TextEdit.replace(
                new Range(
                  new Position(lineNum, openParenPos + 1),
                  new Position(lineNum, closeParenPos)
                ),
                newArgsText
              ));
              this.logger.debug(`Reordered predicate args: "${newArgsText}"`);
            }
          }
        }
      }
    }

    return edits;
  }

  /**
   * Find and remove all predicate calls in a single line
   */
  private findAndRemovePredicateCallsInLine(
    lineText: string,
    lineNum: number,
    predicateName: string,
    argumentPosition: number,
    isNonTerminal: boolean
  ): TextEdit[] {
    this.logger.debug(`findAndRemovePredicateCallsInLine: ${isNonTerminal ? 'non-terminal' : 'predicate'} ${predicateName} in line: "${lineText}"`);
    const edits: TextEdit[] = [];

    if (isNonTerminal) {
      // For non-terminals, find all occurrences of the non-terminal name
      const nonTerminalPattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      let match;

      while ((match = nonTerminalPattern.exec(lineText)) !== null) {
        const startPos = match.index;
        const endPos = startPos + match[0].length;

        // Check if this is followed by an opening parenthesis
        if (endPos < lineText.length && lineText[endPos] === '(') {
          const openParenPos = endPos;
          const closeParenPos = ArgumentUtils.findMatchingCloseParen(lineText, openParenPos);

          if (closeParenPos !== -1) {
            const argsText = lineText.substring(openParenPos + 1, closeParenPos);
            const args = ArgumentUtils.parseArguments(argsText);

            if (args.length > 0 && argumentPosition <= args.length) {
              // Remove the specified argument
              const newArgs = [...args];
              newArgs.splice(argumentPosition - 1, 1); // Convert to 0-based index
              const newArgsText = newArgs.join(', ');

              edits.push(TextEdit.replace(
                new Range(
                  new Position(lineNum, openParenPos + 1),
                  new Position(lineNum, closeParenPos)
                ),
                newArgsText
              ));
              this.logger.debug(`Removed argument ${argumentPosition} from non-terminal: "${newArgsText}"`);
            }
          }
        }
      }
    } else {
      // For predicates, find all occurrences of the predicate name
      const predicatePattern = new RegExp(`\\b${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`, 'g');
      let match;

      while ((match = predicatePattern.exec(lineText)) !== null) {
        const startPos = match.index;
        const openParenPos = startPos + match[0].length - 1; // Position of the opening parenthesis

        const closeParenPos = ArgumentUtils.findMatchingCloseParen(lineText, openParenPos);

        if (closeParenPos !== -1) {
          const argsText = lineText.substring(openParenPos + 1, closeParenPos);
          const args = ArgumentUtils.parseArguments(argsText);

          if (args.length > 0 && argumentPosition <= args.length) {
            // Remove the specified argument
            const newArgs = [...args];
            newArgs.splice(argumentPosition - 1, 1); // Convert to 0-based index
            const newArgsText = newArgs.join(', ');

            edits.push(TextEdit.replace(
              new Range(
                new Position(lineNum, openParenPos + 1),
                new Position(lineNum, closeParenPos)
              ),
              newArgsText
            ));
            this.logger.debug(`Removed argument ${argumentPosition} from predicate: "${newArgsText}"`);
          }
        }
      }
    }

    return edits;
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
    const scopeRange = this.getDirectiveRange(doc, scopeLine);
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
          const range = this.getDirectiveRange(doc, lineNum);
          this.logger.debug(`${directiveType} directive range: lines ${range.start + 1}-${range.end + 1}`);

          // Check if this directive contains our predicate
          let containsOurPredicate = false;
          for (let checkLine = range.start; checkLine <= range.end; checkLine++) {
            const checkText = doc.lineAt(checkLine).text;
            if (checkText.includes(currentIndicator) || checkText.includes(predicateName + '(')) {
              containsOurPredicate = true;
              break;
            }
          }

          if (containsOurPredicate) {
            this.logger.debug(`${directiveType} directive contains our predicate, processing range`);
            const directiveEdits = this.processDirectiveRangeForReorder(
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
    const scopeRange = this.getDirectiveRange(doc, scopeLine);
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
          const range = this.getDirectiveRange(doc, lineNum);
          this.logger.debug(`${directiveType} directive range: lines ${range.start + 1}-${range.end + 1}`);

          // Check if this directive contains our predicate
          let containsOurPredicate = false;
          for (let checkLine = range.start; checkLine <= range.end; checkLine++) {
            const checkText = doc.lineAt(checkLine).text;
            if (checkText.includes(currentIndicator) || checkText.includes(predicateName + '(')) {
              containsOurPredicate = true;
              break;
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
   * Update info directive for argument removal
   */
  private updateInfoDirectiveForRemoval(
    lineText: string,
    predicateName: string,
    argumentPosition: number,
    currentArity: number,
    isNonTerminal: boolean
  ): string | null {
    // Handle argnames and arguments lists
    if (lineText.includes('argnames') || lineText.includes('arguments')) {
      // If removing the last argument and it would result in an empty list, delete the line
      if (currentArity === 1) {
        return ''; // Signal to delete the line
      }

      // Find the list and remove the specified argument
      const listMatch = lineText.match(/\[(.*?)\]/);
      if (listMatch) {
        const listContent = listMatch[1];
        const args = listContent.split(',').map(arg => arg.trim().replace(/^['"]|['"]$/g, ''));

        if (args.length >= argumentPosition) {
          args.splice(argumentPosition - 1, 1); // Remove the argument (convert to 0-based)
          const newListContent = args.map(arg => `'${arg}'`).join(', ');
          return lineText.replace(/\[.*?\]/, `[${newListContent}]`);
        }
      }
    }

    return lineText; // No changes needed
  }

  /**
   * Update mode directive for argument removal
   */
  private updateModeDirectiveForRemoval(
    lineText: string,
    predicateName: string,
    argumentPosition: number,
    currentArity: number
  ): string {
    // Pattern: mode(predicate_name(arg1, arg2), mode_info)
    const modePattern = new RegExp(`mode\\s*\\(\\s*${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([^)]+)\\)\\s*,\\s*([^)]+)\\)`, 'g');

    return lineText.replace(modePattern, (match, argsText, modeInfo) => {
      const args = ArgumentUtils.parseArguments(argsText);
      if (args.length >= argumentPosition) {
        args.splice(argumentPosition - 1, 1); // Remove the argument (convert to 0-based)

        // If no arguments remain, remove parentheses entirely
        if (args.length === 0) {
          return `mode(${predicateName}, ${modeInfo})`;
        } else {
          const newArgsText = args.join(', ');
          return `mode(${predicateName}(${newArgsText}), ${modeInfo})`;
        }
      }
      return match;
    });
  }

  /**
   * Update meta directive for argument removal
   */
  private updateMetaDirectiveForRemoval(
    lineText: string,
    predicateName: string,
    argumentPosition: number,
    currentArity: number,
    isNonTerminal: boolean
  ): string {
    const directiveType = isNonTerminal ? 'meta_non_terminal' : 'meta_predicate';
    const pattern = new RegExp(`${directiveType}\\s*\\(\\s*${predicateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([^)]+)\\)\\s*\\)`, 'g');

    return lineText.replace(pattern, (match, argsText) => {
      const args = ArgumentUtils.parseArguments(argsText);
      if (args.length >= argumentPosition) {
        args.splice(argumentPosition - 1, 1); // Remove the argument (convert to 0-based)

        // If no arguments remain, remove parentheses entirely
        if (args.length === 0) {
          return `${directiveType}(${predicateName})`;
        } else {
          const newArgsText = args.join(', ');
          return `${directiveType}(${predicateName}(${newArgsText}))`;
        }
      }
      return match;
    });
  }

  /**
   * Update general directive for argument removal
   */
  private updateDirectiveForRemoval(
    lineText: string,
    predicateName: string,
    currentIndicator: string,
    argumentPosition: number,
    currentArity: number,
    isNonTerminal: boolean
  ): string {
    // Handle general directives that contain the predicate/non-terminal
    const separator = isNonTerminal ? '//' : '/';
    const newArity = currentArity - 1;
    const newIndicator = `${predicateName}${separator}${newArity}`;

    // Replace the indicator
    return lineText.replace(currentIndicator, newIndicator);
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
