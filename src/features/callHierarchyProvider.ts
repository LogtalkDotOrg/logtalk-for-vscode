"use strict";

import {
  ProviderResult,
  CancellationToken,
  CallHierarchyProvider,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  Position,
  TextDocument,
  Uri,
  SymbolKind,
  Range
} from "vscode";
import LogtalkTerminal from "./terminal";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkCallHierarchyProvider implements CallHierarchyProvider {
  private logger = getLogger();

  /**
   * Find the range of a predicate name in a line of text
   * @param lineText The text of the line
   * @param predicateName The predicate name to find (e.g., "getValue/0")
   * @param lineNumber The line number (0-based)
   * @returns Range of the predicate name, or null if not found
   */
  private findPredicateRangeInLine(lineText: string, predicateName: string, lineNumber: number): Range | null {
    // Extract just the predicate name without arity
    const nameMatch = predicateName.match(/^(.+)\/\d+$/);
    if (!nameMatch) {
      return null;
    }
    const name = nameMatch[1];

    // Find the predicate name in the line
    const index = lineText.indexOf(name);
    if (index === -1) {
      return null;
    }

    // Create range for the predicate name
    const startPos = new Position(lineNumber, index);
    const endPos = new Position(lineNumber, index + name.length);
    return new Range(startPos, endPos);
  }

  /**
   * Create ranges for a CallHierarchyItem based on file content
   * @param filePath Path to the file
   * @param lineNumber Line number (1-based from Logtalk output)
   * @param predicateName Predicate name (e.g., "getValue/0")
   * @returns Object with range and selectionRange
   */
  private async createRangesForItem(filePath: string, lineNumber: number, predicateName: string): Promise<{range: Range, selectionRange: Range}> {
    const zeroBasedLine = lineNumber - 1;

    try {
      // Read the file to get the actual line content
      const fileContent = await fsp.readFile(filePath, 'utf8');
      const lines = fileContent.split(/\r?\n/);

      if (zeroBasedLine >= 0 && zeroBasedLine < lines.length) {
        const lineText = lines[zeroBasedLine];
        const predicateRange = this.findPredicateRangeInLine(lineText, predicateName, zeroBasedLine);

        if (predicateRange) {
          // selectionRange is the predicate name itself
          const selectionRange = predicateRange;
          // range is the entire line (or could be more sophisticated)
          const range = new Range(
            new Position(zeroBasedLine, 0),
            new Position(zeroBasedLine, lineText.length)
          );
          return { range, selectionRange };
        }
      }
    } catch (error) {
      this.logger.error(`Error reading file ${filePath}:`, error);
    }

    // Fallback to zero-width ranges at line start
    const fallbackPos = new Position(zeroBasedLine, 0);
    const fallbackRange = new Range(fallbackPos, fallbackPos);
    return { range: fallbackRange, selectionRange: fallbackRange };
  }

  /**
   * Find ranges where a predicate is called in a specific line
   * @param filePath Path to the file
   * @param lineNumber Line number (1-based from Logtalk output)
   * @param predicateName Predicate name to find calls for
   * @returns Array of ranges where the predicate is called
   */
  private async findCallRangesInLine(filePath: string, lineNumber: number, predicateName: string): Promise<Range[]> {
    const zeroBasedLine = lineNumber - 1;

    try {
      // Read the file to get the actual line content
      const fileContent = await fsp.readFile(filePath, 'utf8');
      const lines = fileContent.split(/\r?\n/);

      if (zeroBasedLine >= 0 && zeroBasedLine < lines.length) {
        const lineText = lines[zeroBasedLine];
        const predicateRange = this.findPredicateRangeInLine(lineText, predicateName, zeroBasedLine);

        if (predicateRange) {
          return [predicateRange];
        }
      }
    } catch (error) {
      this.logger.error(`Error reading file ${filePath}:`, error);
    }

    // Fallback to empty array if not found
    return [];
  }
  public prepareCallHierarchy(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): ProviderResult<CallHierarchyItem> {
    let predicate = Utils.getCallUnderCursor(doc, position);
    if (!predicate) {
      return null;
    } else {
      // Get the word range for the predicate at the cursor position
      const lineText = doc.lineAt(position.line).text;
      const predicateRange = this.findPredicateRangeInLine(lineText, predicate, position.line);

      let range: Range;
      let selectionRange: Range;

      if (predicateRange) {
        // Use the actual predicate range for selection
        selectionRange = predicateRange;
        // Use the entire line for the broader range
        range = new Range(
          new Position(position.line, 0),
          new Position(position.line, lineText.length)
        );
      } else {
        // Fallback to cursor position
        range = new Range(position, position);
        selectionRange = new Range(position, position);
      }

      return new CallHierarchyItem(
        SymbolKind.Function,
        predicate,
        "",
        doc.uri,
        range,
        selectionRange
      );
    }
  }

  public async provideCallHierarchyIncomingCalls(
    item: CallHierarchyItem,
    token: CancellationToken
  ): Promise<CallHierarchyIncomingCall[]> {
    let callers: CallHierarchyIncomingCall[] = [];
    let file = item.uri.fsPath;
    let predicate = item.name;
    let position = item.range.start;

    await LogtalkTerminal.getCallers(file, position, predicate);

    const dir = LogtalkTerminal.getFirstWorkspaceFolder();
    const refs = path.join(dir, ".vscode_callers");

    if (fs.existsSync(refs)) {
      const out = fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      let matches = out.matchAll(/Name:(.+);File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        const callerName = match[1];
        const callerFile = match[2];
        const callerLine = parseInt(match[3]);

        // Create proper ranges for the caller
        const ranges = await this.createRangesForItem(callerFile, callerLine, callerName);

        // Find where the current predicate is called in the caller's line
        const fromRanges = await this.findCallRangesInLine(callerFile, callerLine, predicate);

        callers.push(
          new CallHierarchyIncomingCall(
            new CallHierarchyItem(
              SymbolKind.Function,
              callerName,
              "",
              Uri.file(callerFile),
              ranges.range,
              ranges.selectionRange
            ),
            fromRanges
          )
        );
      }
    } else {
      this.logger.error('.vscode_callers file not found');
    }

    return callers;
  }

  public async provideCallHierarchyOutgoingCalls(
    item: CallHierarchyItem,
    token: CancellationToken
  ): Promise<CallHierarchyOutgoingCall[]> {
    let callees: CallHierarchyOutgoingCall[] = [];
    let file = item.uri.fsPath;
    let predicate = item.name;
    let position = item.range.start;

    await LogtalkTerminal.getCallees(file, position, predicate);

    const dir = LogtalkTerminal.getFirstWorkspaceFolder();
    const refs = path.join(dir, ".vscode_callees");

    if (fs.existsSync(refs)) {
      const out = fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      const matches = out.matchAll(/Name:(.+);File:(.+);Line:(\d+)/g);
      var match = null;
      for (match of matches) {
        const calleeName = match[1];
        const calleeFile = match[2];
        const calleeLine = parseInt(match[3]);

        // Create proper ranges for the callee
        const ranges = await this.createRangesForItem(calleeFile, calleeLine, calleeName);

        // Find where the callee is called from the current predicate
        const fromRanges = await this.findCallRangesInLine(file, position.line + 1, calleeName);

        callees.push(
          new CallHierarchyOutgoingCall(
            new CallHierarchyItem(
              SymbolKind.Function,
              calleeName,
              "",
              Uri.file(calleeFile),
              ranges.range,
              ranges.selectionRange
            ),
            fromRanges
          )
        );
      }
    } else {
      this.logger.error('.vscode_callees file not found');
    }

    return callees;
  }

}
