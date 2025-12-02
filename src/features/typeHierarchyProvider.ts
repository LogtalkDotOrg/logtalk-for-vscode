"use strict";

import {
  CancellationToken,
  TypeHierarchyProvider,
  TypeHierarchyItem,
  Position,
  TextDocument,
  Uri,
  SymbolKind,
  Range,
  workspace,
  Disposable
} from "vscode";
import LogtalkTerminal from "./terminal";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkTypeHierarchyProvider implements TypeHierarchyProvider {
  private logger = getLogger();
  private disposables: Disposable[] = [];

  constructor() {
    // Delete any temporary files from previous sessions in all workspace folders
    const files = [
      ".vscode_ancestors",
      ".vscode_ancestors_done",
      ".vscode_descendants",
      ".vscode_descendants_done"
    ];
    // Fire-and-forget cleanup - errors are logged internally
    if (workspace.workspaceFolders) {
      for (const wf of workspace.workspaceFolders) {
        Utils.cleanupTemporaryFiles(wf.uri.fsPath, files);
      }
    }

    // Clean up any temporary files when folders are added to the workspace
    const workspaceFoldersListener = workspace.onDidChangeWorkspaceFolders((event) => {
      // For each added workspace folder, run the cleanup using the folder path
      // Fire-and-forget cleanup - errors are logged internally
      for (const wf of event.added) {
        Utils.cleanupTemporaryFiles(wf.uri.fsPath, files);
      }
    });
    this.disposables.push(workspaceFoldersListener);
  }

  /**
   * Find the range of an entity name in a line of text
   * @param lineText The text of the line
   * @param entityName The entity name to find
   * @param lineNumber The line number (0-based)
   * @returns Range of the entity name, or null if not found
   */
  private findEntityRangeInLine(lineText: string, entityName: string, lineNumber: number): Range | null {
    // Parse entity opening directive to extract entity name and its position
    const trimmedLine = lineText.trim();

    // Try to match entity opening directives
    const objectMatch = trimmedLine.match(/^(?:\:- object\()([^(),.]+(\(.*\))?)/);
    const protocolMatch = trimmedLine.match(/^(?:\:- protocol\()([^(),.]+(\(.*\))?)/);
    const categoryMatch = trimmedLine.match(/^(?:\:- category\()([^(),.]+(\(.*\))?)/);

    const match = objectMatch || protocolMatch || categoryMatch;
    if (match && match[1]) {
      const extractedName = match[1].trim();
      // Find where the entity name starts in the original line
      const directiveStart = lineText.indexOf(':-');
      if (directiveStart === -1) {
        return null;
      }
      const nameStart = lineText.indexOf(extractedName, directiveStart);
      if (nameStart === -1) {
        return null;
      }

      // Create range for the entity name (including parameters if parametric)
      const startPos = new Position(lineNumber, nameStart);
      const endPos = new Position(lineNumber, nameStart + extractedName.length);
      return new Range(startPos, endPos);
    }

    return null;
  }

  /**
   * Create ranges for a TypeHierarchyItem based on file content
   * @param filePath Path to the file
   * @param lineNumber Line number (1-based from Logtalk output)
   * @param entityName Entity name
   * @returns Object with range and selectionRange
   */
  private async createRangesForItem(filePath: string, lineNumber: number, entityName: string): Promise<{range: Range, selectionRange: Range}> {
    const zeroBasedLine = lineNumber - 1;

    try {
      // Read the file to get the actual line content
      const fileContent = await fsp.readFile(filePath, 'utf8');
      const lines = fileContent.split(/\r?\n/);

      if (zeroBasedLine >= 0 && zeroBasedLine < lines.length) {
        const lineText = lines[zeroBasedLine];
        const entityRange = this.findEntityRangeInLine(lineText, entityName, zeroBasedLine);

        if (entityRange) {
          // selectionRange is the entity name itself
          const selectionRange = entityRange;
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

  public async prepareTypeHierarchy(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<TypeHierarchyItem> {
    let entity = Utils.getEntityNameUnderCursor(doc, position);
    this.logger.debug(`Entity: ${entity}`);
    if (!entity) {
      return null;
    } else {
      let type = await LogtalkTerminal.getType(doc.uri.fsPath, entity, doc.uri);
      let symbol = type == "object" ? SymbolKind.Class : type == "protocol" ? SymbolKind.Interface : SymbolKind.Struct;
      return new TypeHierarchyItem(
        symbol,
        entity,
        "",
        doc.uri,
        new Range(position, position),
        new Range(position, position)
      );
    }
  }

  public async provideTypeHierarchySupertypes(
    item: TypeHierarchyItem,
    token: CancellationToken
  ): Promise<TypeHierarchyItem[]> {
    let ancestors: TypeHierarchyItem[] = [];
    let file = item.uri.fsPath;
    let entity = item.name;

    await LogtalkTerminal.getAncestors(file, entity, item.uri);

    const dir = LogtalkTerminal.getWorkspaceFolderForUri(item.uri);
    if (!dir) {
      this.logger.error('No workspace folder open');
      return [];
    }
    const refs = path.join(dir, ".vscode_ancestors");

    if (fs.existsSync(refs)) {
      const out = fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      let matches = out.matchAll(/Type:(\w+);Name:(.+);File:(.+);Line:(\d+)/g);
      var match = null;
      var symbol = null;
      for (match of matches) {
        const ancestorType = match[1];
        const ancestorName = match[2];
        const ancestorFile = Utils.normalizeDoubleSlashPath(match[3]);
        const ancestorLine = parseInt(match[4]);

        symbol = ancestorType == "object" ? SymbolKind.Class : ancestorType == "protocol" ? SymbolKind.Interface : SymbolKind.Struct;

        // Create proper ranges for the ancestor
        const ranges = await this.createRangesForItem(ancestorFile, ancestorLine, ancestorName);

        ancestors.push(
          new TypeHierarchyItem(
            symbol,
            ancestorName,
            "",
            Uri.file(ancestorFile),
            ranges.range,
            ranges.selectionRange
          )
        );
      }
    } else {
      this.logger.error('.vscode_ancestors file not found');
    }

    return ancestors;
  }

  public async provideTypeHierarchySubtypes(
    item: TypeHierarchyItem,
    token: CancellationToken
  ): Promise<TypeHierarchyItem[]> {
    let descendants: TypeHierarchyItem[] = [];
    let file = item.uri.fsPath;
    let entity = item.name;

    await LogtalkTerminal.getDescendants(file, entity, item.uri);

    const dir = LogtalkTerminal.getWorkspaceFolderForUri(item.uri);
    if (!dir) {
      this.logger.error('No workspace folder open');
      return [];
    }
    const refs = path.join(dir, ".vscode_descendants");

    if (fs.existsSync(refs)) {
      const out = fs.readFileSync(refs).toString();
      await fsp.rm(refs, { force: true });
      const matches = out.matchAll(/Type:(\w+);Name:(.+);File:(.+);Line:(\d+)/g);
      var match = null;
      var symbol = null;
      for (match of matches) {
        const descendantType = match[1];
        const descendantName = match[2];
        this.logger.debug(`Descendant: ${descendantName}`);
        const descendantFile = Utils.normalizeDoubleSlashPath(match[3]);
        const descendantLine = parseInt(match[4]);

        symbol = descendantType == "object" ? SymbolKind.Class : descendantType == "protocol" ? SymbolKind.Interface : SymbolKind.Struct;

        // Create proper ranges for the descendant
        const ranges = await this.createRangesForItem(descendantFile, descendantLine, descendantName);

        descendants.push(
          new TypeHierarchyItem(
            symbol,
            descendantName,
            "",
            Uri.file(descendantFile),
            ranges.range,
            ranges.selectionRange
          )
        );
      }
    } else {
      this.logger.error('.vscode_descendants file not found');
    }

    return descendants;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch (err) {
        this.logger.error('Error disposing resource:', err);
      }
    }
    this.disposables = [];
  }
}
