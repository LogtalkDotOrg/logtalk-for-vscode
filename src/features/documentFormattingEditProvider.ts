"use strict";

import * as vscode from "vscode";
import {
  CancellationToken,
  DocumentFormattingEditProvider,
  FormattingOptions,
  Position,
  Range,
  TextDocument,
  TextEdit
} from "vscode";
import { getLogger } from "../utils/logger";
import { PredicateUtils } from "../utils/predicateUtils";
import { ArgumentUtils } from "../utils/argumentUtils";

export class LogtalkDocumentFormattingEditProvider implements DocumentFormattingEditProvider {
  private logger = getLogger();
  private lastTermType = "";
  private lastTermIndicator = "";

  /**
   * Custom command that chains native indentation conversion with Logtalk formatting
   */
  public async formatDocumentWithIndentationConversion(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      this.logger.debug('No active editor for chained formatting');
      return;
    }

    try {
      this.logger.debug('Starting chained formatting: indentation conversion + Logtalk formatting');

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
      await vscode.commands.executeCommand('editor.action.detectIndentation');
      this.logger.debug('Successfully updated editor options to use tabs');

      // Step 3: Apply Logtalk-specific formatting
      this.logger.debug('Applying Logtalk-specific formatting');
      await vscode.commands.executeCommand('editor.action.formatDocument');
      this.logger.debug('Successfully applied Logtalk formatting');

    } catch (error) {
      this.logger.error(`Error during chained formatting: ${error.message}`);
    }
  }

  public provideDocumentFormattingEdits(
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken
  ): TextEdit[] {
    const edits: TextEdit[] = [];

    this.logger.debug('Received formatting options - tabSize:', options.tabSize, 'insertSpaces:', options.insertSpaces);

    // Check if document actually contains spaces for indentation
    const documentText = document.getText();
    // Only detect space indentation if there are lines with leading spaces with at least the tab size
    const tabSize = options.tabSize || 4;
    const spaceIndentPattern = new RegExp(`^[ ]{${tabSize}}`, 'm');
    const hasSpaceIndentation = spaceIndentPattern.test(documentText);
    this.logger.debug('Document analysis - hasSpaceIndentation:', hasSpaceIndentation, 'options.insertSpaces:', options.insertSpaces);

    // If document uses spaces, trigger the chained formatting command asynchronously
    // and return empty edits (the command will handle everything)
    if (options.insertSpaces || hasSpaceIndentation) {
      this.logger.debug('Document uses spaces - triggering automatic indentation conversion + formatting');
      // Trigger the chained formatting asynchronously
      setTimeout(() => {
        this.formatDocumentWithIndentationConversion().catch(error => {
          this.logger.error(`Error during automatic indentation conversion: ${error.message}`);
        });
      }, 0);
      // Return empty edits - the async command will handle the formatting
      return [];
    }

    this.logger.debug('Document uses tabs, proceeding with normal Logtalk formatting');

    try {
      // Find all entity opening and closing directives
      const allEntities = this.findAllEntities(document);

      if (allEntities.length === 0) {
        this.logger.debug("No entity directives found, skipping formatting");
        return edits;
      }

      this.logger.debug(`Found ${allEntities.length} entities to format:`);
      allEntities.forEach((entity, index) => {
        this.logger.debug(`  Entity ${index + 1}: opening lines ${entity.opening.start.line + 1}-${entity.opening.end.line + 1}, closing lines ${entity.closing.start.line + 1}-${entity.closing.end.line + 1}`);
      });

      // Format each entity found in the document
      for (const entityInfo of allEntities) {
        // 1. Format entity opening directive (ensure it starts at column 0 with empty line after)
        this.formatEntityOpeningDirective(document, entityInfo.opening, edits);

        // 2. Format entity closing directive (ensure it starts at column 0 with empty line after)
        this.formatEntityClosingDirective(document, entityInfo.closing, edits);

        // 3. Indent all content inside the entity and apply specific directive formatting
        this.indentEntityContent(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);
      
        // 4. Ensure a single empty line at the end of the document
        this.ensureSingleEmptyLineAtDocumentEnd(document, edits);
      }

    } catch (error) {
      this.logger.error(`Error during document formatting: ${error.message}`);
    }

    return edits;
  }

  /**
   * Find all entity opening and closing directives in the document
   */
  private findAllEntities(document: TextDocument): { opening: Range; closing: Range }[] {
    const fullRange = new Range(
      new Position(0, 0),
      new Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length)
    );
    return this.findAllEntitiesInRange(document, fullRange);
  }

  /**
   * Find all entity opening and closing directives within a specific range of the document
   */
  public findAllEntitiesInRange(document: TextDocument, range: Range): { opening: Range; closing: Range }[] {
    const entities: { opening: Range; closing: Range }[] = [];
    const openingDirectives: { range: Range; type: string }[] = [];
    const closingDirectives: { range: Range; type: string }[] = [];

    // First pass: find all opening and closing directives within the specified range
    for (let lineNum = range.start.line; lineNum <= range.end.line; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      // Look for entity opening directive
      const openingMatch = lineText.match(/^:-\s*(object|protocol|category)\(/);
      if (openingMatch) {
        this.logger.debug(`Found entity opening directive at line ${lineNum + 1}: "${lineText}"`);
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        this.logger.debug(`Directive range: lines ${directiveRange.start + 1}-${directiveRange.end + 1}`);
        const entityRange = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );
        openingDirectives.push({ range: entityRange, type: openingMatch[1] });
      }

      // Look for entity closing directive
      const closingMatch = lineText.match(/^:-\s*end_(object|protocol|category)\./);
      if (closingMatch) {
        const entityRange = new Range(
          new Position(lineNum, 0),
          new Position(lineNum, document.lineAt(lineNum).text.length)
        );
        closingDirectives.push({ range: entityRange, type: closingMatch[1] });
      }
    }

    // Second pass: match opening and closing directives
    for (const opening of openingDirectives) {
      // Find the first closing directive of the same type that comes after this opening
      const matchingClosing = closingDirectives.find(closing =>
        closing.type === opening.type &&
        closing.range.start.line > opening.range.end.line
      );

      if (matchingClosing) {
        entities.push({
          opening: opening.range,
          closing: matchingClosing.range
        });

        // Remove the used closing directive to avoid matching it again
        const index = closingDirectives.indexOf(matchingClosing);
        closingDirectives.splice(index, 1);
      }
    }

    return entities;
  }

  /**
   * Format entity opening directive to start at column 0 with empty line after
   */
  public formatEntityOpeningDirective(document: TextDocument, range: Range, edits: TextEdit[]): void {
    const directiveText = document.getText(range);
    const formattedDirective = this.formatEntityOpeningDirectiveContent(directiveText);

    // Add empty line after directive if not present
    const nextLineNum = range.end.line + 1;
    let finalText = formattedDirective;

    if (nextLineNum < document.lineCount) {
      const nextLine = document.lineAt(nextLineNum).text;
      if (nextLine.trim() !== '') {
        finalText += '\n';
      }
    }

    edits.push(TextEdit.replace(range, finalText));
  }

  /**
   * Format the content of an entity opening directive with proper multi-line structure
   */
  private formatEntityOpeningDirectiveContent(directiveText: string): string {
    // Remove all newlines and normalize whitespace
    const normalizedText = directiveText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    // Parse entity directive: :- entity_type(arguments...).
    const match = normalizedText.match(/^:-\s*(object|protocol|category)\(\s*(.*)\)\s*\.\s*$/);
    if (!match) {
      // If parsing fails, fall back to simple formatting
      return directiveText.split('\n').map((line, index) => {
        if (index === 0) {
          return line.trim();
        } else {
          return '\t' + line.trim();
        }
      }).join('\n');
    }

    const entityType = match[1]; // "object", "protocol", or "category"
    const argumentsText = match[2].trim(); // "entity_name, implements(...), imports(...)"
    const prefix = `:- ${entityType}(`; // Ensure single space between :- and directive name
    const suffix = ').'; // ")."

    if (!argumentsText || argumentsText === '') {
      return prefix + suffix;
    }

    // Use ArgumentUtils to properly parse the arguments
    const entityArguments = ArgumentUtils.parseArguments(argumentsText);

    if (entityArguments.length <= 1) {
      // Single argument (just entity name) or empty - keep single line
      return prefix + argumentsText + suffix;
    }

    // Multiple arguments - format as multi-line with arguments indented
    let formatted = prefix + entityArguments[0].trim(); // Entity name on first line

    // Add remaining arguments (relations) on separate lines
    for (let i = 1; i < entityArguments.length; i++) {
      formatted += ',\n\t' + entityArguments[i].trim();
    }

    formatted += suffix;
    return formatted;
  }

  /**
   * Format entity closing directive to start at column 0 with single empty line before and after
   */
  public formatEntityClosingDirective(document: TextDocument, range: Range, edits: TextEdit[]): void {
    const directiveText = document.getText(range).trim();

    // Find the last non-empty line before the closing directive
    let lastContentLine = range.start.line - 1;
    while (lastContentLine >= 0 && document.lineAt(lastContentLine).text.trim() === '') {
      lastContentLine--;
    }

    // Determine the range to replace (from after last content line to end of closing directive)
    let replaceStartLine = lastContentLine + 1;
    let replaceStartChar = 0;

    // If there's content before, start from the next line
    if (lastContentLine >= 0) {
      replaceStartLine = lastContentLine + 1;
      replaceStartChar = 0;
    } else {
      // If no content before (shouldn't happen in normal entities), start from beginning
      replaceStartLine = 0;
      replaceStartChar = 0;
    }

    // Ensure proper spacing in closing directive
    const match = directiveText.match(/^:-\s*(end_(?:object|protocol|category))\./);
    const formattedDirective = match ? `:- ${match[1]}.` : directiveText;

    // Create the replacement text: single empty line + closing directive
    let finalText = '\n' + formattedDirective;

    // Add empty line after closing directive if not at end of file
    const nextLineNum = range.end.line + 1;
    if (nextLineNum < document.lineCount) {
      const nextLine = document.lineAt(nextLineNum).text;
      if (nextLine.trim() !== '') {
        finalText += '\n';
      }
    }

    // Replace from after the last content line to the end of the closing directive
    const replaceRange = new Range(
      new Position(replaceStartLine, replaceStartChar),
      range.end
    );

    edits.push(TextEdit.replace(replaceRange, finalText));
  }

  /**
   * Ensure all content inside entity is indented by at least one tab
   * Handles comments, directives, predicate clauses, and grammar rules specifically
   */
  public indentEntityContent(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    this.logger.debug(`Indenting entity content from line ${startLine + 1} to ${endLine + 1}`);
    let indentedItems = 0;

    let lineNum = startLine;
    while (lineNum <= endLine) {
      const line = document.lineAt(lineNum);
      const lineText = line.text;
      const trimmedText = lineText.trim();

      // Skip empty lines
      if (trimmedText === '') {
        lineNum++;
        this.lastTermType = "";
        this.lastTermIndicator = "";
        continue;
      }

      // Handle line comments - indent with one tab if they start at character zero
      if (trimmedText.startsWith('%')) {
        if (!lineText.startsWith('\t') && lineText.startsWith('%')) {
          this.logger.debug(`  Indenting line comment at line ${lineNum + 1}: "${lineText}"`);
          const indentedText = '\t' + lineText;
          const range = new Range(
            new Position(lineNum, 0),
            new Position(lineNum, lineText.length)
          );
          edits.push(TextEdit.replace(range, indentedText));
          indentedItems++;
        }
        lineNum++;
        continue;
      }

      // Handle block comments - indent all lines and don't change lastTermType
      if (trimmedText.startsWith('/*')) {
        // Get the range of the block comment
        const blockRange = this.getBlockCommentRange(document, lineNum);
        if (!lineText.startsWith('\t') && lineText.startsWith('/*')) {
          // Indent all lines in the block comment
          this.indentRange(document, blockRange.start, blockRange.end, edits);
          indentedItems++;
        }
        // Move past the block comment without changing lastTermType or lastTermIndicator
        lineNum = blockRange.end + 1;
        continue;
      }

      // Handle if/1 conditional compilation directives
      if (/^:-\s*if\(/.test(trimmedText)) {
        this.logger.debug(`  Found if/1 conditional compilation directive at line ${lineNum + 1}: "${trimmedText}"`);
        const endifLine = this.findMatchingEndif(document, lineNum);
        if (endifLine !== -1) {
          this.formatIfBlock(document, lineNum, endifLine, edits);
          indentedItems++;
        }
        lineNum = endifLine + 1;
        this.lastTermType = "directive";
        this.lastTermIndicator = "";
        continue;
      }

      // Handle directives (starting with :-)
      if (trimmedText.startsWith(':-')) {
        this.logger.debug(`  Found directive at line ${lineNum + 1}: "${trimmedText}"`);
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        // Call the appropriate formatter based on directive type
        if (/^:-\s*(object|protocol|category)\(/.test(trimmedText)) {
          // entity opening directive (when using the "Format Selection" command)
          this.formatEntityOpeningDirective(document, new Range(
            new Position(directiveRange.start, 0),
            new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
          ), edits);
        } else if (/^:-\s*(end_object|end_protocol|end_category)\./.test(trimmedText)) {
          // entity closing directive (when using the "Format Selection" command)
          this.formatEntityClosingDirective(document, new Range(
            new Position(directiveRange.start, 0),
            new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
          ), edits);
        } else if (/^:-\s*info\(\s*\[/.test(trimmedText)) {
          // info/1 directive with list
          this.formatInfo1Directive(document, directiveRange, edits);
        } else if (/^:-\s*initialization\(\s*\[/.test(trimmedText)) {
          // initialization/1 directive
          this.formatInitialization1Directive(document, directiveRange, edits);
        } else if (/^:-\s*mode\(/.test(trimmedText)) {
          // mode/2 directive
          this.formatMode2Directive(document, directiveRange, edits);
        } else if (/^:-\s*info\((?!\s*\[)[^,]+,/.test(trimmedText)) {
          // info/2 directive
          this.formatInfo2Directive(document, directiveRange, edits);
        } else if (/^:-\s*uses\((?!\s*\[)/.test(trimmedText)) {
          // uses/2 directive
          this.formatUses2Directive(document, directiveRange, edits);
        } else if (/^:-\s*alias\(/.test(trimmedText)) {
          // alias/2 directive
          this.formatAlias2Directive(document, directiveRange, edits);
        } else if (/^:-\s*uses\(\s*\[/.test(trimmedText)) {
          // uses/1 directive with list
          this.formatUses1Directive(document, directiveRange, edits);
        } else if (/^:-\s*use_module\(\s*\[/.test(trimmedText)) {
          // use_module/1 directive with list
          this.formatUseModule1Directive(document, directiveRange, edits);
        } else if (/^:-\s*(public|protected|private)\(/.test(trimmedText)) {
          // scope directives
          this.formatScopeDirective(document, directiveRange, edits);
        } else if (/^:-\s*(discontiguous|dynamic|coinductive|multifile|synchronized)\(\s*\[/.test(trimmedText)) {
          // predicate property directives with list
          this.formatPredicatePropertyDirective(document, directiveRange, edits);
        } else if (/^:-\s*use_module\([^,]+,/.test(trimmedText)) {
          // use_module/2 directive
          this.formatUseModule2Directive(document, directiveRange, edits);
        } else {
          // Other directives - just indent if needed
          if (!lineText.startsWith('\t')) {
            this.logger.debug(`  Found other directive at line ${lineNum + 1}: "${trimmedText}"`);
            this.indentRange(document, directiveRange.start, directiveRange.end, edits);
            indentedItems++;
          }
          // Reset indicator for directives that don't track predicates
          this.lastTermIndicator = "";
        }
        lineNum = directiveRange.end + 1;
        this.lastTermType = "directive";
        continue;
      }

      // Handle grammar rules (containing -->)
      if (trimmedText.includes('-->')) {
        this.logger.debug(`  Found grammar rule at line ${lineNum + 1}: "${trimmedText}"`);
        const ruleRange = PredicateUtils.getClauseRange(document, lineNum);
        this.formatClauseOrGrammarRule(document, ruleRange.start, ruleRange.end, edits);
        lineNum = ruleRange.end + 1;
        this.lastTermType = "non_terminal";
        continue;
      } else if (trimmedText.includes(':-')) {
        // Handle predicate clauses (facts and rules)
        this.logger.debug(`  Found predicate rule at line ${lineNum + 1}: "${trimmedText}"`);
        const clauseRange = PredicateUtils.getClauseRange(document, lineNum);
        this.formatClauseOrGrammarRule(document, clauseRange.start, clauseRange.end, edits);
        lineNum = clauseRange.end + 1;
        this.lastTermType = "predicate";
        continue;
      } else {
        // Handle predicate facts
        const factRange = PredicateUtils.getClauseRange(document, lineNum);

        this.logger.debug(`  Found predicate fact at line ${lineNum + 1}: "${trimmedText}"`);

        // Extract the complete fact text (may be multi-line)
        let factText = '';
        for (let factLineNum = factRange.start; factLineNum <= factRange.end; factLineNum++) {
          factText += document.lineAt(factLineNum).text.trim() + ' ';
        }
        factText = factText.trim();

        // Extract indicator from the complete fact
        const indicator = this.extractIndicatorFromTerm(factText, false);

        // Insert empty line if different indicator
        if (this.lastTermType === "predicate" && this.lastTermIndicator !== "" && indicator !== "" && this.lastTermIndicator !== indicator) {
          edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
        }
        // Insert empty line if switching from non-terminal or directive
        else if (this.lastTermType === "non_terminal" || this.lastTermType === "directive") {
          edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
        }

        // Indent the fact if needed
        if (!lineText.startsWith('\t')) {
          this.indentRange(document, factRange.start, factRange.end, edits);
          indentedItems++;
        }

        // Update the last term indicator
        if (indicator) {
          this.lastTermIndicator = indicator;
        }

        lineNum = factRange.end + 1;
        this.lastTermType = "predicate";
        continue;
      }

      lineNum++;
    }

    this.logger.debug(`Added indentation to ${indentedItems} items`);
  }

  /**
   * Helper method to indent all lines in a range with initial indent
   */
  private indentRange(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const line = document.lineAt(lineNum);
      const lineText = line.text;

      // Skip empty lines
      if (lineText.trim() === '') {
        continue;
      }

      // Add initial indent to line
      const newText = '\t' + lineText;
      const range = new Range(
        new Position(lineNum, 0),
        new Position(lineNum, lineText.length)
      );
      edits.push(TextEdit.replace(range, newText));
    }
  }

  /**
   * Helper method to get the range of a block comment
   * @param document The text document
   * @param startLine The line number where the block comment starts
   * @returns An object with start and end line numbers of the block comment
   */
  private getBlockCommentRange(document: TextDocument, startLine: number): { start: number; end: number } {
    let blockEndLine = startLine;
    while (blockEndLine <= document.lineCount) {
      const blockLine = document.lineAt(blockEndLine).text;
      if (blockLine.includes('*/')) {
        break;
      }
      blockEndLine++;
    }

    return { start: startLine, end: blockEndLine };
  }

  /**
   * Helper method to indent all lines in a range
   */
  private formatClauseOrGrammarRule(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    let initialIndent = '\t';
    if (document.lineAt(startLine).text.startsWith('\t')) {
      initialIndent = '';
    }
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const line = document.lineAt(lineNum);
      const lineText = line.text.trimEnd();
      this.logger.debug(`    Indenting line ${lineNum + 1}: "${lineText}"`);

      // Skip empty lines
      if (lineText === '') {
        continue;
      }

      let processedText = lineText;
      let extractedComment: string | null = null;

      // Check if this is the first line and contains ":- " or "-->"
      if (lineNum === startLine) {
        // Handle clause head lines containing ":-"
        if (lineText.includes(':-')) {
          const result = this.formatClauseOrGrammarHeadLine(lineText, ':-');
          processedText = initialIndent + result.text;
          extractedComment = result.comment;

          // Insert empty line if switching from non-terminal or directive to predicate
          if (this.lastTermType === "non_terminal" || this.lastTermType === "directive") {
            edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
          }
          // Insert empty line if same type (predicate) but different indicator
          else if (this.lastTermType === "predicate" && this.lastTermIndicator !== "" && result.indicator !== "" && this.lastTermIndicator !== result.indicator) {
            edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
          }

          // Update the last term indicator
          if (result.indicator) {
            this.lastTermIndicator = result.indicator;
          }
        // Handle grammar rule head lines containing "-->"
        } else if (lineText.includes('-->')) {
          const result = this.formatClauseOrGrammarHeadLine(lineText, '-->');
          processedText = initialIndent + result.text;
          extractedComment = result.comment;

          // Insert empty line if switching from predicate or directive to non-terminal
          if (this.lastTermType === "predicate" || this.lastTermType === "directive") {
            edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
          }
          // Insert empty line if same type (non-terminal) but different indicator
          else if (this.lastTermType === "non_terminal" && this.lastTermIndicator !== "" && result.indicator !== "" && this.lastTermIndicator !== result.indicator) {
            edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
          }

          // Update the last term indicator
          if (result.indicator) {
            this.lastTermIndicator = result.indicator;
          }
        } else {
          processedText = initialIndent + lineText;
        }
      } else {
        processedText = initialIndent + lineText;
      }
      this.logger.debug(`    Processed text: ${processedText}`);
      this.logger.debug(`    Extracted comment: ${extractedComment}`);

      // If there's an extracted comment, we need to handle the line replacement differently
      if (extractedComment) {
        // Replace the current line with the processed text
        const range = new Range(
          new Position(lineNum, 0),
          new Position(lineNum, lineText.length)
        );
        edits.push(TextEdit.replace(range, processedText));
        edits.push(TextEdit.insert(new Position(lineNum + 1, 0), '\t\t' + extractedComment + '\n'));
      } else {
        // Normal line replacement
        const range = new Range(
          new Position(lineNum, 0),
          new Position(lineNum, line.text.length)
        );
        edits.push(TextEdit.replace(range, processedText));
      }
    }
  }

  /**
   * Find the position of an operator at the top level (not inside parentheses, brackets, braces, or quotes)
   * @param text The text to search in
   * @param operator The operator to find (e.g., ':-' or '-->')
   * @returns The index of the operator, or -1 if not found at top level
   */
  private findTopLevelOperator(text: string, operator: string): number {
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    let inQuotes = false;
    let inSingleQuotes = false;
    let escapeNext = false;
    let inCharCode = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Handle character code notation first
      if (inCharCode) {
        if (char === '\\') {
          if (i + 1 < text.length) {
            i++;
          }
        }
        inCharCode = false;
        continue;
      }

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !inSingleQuotes) {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === "'" && !inQuotes) {
        if (!inSingleQuotes && i > 0 && text[i - 1] === '0') {
          inCharCode = true;
          continue;
        } else {
          inSingleQuotes = !inSingleQuotes;
          continue;
        }
      }

      if (inQuotes || inSingleQuotes) {
        continue;
      }

      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        parenDepth--;
      } else if (char === '[') {
        bracketDepth++;
      } else if (char === ']') {
        bracketDepth--;
      } else if (char === '{') {
        braceDepth++;
      } else if (char === '}') {
        braceDepth--;
      }

      // Check for operator at top level
      if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
        if (text.substring(i, i + operator.length) === operator) {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * Format a predicate clause head or a grammar rule head line to ensure proper spacing and handle line comments
   * Also extracts the predicate/non-terminal indicator for tracking
   */
  private formatClauseOrGrammarHeadLine(lineText: string, operator: string): { text: string; comment: string | null; indicator: string } {
    // Find the operator position at the top level (not inside parentheses, brackets, or braces)
    const operatorIndex = this.findTopLevelOperator(lineText, operator);
    if (operatorIndex === -1) {
      return { text: lineText, comment: null, indicator: '' };
    }

    // Extract the predicate/non-terminal indicator (functor/arity or functor//arity)
    let beforeOperator = lineText.substring(0, operatorIndex);
    let afterOperator = lineText.substring(operatorIndex + operator.length);

    // Extract the indicator from the head (before the operator)
    const headText = beforeOperator.trim();
    let indicator = '';

    // Extract functor name (must start with lowercase letter or underscore)
    const functorMatch = headText.match(/^([a-z_][a-zA-Z0-9_]*)/);
    if (functorMatch) {
      const functor = functorMatch[1];

      // Extract arguments using utility method
      const args = ArgumentUtils.extractArgumentsFromCall(headText);
      const arity = args.length;

      // Use // notation for grammar rules, / notation for predicates
      indicator = operator === '-->' ? `${functor}//${arity}` : `${functor}/${arity}`;
    }

    // Ensure proper spacing before operator
    if (!beforeOperator.endsWith(' ')) {
        beforeOperator = beforeOperator + ' ';
    }

    // Check for line comments after the operator
    const commentMatch = afterOperator.match(/^(.*?)(\s*%.*?)$/);
    if (commentMatch) {
      const mainContent = commentMatch[1].trim();
      const comment = commentMatch[2].trim();

      // Return the main content without the comment, and the comment separately
      return {
        text: beforeOperator + operator + (mainContent ? ' ' + mainContent : ''),
        comment: comment,
        indicator: indicator
      };
    }

    // No comment found - ensure space after operator if there's content
    const trimmedAfter = afterOperator.trim();
    if (trimmedAfter) {
      return { text: beforeOperator + operator + ' ' + trimmedAfter, comment: null, indicator: indicator };
    }

    return { text: beforeOperator + operator + afterOperator, comment: null, indicator: indicator };
  }

  /**
   * Extract the predicate or non-terminal indicator from a term
   * @param termText The text of the term (fact, clause head, or grammar rule head)
   * @param isGrammarRule Whether this is a grammar rule (uses // notation)
   * @returns The indicator in the form functor/arity or functor//arity
   */
  private extractIndicatorFromTerm(termText: string, isGrammarRule: boolean): string {
    const trimmed = termText.trim();

    // Extract functor name (must start with lowercase letter or underscore)
    const functorMatch = trimmed.match(/^([a-z][a-zA-Z0-9_]*)/);
    if (functorMatch) {
      const functor = functorMatch[1];

      // Extract arguments using utility method
      const args = ArgumentUtils.extractArgumentsFromCall(trimmed);
      const arity = args.length;

      // Use // notation for grammar rules, / notation for predicates
      return isGrammarRule ? `${functor}//${arity}` : `${functor}/${arity}`;
    }

    return '';
  }

  /**
   * Extract the predicate or non-terminal indicator from a directive
   * Handles two cases:
   * 1. Directives with explicit indicators: info(foo/2, ...), public(bar/1)
   * 2. Directives with callable forms: mode(foo(+int), one), meta_predicate(bar(*, ::))
   * @param directiveText The text of the directive
   * @returns The indicator in the form functor/arity or functor//arity, or empty string if not found
   */
  private extractIndicatorFromDirective(directiveText: string): string {
    const trimmed = directiveText.trim();

    // First, try to match explicit indicator patterns: name/arity or name//arity
    const indicatorMatch = trimmed.match(/([a-z][a-zA-Z0-9_]*)\/\/(\d+)|([a-z][a-zA-Z0-9_]*)\/(\d+)/);
    if (indicatorMatch) {
      // Check if it's a non-terminal (// notation)
      if (indicatorMatch[1] && indicatorMatch[2]) {
        return `${indicatorMatch[1]}//${indicatorMatch[2]}`;
      }
      // Otherwise it's a predicate (/ notation)
      if (indicatorMatch[3] && indicatorMatch[4]) {
        return `${indicatorMatch[3]}/${indicatorMatch[4]}`;
      }
    }

    // Second, try to extract from callable form (e.g., mode(foo(+int), one))
    // Match the directive name and extract the first argument
    const callableMatch = trimmed.match(/^:-\s*\w+\(\s*([a-z][a-zA-Z0-9_]*)\s*\(/);
    if (callableMatch) {
      const functor = callableMatch[1];

      // Find the opening parenthesis after the functor
      const functorStart = trimmed.indexOf(functor);
      const openParenPos = trimmed.indexOf('(', functorStart + functor.length);

      if (openParenPos !== -1) {
        // Use ArgumentUtils to find the matching closing parenthesis
        const closeParenPos = ArgumentUtils.findMatchingCloseParen(trimmed, openParenPos);

        if (closeParenPos !== -1) {
          // Extract the arguments between the parentheses
          const argsText = trimmed.substring(openParenPos + 1, closeParenPos);
          const args = ArgumentUtils.parseArguments(argsText);
          const arity = args.length;

          // Determine if it's a non-terminal by checking the directive name
          // meta_non_terminal/1 uses // notation, others use / notation
          const isNonTerminal = /^:-\s*meta_non_terminal\(/.test(trimmed);

          return isNonTerminal ? `${functor}//${arity}` : `${functor}/${arity}`;
        }
      }
    }

    return '';
  }

  /**
   * Find the matching endif directive for a given if directive, handling nested if/endif blocks
   */
  private findMatchingEndif(document: TextDocument, ifLineNum: number): number {
    let nestingLevel = 1; // Start with 1 for the initial if directive

    for (let lineNum = ifLineNum + 1; lineNum < document.lineCount; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      // Check for nested if directives
      if (/^:-\s*if\(/.test(lineText)) {
        nestingLevel++;
        this.logger.debug(`  Found nested if at line ${lineNum + 1}, nesting level: ${nestingLevel}`);
      }
      // Check for endif directives
      else if (/^:-\s*endif\s*\./.test(lineText)) {
        nestingLevel--;
        this.logger.debug(`  Found endif at line ${lineNum + 1}, nesting level: ${nestingLevel}`);

        // If we've found the matching endif for our original if
        if (nestingLevel === 0) {
          this.logger.debug(`  Found matching endif at line ${lineNum + 1} for if at line ${ifLineNum + 1}`);
          return lineNum;
        }
      }
    }

    // No matching endif found
    this.logger.warn(`No matching endif found for if directive at line ${ifLineNum + 1}`);
    return -1;
  }

  /**
   * Format a single info/1 directive using pre-computed range
   */
  private formatInfo1Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const formattedInfo1 = this.formatInfo1DirectiveContent(document, directiveRange);

    // Add empty line after directive if not present
    const nextLineNum = directiveRange.end + 1;
    let finalText = formattedInfo1;

    if (nextLineNum < document.lineCount) {
      const nextLine = document.lineAt(nextLineNum).text;
      if (nextLine.trim() !== '') {
        finalText += '\n';
      }
    }

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, finalText));
  }

  /**
   * Format the content of an info/1 directive
   */
  private formatInfo1DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }
    directiveText = directiveText.trim();

    // Normalize the text to extract list content
    const normalizedText = directiveText.replace(/\s+/g, ' ');

    // Parse the directive to ensure proper formatting
    const directiveMatch = normalizedText.match(/^:-\s*info\(\s*\[(.*)\]\s*\)\s*\.$/);
    if (!directiveMatch) {
      // If parsing fails, ensure proper spacing in the directive
      const reformattedDirective = normalizedText.replace(/^:-\s*(info)/, ':- $1');
      return '\t' + reformattedDirective;
    }

    const listContent = directiveMatch[1].trim();
    if (!listContent) {
      return '\t:- info([]).';
    }

    // Parse elements and format with special handling for parameters and remarks
    const elements = ArgumentUtils.parseArguments(listContent);

    let formatted = '\t:- info([\n';
    elements.forEach((element, index) => {
      const formattedElement = this.formatInfo1Element(element.trim());
      formatted += '\t\t' + formattedElement;
      if (index < elements.length - 1) {
        formatted += ',\n';
      } else {
        formatted += '\n';
      }
    });
    formatted += '\t]).';

    return formatted;
  }

  /**
   * Format individual elements in info/1 directives, with special handling for
   * parameters and remarks keys that contain lists
   */
  private formatInfo1Element(element: string): string {
    // Check if this element contains parameters or remarks with lists
    const listKeyMatch = element.match(/^(parameters|remarks)\s+is\s+\[(.*)\]$/);
    if (listKeyMatch) {
      const key = listKeyMatch[1];
      const listContent = listKeyMatch[2].trim();

      if (!listContent) {
        return key + ' is []';
      }

      const listElements = ArgumentUtils.parseArguments(listContent);
      let formatted = key + ' is [\n';
      listElements.forEach((listElement, index) => {
        formatted += '\t\t\t' + listElement.trim();
        if (index < listElements.length - 1) {
          formatted += ',\n';
        } else {
          formatted += '\n';
        }
      });
      formatted += '\t\t]';

      return formatted;
    }

    // For other elements, return as-is
    return element;
  }

  /**
   * Format a single initialization/1 directive using pre-computed range
   */
  private formatInitialization1Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    if (!document.lineAt(directiveRange.start).text.startsWith('\t')) {
      this.indentRange(document, directiveRange.start, directiveRange.end, edits);
    }

    // Add empty line after directive if not present
    const nextLineNum = directiveRange.end + 1;
    if (nextLineNum < document.lineCount) {
      const nextLine = document.lineAt(nextLineNum).text;
      if (nextLine.trim() !== '') {
        edits.push(TextEdit.insert(new Position(directiveRange.end + 1, 0), '\n'));
      }
    }
  }

  /**
   * Format a single mode/2 directive using pre-computed range
   */
  private formatMode2Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    // Extract directive text to get the indicator
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }

    const indicator = this.extractIndicatorFromDirective(directiveText);
    this.logger.debug(`mode/2 directive: indicator="${indicator}", lastTermIndicator="${this.lastTermIndicator}"`);

    // Insert empty line if switching to a different predicate/non-terminal
    if (indicator && this.lastTermIndicator !== "" && indicator !== this.lastTermIndicator) {
      this.logger.debug(`Inserting empty line before mode/2 directive (different indicator)`);
      edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
    }

    const formattedMode = this.formatMode2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedMode));

    // Update the last term indicator
    if (indicator) {
      this.lastTermIndicator = indicator;
    }
  }

  /**
   * Format the content of a mode/2 directive
   */
  private formatMode2DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }
    directiveText = directiveText.trim();

    // Parse mode/2 directive: :- mode(template, solutions).
    const normalizedText = directiveText.replace(/\s+/g, ' ');
    const match = normalizedText.match(/^:-\s*mode\(\s*(.*)\)\s*\.$/);
    if (!match) {
      // If parsing fails, ensure proper spacing in the directive
      const reformattedDirective = normalizedText.replace(/^:-\s*(\w+)/, ':- $1');
      return '\t' + reformattedDirective;
    }

    const argumentsText = match[1].trim();
    if (!argumentsText) {
      return '\t:- mode().';
    }

    // Use ArgumentUtils to parse the two arguments
    const directiveArguments = ArgumentUtils.parseArguments(argumentsText);
    if (directiveArguments.length !== 2) {
      // If not exactly 2 arguments, ensure proper spacing and return
      return '\t:- mode(' + argumentsText + ').';
    }

    const template = directiveArguments[0].trim();
    const solutions = directiveArguments[1].trim();

    // Format with proper spacing: single space after :- and single space between arguments
    return '\t:- mode(' + template + ', ' + solutions + ').';
  }

  /**
   * Format a single info/2 directive using pre-computed range
   */
  private formatInfo2Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    // Extract directive text to get the indicator
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }

    const indicator = this.extractIndicatorFromDirective(directiveText);

    // Insert empty line if switching to a different predicate/non-terminal
    if (indicator && this.lastTermIndicator !== "" && indicator !== this.lastTermIndicator) {
      edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
    }

    const formattedInfo2 = this.formatInfo2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedInfo2));

    // Update the last term indicator
    if (indicator) {
      this.lastTermIndicator = indicator;
    }
  }

  /**
   * Format the content of an info/2 directive
   */
  private formatInfo2DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }
    directiveText = directiveText.trim();

    // Parse info/2 directive: :- info(predicate/arity, [list]).
    const normalizedText = directiveText.replace(/\s+/g, ' ');
    const match = normalizedText.match(/^:-\s*info\(\s*(.*)\)\s*\.$/);
    if (!match) {
      return '\t' + directiveText;
    }

    const argumentsText = match[1].trim();
    if (!argumentsText) {
      return '\t' + directiveText;
    }

    // Use ArgumentUtils to parse all directive arguments
    const directiveArguments = ArgumentUtils.parseArguments(argumentsText);
    if (directiveArguments.length !== 2) {
      return '\t' + directiveText;
    }

    const predicateIndicator = directiveArguments[0].trim();
    const listArgument = directiveArguments[1].trim();

    // Extract list content from [...]
    const listMatch = listArgument.match(/^\[(.*)\]$/);
    if (!listMatch) {
      return '\t' + directiveText;
    }

    const listContent = listMatch[1].trim();
    if (!listContent) {
      // Empty list case
      return '\t:- info(' + predicateIndicator + ', []).';
    }

    const elements = ArgumentUtils.parseArguments(listContent);

    let formatted = '\t:- info(' + predicateIndicator + ', [\n';
    elements.forEach((element, index) => {
      const formattedElement = this.formatInfo2Element(element.trim());
      formatted += '\t\t' + formattedElement;
      if (index < elements.length - 1) {
        formatted += ',\n';
      } else {
        formatted += '\n';
      }
    });
    formatted += '\t]).';

    return formatted;
  }

  /**
   * Format individual elements in info/2 directives, with special handling for
   * arguments, exceptions, and examples keys that contain lists
   */
  private formatInfo2Element(element: string): string {
    // Check if this element contains arguments, exceptions, or examples with lists
    const listKeyMatch = element.match(/^(arguments|exceptions|examples|remarks)\s+is\s+\[(.*)\]$/);
    if (listKeyMatch) {
      const key = listKeyMatch[1];
      const listContent = listKeyMatch[2].trim();

      if (!listContent) {
        return key + ' is []';
      }

      const listElements = ArgumentUtils.parseArguments(listContent);
      let formatted = key + ' is [\n';
      listElements.forEach((listElement, index) => {
        formatted += '\t\t\t' + listElement.trim();
        if (index < listElements.length - 1) {
          formatted += ',\n';
        } else {
          formatted += '\n';
        }
      });
      formatted += '\t\t]';

      return formatted;
    }

    // For other elements, return as-is
    return element;
  }

  /**
   * Format a single uses/2 directive using pre-computed range
   */
  private formatUses2Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const formattedUses = this.formatUses2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedUses));
  }

  /**
   * Format the content of a uses/2 directive
   */
  private formatUses2DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }
    directiveText = directiveText.trim();

    // Parse uses directive: :- uses(Object, [list]).
    const normalizedText = directiveText.replace(/\s+/g, ' ');
    const match = normalizedText.match(/^:-\s*uses\(\s*(.*)\)\s*\.$/);
    if (!match) {
      return '\t' + directiveText;
    }

    const argumentsText = match[1].trim();
    if (!argumentsText) {
      return '\t' + directiveText;
    }

    // Use ArgumentUtils to parse all directive arguments
    const directiveArguments = ArgumentUtils.parseArguments(argumentsText);
    if (directiveArguments.length !== 2) {
      return '\t' + directiveText;
    }

    const objectName = directiveArguments[0].trim();
    const listArgument = directiveArguments[1].trim();

    // Extract list content from [...]
    const listMatch = listArgument.match(/^\[(.*)\]$/);
    if (!listMatch) {
      return '\t' + directiveText;
    }

    const listContent = listMatch[1].trim();
    if (!listContent) {
      // Empty list case
      return '\t:- uses(' + objectName + ', []).';
    }

    const elements = ArgumentUtils.parseArguments(listContent);

    let formatted = '\t:- uses(' + objectName + ', [\n\t\t';
    elements.forEach((element, index) => {
      formatted += element.trim();
      if (index < elements.length - 1) {
        formatted += ', ';
      } else {
        formatted += '\n';
      }
    });
    formatted += '\t]).';

    return formatted;
  }

  /**
   * Format a single alias/2 directive using pre-computed range
   */
  private formatAlias2Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const formattedAlias = this.formatAlias2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedAlias));
  }

  /**
   * Format the content of an alias/2 directive
   */
  private formatAlias2DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }
    directiveText = directiveText.trim();

    // Parse alias directive: :- alias(Object, List).
    const normalizedText = directiveText.replace(/\s+/g, ' ');
    const match = normalizedText.match(/^:-\s*alias\(\s*(.*)\)\s*\.$/);
    if (!match) {
      return '\t' + directiveText;
    }

    const argumentsText = match[1].trim();
    if (!argumentsText) {
      return '\t' + directiveText;
    }

    // Use ArgumentUtils to parse all directive arguments
    const directiveArguments = ArgumentUtils.parseArguments(argumentsText);
    if (directiveArguments.length !== 2) {
      return '\t' + directiveText;
    }

    const objectName = directiveArguments[0].trim();
    const listArgument = directiveArguments[1].trim();

    // Extract list content from [...]
    const listMatch = listArgument.match(/^\[(.*)\]$/);
    if (!listMatch) {
      return '\t' + directiveText;
    }

    const listContent = listMatch[1].trim();
    if (!listContent) {
      // Empty list case
      return '\t:- alias(' + objectName + ', []).';
    }

    const elements = ArgumentUtils.parseArguments(listContent);

    let formatted = '\t:- alias(' + objectName + ', [\n\t\t';
    elements.forEach((element, index) => {
      formatted += element.trim();
      if (index < elements.length - 1) {
        formatted += ', ';
      } else {
        formatted += '\n';
      }
    });
    formatted += '\t]).';

    return formatted;
  }

  /**
   * Format a single use_module/2 directive using pre-computed range
   */
  private formatUseModule2Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const formattedUseModule = this.formatUseModule2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedUseModule));
  }

  /**
   * Format the content of a use_module/2 directive
   */
  private formatUseModule2DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }
    directiveText = directiveText.trim();

    // Parse use_module directive: :- use_module(Module, [list]).
    const normalizedText = directiveText.replace(/\s+/g, ' ');
    const match = normalizedText.match(/^:-\s*use_module\(\s*(.*)\)\s*\.$/);
    if (!match) {
      return '\t' + directiveText.trim();
    }

    const argumentsText = match[1].trim();
    if (!argumentsText) {
      return '\t' + directiveText.trim();
    }

    // Use ArgumentUtils to parse all directive arguments
    const directiveArguments = ArgumentUtils.parseArguments(argumentsText);
    if (directiveArguments.length !== 2) {
      return '\t' + directiveText.trim();
    }

    const moduleName = directiveArguments[0].trim();
    const listArgument = directiveArguments[1].trim();

    // Extract list content from [...]
    const listMatch = listArgument.match(/^\[(.*)\]$/);
    if (!listMatch) {
      return '\t' + directiveText.trim();
    }

    const listContent = listMatch[1].trim();
    if (!listContent) {
      // Empty list case
      return '\t:- use_module(' + moduleName + ', []).';
    }

    const elements = ArgumentUtils.parseArguments(listContent);

    let formatted = '\t:- use_module(' + moduleName + ', [\n\t\t';
    elements.forEach((element, index) => {
      formatted += element.trim();
      if (index < elements.length - 1) {
        formatted += ', ';
      } else {
        formatted += '\n';
      }
    });
    formatted += '\t]).';

    return formatted;
  }

  /**
   * Format a single uses/1 directive using pre-computed range
   */
  private formatUses1Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const formattedUses1 = this.formatListDirectiveContent(document, directiveRange, 'uses');

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedUses1));
  }

  /**
   * Format a single use_module/1 directive using pre-computed range
   */
  private formatUseModule1Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const formattedUseModule = this.formatListDirectiveContent(document, directiveRange, 'use_module');

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedUseModule));
  }

  /**
   * Format a single scope directive using pre-computed range
   */
  private formatScopeDirective(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const lineText = document.lineAt(directiveRange.start).text.trim();
    const match = lineText.match(/^:-\s*(public|protected|private)\(/);
    if (match) {
      const directiveName = match[1];

      // Extract directive text to get the indicator (for single indicator directives)
      let directiveText = '';
      for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
        directiveText += document.lineAt(lineNum).text;
      }

      const indicator = this.extractIndicatorFromDirective(directiveText);
      this.logger.debug(`scope directive: indicator="${indicator}", lastTermIndicator="${this.lastTermIndicator}"`);

      // Insert empty line if switching to a different predicate/non-terminal
      // (only for single indicator directives, not lists)
      if (indicator && this.lastTermIndicator !== "" && indicator !== this.lastTermIndicator) {
        this.logger.debug(`Inserting empty line before scope directive (different indicator)`);
        edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
      }

      // Check if this is a list directive or single indicator directive
      if (/^:-\s*(public|protected|private)\(\s*\[/.test(lineText)) {
        // List directive - use existing list formatter
        const formattedScope = this.formatListDirectiveContent(document, directiveRange, directiveName);

        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );

        edits.push(TextEdit.replace(range, formattedScope));
      } else {
        // Single indicator directive - format with proper spacing
        const formattedScope = this.formatSingleIndicatorDirective(document, directiveRange, directiveName);

        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );

        edits.push(TextEdit.replace(range, formattedScope));

        // Update the last term indicator (only for single indicator directives)
        if (indicator) {
          this.lastTermIndicator = indicator;
        }
      }
    }
  }

  /**
   * Format a single indicator directive (non-list) with proper spacing
   */
  private formatSingleIndicatorDirective(document: TextDocument, directiveRange: { start: number; end: number }, directiveName: string): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }
    directiveText = directiveText.trim();

    // Parse the directive: :- directiveName(indicator).
    const normalizedText = directiveText.replace(/\s+/g, ' ');
    const match = normalizedText.match(/^:-\s*\w+\(\s*(.*)\)\s*\.$/);
    if (!match) {
      // If parsing fails, ensure proper spacing in the directive
      const reformattedDirective = normalizedText.replace(/^:-\s*(\w+)/, ':- $1');
      return '\t' + reformattedDirective;
    }

    const indicatorText = match[1].trim();
    return `\t:- ${directiveName}(${indicatorText}).`;
  }

  /**
   * Format a single predicate property directive using pre-computed range
   */
  private formatPredicatePropertyDirective(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const lineText = document.lineAt(directiveRange.start).text.trim();
    const match = lineText.match(/^:-\s*(discontiguous|dynamic|coinductive|multifile|synchronized)\(/);
    if (match) {
      const directiveName = match[1];

      // Extract directive text to get the first indicator from the list
      let directiveText = '';
      for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
        directiveText += document.lineAt(lineNum).text;
      }

      const indicator = this.extractIndicatorFromDirective(directiveText);

      // Insert empty line if switching to a different predicate/non-terminal
      if (indicator && this.lastTermIndicator !== "" && indicator !== this.lastTermIndicator) {
        edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
      }

      const formattedProperty = this.formatListDirectiveContent(document, directiveRange, directiveName);

      const range = new Range(
        new Position(directiveRange.start, 0),
        new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
      );

      edits.push(TextEdit.replace(range, formattedProperty));

      // Update the last term indicator
      if (indicator) {
        this.lastTermIndicator = indicator;
      }
    }
  }

  /**
   * Generic method to format single-argument list directives
   */
  private formatListDirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }, directiveName: string): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }
    directiveText = directiveText.trim();

    // Normalize the text to extract list content
    const normalizedText = directiveText.replace(/\s+/g, ' ');

    // Parse the directive to ensure proper formatting
    const directiveMatch = normalizedText.match(/^:-\s*\w+\(\s*\[(.*)\]\s*\)\s*\.$/);
    if (!directiveMatch) {
      // If parsing fails, ensure proper spacing in the directive
      const reformattedDirective = normalizedText.replace(/^:-\s*(\w+)/, ':- $1');
      return '\t' + reformattedDirective;
    }

    const listContent = directiveMatch[1].trim();
    if (!listContent) {
      return `\t:- ${directiveName}([]).`;
    }

    // Parse arguments and format
    const elements = ArgumentUtils.parseArguments(listContent);

    let formatted = `\t:- ${directiveName}([\n\t\t`;
    elements.forEach((element, index) => {
      formatted += `${element.trim()}`;
      if (index < elements.length - 1) {
        formatted += ', ';
      } else {
        formatted += '\n';
      }
    });
    formatted += `\t]).`;

    return formatted;
  }

  /**
   * Format a conditional compilation block (if/elif/else/endif) with proper spacing and nesting
   */
  private formatIfBlock(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    // Determine the base indentation level (should be one tab for entity content)
    let baseIndent = '\t';
    if (document.lineAt(startLine).text.startsWith('\t')) {
      baseIndent = '';
    }

    // Track nesting level for nested if/endif blocks
    let nestingLevel = 0;

    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const line = document.lineAt(lineNum);
      const lineText = line.text;
      const trimmedText = lineText.trim();

      // Skip empty lines
      if (trimmedText === '') {
        continue;
      }

      // Check if this line contains a conditional compilation directive
      const directiveMatch = trimmedText.match(/^:-\s*(if|elif|else|endif)(.*)$/);

      if (directiveMatch) {
        const directiveName = directiveMatch[1];
        const remainder = directiveMatch[2]; // Everything after the directive name

        // Determine the indentation level for this directive
        let directiveNestingLevel = nestingLevel;

        // elif, else, and endif should be at the same level as their corresponding if
        // So we need to use the nesting level BEFORE the current if block
        if (directiveName === 'elif' || directiveName === 'else' || directiveName === 'endif') {
          directiveNestingLevel = nestingLevel - 1;
        }

        // Format the directive with base indent plus nesting indent
        const directiveIndent = baseIndent + '\t'.repeat(directiveNestingLevel);
        const formattedDirective = `${directiveIndent}${lineText}`;

        this.logger.debug(`    Formatting conditional directive at line ${lineNum + 1}, nesting=${nestingLevel}, directive_nesting=${directiveNestingLevel}: "${trimmedText}" → "${formattedDirective}"`);

        const range = new Range(
          new Position(lineNum, 0),
          new Position(lineNum, lineText.length)
        );
        edits.push(TextEdit.replace(range, formattedDirective));

        // Adjust nesting level AFTER formatting
        if (directiveName === 'if') {
          nestingLevel++;
        } else if (directiveName === 'endif') {
          nestingLevel--;
        }
        // elif and else don't change nesting level
      } else {
        // This is content between conditional directives
        // Content should be indented one level deeper than the current if directive
        // The current if is at level (nestingLevel - 1), so content is at nestingLevel
        const contentIndent = baseIndent + '\t'.repeat(nestingLevel);
        const formattedContent = contentIndent + lineText;

        this.logger.debug(`    Formatting conditional block content at line ${lineNum + 1}, nesting=${nestingLevel}: "${trimmedText}" → "${formattedContent}"`);

        const range = new Range(
          new Position(lineNum, 0),
          new Position(lineNum, lineText.length)
        );
        edits.push(TextEdit.replace(range, formattedContent));
      }
    }
  }

  /**
   * Ensure a final newline at the end of the document
   */
  private ensureSingleEmptyLineAtDocumentEnd(document: TextDocument, edits: TextEdit[]): void {
    if (document.lineCount === 0) {
      // Empty document, do nothing
      return;
    }

    const lastLineIndex = document.lineCount - 1;
    const lastLine = document.lineAt(lastLineIndex);

    // Check if the last line is empty
    if (lastLine.text.trim() === '') {
      // Last line is empty, find the last line with content
      let lastContentLineIndex = lastLineIndex - 1;

      // Find the last line with actual content
      while (lastContentLineIndex >= 0 && document.lineAt(lastContentLineIndex).text.trim() === '') {
        lastContentLineIndex--;
      }

      if (lastContentLineIndex >= 0) {
        // Remove all empty lines after the last content line
        const startPosition = new Position(lastContentLineIndex + 1, 0);
        const endPosition = new Position(lastLineIndex, lastLine.text.length);

        // Delete all the empty lines (the last content line already has its newline)
        edits.push(TextEdit.delete(new Range(startPosition, endPosition)));
      }
    } else {
      // Last line has content but no final newline, add one
      const endPosition = new Position(lastLineIndex, lastLine.text.length);
      edits.push(TextEdit.insert(endPosition, '\n'));
    }
  }

}
