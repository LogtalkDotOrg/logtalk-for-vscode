"use strict";

import * as vscode from "vscode";
import {
  CancellationToken,
  DocumentFormattingEditProvider,
  FormattingOptions,
  Position,
  Range,
  TextDocument,
  TextEdit,
  workspace
} from "vscode";
import { getLogger } from "../utils/logger";
import { PredicateUtils } from "../utils/predicateUtils";
import { ArgumentUtils } from "../utils/argumentUtils";

export class LogtalkDocumentFormattingEditProvider implements DocumentFormattingEditProvider {
  private logger = getLogger();
  private lastTermType = "";
  private lastTermIndicator = "";
  private lastPredicateIndicator = "";

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
      }

      // Ensure a single empty line at the end of the document
      this.ensureSingleEmptyLineAtDocumentEnd(document, edits);

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

    edits.push(TextEdit.replace(range, formattedDirective));

    // Update the last term indicator
    // Extract entity type from directive (object, protocol, or category)
    const match = directiveText.match(/^:-\s*(object|protocol|category)\(/);
    if (match) {
      const entityType = match[1];
      this.lastTermIndicator = `${entityType}/1`; // or higher arity depending on arguments
      this.lastPredicateIndicator = "";
    }
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
        if (nextLine.trim().match(/:-\s*(object|protocol|category)\(/)) {
          finalText += '\n\n';
        } else {
          finalText += '\n';
        }
      }
    }

    // Add a second empty line if the next term is an entity opening directive
    const nextNextLineNum = nextLineNum + 1;
    if (nextNextLineNum < document.lineCount) {
      const nextNextLine = document.lineAt(nextNextLineNum).text;
      if (nextNextLine.trim().match(/:-\s*(object|protocol|category)\(/)) {
        finalText += '\n';
      }
    }

    // Replace from after the last content line to the end of the closing directive
    const replaceRange = new Range(
      new Position(replaceStartLine, replaceStartChar),
      range.end
    );

    edits.push(TextEdit.replace(replaceRange, finalText));

    // Update the last term indicator
    // Extract entity type from directive (end_object, end_protocol, or end_category)
    const entityMatch = directiveText.match(/^:-\s*(end_(?:object|protocol|category))\./);
    if (entityMatch) {
      this.lastTermIndicator = `${entityMatch[1]}/0`;
      this.lastPredicateIndicator = "";
    }
  }

  /**
   * Ensure all content inside entity is indented by at least one tab
   * Handles comments, directives, predicate clauses, and grammar rules specifically
   */
  public indentEntityContent(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    this.logger.debug(`Indenting entity content from line ${startLine + 1} to ${endLine + 1}`);
    let indentedItems = 0;
    this.lastTermType = "";
    this.lastTermIndicator = "";
    this.lastPredicateIndicator = "";

    let lineNum = startLine;
    while (lineNum <= endLine) {
      const line = document.lineAt(lineNum);
      const lineText = line.text;
      const trimmedText = lineText.trim();

      // Skip and collapse consecutive empty lines
      if (trimmedText === '') {
        const prevLine = lineNum - 1;
        if (prevLine >= 0 && document.lineAt(prevLine).text.trim() === '') {
          edits.push(TextEdit.delete(new Range(new Position(prevLine, 0), new Position(lineNum, 0))));
        }
        lineNum++;
        continue;
      }

      // Handle line comments - indent if they start at character zero but not followed by indented content
      if (trimmedText.startsWith('%')) {
        if (!lineText.startsWith('\t') && !lineText.startsWith('%\t')) {
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
        if (!lineText.startsWith('\t')) {
          if (trimmedText === '/*' && document.lineAt(blockRange.end).text.trim() === '*/') {
            // Indent content inside the block comment
            this.indentEntityContent(document, blockRange.start + 1, blockRange.end - 1, edits);
          } else {
            // Indent all lines in the block comment
            this.indentRange(document, blockRange.start, blockRange.end, edits);
          }
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
        this.lastPredicateIndicator = "";
        continue;
      }

      // Handle directives (starting with :-)
      if (trimmedText.startsWith(':-')) {
        this.logger.debug(`  Found directive at line ${lineNum + 1}: "${trimmedText}"`);
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        this.logger.debug(`  Directive range: lines ${directiveRange.start + 1}-${directiveRange.end + 1}`);
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
        } else if (/^:-\s*mode_non_terminal\(/.test(trimmedText)) {
          // mode_non_terminal/2 directive
          this.formatModeNonTerminal2Directive(document, directiveRange, edits);
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
        } else if (/^:-\s*(discontiguous|dynamic|coinductive|multifile|synchronized)\(/.test(trimmedText)) {
          // predicate property directives (single indicator or list)
          this.formatPredicatePropertyDirective(document, directiveRange, edits);
        } else if (/^:-\s*use_module\([^,]+,/.test(trimmedText)) {
          // use_module/2 directive
          this.formatUseModule2Directive(document, directiveRange, edits);
        } else if (/^:-\s*meta_predicate\(/.test(trimmedText)) {
          // meta_predicate/1 directive
          this.formatMetaPredicate1Directive(document, directiveRange, edits);
        } else if (/^:-\s*meta_non_terminal\(/.test(trimmedText)) {
          // meta_non_terminal/1 directive
          this.formatMetaNonTerminal1Directive(document, directiveRange, edits);
        } else {
          // Other directives - just add an empty line before if not already present and indent if needed
          let lastTermIndicator = "";
          let directiveName = ""
          // Extract directive name
          // Match directive name with optional arguments: :- directive_name or :- directive_name(...)
          const directiveMatch = trimmedText.match(/^:-\s*([a-z_][a-zA-Z0-9_]*)(?:\(|\.|$)/);
          if (directiveMatch) {
            directiveName = directiveMatch[1];
            // Determine arity: 0 if followed by '.', otherwise assume 1 or more
            const hasArgs = trimmedText.match(/^:-\s*[a-z_][a-zA-Z0-9_]*\(/);
            lastTermIndicator = hasArgs ? `${directiveName}/1` : `${directiveName}/0`;
          } else {
            lastTermIndicator = "";
          }
          this.insertEmptyLineBeforeIfRequired(document, directiveRange.start, "directive", lastTermIndicator, edits);
          if (!lineText.startsWith('\t')) {
            this.logger.debug(`  Found other directive at line ${lineNum + 1}: "${trimmedText}"`);
            this.indentRange(document, directiveRange.start, directiveRange.end, edits);
            indentedItems++;
          }
          this.lastTermIndicator = lastTermIndicator;
          this.logger.debug(`  Updated lastTermIndicator to: ${this.lastTermIndicator}`);
          this.lastPredicateIndicator = "";
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

        // Insert empty line if no empty line or comment separator in the previous line and
        // if different indicator or switching from non-terminal or directive
        const prevLine = lineNum - 1;
        if (prevLine >= 0) {
          const prevLineText = document.lineAt(prevLine).text.trim();
          if (prevLineText !== '' && !prevLineText.startsWith('%') && !prevLineText.endsWith('*/')) {
            if (this.lastTermType === "predicate" && this.lastTermIndicator !== "" && indicator !== "" && this.lastTermIndicator !== indicator) {
              edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
            } else if (this.lastTermType === "non_terminal" || this.lastTermType === "directive") {
              edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
            }
          }
        }

        // Indent the fact if needed
        if (!lineText.startsWith('\t')) {
          this.indentRange(document, factRange.start, factRange.end, edits);
          indentedItems++;
        }

        // Update the last term and predicate indicators
        if (indicator) {
          this.lastTermIndicator = indicator;
          this.lastPredicateIndicator = indicator;
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

      let processedHead = lineText;
      let extractedContentAfterHead: string | null = null;

      // Check if this is the first line and contains ":- " or "-->"
      if (lineNum === startLine) {
        // Handle clause head lines containing ":-"
        if (lineText.includes(':-')) {
          const result = this.formatClauseOrGrammarHeadLine(lineText, ':-');
          processedHead = initialIndent + result.head;
          // If there's content after the head, extract it to move to next line
          if (result.contentAfterHead) {
            extractedContentAfterHead = result.contentAfterHead;
          }

          // Insert empty line if no empty line or comment separator in the previous line and
          // switching from non-terminal or directive to predicate or if same type (predicate) but different indicator
          const prevLine = lineNum - 1;
          if (prevLine >= 0) {
            const prevLineText = document.lineAt(prevLine).text.trim();
            if (prevLineText !== '' && !prevLineText.startsWith('%') && !prevLineText.endsWith('*/')) {
              if (this.lastTermType === "non_terminal" || this.lastTermType === "directive") {
                edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
              } else if (this.lastTermType === "predicate" && this.lastTermIndicator !== "" && result.indicator !== "" && this.lastTermIndicator !== result.indicator) {
                edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
              }
            }
          }

          // Update the last term and predicate indicators
          if (result.indicator) {
            this.lastTermIndicator = result.indicator;
            this.lastPredicateIndicator = result.indicator;
          }
        // Handle grammar rule head lines containing "-->"
        } else if (lineText.includes('-->')) {
          const result = this.formatClauseOrGrammarHeadLine(lineText, '-->');
          processedHead = initialIndent + result.head;
          // If there's content after the head, extract it to move to next line
          if (result.contentAfterHead) {
            extractedContentAfterHead = result.contentAfterHead;
          }

          // Insert empty line if no empty line or comment separator in the previous line and
          // switching from predicate or directive to non-terminal or if same type (non-terminal) but different indicator
          const prevLine = lineNum - 1;
          if (prevLine >= 0) {
            const prevLineText = document.lineAt(prevLine).text.trim();
            if (prevLineText !== '' && !prevLineText.startsWith('%') && !prevLineText.endsWith('*/')) {
              if (this.lastTermType === "predicate" || this.lastTermType === "directive") {
                edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
              } else if (this.lastTermType === "non_terminal" && this.lastTermIndicator !== "" && result.indicator !== "" && this.lastTermIndicator !== result.indicator) {
                edits.push(TextEdit.insert(new Position(lineNum, 0), '\n'));
              }
            }
          }

          // Update the last term and predicate indicators
          if (result.indicator) {
            this.lastTermIndicator = result.indicator;
            this.lastPredicateIndicator = result.indicator;
          }
        } else {
          processedHead = initialIndent + lineText;
        }
      } else {
        processedHead = initialIndent + lineText;
      }
      this.logger.debug(`    Processed head: ${processedHead}`);
      this.logger.debug(`    Extracted content after head: ${extractedContentAfterHead}`);

      // If there's content after the head, move it to the next line with proper indentation
      if (extractedContentAfterHead) {
        // Replace the current line with just the head
        const range = new Range(
          new Position(lineNum, 0),
          new Position(lineNum, lineText.length)
        );
        edits.push(TextEdit.replace(range, processedHead));
        // Insert the content after head on the next line with double indentation
        edits.push(TextEdit.insert(new Position(lineNum + 1, 0), '\t\t' + extractedContentAfterHead + '\n'));
      } else {
        // Normal line replacement
        const range = new Range(
          new Position(lineNum, 0),
          new Position(lineNum, line.text.length)
        );
        edits.push(TextEdit.replace(range, processedHead));
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
   * Format a predicate clause head or a grammar rule head line
   * Extracts the head (before operator), content after head, and predicate/non-terminal indicator
   */
  private formatClauseOrGrammarHeadLine(lineText: string, operator: string): { head: string; contentAfterHead: string; indicator: string } {
    // Find the operator position at the top level (not inside parentheses, brackets, or braces)
    const operatorIndex = this.findTopLevelOperator(lineText, operator);
    if (operatorIndex === -1) {
      return { head: lineText, contentAfterHead: '', indicator: '' };
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

    // Format the head with operator
    const formattedHead = beforeOperator + operator;

    // Extract content after operator (trimmed, if any)
    const contentAfterHead = afterOperator.trim();

    return { head: formattedHead, contentAfterHead: contentAfterHead, indicator: indicator };
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
   * Handles multiple cases:
   * 1. Directives with explicit indicators: info(foo/2, ...), public(bar/1), private('REFINED_TERM'/3)
   * 2. Directives with qualified indicators: public(foo::bar/1), public(foo(a,b)::bar/1), public(module:bar/1)
   * 3. Directives with callable forms: mode(foo(+int), one), meta_predicate(bar(*, ::))
   * 4. Directives with qualified callable forms: mode(foo::bar(+int), one), mode(foo(a)::bar(+int), one)
   * @param directiveText The text of the directive
   * @returns The indicator in the form functor/arity or functor//arity, with optional qualification, or empty string if not found
   */
  private extractIndicatorFromDirective(directiveText: string): string {
    const trimmed = directiveText.trim();

    // Atom pattern: either unquoted (lowercase start) or quoted (single quotes)
    const atomPattern = `(?:'[^']*'|[a-z][a-zA-Z0-9_]*)`;

    // First, try to match explicit qualified indicator patterns
    // Examples: foo::bar/2, foo(a,b)::bar/2, module:bar/2, foo::'QUOTED'/2
    // Pattern: (entity_name or entity_name(...)) followed by :: or : followed by predicate/arity or predicate//arity
    const qualifiedIndicatorRegex = new RegExp(`(${atomPattern})(?:\\([^)]*\\))?\\s*(::?)\\s*(${atomPattern})\\s*(\\/\\/|\\/)\\s*(\\d+)`);
    const qualifiedIndicatorMatch = trimmed.match(qualifiedIndicatorRegex);
    if (qualifiedIndicatorMatch) {
      const entityName = qualifiedIndicatorMatch[1];
      const qualOp = qualifiedIndicatorMatch[2]; // :: or :
      const predicateName = qualifiedIndicatorMatch[3];
      const arityOp = qualifiedIndicatorMatch[4]; // // or /
      const arity = qualifiedIndicatorMatch[5];

      // Check if entity is parametric by looking for parentheses after entity name
      const escapedEntityName = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const entityParamsMatch = trimmed.match(new RegExp(`${escapedEntityName}\\(([^)]*)\\)`));
      if (entityParamsMatch) {
        // Parametric entity - extract parameters and count them
        const paramsText = entityParamsMatch[1];
        const params = ArgumentUtils.parseArguments(paramsText);
        const entityArity = params.length;
        return `${entityName}/${entityArity}${qualOp}${predicateName}${arityOp}${arity}`;
      } else {
        // Non-parametric entity
        return `${entityName}${qualOp}${predicateName}${arityOp}${arity}`;
      }
    }

    // Second, try to match explicit non-qualified indicator patterns: name/arity or name//arity
    // Examples: foo/2, bar//1, 'REFINED_TERM'/3
    const indicatorRegex = new RegExp(`(${atomPattern})\\s*(\\/\\/|\\/)\\s*(\\d+)`);
    const indicatorMatch = trimmed.match(indicatorRegex);
    if (indicatorMatch) {
      const functor = indicatorMatch[1];
      const arityOp = indicatorMatch[2]; // // or /
      const arity = indicatorMatch[3];
      return `${functor}${arityOp}${arity}`;
    }

    // Third, try to extract from qualified callable form
    // Examples: dynamic(foo::bar/1), multifile(module:foo//2), private(foo::'QUOTED'/1)
    const qualifiedCallableRegex = new RegExp(`^:-\\s*\\w+\\(\\s*(${atomPattern})(?:\\([^)]*\\))?\\s*(::?)\\s*(${atomPattern})\\s*\\(`);
    const qualifiedCallableMatch = trimmed.match(qualifiedCallableRegex);
    if (qualifiedCallableMatch) {
      const entityName = qualifiedCallableMatch[1];
      const qualOp = qualifiedCallableMatch[2]; // :: or :
      const predicateName = qualifiedCallableMatch[3];

      // Check if entity is parametric
      const escapedEntityName = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const entityParamsMatch = trimmed.match(new RegExp(`${escapedEntityName}\\(([^)]*)\\)\\s*${qualOp}`));
      let entityQualifier = entityName;
      if (entityParamsMatch) {
        // Parametric entity - extract parameters and count them
        const paramsText = entityParamsMatch[1];
        const params = ArgumentUtils.parseArguments(paramsText);
        const entityArity = params.length;
        entityQualifier = `${entityName}/${entityArity}`;
      }

      // Find the predicate arguments - need to handle quoted atoms
      let predicateStart: number;
      if (predicateName.startsWith("'")) {
        // Quoted atom - search for the exact quoted string
        predicateStart = trimmed.indexOf(predicateName);
      } else {
        // Unquoted atom
        predicateStart = trimmed.indexOf(predicateName);
      }
      const openParenPos = trimmed.indexOf('(', predicateStart + predicateName.length);

      if (openParenPos !== -1) {
        // Use ArgumentUtils to find the matching closing parenthesis
        const closeParenPos = ArgumentUtils.findMatchingCloseParen(trimmed, openParenPos);

        if (closeParenPos !== -1) {
          // Extract the arguments between the parentheses
          const argsText = trimmed.substring(openParenPos + 1, closeParenPos);
          const args = ArgumentUtils.parseArguments(argsText);
          const arity = args.length;

          // Determine if it's a non-terminal:
          // - For meta_non_terminal/1 directive, it's always a non-terminal
          // - For mode/2 and meta_predicate/1 directives, use / notation (predicates)
          // - For other directives with callable forms, use / notation
          const isNonTerminal = /^:-\s*meta_non_terminal\(/.test(trimmed);

          return isNonTerminal ? `${entityQualifier}${qualOp}${predicateName}//${arity}` : `${entityQualifier}${qualOp}${predicateName}/${arity}`;
        }
      }
    }

    // Fourth, try to extract from non-qualified callable form (e.g., mode(foo(+int), one), mode('QUOTED'(+int), one))
    // Match the directive name and extract the first argument
    const callableRegex = new RegExp(`^:-\\s*\\w+\\(\\s*(${atomPattern})\\s*\\(`);
    const callableMatch = trimmed.match(callableRegex);
    if (callableMatch) {
      const functor = callableMatch[1];

      // Find the opening parenthesis after the functor - need to handle quoted atoms
      let functorStart: number;
      if (functor.startsWith("'")) {
        // Quoted atom - search for the exact quoted string
        functorStart = trimmed.indexOf(functor);
      } else {
        // Unquoted atom
        functorStart = trimmed.indexOf(functor);
      }
      const openParenPos = trimmed.indexOf('(', functorStart + functor.length);

      if (openParenPos !== -1) {
        // Use ArgumentUtils to find the matching closing parenthesis
        const closeParenPos = ArgumentUtils.findMatchingCloseParen(trimmed, openParenPos);

        if (closeParenPos !== -1) {
          // Extract the arguments between the parentheses
          const argsText = trimmed.substring(openParenPos + 1, closeParenPos);
          const args = ArgumentUtils.parseArguments(argsText);
          const arity = args.length;

          // Determine if it's a non-terminal:
          // - For meta_non_terminal/1 directive, it's always a non-terminal
          // - For mode/2 and meta_predicate/1 directives, use / notation (predicates)
          // - For other directives with callable forms, use / notation
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

    // Add empty line before directive if not present
    const previousLineNum = directiveRange.start - 1;
    let finalText = formattedInfo1;

    if (previousLineNum >= 0) {
      const previousLine = document.lineAt(previousLineNum).text;
      if (previousLine.trim() !== '') {
        finalText = '\n' + finalText;
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
      const formattedElement = this.formatInfo1Element(document, element.trim());
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
  private formatInfo1Element(document: TextDocument, element: string): string {
    // Check if this element contains keys whose values are list of pairs
    const listPairsKeyMatch = element.match(/^(parameters|remarks)\s+is\s+\[(.*)\]$/);
    if (listPairsKeyMatch) {
      const key = listPairsKeyMatch[1];
      const listPairsContent = listPairsKeyMatch[2].trim();

      if (!listPairsContent) {
        return key + ' is []';
      }

      const listPairElements = ArgumentUtils.parseArguments(listPairsContent);
      let formatted = key + ' is [\n';
      listPairElements.forEach((listElement, index) => {
        formatted += '\t\t\t' + listElement.trim();
        if (index < listPairElements.length - 1) {
          formatted += ',\n';
        } else {
          formatted += '\n';
        }
      });
      formatted += '\t\t]';

      return formatted;
    }

    // Check if this element contains keys whose values are list of elements
    const listKeyMatch = element.match(/^(parnames|see_also)\s+is\s+\[(.*)\]$/);
    if (listKeyMatch) {
      const key = listKeyMatch[1];
      const listContent = listKeyMatch[2].trim();

      if (!listContent) {
        return key + ' is []';
      }

      // Get the ruler and tab size settings
      const config = workspace.getConfiguration('editor', document.uri);
      const rulers = config.get<number[]>('rulers', []);
      const maxLineLength = rulers.length > 0 ? rulers[0] : 79;
      const tabSize = config.get<number>('tabSize', 4);

      const elements = ArgumentUtils.parseArguments(listContent);
      let formatted = key + ' is [\n\t\t\t' + elements[0];
      let currentLineLength = 3 * tabSize + elements[0].length;
      let index = 1;

      while (index < elements.length) {
        const element = elements[index];
        const elementLength = element.length + 2
        if (currentLineLength + 2 + elementLength > maxLineLength) {
          // Start a new line
          formatted += ',\n\t\t\t';
          currentLineLength = 3 * tabSize;
        } else {
          // Add separator from previous element
          formatted += ', ';
          currentLineLength += 2;
        }
        // Add element to current line
        formatted += elements[index];
        currentLineLength += elementLength;
        index = index + 1;
      };
      formatted += '\n\t\t]';

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

    // Add empty line before directive if not present
    const previousLineNum = directiveRange.start - 1;
    if (previousLineNum < document.lineCount) {
      const previousLine = document.lineAt(previousLineNum).text;
      if (previousLine.trim() !== '') {
        edits.push(TextEdit.insert(new Position(directiveRange.start - 1, 0), '\n'));
      }
    }
  }

  /**
   * Insert an empty line before a term if the previous line is not empty, is not a comment,
   * and the last term type is different or the last term indicator doesn't match the given indicator
   * @param document The text document
   * @param line The line number where the directive starts
   * @param termType The term type (e.g., "directive", "predicate", "non_terminal")
   * @param indicator The term indicator to check against (e.g., "uses/1", "use_module/1")
   * @param edits The array of text edits to add to
   */
  private insertEmptyLineBeforeIfRequired(document: TextDocument, line: number, termType: string, indicator: string, edits: TextEdit[]): void {
    if (line > 0) {
      const prevLine = document.lineAt(line - 1);
      if (prevLine.text.trim() === '' || prevLine.text.trim().startsWith('%') || prevLine.text.trim().endsWith('*/')) {
        return;
      } else if (this.lastTermType !== termType || this.lastTermIndicator !== indicator) {
        edits.push(TextEdit.insert(new Position(line, 0), '\n'));
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

    let predicateIndicator = this.extractIndicatorFromDirective(directiveText);
    this.logger.debug(`mode/2 directive: predicateIndicator="${predicateIndicator}", lastPredicateIndicator="${this.lastPredicateIndicator}"`);

    // Insert empty line if switching to a different predicate/non-terminal
    if (predicateIndicator && this.lastPredicateIndicator !== "" && predicateIndicator !== this.lastPredicateIndicator) {
      this.logger.debug(`Inserting empty line before mode/2 directive (different predicate/non-terminal)`);
      edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
    }

    const formattedMode = this.formatMode2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedMode));

    // Update the last term indicator to "mode/2" and predicate indicator to the predicate being described
    this.lastTermIndicator = "mode/2";
    if (predicateIndicator) {
      this.lastPredicateIndicator = predicateIndicator;
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
   * Format a single mode_non_terminal/2 directive using pre-computed range
   */
  private formatModeNonTerminal2Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    // Extract directive text to get the indicator
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }

    let predicateIndicator = this.extractIndicatorFromDirective(directiveText);
    this.logger.debug(`mode_non_terminal/2 directive: predicateIndicator="${predicateIndicator}", lastPredicateIndicator="${this.lastPredicateIndicator}"`);
    if (predicateIndicator && this.lastPredicateIndicator !== "" && predicateIndicator.replace(/\/\//g, '/') === this.lastPredicateIndicator.replace(/\/\//g, '/')) {
      predicateIndicator = this.lastPredicateIndicator;
    }

    // Insert empty line if switching to a different predicate/non-terminal
    if (predicateIndicator && this.lastPredicateIndicator !== "" && predicateIndicator !== this.lastPredicateIndicator) {
      this.logger.debug(`Inserting empty line before mode_non_terminal/2 directive (different predicate/non-terminal)`);
      edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
    }

    const formattedMode = this.formatModeNonTerminal2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedMode));

    // Update the last term indicator to "mode_non_terminal/2" and predicate indicator to the predicate being described
    this.lastTermIndicator = "mode_non_terminal/2";
    if (predicateIndicator) {
      this.lastPredicateIndicator = predicateIndicator;
    }
  }

  /**
   * Format the content of a mode_non_terminal/2 directive
   */
  private formatModeNonTerminal2DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }
    directiveText = directiveText.trim();

    // Parse mode/2 directive: :- mode(template, solutions).
    const normalizedText = directiveText.replace(/\s+/g, ' ');
    const match = normalizedText.match(/^:-\s*mode_non_terminal\(\s*(.*)\)\s*\.$/);
    if (!match) {
      // If parsing fails, ensure proper spacing in the directive
      const reformattedDirective = normalizedText.replace(/^:-\s*(\w+)/, ':- $1');
      return '\t' + reformattedDirective;
    }

    const argumentsText = match[1].trim();
    if (!argumentsText) {
      return '\t:- mode_non_terminal().';
    }

    // Use ArgumentUtils to parse the two arguments
    const directiveArguments = ArgumentUtils.parseArguments(argumentsText);
    if (directiveArguments.length !== 2) {
      // If not exactly 2 arguments, ensure proper spacing and return
      return '\t:- mode_non_terminal(' + argumentsText + ').';
    }

    const template = directiveArguments[0].trim();
    const solutions = directiveArguments[1].trim();

    // Format with proper spacing: single space after :- and single space between arguments
    return '\t:- mode_non_terminal(' + template + ', ' + solutions + ').';
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

    const predicateIndicator = this.extractIndicatorFromDirective(directiveText);

    // Insert empty line if switching to a different predicate/non-terminal
    if (predicateIndicator && this.lastPredicateIndicator !== "" && predicateIndicator !== this.lastPredicateIndicator) {
      edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
    }

    const formattedInfo2 = this.formatInfo2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedInfo2));

    // Update the last term indicator to "info/2" and predicate indicator to the predicate being described
    this.lastTermIndicator = "info/2";
    if (predicateIndicator) {
      this.lastPredicateIndicator = predicateIndicator;
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
      const formattedElement = this.formatInfo2Element(document, element.trim());
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
  private formatInfo2Element(document: TextDocument, element: string): string {
    // Check if this element contains arguments, exceptions, or examples with lists
    const listPairsKeyMatch = element.match(/^(arguments|exceptions|examples|remarks)\s+is\s+\[(.*)\]$/);
    if (listPairsKeyMatch) {
      const key = listPairsKeyMatch[1];
      const listPairsContent = listPairsKeyMatch[2].trim();

      if (!listPairsContent) {
        return key + ' is []';
      }

      const listPairElements = ArgumentUtils.parseArguments(listPairsContent);
      let formatted = key + ' is [\n';
      listPairElements.forEach((listElement, index) => {
        formatted += '\t\t\t' + listElement.trim();
        if (index < listPairElements.length - 1) {
          formatted += ',\n';
        } else {
          formatted += '\n';
        }
      });
      formatted += '\t\t]';

      return formatted;
    }

    // Check if this element contains arguments, exceptions, or examples with lists
    const listKeyMatch = element.match(/^(argnames|see_also)\s+is\s+\[(.*)\]$/);
    if (listKeyMatch) {
      const key = listKeyMatch[1];
      const listContent = listKeyMatch[2].trim();

      if (!listContent) {
        return key + ' is []';
      }

      // Get the ruler and tab size settings
      const config = workspace.getConfiguration('editor', document.uri);
      const rulers = config.get<number[]>('rulers', []);
      const maxLineLength = rulers.length > 0 ? rulers[0] : 79;
      const tabSize = config.get<number>('tabSize', 4);

      const elements = ArgumentUtils.parseArguments(listContent);
      let formatted = key + ' is [\n\t\t\t' + elements[0];
      let currentLineLength = 3 * tabSize + elements[0].length; // Start with three tabs
      let index = 1;

      while (index < elements.length) {
        const element = elements[index];
        const elementLength = element.length + 2
        if (currentLineLength + 2 + elementLength > maxLineLength) {
          // Start a new line
          formatted += ',\n\t\t\t';
          currentLineLength = 3 * tabSize;
        } else {
          // Add separator from previous element
          formatted += ', ';
          currentLineLength += 2;
        }
        // Add element to current line
        formatted += elements[index];
        currentLineLength += elementLength;
        index = index + 1;
      };
      formatted += '\n\t\t]';
      return formatted;
    }

    // For other elements, return as-is
    return element;
  }

  /**
   * Format a single uses/2 directive using pre-computed range
   */
  private formatUses2Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    this.insertEmptyLineBeforeIfRequired(document, directiveRange.start, "directive", "uses/2", edits);
    const formattedUses = this.formatUses2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );
    edits.push(TextEdit.replace(range, formattedUses));

    // Update the last term indicator
    this.lastTermIndicator = "uses/2";
    this.lastPredicateIndicator = "";
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

    // Get the ruler and tab size settings
    const config = workspace.getConfiguration('editor', document.uri);
    const rulers = config.get<number[]>('rulers', []);
    const maxLineLength = rulers.length > 0 ? rulers[0] : 79;
    const tabSize = config.get<number>('tabSize', 4);

    let formatted = '\t:- uses(' + objectName + ', [\n\t\t' + elements[0];
    let currentLineLength = 2 * tabSize + elements[0].length;

    let index = 1;
    while(index < elements.length) {
      const element = elements[index];
      const elementLength = element.length + 2
      if (currentLineLength + 2 + elementLength > maxLineLength) {
        // Start a new line
        formatted += ',\n\t\t';
        currentLineLength = 2 * tabSize;
      } else {
        // Add separator from previous element
        formatted += ', ';
        currentLineLength += 2;
      }
      // Add element to current line
      formatted += elements[index];
      currentLineLength += elementLength;
      index = index + 1;
    };
    formatted += '\n\t]).';

    return formatted;
  }

  /**
   * Format a single alias/2 directive using pre-computed range
   */
  private formatAlias2Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    this.insertEmptyLineBeforeIfRequired(document, directiveRange.start, "directive", "alias/2", edits);
    const formattedAlias = this.formatAlias2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );
    edits.push(TextEdit.replace(range, formattedAlias));

    // Update the last term indicator
    this.lastTermIndicator = "alias/2";
    this.lastPredicateIndicator = "";
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

    // Get the ruler and tab size settings
    const config = workspace.getConfiguration('editor', document.uri);
    const rulers = config.get<number[]>('rulers', []);
    const maxLineLength = rulers.length > 0 ? rulers[0] : 79;
    const tabSize = config.get<number>('tabSize', 4);

    const elements = ArgumentUtils.parseArguments(listContent);
    let formatted = '\t:- alias(' + objectName + ', [\n\t\t' + elements[0];
    let currentLineLength = 2 * tabSize + elements[0].length;
    let index = 1;

    while(index < elements.length) {
      const element = elements[index];
      const elementLength = element.length + 2
      if (currentLineLength + 2 + elementLength > maxLineLength) {
        // Start a new line
        formatted += ',\n\t\t';
        currentLineLength = 2 * tabSize;
      } else {
        // Add separator from previous element
        formatted += ', ';
        currentLineLength += 2;
      }
      // Add element to current line
      formatted += elements[index];
      currentLineLength += elementLength;
      index = index + 1;
    };
    formatted += '\n\t]).';

    return formatted;
  }

  /**
   * Format a single use_module/2 directive using pre-computed range
   */
  private formatUseModule2Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    this.insertEmptyLineBeforeIfRequired(document, directiveRange.start, "directive", "use_module/2", edits);
    const formattedUseModule = this.formatUseModule2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedUseModule));

    // Update the last term indicator
    this.lastTermIndicator = "use_module/2";
    this.lastPredicateIndicator = "";
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
    this.insertEmptyLineBeforeIfRequired(document, directiveRange.start, "directive", "uses/1", edits);
    const formattedUses1 = this.formatListDirectiveContent(document, directiveRange, 'uses');

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );
    edits.push(TextEdit.replace(range, formattedUses1));

    // Update the last term indicator
    this.lastTermIndicator = "uses/1";
    this.lastPredicateIndicator = "";
  }

  /**
   * Format a single use_module/1 directive using pre-computed range
   */
  private formatUseModule1Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    this.insertEmptyLineBeforeIfRequired(document, directiveRange.start, "directive", "use_module/1", edits);
    const formattedUseModule = this.formatListDirectiveContent(document, directiveRange, 'use_module');

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );
    edits.push(TextEdit.replace(range, formattedUseModule));

    // Update the last term indicator
    this.lastTermIndicator = "use_module/1";
    this.lastPredicateIndicator = "";
  }

  /**
   * Format a single meta_predicate/1 directive using pre-computed range
   */
  private formatMetaPredicate1Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const lineText = document.lineAt(directiveRange.start).text.trim();

    // Extract directive text to get the predicate indicator from meta template
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }

    const predicateIndicator = this.extractIndicatorFromDirective(directiveText);
    this.logger.debug(`meta_predicate/1 directive: predicateIndicator="${predicateIndicator}", lastPredicateIndicator="${this.lastPredicateIndicator}"`);

    // Insert empty line if switching to a different predicate
    // (only for single template directives, not lists)
    if (predicateIndicator && this.lastPredicateIndicator !== "" && predicateIndicator !== this.lastPredicateIndicator) {
      this.logger.debug(`Inserting empty line before meta_predicate/1 directive (different predicate)`);
      edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
    }

    // Check if this is a list directive or single template directive
    if (/^:-\s*meta_predicate\(\s*\[/.test(lineText)) {
      // List directive - use existing list formatter
      const formattedMetaPredicate = this.formatListDirectiveContent(document, directiveRange, 'meta_predicate');

      const range = new Range(
        new Position(directiveRange.start, 0),
        new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
      );

      edits.push(TextEdit.replace(range, formattedMetaPredicate));

      // Update the last term indicator to "meta_predicate/1"
      this.lastTermIndicator = "meta_predicate/1";
      // For list directives, reset predicate indicator
      this.lastPredicateIndicator = "";
    } else {
      // Single template directive - format with proper spacing
      const formattedMetaPredicate = this.formatSingleIndicatorDirective(document, directiveRange, 'meta_predicate');

      const range = new Range(
        new Position(directiveRange.start, 0),
        new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
      );

      edits.push(TextEdit.replace(range, formattedMetaPredicate));

      // Update the last term indicator and predicate indicator
      this.lastTermIndicator = "meta_predicate/1";
      if (predicateIndicator) {
        this.lastPredicateIndicator = predicateIndicator;
      }
    }
  }

  /**
   * Format a single meta_non_terminal/1 directive using pre-computed range
   */
  private formatMetaNonTerminal1Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const lineText = document.lineAt(directiveRange.start).text.trim();

    // Extract directive text to get the non-terminal indicator from meta template
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }

    const predicateIndicator = this.extractIndicatorFromDirective(directiveText);
    this.logger.debug(`meta_non_terminal/1 directive: predicateIndicator="${predicateIndicator}", lastPredicateIndicator="${this.lastPredicateIndicator}"`);

    // Insert empty line if switching to a different non-terminal
    // (only for single template directives, not lists)
    if (predicateIndicator && this.lastPredicateIndicator !== "" && predicateIndicator !== this.lastPredicateIndicator) {
      this.logger.debug(`Inserting empty line before meta_non_terminal/1 directive (different non-terminal)`);
      edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
    }

    // Check if this is a list directive or single template directive
    if (/^:-\s*meta_non_terminal\(\s*\[/.test(lineText)) {
      // List directive - use existing list formatter
      const formattedMetaNonTerminal = this.formatListDirectiveContent(document, directiveRange, 'meta_non_terminal');

      const range = new Range(
        new Position(directiveRange.start, 0),
        new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
      );

      edits.push(TextEdit.replace(range, formattedMetaNonTerminal));

      // Update the last term indicator to "meta_non_terminal/1"
      this.lastTermIndicator = "meta_non_terminal/1";
      // For list directives, reset predicate indicator
      this.lastPredicateIndicator = "";
    } else {
      // Single template directive - format with proper spacing
      const formattedMetaNonTerminal = this.formatSingleIndicatorDirective(document, directiveRange, 'meta_non_terminal');

      const range = new Range(
        new Position(directiveRange.start, 0),
        new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
      );

      edits.push(TextEdit.replace(range, formattedMetaNonTerminal));

      // Update the last term indicator and predicate indicator
      this.lastTermIndicator = "meta_non_terminal/1";
      if (predicateIndicator) {
        this.lastPredicateIndicator = predicateIndicator;
      }
    }
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

      const predicateIndicator = this.extractIndicatorFromDirective(directiveText);
      this.logger.debug(`scope directive: predicateIndicator="${predicateIndicator}", lastPredicateIndicator="${this.lastPredicateIndicator}"`);

      // Insert empty line if no empty line or comment separator in the previous line and
      // and if switching to a different predicate/non-terminal (only for single indicator directives, not lists)
      const prevLine = directiveRange.start - 1;
      if (prevLine >= 0) {
        const prevLineText = document.lineAt(prevLine).text.trim();
        if (prevLineText !== '' && !prevLineText.startsWith('%') && !prevLineText.endsWith('*/')) {
          if (predicateIndicator && this.lastPredicateIndicator !== "" && predicateIndicator !== this.lastPredicateIndicator) {
            this.logger.debug(`Inserting empty line before scope directive (different predicate)`);
            edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
          } else if (this.lastPredicateIndicator === "" && this.lastTermType === "directive") {
            this.logger.debug(`Inserting empty line before scope directive (entity directive before)`);
            edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
          }
        }
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

        // Update the last term indicator to the directive name (e.g., "public/1")
        this.lastTermIndicator = `${directiveName}/1`;
        // For list directives, reset predicate indicator
        this.lastPredicateIndicator = "";
      } else {
        // Single indicator directive - format with proper spacing
        const formattedScope = this.formatSingleIndicatorDirective(document, directiveRange, directiveName);

        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );

        edits.push(TextEdit.replace(range, formattedScope));

        // Update the last term indicator to the directive name and predicate indicator
        this.lastTermIndicator = `${directiveName}/1`;
        if (predicateIndicator) {
          this.lastPredicateIndicator = predicateIndicator;
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
   * Handles both single indicator and list forms
   */
  private formatPredicatePropertyDirective(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const lineText = document.lineAt(directiveRange.start).text.trim();
    const match = lineText.match(/^:-\s*(discontiguous|dynamic|coinductive|multifile|synchronized)\(/);
    if (match) {
      const directiveName = match[1];

      // Extract directive text to get the indicator (for single indicator directives)
      let directiveText = '';
      for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
        directiveText += document.lineAt(lineNum).text;
      }

      const predicateIndicator = this.extractIndicatorFromDirective(directiveText);
      this.logger.debug(`${directiveName}/1 directive: predicateIndicator="${predicateIndicator}", lastPredicateIndicator="${this.lastPredicateIndicator}"`);

      // Insert empty line if no empty line or comment separator in the previous line and
      // and if switching to a different predicate/non-terminal (only for single indicator directives, not lists)
      const prevLine = directiveRange.start - 1;
      if (prevLine >= 0) {
        const prevLineText = document.lineAt(prevLine).text.trim();
        if (prevLineText !== '' && !prevLineText.startsWith('%') && !prevLineText.endsWith('*/')) {
          if (predicateIndicator && this.lastPredicateIndicator !== "" && predicateIndicator !== this.lastPredicateIndicator) {
            this.logger.debug(`Inserting empty line before ${directiveName}/1 directive (different predicate: ${predicateIndicator} != ${this.lastPredicateIndicator})`);
           edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
          } else if (this.lastPredicateIndicator === "" && this.lastTermType === "directive") {
            this.logger.debug(`Inserting empty line before ${directiveName}/1 directive (entity directive before)`);
            edits.push(TextEdit.insert(new Position(directiveRange.start, 0), '\n'));
          }
        }
      }

      // Check if this is a list directive or single indicator directive
      if (/^:-\s*(discontiguous|dynamic|coinductive|multifile|synchronized)\(\s*\[/.test(lineText)) {
        // List directive - use existing list formatter
        const formattedProperty = this.formatListDirectiveContent(document, directiveRange, directiveName);

        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );

        edits.push(TextEdit.replace(range, formattedProperty));

        // Update the last term indicator to the directive name (e.g., "dynamic/1")
        this.lastTermIndicator = `${directiveName}/1`;
        // For list directives, reset predicate indicator
        this.lastPredicateIndicator = "";
      } else {
        // Single indicator directive - format with proper spacing
        const formattedProperty = this.formatSingleIndicatorDirective(document, directiveRange, directiveName);

        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );

        edits.push(TextEdit.replace(range, formattedProperty));

        // Update the last term indicator to the directive name and predicate indicator
        this.lastTermIndicator = `${directiveName}/1`;
        if (predicateIndicator) {
          this.lastPredicateIndicator = predicateIndicator;
        }
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

    // Get the ruler and tab size settings
    const config = workspace.getConfiguration('editor', document.uri);
    const rulers = config.get<number[]>('rulers', []);
    const maxLineLength = rulers.length > 0 ? rulers[0] : 79;
    const tabSize = config.get<number>('tabSize', 4);

    // Parse arguments and format
    const elements = ArgumentUtils.parseArguments(listContent);
    let formatted = `\t:- ${directiveName}([\n\t\t` + elements[0];
    let currentLineLength = 2 * tabSize + elements[0].length;
    let index = 1;

    while (index < elements.length) {
      const element = elements[index];
      const elementLength = element.length + 2
      if (currentLineLength + 2 + elementLength > maxLineLength) {
        // Start a new line
        formatted += ',\n\t\t';
        currentLineLength = 2 * tabSize;
      } else {
        // Add separator from previous element
        formatted += ', ';
        currentLineLength += 2;
      }
      // Add element to current line
      formatted += elements[index];
      currentLineLength += elementLength;
      index = index + 1;
    };
    formatted += '\n\t]).';

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
      this.logger.debug(`Adding final newline at end of document`);
      edits.push(TextEdit.insert(endPosition, '\n'));
    }
  }

}
