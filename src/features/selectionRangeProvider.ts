"use strict";

import {
  CancellationToken,
  Position,
  Range,
  SelectionRange,
  SelectionRangeProvider,
  TextDocument,
  workspace,
  Uri
} from "vscode";
import { PredicateUtils } from "../utils/predicateUtils";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import LogtalkTerminal from "./terminal";
import * as path from "path";

/**
 * Provides smart selection ranges for Logtalk code.
 *
 * The hierarchy of selection ranges (when expanding a selection):
 * 1. Line (current line)
 * 2. Block comment, directive, predicate clause, or grammar rule
 * 3. Predicate or non-terminal definition (all consecutive clauses or rules)
 * 4. Entity (object/protocol/category)
 * 5. File (entire document)
 */
export class LogtalkSelectionRangeProvider implements SelectionRangeProvider {
  private logger = getLogger();

  /**
   * Provide selection ranges for the given positions.
   * @param document The document in which the command was invoked
   * @param positions The positions at which the command was invoked
   * @param token A cancellation token
   * @returns An array of selection ranges or a thenable that resolves to such
   */
  public async provideSelectionRanges(
    document: TextDocument,
    positions: Position[],
    token: CancellationToken
  ): Promise<SelectionRange[]> {
    const selectionRanges: SelectionRange[] = [];

    for (const position of positions) {
      if (token.isCancellationRequested) {
        break;
      }

      const selectionRange = await this.buildSelectionRangeHierarchy(document, position);
      if (selectionRange) {
        selectionRanges.push(selectionRange);
      }
    }

    return selectionRanges;
  }

  /**
   * Build the complete selection range hierarchy for a position.
   * @param document The text document
   * @param position The position in the document
   * @returns The selection range hierarchy
   */
  private async buildSelectionRangeHierarchy(
    document: TextDocument,
    position: Position
  ): Promise<SelectionRange | null> {
    try {
      // Level 1: Current line
      const lineRange = this.getLineRange(document, position);

      // Level 2: Block comment, directive, clause, or grammar rule
      const blockRange = this.getBlockRange(document, position);

      // Level 3: Predicate or non-terminal definition (all consecutive clauses or rules)
      const predicateDefRange = await this.getPredicateDefinitionRange(document, position, blockRange);

      // Level 4: Entity
      const entityRange = Utils.getEntityRange(document, position);

      // Level 5: File (entire document)
      const fileRange = this.getFileRange(document);

      // Debug logging
      this.logger.debug(`Selection ranges at position ${position.line}:${position.character}:`);
      this.logger.debug(`  Line: ${lineRange.start.line}-${lineRange.end.line}`);
      this.logger.debug(`  Block: ${blockRange ? `${blockRange.start.line}-${blockRange.end.line}` : 'null'}`);
      this.logger.debug(`  Predicate def: ${predicateDefRange ? `${predicateDefRange.start.line}-${predicateDefRange.end.line}` : 'null'}`);
      this.logger.debug(`  Entity: ${entityRange ? `${entityRange.start.line}-${entityRange.end.line}` : 'null'}`);
      this.logger.debug(`  File: ${fileRange.start.line}-${fileRange.end.line}`);

      // Build the hierarchy from outermost to innermost
      // Each level's parent is the next level out
      // Only include ranges that are strictly different (not equal) to ensure
      // proper selection expansion

      // Start with the file range (outermost)
      let currentRange: SelectionRange = new SelectionRange(fileRange);

      // Add entity range if it exists and is strictly smaller than file
      if (entityRange && !entityRange.isEqual(fileRange)) {
        currentRange = new SelectionRange(entityRange, currentRange);
      }

      // Add predicate definition range if it exists and is strictly smaller than the current parent
      if (predicateDefRange && !predicateDefRange.isEqual(currentRange.range)) {
        currentRange = new SelectionRange(predicateDefRange, currentRange);
      }

      // Add block range if it exists and is strictly smaller than the current parent
      if (blockRange && !blockRange.isEqual(currentRange.range)) {
        currentRange = new SelectionRange(blockRange, currentRange);
      }

      // Add line range if it is strictly smaller than the current parent
      if (!lineRange.isEqual(currentRange.range)) {
        currentRange = new SelectionRange(lineRange, currentRange);
      }

      return currentRange;
    } catch (error) {
      this.logger.error(`Error building selection range hierarchy: ${error}`);
      return null;
    }
  }

  /**
   * Get the range of the current line.
   * @param document The text document
   * @param position The position in the document
   * @returns The range of the current line
   */
  private getLineRange(document: TextDocument, position: Position): Range {
    const line = document.lineAt(position.line);
    return line.range;
  }

  /**
   * Get the range of the block (comment, directive, or clause) containing the position.
   * @param document The text document
   * @param position The position in the document
   * @returns The range of the block, or null if not found
   */
  private getBlockRange(
    document: TextDocument,
    position: Position
  ): Range | null {
    const lineText = document.lineAt(position.line).text;
    const trimmed = lineText.trim();

    // If we're on a line comment (not a block comment), return null
    // This will cause the selection to jump directly to the entity level
    if (trimmed.startsWith('%')) {
      // Check if this is actually part of a block comment
      const blockCommentRange = this.getBlockCommentRangeAtPosition(document, position);
      if (blockCommentRange) {
        return blockCommentRange;
      }
      // It's a line comment, return null to skip to entity level
      return null;
    }

    // Check if we're in a block comment
    const blockCommentRange = this.getBlockCommentRangeAtPosition(document, position);
    if (blockCommentRange) {
      return blockCommentRange;
    }

    // Check if we're in a directive by searching backwards for the directive start
    const directiveRange = this.getDirectiveRangeAtPosition(document, position);
    if (directiveRange) {
      return directiveRange;
    }

    // Check if we're in a clause (predicate or non-terminal)
    const clauseRange = this.getClauseRangeAtPosition(document, position);
    if (clauseRange) {
      return clauseRange;
    }

    return null;
  }

  /**
   * Get the range of a directive containing the position.
   * Searches backwards to find the directive start.
   * @param document The text document
   * @param position The position in the document
   * @returns The range of the directive, or null if not in a directive
   */
  private getDirectiveRangeAtPosition(
    document: TextDocument,
    position: Position
  ): Range | null {
    // Search backwards to find a line that starts with :-
    for (let lineNum = position.line; lineNum >= 0; lineNum--) {
      const lineText = document.lineAt(lineNum).text;
      const trimmed = lineText.trim();

      // Skip empty lines and line comments - they could be between directive lines
      if (trimmed === '' || trimmed.startsWith('%')) {
        continue;
      }

      // If we find a directive start, check if our position is within its range
      if (trimmed.startsWith(':-')) {
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        if (position.line >= directiveRange.start && position.line <= directiveRange.end) {
          return new Range(
            new Position(directiveRange.start, 0),
            new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
          );
        }
        // If we found a directive but we're not in it, we're not in any directive
        return null;
      }

      // If the line ends with a comma, continue searching backwards (it's a continuation line)
      if (trimmed.endsWith(',')) {
        continue;
      }

      // If we hit a line that ends with a period, we've gone past any directive
      // and are now in a previous term (clause or directive)
      if (trimmed.endsWith('.')) {
        return null;
      }

      // If we hit any other line (not starting with :-, not ending with comma or period),
      // we're not in a directive
      return null;
    }

    return null;
  }

  /**
   * Get the range of a block comment containing the position.
   * @param document The text document
   * @param position The position in the document
   * @returns The range of the block comment, or null if not in a block comment
   */
  private getBlockCommentRangeAtPosition(
    document: TextDocument,
    position: Position
  ): Range | null {
    // Search backwards to find the start of a block comment
    let startLine = position.line;
    let foundStart = false;

    // First check if we're currently on a line with /* or inside a block comment
    for (let lineNum = position.line; lineNum >= 0; lineNum--) {
      const lineText = document.lineAt(lineNum).text;

      // If we find */, we're not in a block comment (we've gone past the end of a previous one)
      if (lineText.includes('*/') && lineNum < position.line) {
        break;
      }

      // If we find /*, this is the start
      if (lineText.includes('/*')) {
        startLine = lineNum;
        foundStart = true;
        break;
      }
    }

    if (!foundStart) {
      return null;
    }

    // Search forwards to find the end of the block comment
    let endLine = startLine;
    for (let lineNum = startLine; lineNum < document.lineCount; lineNum++) {
      const lineText = document.lineAt(lineNum).text;
      if (lineText.includes('*/')) {
        endLine = lineNum;
        break;
      }
    }

    // Make sure the position is actually within this block comment range
    if (position.line < startLine || position.line > endLine) {
      return null;
    }

    return new Range(
      new Position(startLine, 0),
      new Position(endLine, document.lineAt(endLine).text.length)
    );
  }

  /**
   * Get the range of a clause (predicate or non-terminal) containing the position.
   * @param document The text document
   * @param position The position in the document
   * @returns The range of the clause, or null if not in a clause
   */
  private getClauseRangeAtPosition(
    document: TextDocument,
    position: Position
  ): Range | null {
    // Use Utils.findTermStart to find the beginning of the term
    const termStartLine = Utils.findTermStart(document, position.line);

    if (termStartLine === null) {
      return null;
    }

    // Check if the term start is a directive (not a clause)
    const startLineText = document.lineAt(termStartLine).text.trim();
    if (startLineText.startsWith(':-')) {
      // This is a directive, not a clause
      return null;
    }

    // Get the clause range starting from the found start line
    const clauseRange = PredicateUtils.getClauseRange(document, termStartLine);

    // Verify that the position is within this clause range
    if (position.line < clauseRange.start || position.line > clauseRange.end) {
      return null;
    }

    return new Range(
      new Position(clauseRange.start, 0),
      new Position(clauseRange.end, document.lineAt(clauseRange.end).text.length)
    );
  }

  /**
   * Get the range of the predicate or non-terminal definition (all consecutive clauses or rules) containing the position.
   * @param document The text document
   * @param position The position in the document
   * @param blockRange The block range (clause or rule) at the position, if any
   * @returns The range of the predicate or non-terminal definition, or null if not in a clause/rule
   */
  private async getPredicateDefinitionRange(
    document: TextDocument,
    position: Position,
    blockRange: Range | null
  ): Promise<Range | null> {
    // Only applicable if we're in a clause or rule (not a directive or comment)
    if (!blockRange) {
      return null;
    }

    // Check if the block is a clause/rule (not a directive or comment)
    // Directives start with :-, block comments start with /*
    const blockStartLine = document.lineAt(blockRange.start.line).text.trim();
    if (blockStartLine.startsWith(':-') || blockStartLine.startsWith('/*')) {
      return null;
    }

    // Get the predicate/non-terminal indicator under cursor (name/arity or name//arity)
    const call = Utils.getCallUnderCursor(document, position);
    if (!call) {
      return null;
    }

    // Determine if it's a non-terminal by checking if blockRange contains '-->'
    let isNonTerminal = false;
    for (let lineNum = blockRange.start.line; lineNum <= blockRange.end.line; lineNum++) {
      const lineText = document.lineAt(lineNum).text;
      if (lineText.includes('-->')) {
        isNonTerminal = true;
        break;
      }
    }

    // Build the indicator in the correct format
    const indicator = call.includes('//') ? call : (isNonTerminal ? call.replace('/', '//') : call);

    // Use LogtalkTerminal.getDefinition to find the definition location
    await LogtalkTerminal.getDefinition(document, position, call);

    // Read the definition location from the .vscode_definition file
    const dir = LogtalkTerminal.getWorkspaceFolderForUri(document.uri);
    if (!dir) {
      return null;
    }

    const defFile = path.join(dir, ".vscode_definition");
    let out: string;
    try {
      const content = await workspace.fs.readFile(Uri.file(defFile));
      out = content.toString();
      await workspace.fs.delete(Uri.file(defFile), { useTrash: false });
    } catch (err) {
      return null;
    }

    const match = out.match(/File:(.+);Line:(\d+)/);
    if (!match) {
      return null;
    }

    const fileName: string = Utils.normalizeDoubleSlashPath(match[1]);
    const definitionLine: number = parseInt(match[2]) - 1; // Convert to 0-based

    // Check if the definition is in the same file
    if (path.resolve(fileName) !== path.resolve(document.fileName)) {
      return null;
    }

    // Find all consecutive clauses/rules for this predicate/non-terminal starting from the definition line
    const ranges = PredicateUtils.findConsecutivePredicateClauseRanges(
      document,
      indicator,
      definitionLine
    );

    if (ranges.length === 0) {
      return null;
    }

    // If there's only one clause/rule, return null (no need for predicate definition level)
    if (ranges.length === 1) {
      return null;
    }

    // Compute the overall range from first to last clause/rule
    const firstRange = ranges[0];
    const lastRange = ranges[ranges.length - 1];

    return new Range(firstRange.start, lastRange.end);
  }

  /**
   * Get the range of the entire file.
   * @param document The text document
   * @returns The range of the entire file
   */
  private getFileRange(document: TextDocument): Range {
    return new Range(
      new Position(0, 0),
      new Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length)
    );
  }
}

