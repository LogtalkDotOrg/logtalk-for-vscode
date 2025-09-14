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
  Position
} from "vscode";
import { getLogger } from "../utils/logger";
import * as path from "path";
import * as fs from "fs";

interface EntityTypeOption extends QuickPickItem {
  entityType: 'object' | 'protocol' | 'category';
  directive: string;
  endDirective: string;
}

export class LogtalkRefactorProvider implements CodeActionProvider {
  private logger = getLogger();

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
   * Dispose of the refactor provider and clean up resources
   */
  public dispose(): void {
    // Currently no resources to dispose, but this method provides
    // consistency with other providers and allows for future cleanup
    this.logger.debug('LogtalkRefactorProvider disposed');
  }
}
