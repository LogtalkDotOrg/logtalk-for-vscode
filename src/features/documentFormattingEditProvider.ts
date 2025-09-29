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

      // Step 2: Apply Logtalk-specific formatting
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
      const openingMatch = lineText.match(/^:-\s+(object|protocol|category)\(/);
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
      const closingMatch = lineText.match(/^:-\s+end_(object|protocol|category)\./);
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
    const match = normalizedText.match(/^(:-\s+(object|protocol|category)\(\s*)(.*)(\)\s*\.\s*)$/);
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

    const prefix = match[1]; // ":- object("
    const argumentsText = match[3].trim(); // "entity_name, implements(...), imports(...)"
    const suffix = match[4]; // ")."

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

    // Create the replacement text: single empty line + closing directive
    let finalText = '\n' + directiveText;

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
        continue;
      }

      // Handle comments - indent with one tab if they start at character zero
      if (trimmedText.startsWith('%')) {
        if (!lineText.startsWith('\t') && lineText.startsWith('%')) {
          this.logger.debug(`  Indenting comment at line ${lineNum + 1}: "${lineText}"`);
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

      // Handle if/1 conditional compilation directives
      if (/^:-\s+if\(/.test(trimmedText)) {
        this.logger.debug(`  Found if/1 conditional compilation directive at line ${lineNum + 1}: "${trimmedText}"`);
        const endifLine = this.findMatchingEndif(document, lineNum);
        if (endifLine !== -1) {
          if (!lineText.startsWith('\t')) {
            this.indentRangeWithInitialIndent(document, lineNum, endifLine, edits);
            indentedItems++;
          }
          lineNum = endifLine + 1;
          continue;
        }
      }

      // Handle directives (starting with :-)
      if (trimmedText.startsWith(':-')) {
        this.logger.debug(`  Found directive at line ${lineNum + 1}: "${trimmedText}"`);
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        // Call the appropriate formatter based on directive type
        if (/^:-\s+(object|protocol|category)\(/.test(trimmedText)) {
          // entity opening directive (when using the "Format Selection" command)
          this.formatEntityOpeningDirective(document, new Range(
            new Position(directiveRange.start, 0),
            new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
          ), edits);
        } else if (/^:-\s+(end_object|end_protocol|end_category)\./.test(trimmedText)) {
          // entity closing directive (when using the "Format Selection" command)
          this.formatEntityClosingDirective(document, new Range(
            new Position(directiveRange.start, 0),
            new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
          ), edits);
        } else if (/^:-\s+info\(\s*\[/.test(trimmedText)) {
          // info/1 directive with list
          this.formatInfo1Directive(document, directiveRange, edits);
        } else if (/^:-\s+info\((?!\s*\[)[^,]+,/.test(trimmedText)) {
          // info/2 directive
          this.formatInfo2Directive(document, directiveRange, edits);
        } else if (/^:-\s+uses\((?!\s*\[)/.test(trimmedText)) {
          // uses/2 directive
          this.formatUses2Directive(document, directiveRange, edits);
        } else if (/^:-\s+alias\(/.test(trimmedText)) {
          // alias/2 directive
          this.formatAliasDirective(document, directiveRange, edits);
        } else if (/^:-\s+uses\(\s*\[/.test(trimmedText)) {
          // uses/1 directive with list
          this.formatUses1Directive(document, directiveRange, edits);
        } else if (/^:-\s+use_module\(\s*\[/.test(trimmedText)) {
          // use_module/1 directive with list
          this.formatUseModule1Directive(document, directiveRange, edits);
        } else if (/^:-\s+(public|protected|private)\(\s*\[/.test(trimmedText)) {
          // scope directives with list
          this.formatScopeDirective(document, directiveRange, edits);
        } else if (/^:-\s+(discontiguous|dynamic|coinductive|multifile|synchronized)\(\s*\[/.test(trimmedText)) {
          // predicate property directives with list
          this.formatPredicatePropertyDirective(document, directiveRange, edits);
        } else if (/^:-\s+use_module\([^,]+,/.test(trimmedText)) {
          // use_module/2 directive
          this.formatUseModule2Directive(document, directiveRange, edits);
        } else {
          // Other directives - just indent if needed
          if (!lineText.startsWith('\t')) {
            this.logger.debug(`  Found other directive at line ${lineNum + 1}: "${trimmedText}"`);
            this.indentRangeWithInitialIndent(document, directiveRange.start, directiveRange.end, edits);
            indentedItems++;
          }
        }
        lineNum = directiveRange.end + 1;
        continue;
      }
      
      // Handle grammar rules (containing -->)
      if (trimmedText.includes('-->')) {
        this.logger.debug(`  Found grammar rule at line ${lineNum + 1}: "${trimmedText}"`);
        const ruleRange = PredicateUtils.getClauseRange(document, lineNum);
        this.formatClauseOrGrammarRule(document, ruleRange.start, ruleRange.end, edits);
        lineNum = ruleRange.end + 1;
        continue;
      } else {
        // Handle predicate clauses (facts and rules)
        this.logger.debug(`  Found predicate clause at line ${lineNum + 1}: "${trimmedText}"`);
        const clauseRange = PredicateUtils.getClauseRange(document, lineNum);
        this.formatClauseOrGrammarRule(document, clauseRange.start, clauseRange.end, edits);
        lineNum = clauseRange.end + 1;
        continue;
      }

      lineNum++;
    }

    this.logger.debug(`Added indentation to ${indentedItems} items`);
  }

  /**
   * Helper method to indent all lines in a range with initial indent
   */
  private indentRangeWithInitialIndent(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
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
        }
        // Handle grammar rule head lines containing "-->"
        else if (lineText.includes('-->')) {
          const result = this.formatClauseOrGrammarHeadLine(lineText, '-->');
          processedText = initialIndent + result.text;
          extractedComment = result.comment;
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
        processedText = initialIndent + '\t' + lineText;
        edits.push(TextEdit.insert(new Position(lineNum + 1, 0), initialIndent + '\t' + extractedComment + '\n'));
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
   * Format a predicate clause head or a grammar rule head line to ensure proper spacing and handle line comments
   */
  private formatClauseOrGrammarHeadLine(lineText: string, operator: string): { text: string; comment: string | null } {
    // Find the operator position
    const operatorIndex = lineText.indexOf(operator);
    if (operatorIndex === -1) {
      return { text: lineText, comment: null };
    }

    // Check if there's a space before the operator (for ":- " we want " :-", for "-->" we want " -->")
    let beforeOperator = lineText.substring(0, operatorIndex);
    let afterOperator = lineText.substring(operatorIndex + operator.length);

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
        comment: comment
      };
    }

    return { text: beforeOperator + operator + afterOperator, comment: null };
  }

  /**
   * Find the matching endif directive for a given if directive, handling nested if/endif blocks
   */
  private findMatchingEndif(document: TextDocument, ifLineNum: number): number {
    let nestingLevel = 1; // Start with 1 for the initial if directive

    for (let lineNum = ifLineNum + 1; lineNum < document.lineCount; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      // Check for nested if directives
      if (/^:-\s+if\(/.test(lineText)) {
        nestingLevel++;
        this.logger.debug(`  Found nested if at line ${lineNum + 1}, nesting level: ${nestingLevel}`);
      }
      // Check for endif directives
      else if (/^:-\s+endif\s*\./.test(lineText)) {
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
    const formattedInfo1 = this.formatListDirectiveContent(document, directiveRange, 'info');

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedInfo1));
  }

  /**
   * Format a single info/2 directive using pre-computed range
   */
  private formatInfo2Directive(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const formattedInfo2 = this.formatInfo2DirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedInfo2));
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
    const match = normalizedText.match(/^:-\s+info\(\s*(.*)\)\s*\.$/);
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
    const listKeyMatch = element.match(/^(arguments|exceptions|examples)\s+is\s+\[(.*)\]$/);
    if (listKeyMatch) {
      const key = listKeyMatch[1];
      const listContent = listKeyMatch[2].trim();

      if (!listContent) {
        return key + ' is []';
      }

      const listElements = ArgumentUtils.parseArguments(listContent);

      if (listElements.length === 1) {
        // Single element - keep on same line
        return key + ' is [' + listContent + ']';
      }

      // Multiple elements - format as multi-line
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
    const match = normalizedText.match(/^:-\s+uses\(\s*(.*)\)\s*\.$/);
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
      return '\t' + ':- uses(' + objectName + ', []).';
    }

    const elements = ArgumentUtils.parseArguments(listContent);

    let formatted = '\t:- uses(' + objectName + ', [\n';
    elements.forEach((element, index) => {
      formatted += '\t\t' + element.trim();
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
   * Format a single alias/2 directive using pre-computed range
   */
  private formatAliasDirective(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const formattedAlias = this.formatAliasDirectiveContent(document, directiveRange);

    const range = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );

    edits.push(TextEdit.replace(range, formattedAlias));
  }

  /**
   * Format the content of an alias/2 directive
   */
  private formatAliasDirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text;
    }
    directiveText = directiveText.trim();

    // Parse alias directive: :- alias(Object, List).
    const normalizedText = directiveText.replace(/\s+/g, ' ');
    const match = normalizedText.match(/^:-\s+alias\(\s*(.*)\)\s*\.$/);
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
      return '\t' + ':- alias(' + objectName + ', []).';
    }

    const elements = ArgumentUtils.parseArguments(listContent);

    let formatted = '\t:- alias(' + objectName + ', [\n';
    elements.forEach((element, index) => {
      formatted += '\t\t' + element.trim();
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
    const match = normalizedText.match(/^:-\s+use_module\(\s*(.*)\)\s*\.$/);
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

    let formatted = '\t:- use_module(' + moduleName + ', [\n';
    elements.forEach((element, index) => {
      formatted += '\t\t' + element.trim();
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
    const match = lineText.match(/^:-\s+(public|protected|private)\(/);
    if (match) {
      const directiveName = match[1];
      const formattedScope = this.formatListDirectiveContent(document, directiveRange, directiveName);

      const range = new Range(
        new Position(directiveRange.start, 0),
        new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
      );

      edits.push(TextEdit.replace(range, formattedScope));
    }
  }

  /**
   * Format a single predicate property directive using pre-computed range
   */
  private formatPredicatePropertyDirective(document: TextDocument, directiveRange: { start: number; end: number }, edits: TextEdit[]): void {
    const lineText = document.lineAt(directiveRange.start).text.trim();
    const match = lineText.match(/^:-\s+(discontiguous|dynamic|coinductive|multifile|synchronized)\(/);
    if (match) {
      const directiveName = match[1];
      const formattedProperty = this.formatListDirectiveContent(document, directiveRange, directiveName);

      const range = new Range(
        new Position(directiveRange.start, 0),
        new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
      );

      edits.push(TextEdit.replace(range, formattedProperty));
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

    // Find position after "directiveName(["
    const openIndex = normalizedText.indexOf('([');
    if (openIndex === -1) {
      return '\t' + directiveText;
    }

    // Find the list content between [ and ]
    const afterOpen = normalizedText.substring(openIndex + 2); // Skip past '(['
    const closeIndex = afterOpen.lastIndexOf(']).');
    if (closeIndex === -1) {
      return '\t' + directiveText;
    }

    const listContent = afterOpen.substring(0, closeIndex).trim();
    if (!listContent) {
      return `\t:- ${directiveName}([]).`;
    }

    // Parse arguments and format
    const elements = ArgumentUtils.parseArguments(listContent);

    let formatted = `\t:- ${directiveName}([\n`;
    elements.forEach((element, index) => {
      formatted += `\t\t${element.trim()}`;
      if (index < elements.length - 1) {
        formatted += ',\n';
      } else {
        formatted += '\n';
      }
    });
    formatted += `\t]).`;

    return formatted;
  }
}
