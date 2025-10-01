"use strict";

import * as vscode from "vscode";
import {
  CancellationToken,
  DocumentRangeFormattingEditProvider,
  FormattingOptions,
  Range,
  TextDocument,
  TextEdit
} from "vscode";
import { getLogger } from "../utils/logger";
import { LogtalkDocumentFormattingEditProvider } from "./documentFormattingEditProvider";

export class LogtalkDocumentRangeFormattingEditProvider implements DocumentRangeFormattingEditProvider {
  private logger = getLogger();
  private documentFormatter: LogtalkDocumentFormattingEditProvider;

  constructor() {
    this.documentFormatter = new LogtalkDocumentFormattingEditProvider();
  }

  /**
   * Custom command that chains native indentation conversion with Logtalk range formatting
   * Requires a non-empty selection
   */
  public async formatDocumentRangeWithIndentationConversion(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      this.logger.debug('No active editor for chained range formatting');
      return;
    }

    // Check if there's a non-empty selection
    const selection = activeEditor.selection;
    if (selection.isEmpty) {
      this.logger.debug('No selection found for range formatting - selection is required');
      vscode.window.showWarningMessage('Please select a range of text to format.');
      return;
    }

    try {
      this.logger.debug('Starting chained range formatting: indentation conversion + Logtalk formatting');

      // Step 1: Execute native indentation to tabs command
      this.logger.debug('Executing VS Code native command: editor.action.indentationToTabs');
      await vscode.commands.executeCommand('editor.action.indentationToTabs');
      this.logger.debug('Successfully executed indentationToTabs command');

      // Step 2: Update the editor options to use tabs for this document
      this.logger.debug('Updating editor options to use tabs');
      activeEditor.options = {
        ...activeEditor.options,
        tabSize: 4, // Use the configurationDefaults "editor.tabSize" from package.json
        insertSpaces: false
      };
      this.logger.debug('Successfully updated editor options to use tabs');

      // Step 3: Apply Logtalk-specific range formatting
      this.logger.debug('Applying Logtalk-specific range formatting');
      await vscode.commands.executeCommand('editor.action.formatSelection');
      this.logger.debug('Successfully applied Logtalk range formatting');

    } catch (error) {
      this.logger.error(`Error during chained range formatting: ${error.message}`);
    }
  }

  public provideDocumentRangeFormattingEdits(
    document: TextDocument,
    range: Range,
    options: FormattingOptions,
    token: CancellationToken
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    try {
      // Find all entity opening and closing directives within the specified range
      const allEntities = this.documentFormatter.findAllEntitiesInRange(document, range);

      if (allEntities.length === 0) {
        this.logger.debug("No entity directives found in range, formatting entity content only");
        this.documentFormatter.indentEntityContent(document, range.start.line, range.end.line, edits);
        return edits;
      }

      this.logger.debug(`Found ${allEntities.length} entities to format in range:`);
      allEntities.forEach((entity, index) => {
        this.logger.debug(`  Entity ${index + 1}: opening lines ${entity.opening.start.line + 1}-${entity.opening.end.line + 1}, closing lines ${entity.closing.start.line + 1}-${entity.closing.end.line + 1}`);
      });

      // Format each entity found in the range
      for (const entityInfo of allEntities) {
        // 1. Format entity opening directive (ensure it starts at column 0 with empty line after)
        this.documentFormatter.formatEntityOpeningDirective(document, entityInfo.opening, edits);

        // 2. Format entity closing directive (ensure it starts at column 0 with empty line after)
        this.documentFormatter.formatEntityClosingDirective(document, entityInfo.closing, edits);

        // 3. Indent all content inside the entity and apply specific directive formatting
        this.documentFormatter.indentEntityContent(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);
      }

    } catch (error) {
      this.logger.error(`Error during document range formatting: ${error.message}`);
    }

    return edits;
  }
}
