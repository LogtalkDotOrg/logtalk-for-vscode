"use strict";

import {
  CancellationToken,
  DefinitionProvider,
  Location,
  Position,
  TextDocument,
  Uri,
  window,
  workspace,
  Disposable
} from "vscode";
import LogtalkTerminal from "./terminal";
import { getLogger } from "../utils/logger";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";

export class LogtalkDefinitionProvider implements DefinitionProvider {
  private logger = getLogger();
  private disposables: Disposable[] = [];

  // Extensions to try when resolving file paths (in order of priority)
  private static readonly FILE_EXTENSIONS = ['.lgt', '.logtalk', '.pl', '.prolog', ''];

  constructor() {
    // Delete any temporary files from previous sessions in all workspace folders
    const files = [
      ".vscode_definition",
      ".vscode_definition_done"
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
   * Detect if the cursor is on an atom (file path) inside the first argument of logtalk_load/1-2.
   * Only handles atoms (possibly quoted), not compound terms like library(name).
   * @param doc The text document
   * @param position The cursor position
   * @returns The file path atom (without quotes) if detected, null otherwise
   */
  private getLogtalkLoadFilePath(doc: TextDocument, position: Position): string | null {
    // Get surrounding context to check if we're in a logtalk_load call
    const lineText = doc.lineAt(position.line).text;

    // Search backwards to find the logtalk_load call context
    const searchStart = Math.max(0, position.line - 20);

    // Build the text from searchStart to current position to check context
    let contextText = '';
    for (let i = searchStart; i <= position.line; i++) {
      contextText += doc.lineAt(i).text + '\n';
    }

    // Check if we're inside a logtalk_load call
    // Look for logtalk_load( that hasn't been closed yet
    const logtalkLoadMatch = contextText.match(/logtalk_load\s*\(/g);
    if (!logtalkLoadMatch) {
      return null;
    }

    // Find the last logtalk_load( in the context
    let lastLogtalkLoadPos = contextText.lastIndexOf('logtalk_load');
    if (lastLogtalkLoadPos === -1) {
      return null;
    }

    // Check if the logtalk_load call is still open (not closed with matching parenthesis)
    let afterLogtalkLoad = contextText.substring(lastLogtalkLoadPos);
    let openParenPos = afterLogtalkLoad.indexOf('(');
    if (openParenPos === -1) {
      return null;
    }

    // Count parentheses to see if we're still inside the first argument of the call
    let parenDepth = 0;
    let bracketDepth = 0;
    let inFirstArg = false;
    let inQuote = false;
    let inDoubleQuote = false;

    for (let i = openParenPos; i < afterLogtalkLoad.length; i++) {
      const char = afterLogtalkLoad[i];

      // Handle quotes
      if (char === "'" && !inDoubleQuote) {
        inQuote = !inQuote;
        continue;
      }
      if (char === '"' && !inQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }
      if (inQuote || inDoubleQuote) {
        continue;
      }

      if (char === '(') {
        parenDepth++;
        if (parenDepth === 1) {
          inFirstArg = true;
        }
      } else if (char === ')') {
        parenDepth--;
        if (parenDepth === 0) {
          // End of logtalk_load call
          break;
        }
      } else if (char === '[') {
        bracketDepth++;
      } else if (char === ']') {
        bracketDepth--;
      } else if (char === ',' && parenDepth === 1 && bracketDepth === 0) {
        // End of first argument (start of second argument for logtalk_load/2)
        break;
      }
    }

    if (!inFirstArg) {
      return null;
    }

    // Now get the word/atom under the cursor
    // Handle quoted atoms: 'file_name' or "file_name"
    // Handle unquoted atoms: file_name
    let wordRange = doc.getWordRangeAtPosition(position, /'[^']*'|"[^"]*"|\w+/);
    if (!wordRange) {
      return null;
    }

    let word = doc.getText(wordRange);
    this.logger.debug(`Word under cursor: ${word}`);

    // Check if this is a compound term (has parenthesis immediately after)
    // e.g., library(name) - we should NOT handle these
    const afterWord = lineText.substring(wordRange.end.character);
    if (/^\s*\(/.test(afterWord)) {
      this.logger.debug(`Skipping compound term: ${word}(...)`);
      return null;
    }

    // Remove quotes if present
    if ((word.startsWith("'") && word.endsWith("'")) ||
        (word.startsWith('"') && word.endsWith('"'))) {
      word = word.substring(1, word.length - 1);
    }

    // Validate it's a valid atom (starts with lowercase or is quoted)
    if (!word || word.length === 0) {
      return null;
    }

    this.logger.debug(`Detected logtalk_load file path: ${word}`);
    return word;
  }

  /**
   * Try to resolve a file path, trying various extensions if the file doesn't exist.
   * @param basePath The base directory (directory of the document containing the logtalk_load call)
   * @param filePath The file path from the logtalk_load call (may be relative, may omit extension)
   * @returns The resolved absolute file path if found, null otherwise
   */
  private resolveFilePath(basePath: string, filePath: string): string | null {
    // If the path already has an extension we recognize, try it first
    const hasKnownExtension = LogtalkDefinitionProvider.FILE_EXTENSIONS.some(
      ext => ext && filePath.endsWith(ext)
    );

    if (hasKnownExtension) {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
      if (fs.existsSync(fullPath)) {
        this.logger.debug(`Resolved file path (with extension): ${fullPath}`);
        return fullPath;
      }
    }

    // Try each extension
    for (const ext of LogtalkDefinitionProvider.FILE_EXTENSIONS) {
      const testPath = path.isAbsolute(filePath)
        ? filePath + ext
        : path.join(basePath, filePath + ext);

      if (fs.existsSync(testPath)) {
        this.logger.debug(`Resolved file path: ${testPath}`);
        return testPath;
      }
    }

    this.logger.debug(`Could not resolve file path: ${filePath} from ${basePath}`);
    return null;
  }

  public async provideDefinition(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location | null> {
    if (window.activeTextEditor?.document === doc && window.activeTextEditor.selection.active.line !== position.line) {
      return null;
    }

    const lineText = doc.lineAt(position.line).text.trim();
    if (lineText.startsWith("%")) {
      return null;
    }

    // First, check if the cursor is on a file path in logtalk_load/1-2
    const logtalkLoadFilePath = this.getLogtalkLoadFilePath(doc, position);
    if (logtalkLoadFilePath) {
      // Try to resolve the file path relative to the document's directory
      const docDir = path.dirname(doc.uri.fsPath);
      const resolvedPath = this.resolveFilePath(docDir, logtalkLoadFilePath);

      if (resolvedPath) {
        this.logger.debug(`Opening file from logtalk_load: ${resolvedPath}`);
        return new Location(Uri.file(resolvedPath), new Position(0, 0));
      } else {
        this.logger.debug(`Could not resolve logtalk_load file path: ${logtalkLoadFilePath}`);
        // Fall through to regular definition lookup
      }
    }

    let call = Utils.getCallUnderCursor(doc, position);
    if (!call) {
      return null;
    }

    if (token.isCancellationRequested) {
      return null;
    }

    await LogtalkTerminal.getDefinition(doc, position, call);

    let location: Location = null;
    const dir = LogtalkTerminal.getWorkspaceFolderForUri(doc.uri);
    if (!dir) {
      this.logger.error('No workspace folder open');
      return location;
    }
    const def = path.join(dir, ".vscode_definition");

    try {
      const content = await workspace.fs.readFile(Uri.file(def));
      const out = content.toString();
      await workspace.fs.delete(Uri.file(def), { useTrash: false });
      const match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        let fileName = Utils.normalizeDoubleSlashPath(match[1]);
        const lineNum: number = parseInt(match[2]);
        location = new Location(Uri.file(fileName), new Position(lineNum - 1, 0));
      }
    } catch (err) {
      this.logger.error('.vscode_definition file not found');
    }

    return location;
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
