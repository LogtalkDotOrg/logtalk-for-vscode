"use strict";

import {
  Diagnostic,
  DiagnosticCollection,
  Position,
  Range,
  TextDocumentChangeEvent,
  TextDocumentContentChangeEvent,
  Uri
} from "vscode";

/**
 * Utility functions for managing diagnostics across different Logtalk tools
 */
export class DiagnosticsUtils {

  /**
   * Updates diagnostics by removing a specific diagnostic from the collection
   * @param diagnosticCollection The diagnostic collection to update
   * @param uri The URI of the document
   * @param diagnosticToRemove The diagnostic to remove
   */
  public static updateDiagnostics(
    diagnosticCollection: DiagnosticCollection,
    uri: Uri,
    diagnosticToRemove: Diagnostic
  ): void {
    const existingDiagnostics = diagnosticCollection.get(uri) || [];
    const filteredDiagnostics = existingDiagnostics.filter(
      diagnostic => !DiagnosticsUtils.areDiagnosticsEqual(diagnostic, diagnosticToRemove)
    );
    diagnosticCollection.set(uri, filteredDiagnostics);
  }

  /**
   * Compares two diagnostics to determine if they are equal
   * @param a First diagnostic
   * @param b Second diagnostic
   * @returns true if diagnostics are equal, false otherwise
   */
  public static areDiagnosticsEqual(a: Diagnostic, b: Diagnostic): boolean {
    return a.message === b.message && 
           a.severity === b.severity &&
           a.code === b.code;
  }

  /**
   * Updates diagnostic positions when document content changes
   * @param diagnosticCollection The diagnostic collection to update
   * @param event The text document change event
   */
  public static updateDiagnosticsOnChange(
    diagnosticCollection: DiagnosticCollection,
    event: TextDocumentChangeEvent
  ): void {
    const existingDiagnostics = diagnosticCollection.get(event.document.uri);

    if (!existingDiagnostics || existingDiagnostics.length === 0) {
      return;
    }

    const updatedDiagnostics: Diagnostic[] = [];

    for (const diagnostic of existingDiagnostics) {
      const newRange = DiagnosticsUtils.adjustRangeForChanges(diagnostic.range, event.contentChanges);

      if (newRange) {
        // Create new diagnostic with updated position
        const newDiagnostic = new Diagnostic(
          newRange,
          diagnostic.message,
          diagnostic.severity
        );
        // Copy other properties
        newDiagnostic.source = diagnostic.source;
        newDiagnostic.code = diagnostic.code;
        updatedDiagnostics.push(newDiagnostic);
      }
      // If newRange is null, the diagnostic should be removed
    }

    diagnosticCollection.set(event.document.uri, updatedDiagnostics);
  }

  /**
   * Adjusts a range based on document content changes
   * @param range The original range
   * @param changes The content changes
   * @returns The adjusted range or null if the range should be removed
   */
  private static adjustRangeForChanges(
    range: Range,
    changes: readonly TextDocumentContentChangeEvent[]
  ): Range | null {
    let adjustedRange = range;

    // Process changes in reverse order (from end to beginning)
    const sortedChanges = [...changes].sort((a, b) => {
      const aStart = a.range?.start || new Position(0, 0);
      const bStart = b.range?.start || new Position(0, 0);
      return bStart.compareTo(aStart);
    });

    for (const change of sortedChanges) {
      if (!change.range) continue;

      adjustedRange = DiagnosticsUtils.adjustRangeForSingleChange(adjustedRange, change);

      // If the diagnostic range was completely removed, return null
      if (!adjustedRange) {
        return null;
      }
    }

    return adjustedRange;
  }

  /**
   * Adjusts a range for a single content change
   * @param range The range to adjust
   * @param change The content change
   * @returns The adjusted range or null if the range should be removed
   */
  private static adjustRangeForSingleChange(
    range: Range,
    change: TextDocumentContentChangeEvent
  ): Range | null {
    if (!change.range) return range;

    const changeStart = change.range.start;
    const changeEnd = change.range.end;
    const newText = change.text;
    const newLines = newText.split('\n');
    const lineDelta = newLines.length - 1 - (changeEnd.line - changeStart.line);

    // If change is completely after the diagnostic, no adjustment needed
    if (changeStart.isAfterOrEqual(range.end)) {
      return range;
    }

    // If change completely contains the diagnostic, remove it
    if (changeStart.isBeforeOrEqual(range.start) && changeEnd.isAfterOrEqual(range.end)) {
      return null;
    }

    // If change is completely before the diagnostic, adjust line numbers
    if (changeEnd.isBeforeOrEqual(range.start)) {
      const newStart = new Position(
        range.start.line + lineDelta,
        range.start.character
      );
      const newEnd = new Position(
        range.end.line + lineDelta,
        range.end.character
      );
      return new Range(newStart, newEnd);
    }

    // If change starts before diagnostic but ends within it
    if (changeStart.isBefore(range.start) && changeEnd.isAfter(range.start)) {
      // The diagnostic start is affected by the change
      if (changeEnd.isAfterOrEqual(range.end)) {
        // Change completely covers the diagnostic
        return null;
      } else {
        // Adjust the start position
        const newStart = new Position(
          changeStart.line,
          changeStart.character
        );
        const newEnd = new Position(
          range.end.line + lineDelta,
          range.end.character
        );
        return new Range(newStart, newEnd);
      }
    }

    // If change is within the diagnostic range
    if (changeStart.isAfterOrEqual(range.start) && changeEnd.isBeforeOrEqual(range.end)) {
      // Only adjust the end position
      const newEnd = new Position(
        range.end.line + lineDelta,
        range.end.character
      );
      return new Range(range.start, newEnd);
    }

    // If change starts within diagnostic but extends beyond it
    if (changeStart.isAfterOrEqual(range.start) && changeStart.isBefore(range.end)) {
      // Truncate the diagnostic at the change start
      return new Range(range.start, changeStart);
    }

    return range;
  }

  /**
   * Removes duplicate diagnostics from an array
   * @param diagnostics Array of diagnostics to deduplicate
   * @returns Array with duplicates removed
   */
  public static removeDuplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    const seen = new Set<string>();
    return diagnostics.filter(diag => {
      const key = `${diag.range.start.line},${diag.range.start.character},${diag.range.end.line},${diag.range.end.character},${diag.message},${diag.severity}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Checks if there is only whitespace before and after a given range
   * @param document The text document
   * @param range The range to check around (can be single or multi-line)
   * @returns true if there is only whitespace outside the range
   */
  public static isOnlyWhitespaceAroundRange(document: any, range: Range): boolean {
    // For single-line ranges
    if (range.start.line === range.end.line) {
      const lineText = document.lineAt(range.start.line).text;
      const beforeRange = lineText.substring(0, range.start.character);
      const afterRange = lineText.substring(range.end.character);

      return beforeRange.trim() === '' && afterRange.trim() === '';
    }

    // For multi-line ranges
    // Check if there's only whitespace before the range on the first line
    const firstLineText = document.lineAt(range.start.line).text;
    const beforeRange = firstLineText.substring(0, range.start.character);

    // Check if there's only whitespace after the range on the last line
    const lastLineText = document.lineAt(range.end.line).text;
    const afterRange = lastLineText.substring(range.end.character);

    return beforeRange.trim() === '' && afterRange.trim() === '';
  }

  /**
   * Creates a range for deleting entire lines covered by a diagnostic range
   * @param range The diagnostic range that may span multiple lines
   * @returns Range covering all lines from start to end including newlines
   */
  public static createWholeLineRange(range: Range): Range {
    return new Range(
      new Position(range.start.line, 0),
      new Position(range.end.line + 1, 0)
    );
  }

  /**
   * Creates a smart delete operation that removes entire lines when there's only whitespace around the range,
   * or just the range itself when there's other content on the same lines
   * @param edit The WorkspaceEdit to add the delete operation to
   * @param document The text document
   * @param uri The document URI
   * @param diagnosticRange The diagnostic range to delete
   */
  public static addSmartDeleteOperation(edit: any, document: any, uri: any, diagnosticRange: Range): void {
    // Check if there is only whitespace around the diagnostic range
    if (DiagnosticsUtils.isOnlyWhitespaceAroundRange(document, diagnosticRange)) {
      // Delete the entire lines including newlines
      const lineRange = DiagnosticsUtils.createWholeLineRange(diagnosticRange);
      edit.delete(uri, lineRange);
    } else {
      // Only delete the diagnostic range itself
      edit.delete(uri, diagnosticRange);
    }
  }

  /**
   * Searches for a specific text within a diagnostic range and returns the range of the found text
   * @param document The text document
   * @param diagnosticRange The diagnostic range to search within
   * @param searchText The text to search for
   * @returns Range of the found text, or null if not found
   */
  public static findTextInRange(document: any, diagnosticRange: Range, searchText: string): Range | null {
    // Get the text content of the diagnostic range
    const rangeText = document.getText(diagnosticRange);

    // Find the index of the search text within the range
    const searchIndex = rangeText.indexOf(searchText);

    if (searchIndex === -1) {
      return null; // Text not found
    }

    // Calculate the absolute position of the found text
    // We need to convert the relative position within the range to absolute document positions
    let currentLine = diagnosticRange.start.line;
    let currentChar = diagnosticRange.start.character;
    let charCount = 0;

    // Iterate through the range text to find the absolute position
    for (let i = 0; i < searchIndex; i++) {
      if (rangeText[i] === '\n') {
        currentLine++;
        currentChar = 0;
      } else {
        currentChar++;
      }
      charCount++;
    }

    // Calculate the end position
    let endLine = currentLine;
    let endChar = currentChar;

    for (let i = 0; i < searchText.length; i++) {
      if (searchText[i] === '\n') {
        endLine++;
        endChar = 0;
      } else {
        endChar++;
      }
    }

    return new Range(
      new Position(currentLine, currentChar),
      new Position(endLine, endChar)
    );
  }
}
