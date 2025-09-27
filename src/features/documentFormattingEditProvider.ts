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
      const allEntities = this.findAllEntityDirectives(document);

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

        // 3. Indent all content inside the entity (assumes tabs are already converted)
        //this.indentEntityContent(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

        // 4. Format info/1 directive if present
        this.formatInfo1Directive(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

        // 5. Format info/2 directives if present
        this.formatInfo2Directives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

        // 6. Format uses/2 directives if present
        this.formatUses2Directives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

        // 7. Format alias/2 directives if present
        this.formatAliasDirectives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

        // 8. Format uses/1 directives if present
        this.formatUses1Directives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

        // 9. Format use_module/1 directives if present
        this.formatUseModule1Directives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

        // 10. Format scope directives (public/1, protected/1, private/1) if present
        this.formatScopeDirectives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

        // 11. Format predicate property directives if present
        this.formatPredicatePropertyDirectives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);

        // 12. Format use_module/2 directives if present
        this.formatUseModule2Directives(document, entityInfo.opening.end.line + 1, entityInfo.closing.start.line - 1, edits);
      }

    } catch (error) {
      this.logger.error(`Error during document formatting: ${error.message}`);
    }

    return edits;
  }

  /**
   * Find all entity opening and closing directives in the document
   */
  private findAllEntityDirectives(document: TextDocument): { opening: Range; closing: Range }[] {
    const entities: { opening: Range; closing: Range }[] = [];
    const openingDirectives: { range: Range; type: string }[] = [];
    const closingDirectives: { range: Range; type: string }[] = [];

    // First pass: find all opening and closing directives
    for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      // Look for entity opening directive
      const openingMatch = lineText.match(/^:-\s+(object|protocol|category)\(/);
      if (openingMatch) {
        this.logger.debug(`Found entity opening directive at line ${lineNum + 1}: "${lineText}"`);
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        this.logger.debug(`Directive range: lines ${directiveRange.start + 1}-${directiveRange.end + 1}`);
        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );
        openingDirectives.push({ range, type: openingMatch[1] });
      }

      // Look for entity closing directive
      const closingMatch = lineText.match(/^:-\s+end_(object|protocol|category)\./);
      if (closingMatch) {
        const range = new Range(
          new Position(lineNum, 0),
          new Position(lineNum, document.lineAt(lineNum).text.length)
        );
        closingDirectives.push({ range, type: closingMatch[1] });
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
  private formatEntityOpeningDirective(document: TextDocument, range: Range, edits: TextEdit[]): void {
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
   * Format entity closing directive to start at column 0 with empty line after
   */
  private formatEntityClosingDirective(document: TextDocument, range: Range, edits: TextEdit[]): void {
    const directiveText = document.getText(range).trim();
    
    // Add empty line after closing directive if not at end of file
    const nextLineNum = range.end.line + 1;
    let finalText = directiveText;
    
    if (nextLineNum < document.lineCount) {
      const nextLine = document.lineAt(nextLineNum).text;
      if (nextLine.trim() !== '') {
        finalText += '\n';
      }
    }

    edits.push(TextEdit.replace(range, finalText));
  }

  /**
   * Ensure all content inside entity is indented by at least one tab
   * (assumes spaces have already been converted to tabs by VS Code's native command)
   */
  private indentEntityContent(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    this.logger.debug(`Indenting entity content from line ${startLine + 1} to ${endLine + 1}`);
    let indentedLines = 0;

    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const line = document.lineAt(lineNum);
      const lineText = line.text;

      // Skip empty lines
      if (lineText.trim() === '') {
        continue;
      }

      // Check if line is already properly indented (starts with at least one tab)
      if (!lineText.startsWith('\t') && lineText.trim() !== '') {
        this.logger.debug(`  Line ${lineNum + 1} needs indentation: "${lineText}"`);
        const indentedText = '\t' + lineText.trimStart();
        const range = new Range(
          new Position(lineNum, 0),
          new Position(lineNum, lineText.length)
        );
        edits.push(TextEdit.replace(range, indentedText));
        indentedLines++;
      }
    }

    this.logger.debug(`Added indentation to ${indentedLines} lines`);
  }

  /**
   * Format info/1 directive with proper indentation
   */
  private formatInfo1Directive(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();
      
      if (/^:-\s+info\(\s*\[/.test(lineText)) {
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        const formattedInfo = this.formatInfo1DirectiveContent(document, directiveRange);
        
        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );
        
        edits.push(TextEdit.replace(range, formattedInfo));
        
        // Add empty line after info directive
        const nextLineNum = directiveRange.end + 1;
        if (nextLineNum <= endLine && nextLineNum < document.lineCount) {
          const nextLine = document.lineAt(nextLineNum).text;
          if (nextLine.trim() !== '') {
            edits.push(TextEdit.insert(new Position(nextLineNum, 0), '\n'));
          }
        }
        
        break; // Only format the first info directive found
      }
    }
  }

  /**
   * Format the content of an info/1 directive
   */
  private formatInfo1DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text + '\n';
    }

    // Parse and reformat the info directive
    const match = directiveText.replace(/\n/g, ' ').match(/:-\s+info\(\s*\[(.*)\]\s*\)\s*\./);
    if (!match) {
      return '\t' + directiveText.trim();
    }

    const listContent = match[1].trim();
    const elements = ArgumentUtils.parseArguments(listContent);
    
    let formatted = '\t:- info([\n';
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
   * Format info/2 directives with proper indentation
   */
  private formatInfo2Directives(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      // Look for info/2 directives (predicate-specific info)
      if (/^:-\s+info\(\s*[^,\[]+,/.test(lineText)) {
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        const formattedInfo2 = this.formatInfo2DirectiveContent(document, directiveRange);

        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );

        edits.push(TextEdit.replace(range, formattedInfo2));
      }
    }
  }

  /**
   * Format the content of an info/2 directive
   */
  private formatInfo2DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text + '\n';
    }

    // Parse info/2 directive: :- info(predicate/arity, [list]).
    const normalizedText = directiveText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const match = normalizedText.match(/^:-\s+info\(\s*(.*)\)\s*\.$/);
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

    const predicateIndicator = directiveArguments[0].trim();
    const listArgument = directiveArguments[1].trim();

    // Extract list content from [...]
    const listMatch = listArgument.match(/^\[(.*)\]$/);
    if (!listMatch) {
      return '\t' + directiveText.trim();
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
   * Format uses/2 directives with proper list indentation
   */
  private formatUses2Directives(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();
      
      if (/^:-\s+uses\(/.test(lineText)) {
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        const formattedUses = this.formatUses2DirectiveContent(document, directiveRange);
        
        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );
        
        edits.push(TextEdit.replace(range, formattedUses));
      }
    }
  }

  /**
   * Format the content of a uses/2 directive
   */
  private formatUses2DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text + '\n';
    }

    // Parse uses directive: :- uses(Object, [list]).
    const normalizedText = directiveText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const match = normalizedText.match(/^:-\s+uses\(\s*(.*)\)\s*\.$/);
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

    const objectName = directiveArguments[0].trim();
    const listArgument = directiveArguments[1].trim();

    // Extract list content from [...]
    const listMatch = listArgument.match(/^\[(.*)\]$/);
    if (!listMatch) {
      return '\t' + directiveText.trim();
    }

    const listContent = listMatch[1].trim();
    if (!listContent) {
      // Empty list case
      return '\t:- uses(' + objectName + ', []).';
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
   * Format alias/2 directives with proper list indentation
   */
  private formatAliasDirectives(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      if (/^:-\s+alias\(/.test(lineText)) {
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        const formattedAlias = this.formatAliasDirectiveContent(document, directiveRange);

        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );

        edits.push(TextEdit.replace(range, formattedAlias));
      }
    }
  }

  /**
   * Format the content of an alias/2 directive
   */
  private formatAliasDirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text + '\n';
    }

    // Parse alias directive: :- alias(Object, [list]).
    const normalizedText = directiveText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const match = normalizedText.match(/^:-\s+alias\(\s*(.*)\)\s*\.$/);
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

    const objectName = directiveArguments[0].trim();
    const listArgument = directiveArguments[1].trim();

    // Extract list content from [...]
    const listMatch = listArgument.match(/^\[(.*)\]$/);
    if (!listMatch) {
      return '\t' + directiveText.trim();
    }

    const listContent = listMatch[1].trim();
    if (!listContent) {
      // Empty list case
      return '\t:- alias(' + objectName + ', []).';
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
   * Format use_module/2 directives with proper list indentation
   */
  private formatUseModule2Directives(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      if (/^:-\s+use_module\(/.test(lineText)) {
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        const formattedUseModule2 = this.formatUseModule2DirectiveContent(document, directiveRange);

        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );

        edits.push(TextEdit.replace(range, formattedUseModule2));
      }
    }
  }

  /**
   * Format the content of a use_module/2 directive
   */
  private formatUseModule2DirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text + '\n';
    }

    // Parse use_module directive: :- use_module(Module, [list]).
    const normalizedText = directiveText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
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
   * Format uses/1 directives with proper list indentation
   */
  private formatUses1Directives(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      if (/^:-\s+uses\(\s*\[/.test(lineText)) {
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        const formattedUses1 = this.formatListDirectiveContent(document, directiveRange, 'uses');

        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );

        edits.push(TextEdit.replace(range, formattedUses1));
      }
    }
  }

  /**
   * Format use_module/1 directives with proper list indentation
   */
  private formatUseModule1Directives(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      if (/^:-\s+use_module\(\s*\[/.test(lineText)) {
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
        const formattedUseModule = this.formatListDirectiveContent(document, directiveRange, 'use_module');

        const range = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
        );

        edits.push(TextEdit.replace(range, formattedUseModule));
      }
    }
  }

  /**
   * Format scope directives (public/1, protected/1, private/1) with proper list indentation
   */
  private formatScopeDirectives(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      if (/^:-\s+(public|protected|private)\(\s*\[/.test(lineText)) {
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
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
    }
  }

  /**
   * Format predicate property directives (discontiguous/1, dynamic/1, coinductive/1, multifile/1, synchronized/1) with proper list indentation
   */
  private formatPredicatePropertyDirectives(document: TextDocument, startLine: number, endLine: number, edits: TextEdit[]): void {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();

      if (/^:-\s+(discontiguous|dynamic|coinductive|multifile|synchronized)\(\s*\[/.test(lineText)) {
        const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);
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
    }
  }

  /**
   * Generic method to format single-argument list directives
   */
  private formatListDirectiveContent(document: TextDocument, directiveRange: { start: number; end: number }, directiveName: string): string {
    let directiveText = '';
    for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
      directiveText += document.lineAt(lineNum).text + '\n';
    }

    // Parse directive: :- directive_name([list]).
    const normalizedText = directiveText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const match = normalizedText.match(new RegExp(`^:-\\s+${directiveName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(\\s*\\[(.*)\\]\\s*\\)\\s*\\.$`));
    if (!match) {
      return '\t' + directiveText.trim();
    }

    const listContent = match[1].trim();
    if (!listContent) {
      return `\t:- ${directiveName}([]).`;
    }

    const elements = ArgumentUtils.parseArguments(listContent);

    let formatted = `\t:- ${directiveName}([\n`;
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
}
