import * as fs from 'fs';
import * as path from 'path';
import { Uri, WorkspaceEdit, TextEdit, Range, Position } from 'vscode';
import { getLogger } from './logger';

/**
 * Handles propagation of file renames to loader.lgt and tester.lgt files
 */
export class FileRenameHandler {
  private static logger = getLogger();

  /**
   * Propagates file rename to loader.lgt and tester.lgt files in the same directory
   * @param oldUri The old file URI
   * @param newUri The new file URI
   * @param timeoutMs Timeout in milliseconds (default: 5000)
   * @returns WorkspaceEdit with all necessary changes, or null if no changes needed
   */
  public static async propagateFileRename(oldUri: Uri, newUri: Uri, timeoutMs: number = 5000): Promise<WorkspaceEdit | null> {
    // Wrap the operation in a timeout to prevent hanging
    return Promise.race([
      this.propagateFileRenameInternal(oldUri, newUri),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          this.logger.warn(`File rename propagation timed out after ${timeoutMs}ms`);
          resolve(null);
        }, timeoutMs);
      })
    ]);
  }

  /**
   * Internal implementation of file rename propagation
   * @param oldUri The old file URI
   * @param newUri The new file URI
   * @returns WorkspaceEdit with all necessary changes, or null if no changes needed
   */
  private static async propagateFileRenameInternal(oldUri: Uri, newUri: Uri): Promise<WorkspaceEdit | null> {
    const oldPath = oldUri.fsPath;
    const newPath = newUri.fsPath;
    
    // Get file names without extensions
    const oldBaseName = path.basename(oldPath, path.extname(oldPath));
    const newBaseName = path.basename(newPath, path.extname(newPath));
    
    // Skip if renaming loader.lgt or tester.lgt themselves
    const oldFileName = path.basename(oldPath);
    if (oldFileName === 'loader.lgt' || oldFileName === 'loader.logtalk' || 
        oldFileName === 'tester.lgt' || oldFileName === 'tester.logtalk') {
      this.logger.debug(`Skipping rename propagation for ${oldFileName}`);
      return null;
    }
    
    // Get the directory containing the renamed file
    const directory = path.dirname(oldPath);
    
    // Check if the new file is in a different directory
    const newDirectory = path.dirname(newPath);
    const isSameDirectory = directory === newDirectory;
    
    this.logger.debug(`Propagating rename from ${oldBaseName} to ${newBaseName} in directory ${directory}`);
    
    const workspaceEdit = new WorkspaceEdit();
    let hasChanges = false;
    
    // Find and update loader.lgt and tester.lgt files
    const loaderFiles = ['loader.lgt', 'loader.logtalk'];
    const testerFiles = ['tester.lgt', 'tester.logtalk'];
    
    // Update loader files in the old directory
    for (const loaderFile of loaderFiles) {
      const loaderPath = path.join(directory, loaderFile);
      if (fs.existsSync(loaderPath)) {
        const edits = await this.updateFileReferences(loaderPath, oldBaseName, newBaseName, isSameDirectory);
        if (edits.length > 0) {
          workspaceEdit.set(Uri.file(loaderPath), edits);
          hasChanges = true;
          this.logger.debug(`Added ${edits.length} edits to ${loaderFile}`);
        }
      }
    }
    
    // Update tester files in the old directory
    for (const testerFile of testerFiles) {
      const testerPath = path.join(directory, testerFile);
      if (fs.existsSync(testerPath)) {
        const edits = await this.updateFileReferences(testerPath, oldBaseName, newBaseName, isSameDirectory);
        if (edits.length > 0) {
          workspaceEdit.set(Uri.file(testerPath), edits);
          hasChanges = true;
          this.logger.debug(`Added ${edits.length} edits to ${testerFile}`);
        }
      }
    }
    
    // If file was moved to a different directory, also update loader/tester in new directory
    if (!isSameDirectory) {
      // Update loader files in the new directory
      for (const loaderFile of loaderFiles) {
        const loaderPath = path.join(newDirectory, loaderFile);
        if (fs.existsSync(loaderPath)) {
          // Add the new file reference if it doesn't exist
          const edits = await this.addFileReference(loaderPath, newBaseName);
          if (edits.length > 0) {
            workspaceEdit.set(Uri.file(loaderPath), edits);
            hasChanges = true;
            this.logger.debug(`Added ${edits.length} edits to ${loaderFile} in new directory`);
          }
        }
      }
      
      // Update tester files in the new directory
      for (const testerFile of testerFiles) {
        const testerPath = path.join(newDirectory, testerFile);
        if (fs.existsSync(testerPath)) {
          // Add the new file reference if it doesn't exist
          const edits = await this.addFileReference(testerPath, newBaseName);
          if (edits.length > 0) {
            workspaceEdit.set(Uri.file(testerPath), edits);
            hasChanges = true;
            this.logger.debug(`Added ${edits.length} edits to ${testerFile} in new directory`);
          }
        }
      }
    }
    
    return hasChanges ? workspaceEdit : null;
  }

  /**
   * Updates file references in a loader or tester file
   * @param filePath Path to the loader or tester file
   * @param oldBaseName Old file base name (without extension)
   * @param newBaseName New file base name (without extension)
   * @param isSameDirectory Whether the file is being renamed in the same directory
   * @returns Array of TextEdits
   */
  private static async updateFileReferences(
    filePath: string,
    oldBaseName: string,
    newBaseName: string,
    isSameDirectory: boolean
  ): Promise<TextEdit[]> {
    const edits: TextEdit[] = [];

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // Pattern to match file references in logtalk_load/1-2 first argument
      // The first argument can be:
      // 1. A single file name: logtalk_load(file) or logtalk_load('file')
      // 2. A list of file names: logtalk_load([file1, file2, ...])
      // Files can be referenced with or without extension (.lgt, .logtalk)
      // Files can be quoted with single quotes, double quotes, or unquoted

      // Track whether we're inside a logtalk_load/ensure_loaded/include call
      // This is needed to handle multi-line calls
      let insideLoadCall = false;
      let depth = 0; // Track nesting depth (parentheses and brackets combined)

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        // Update depth tracking for this line
        for (let i = 0; i < line.length; i++) {
          const char = line[i];

          // Check if we're starting a load directive
          if (!insideLoadCall) {
            // Look for logtalk_load(, ensure_loaded(, or include(
            if (char === '(' && i > 0) {
              const beforeParen = line.substring(0, i);
              if (beforeParen.includes('logtalk_load') ||
                  beforeParen.includes('ensure_loaded') ||
                  beforeParen.includes('include')) {
                insideLoadCall = true;
                depth = 1; // We just entered the opening parenthesis
                continue;
              }
            }
          }

          // If we're inside a load call, track depth
          if (insideLoadCall) {
            if (char === '(' || char === '[') {
              depth++;
            } else if (char === ')' || char === ']') {
              depth--;
              // If depth reaches 0, we've closed the load call
              if (depth === 0) {
                insideLoadCall = false;
              }
            }
          }
        }

        // Process the line if we're inside a load call
        if (insideLoadCall || line.includes('logtalk_load') ||
            line.includes('ensure_loaded') || line.includes('include')) {
          // Find all occurrences of the old file name in this line
          const lineEdits = this.findAndReplaceFileReferences(line, lineIndex, oldBaseName, newBaseName);
          edits.push(...lineEdits);
        }
      }

      // If file was moved to different directory, we should remove the reference
      if (!isSameDirectory && edits.length > 0) {
        this.logger.debug(`File moved to different directory - references will be removed from ${filePath}`);
        // For moves, we might want to comment out or remove the line entirely
        // For now, we'll just update the name and let the user handle the move
      }

    } catch (error) {
      this.logger.error(`Error updating file references in ${filePath}:`, error);
    }

    return edits;
  }

  /**
   * Finds and replaces file references in a single line
   * @param line The line to search
   * @param lineIndex The line index (0-based)
   * @param oldBaseName Old file base name (without extension)
   * @param newBaseName New file base name (without extension)
   * @returns Array of TextEdits for this line
   */
  private static findAndReplaceFileReferences(
    line: string,
    lineIndex: number,
    oldBaseName: string,
    newBaseName: string
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    // Create patterns to match different reference formats
    // Pattern 1: Single-quoted with optional extension: 'filename' or 'filename.lgt'
    const singleQuotePattern = new RegExp(`'(${this.escapeRegex(oldBaseName)})(?:\\.(lgt|logtalk))?'`, 'g');
    // Pattern 2: Double-quoted with optional extension: "filename" or "filename.lgt"
    const doubleQuotePattern = new RegExp(`"(${this.escapeRegex(oldBaseName)})(?:\\.(lgt|logtalk))?"`, 'g');
    // Pattern 3: Unquoted (atom) with optional extension: filename or filename.lgt
    // We need to check context to avoid matching parts of library notation like lgtunit(loader)
    const unquotedPattern = new RegExp(`\\b(${this.escapeRegex(oldBaseName)})(?:\\.(lgt|logtalk))?\\b`, 'g');

    const patterns = [
      { pattern: singleQuotePattern, quoteStyle: 'single' },
      { pattern: doubleQuotePattern, quoteStyle: 'double' },
      { pattern: unquotedPattern, quoteStyle: 'none' }
    ];

    for (const { pattern, quoteStyle } of patterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0; // Reset regex state
      let iterationCount = 0;
      const maxIterations = 100; // Safety limit to prevent infinite loops

      while ((match = pattern.exec(line)) !== null) {
        // Safety check to prevent infinite loops
        if (++iterationCount > maxIterations) {
          this.logger.warn(`Maximum iteration limit reached while processing line ${lineIndex + 1}`);
          break;
        }

        const matchText = match[0];
        const startChar = match.index;
        const endChar = startChar + matchText.length;

        // Prevent infinite loop: if match is empty, advance manually
        if (matchText.length === 0) {
          pattern.lastIndex++;
          continue;
        }

        // For unquoted matches, verify it's in a valid context
        // Skip if it's part of library notation like library(file) or lgtunit(file)
        if (quoteStyle === 'none') {
          // Check if preceded by '(' which would indicate library notation
          const charBefore = startChar > 0 ? line[startChar - 1] : '';
          if (charBefore === '(') {
            // This might be library notation - check if there's an atom immediately before the '('
            // We need to look backwards from the '(' to find if there's a library/module name
            let beforeParenIndex = startChar - 2; // Start before the '('
            // Skip whitespace backwards
            while (beforeParenIndex >= 0 && /\s/.test(line[beforeParenIndex])) {
              beforeParenIndex--;
            }
            // Now check if we have a word character (part of an atom)
            if (beforeParenIndex >= 0 && /\w/.test(line[beforeParenIndex])) {
              // Extract the atom before the '('
              let atomStart = beforeParenIndex;
              while (atomStart > 0 && /\w/.test(line[atomStart - 1])) {
                atomStart--;
              }
              const atomBefore = line.substring(atomStart, beforeParenIndex + 1);
              // Check if this looks like a library/module name (not a predicate like logtalk_load)
              // Library notation typically uses short names like: lgtunit, library, types, etc.
              // We should skip if it's NOT logtalk_load, ensure_loaded, include, etc.
              const loadingPredicates = ['logtalk_load', 'ensure_loaded', 'include', 'use_module', 'load_files'];
              if (!loadingPredicates.includes(atomBefore)) {
                this.logger.debug(`Skipping library notation at line ${lineIndex + 1}, col ${startChar + 1}: "${atomBefore}(${matchText})"`);
                continue;
              }
            }
          }
        }

        // Determine the replacement text based on the original format
        let replacement: string;
        const hasExtension = match[2] !== undefined; // Group 2 captures the extension
        const extension = hasExtension ? match[2] : 'lgt';

        if (quoteStyle === 'single') {
          replacement = hasExtension ? `'${newBaseName}.${extension}'` : `'${newBaseName}'`;
        } else if (quoteStyle === 'double') {
          replacement = hasExtension ? `"${newBaseName}.${extension}"` : `"${newBaseName}"`;
        } else {
          // Unquoted
          replacement = hasExtension ? `${newBaseName}.${extension}` : newBaseName;
        }

        const range = new Range(
          new Position(lineIndex, startChar),
          new Position(lineIndex, endChar)
        );

        edits.push(TextEdit.replace(range, replacement));
        this.logger.debug(`Found reference at line ${lineIndex + 1}, col ${startChar + 1}: "${matchText}" -> "${replacement}"`);
      }
    }

    return edits;
  }

  /**
   * Adds a file reference to a loader or tester file (when file is moved to new directory)
   * @param filePath Path to the loader or tester file
   * @param baseName File base name (without extension)
   * @returns Array of TextEdits
   */
  private static async addFileReference(filePath: string, baseName: string): Promise<TextEdit[]> {
    // For now, we won't automatically add references when files are moved
    // This is a more complex operation that might require user input
    // Users can manually add the reference to the new loader/tester file
    this.logger.debug(`File moved to new directory - user should manually add ${baseName} to ${filePath}`);
    return [];
  }

  /**
   * Escapes special regex characters in a string
   * @param str String to escape
   * @returns Escaped string
   */
  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
