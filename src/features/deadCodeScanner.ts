"use strict";

import {
  CancellationToken,
  CodeAction,
  CodeActionContext,
  CodeActionKind,
  CodeActionProvider,
  Diagnostic,
  DiagnosticCollection,
  DiagnosticSeverity,
  Disposable,
  ExtensionContext,
  languages,
  Position,
  Range,
  TextDocument,
  Uri,
  workspace,
  WorkspaceEdit
} from "vscode";
import * as path from "path";
import { DiagnosticsUtils } from "../utils/diagnostics";
import { getLogger } from "../utils/logger";
import { PredicateUtils } from "../utils/predicateUtils";
import { ArgumentUtils } from "../utils/argumentUtils";
import { LogtalkDocumentFormattingEditProvider } from "./documentFormattingEditProvider";

export default class LogtalkDeadCodeScanner implements CodeActionProvider {

  public  diagnosticCollection: DiagnosticCollection;
  public  diagnostics: { [docName: string]: Diagnostic[] } = {};
  public  diagnosticHash = [];
  private sortedDiagIndex: { [docName: string]: number[] } = {};
  private compilingFileRegex = /%\s\[\scompiling\s(.+)\s\.\.\.\s\]/;
  private msgRegex = /(((\*|\!)\s{5}.+\n[\*|\!]\s{7}.+\n)|((\*|\!)\s{5}.+\n))[\*|\!]\s{7}.+\n[\*|\!]\s{7}in file\s(.+)\s((at or above line\s(\d+))|(between lines\s(\d+)[-](\d+))|(at line\s(\d+)))/;
  private documentListener: Disposable;
  private openDocumentListener: Disposable;
  private logger = getLogger();
  private formatter = new LogtalkDocumentFormattingEditProvider();

  constructor(private context: ExtensionContext) {
    this.loadConfiguration();
  }

  async provideCodeActions(
    document: TextDocument,
    _range: Range,
    context: CodeActionContext,
    token: CancellationToken
  ): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];

    // Iterate through diagnostics (dead code warnings) in the current context
    for (const diagnostic of context.diagnostics) {
      // Check if this diagnostic is from the dead code scanner and can be fixed
      if (this.canFix(diagnostic)) {
        const action = await this.createDeleteAction(document, diagnostic, token);
        if (action) {
          actions.push(action);
        }
      }
    }

    return actions;
  }

  private parseIssue(issue: string) {

    if(this.diagnosticHash.includes(issue)) {
      return;  // Skip duplicate issues
    }

    let match = issue.match(this.msgRegex)
    if (match == null) { return null; }

    // Add to hash to prevent duplicates
    this.diagnosticHash.push(issue);

    let severity: DiagnosticSeverity;
    if(match[0][0] == '*') {
      severity = DiagnosticSeverity.Warning
    } else {
      severity = DiagnosticSeverity.Error
    } 

    let fileName = path.resolve(match[6]);
    this.logger.debug(fileName);
    let lineFrom = 0,
        lineTo   = 0;
    this.logger.debug("match:", match);

    // Position line and column numbers are zero-based
    if(match[9]) {
      lineFrom = parseInt(match[9])-1;
      lineTo   = parseInt(match[9])-1;
    } else if(match[14]) {
      lineFrom = parseInt(match[14])-1;
      lineTo   = parseInt(match[14])-1;
    } else {
      lineFrom = parseInt(match[11])-1
      lineTo   = parseInt(match[12])-1
    }

    // Default horizontal range
    let fromCol = 0;
    let toCol = 240;
    let fromPos = new Position(lineFrom, fromCol);
    let toPos = new Position(lineTo, toCol);
    let range = new Range(fromPos, toPos);
    let errMsg = match[1].replace(new RegExp(/\*     /,'g'), '').replace(new RegExp(/\!     /,'g'), '');
    let diag = new Diagnostic(range, errMsg, severity);
    diag.source = "Logtalk Dead Code Scanner";
    diag.code = lineFrom + 1;

    if (diag) {
      if (!this.diagnostics[fileName]) {
        this.diagnostics[fileName] = [diag];
      } else {
          this.diagnostics[fileName].push(diag);
      }
      this.diagnostics[fileName] = this.removeDuplicateDiagnostics(this.diagnostics[fileName]);
    }

  }

  public lint(message: string) {
    this.parseIssue(message);
    for (let doc in this.diagnostics) {
      let index = this.diagnostics[doc]
        .map((diag, i) => {
          return [diag.range.start.line, i];
        })
        .sort((a, b) => {
          return a[0] - b[0];
        });
      this.sortedDiagIndex[doc] = index.map(item => {
        return item[1];
      });
      this.diagnosticCollection.set(Uri.file(doc), this.diagnostics[doc]);
    }
  }

  public clear(line: string) {
    let match = line.match(this.compilingFileRegex)
    if (match) {
      this.diagnosticCollection.delete(Uri.file(match[1]));
      if (match[1] in this.diagnostics) {
        this.diagnostics[match[1]] = [];
        this.diagnosticHash = [];
      }
    }
  }

  public clearAll() {
    this.diagnosticCollection.clear();
    this.diagnostics = {};
    this.diagnosticHash = [];
  }

  public updateDiagnostics(uri: Uri, diagnosticToRemove: Diagnostic) {
    DiagnosticsUtils.updateDiagnostics(this.diagnosticCollection, uri, diagnosticToRemove);
  }

  private removeDuplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    return DiagnosticsUtils.removeDuplicateDiagnostics(diagnostics);
  }

  /**
   * Check if a diagnostic can be fixed by deleting dead code
   */
  private canFix(diagnostic: Diagnostic): boolean {
    // Only handle diagnostics from the dead code scanner
    if (diagnostic.source !== "Logtalk Dead Code Scanner") {
      return false;
    }

    // Look for patterns that indicate dead predicates or non-terminals
    const message = diagnostic.message;

    // Common patterns for dead code messages (these may need adjustment based on actual Logtalk output)
    return message.includes('dead predicate') ||
           message.includes('dead non-terminal') ||
           message.includes('unused predicate') ||
           message.includes('unused non-terminal') ||
           message.includes('unreachable predicate') ||
           message.includes('unreachable non-terminal') ||
           message.includes('Likely unused predicate:') ||
           // Look for predicate/non-terminal indicators in the message
           /\b\w+\/\d+\b/.test(message) ||  // predicate indicator: name/arity
           /\b\w+\/\/\d+\b/.test(message);  // non-terminal indicator: name//arity
  }



  /**
   * Check if a callable form matches an indicator
   * E.g., "dbg(Message)" matches "dbg/1"
   */
  private matchesCallable(callable: string, indicator: string): boolean {
    // Extract functor and arity from the indicator (e.g., "dbg/1" -> functor="dbg", arity=1)
    const indicatorMatch = indicator.match(/^(.+)\/(\d+)$/);
    if (!indicatorMatch) {
      return false;
    }
    const expectedFunctor = indicatorMatch[1];
    const expectedArity = parseInt(indicatorMatch[2], 10);

    // Extract functor and count arguments from the callable (e.g., "dbg(Message)" -> functor="dbg", arity=1)
    const callableMatch = callable.match(/^([^(]+)\((.*)\)$/);
    if (!callableMatch) {
      return false;
    }
    const callableFunctor = callableMatch[1].trim();
    const argsText = callableMatch[2].trim();

    // Count arguments (empty string = 0 args, otherwise parse with ArgumentUtils)
    const callableArity = argsText === '' ? 0 : ArgumentUtils.parseArguments(argsText).length;

    return callableFunctor === expectedFunctor && callableArity === expectedArity;
  }

  /**
   * Format a uses/2 directive with the given object name and list elements
   * Calls LogtalkDocumentFormattingEditProvider.formatUses2DirectiveContent()
   */
  private formatUses2DirectiveWithElements(
    document: TextDocument,
    objectName: string,
    elements: string[]
  ): string {
    // Create a temporary directive text with the updated elements
    const newListContent = elements.join(', ');
    const tempDirectiveText = `:- uses(${objectName}, [${newListContent}]).`;

    // Create a mock document that returns our temporary directive text
    const mockDocument = {
      uri: document.uri,
      lineAt: (_line: number) => ({
        text: tempDirectiveText
      })
    } as TextDocument;

    // Call the formatter's public method
    const directiveRange = { start: 0, end: 0 };
    return this.formatter.formatUses2DirectiveContent(mockDocument, directiveRange);
  }

  /**
   * Format a use_module/2 directive with the given module name and list elements
   * Calls LogtalkDocumentFormattingEditProvider.formatUseModule2DirectiveContent()
   */
  private formatUseModule2DirectiveWithElements(
    document: TextDocument,
    moduleName: string,
    elements: string[]
  ): string {
    // Create a temporary directive text with the updated elements
    const newListContent = elements.join(', ');
    const tempDirectiveText = `:- use_module(${moduleName}, [${newListContent}]).`;

    // Create a mock document that returns our temporary directive text
    const mockDocument = {
      uri: document.uri,
      lineAt: (_line: number) => ({
        text: tempDirectiveText
      })
    } as TextDocument;

    // Call the formatter's public method
    const directiveRange = { start: 0, end: 0 };
    return this.formatter.formatUseModule2DirectiveContent(mockDocument, directiveRange);
  }

  /**
   * Create a code action to delete dead predicate or non-terminal
   */
  private async createDeleteAction(
    document: TextDocument,
    diagnostic: Diagnostic,
    _token: CancellationToken
  ): Promise<CodeAction | null> {
    try {
      // Check if this is a "Likely unused predicate:" warning in a uses/2 or use_module/2 directive
      if (diagnostic.message.includes('Likely unused predicate:')) {
        return this.createRemoveFromUsesOrUseModuleAction(document, diagnostic);
      }

      // Extract the predicate/non-terminal indicator from the diagnostic message
      const indicator = this.extractIndicatorFromMessage(diagnostic.message);
      if (!indicator) {
        this.logger.debug(`Could not extract indicator from message: ${diagnostic.message}`);
        return null;
      }

      this.logger.debug(`Extracted indicator: ${indicator} from dead code diagnostic`);

      // Create the workspace edit
      const edit = new WorkspaceEdit();

      // Find the exact position of the predicate/non-terminal name in the definition
      const definitionPosition = this.findPredicatePositionInDefinition(
        document,
        diagnostic.range.start.line,
        indicator
      );

      // Get the definition range using our utility function
      const definitionRange = await PredicateUtils.getPredicateDefinitionRange(
        document.uri,
        definitionPosition,
        indicator
      );

      if (definitionRange) {
        // Delete the definition (all clauses/rules) using smart delete to avoid leaving empty lines
        DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, definitionRange);
        this.logger.debug(`Added definition deletion for ${indicator} at range ${definitionRange.start.line}-${definitionRange.end.line}`);
      } else {
        this.logger.debug(`Could not find definition range for ${indicator}`);
        return null;
      }

      // Create the code action
      const action = new CodeAction(
        `Delete dead ${indicator.includes('//') ? 'non-terminal' : 'predicate'} ${indicator}`,
        CodeActionKind.QuickFix
      );
      action.edit = edit;
      // Associate this action with the specific diagnostic
      action.diagnostics = [diagnostic];
      action.command = {
        title: 'Logtalk Dead Code Scanner',
        command: 'logtalk.update.diagnostics',
        arguments: [document.uri, diagnostic]
      };

      return action;
    } catch (error) {
      this.logger.error(`Error creating delete action: ${error}`);
      return null;
    }
  }

  /**
   * Create a code action to remove an unused predicate from a uses/2 or use_module/2 directive
   */
  private createRemoveFromUsesOrUseModuleAction(
    document: TextDocument,
    diagnostic: Diagnostic
  ): CodeAction | null {
    try {
      // Extract the predicate indicator from the diagnostic message
      const indicatorMatch = diagnostic.message.match(/Likely unused predicate:\s*(.+)/);
      if (!indicatorMatch) {
        this.logger.debug(`Could not extract indicator from message: ${diagnostic.message}`);
        return null;
      }

      const qualifiedIndicator = indicatorMatch[1].trim();
      this.logger.debug(`Extracted qualified indicator: ${qualifiedIndicator} from likely unused predicate warning`);

      // First, check the directive type on the warning line
      const warningLine = diagnostic.range.start.line;
      const lineText = document.lineAt(warningLine).text.trim();

      let directiveType: 'uses' | 'use_module';
      if (lineText.match(/^\:-\s*uses\(/)) {
        directiveType = 'uses';
      } else if (lineText.match(/^\:-\s*use_module\(/)) {
        directiveType = 'use_module';
      } else {
        this.logger.debug(`Warning line ${warningLine} is not a uses/2 or use_module/2 directive`);
        return null;
      }

      // Now parse the qualified indicator based on the directive type
      // Format for uses/2: object::predicate/arity or object::predicate//arity
      // Format for use_module/2: module:predicate/arity or module:predicate//arity
      let expectedObjectOrModuleName: string;
      let unqualifiedIndicator: string;

      if (directiveType === 'uses') {
        const usesMatch = qualifiedIndicator.match(/^(.+)::(.+)$/);
        if (!usesMatch) {
          this.logger.debug(`Indicator ${qualifiedIndicator} is not qualified with :: for uses/2 directive`);
          return null;
        }
        expectedObjectOrModuleName = usesMatch[1].trim();
        unqualifiedIndicator = usesMatch[2].trim();
        this.logger.debug(`Parsed uses/2: object=${expectedObjectOrModuleName}, indicator=${unqualifiedIndicator}`);
      } else {
        const useModuleMatch = qualifiedIndicator.match(/^([^:]+):([^:].+)$/);
        if (!useModuleMatch) {
          this.logger.debug(`Indicator ${qualifiedIndicator} is not qualified with : for use_module/2 directive`);
          return null;
        }
        expectedObjectOrModuleName = useModuleMatch[1].trim();
        unqualifiedIndicator = useModuleMatch[2].trim();
        this.logger.debug(`Parsed use_module/2: module=${expectedObjectOrModuleName}, indicator=${unqualifiedIndicator}`);
      }

      // Get the full range of the directive
      const directiveRange = PredicateUtils.getDirectiveRange(document, warningLine);

      // Get the directive text (join all lines without newlines for easier parsing)
      let directiveText = '';
      for (let i = warningLine; i <= directiveRange.end; i++) {
        directiveText += document.lineAt(i).text.trim();
      }

      // Parse the directive: :- uses(Object, [list]). or :- use_module(Module, [list]).
      const directiveRegex = directiveType === 'uses'
        ? /^:-\s*uses\(\s*(.*)\)\s*\.$/
        : /^:-\s*use_module\(\s*(.*)\)\s*\.$/;

      const match = directiveText.match(directiveRegex);
      if (!match) {
        this.logger.debug(`Could not parse ${directiveType}/2 directive: ${directiveText}`);
        return null;
      }

      const argumentsText = match[1].trim();
      if (!argumentsText) {
        this.logger.debug(`Empty arguments in uses/2 directive`);
        return null;
      }

      // Extract the two arguments (object name and list)
      const args = ArgumentUtils.parseArguments(argumentsText);
      if (args.length !== 2) {
        this.logger.debug(`Expected 2 arguments in uses/2 directive, got ${args.length}`);
        return null;
      }

      const directiveObjectOrModuleName = args[0].trim();
      const listText = args[1].trim();

      // Verify that the object/module name from the warning matches the first argument of the directive
      if (directiveObjectOrModuleName !== expectedObjectOrModuleName) {
        this.logger.debug(`Name mismatch: expected ${expectedObjectOrModuleName}, got ${directiveObjectOrModuleName}`);
        return null;
      }

      // Remove the outer brackets from the list
      if (!listText.startsWith('[') || !listText.endsWith(']')) {
        this.logger.debug(`Second argument is not a list: ${listText}`);
        return null;
      }

      const listContent = listText.substring(1, listText.length - 1).trim();
      if (!listContent) {
        this.logger.debug(`Empty list in uses/2 directive`);
        return null;
      }

      // Parse the list elements
      const elements = ArgumentUtils.parseArguments(listContent);
      this.logger.debug(`Parsed ${elements.length} elements from uses/2 list`);

      // Find the element to remove
      let elementToRemove = -1;
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i].trim();

        // Check if this element matches the unqualified indicator
        // The indicator could be:
        // 1. Just the predicate (e.g., "append/3") - can delete
        // 2. The alias part after "as" (e.g., in "append/3 as my_append/3", indicator is "my_append/3") - can delete whole element
        // 3. The original part before "as" (e.g., in "append/3 as my_append/3", indicator is "append/3") - CANNOT delete

        if (element === unqualifiedIndicator) {
          // Simple case: element is exactly the indicator (no "as" operator)
          elementToRemove = i;
          break;
        } else if (element.includes(' as ')) {
          // Element uses the "as" operator (e.g., "append/3 as my_append/3" or "print_message(...) as dbg(Message)")
          const parts = element.split(' as ');
          if (parts.length === 2) {
            const original = parts[0].trim();
            const alias = parts[1].trim();

            // Check if alias matches the indicator (either exact match or callable form)
            if (alias === unqualifiedIndicator || this.matchesCallable(alias, unqualifiedIndicator)) {
              // The indicator is the alias (part after "as"), so we can delete the whole element
              elementToRemove = i;
              break;
            } else if (original === unqualifiedIndicator || this.matchesCallable(original, unqualifiedIndicator)) {
              // The indicator is the original (part before "as"), so we cannot provide a quick fix
              // because the alias might still be used
              this.logger.debug(`Indicator ${unqualifiedIndicator} appears before 'as' in element ${element}, cannot remove`);
              return null;
            }
          }
        }
      }

      if (elementToRemove === -1) {
        this.logger.debug(`Could not find element ${unqualifiedIndicator} in uses/2 list`);
        return null;
      }

      // Remove the element from the list
      elements.splice(elementToRemove, 1);

      // Create the workspace edit
      const edit = new WorkspaceEdit();

      // Get the full range of the directive for deletion/replacement
      const directiveStartPos = new Position(warningLine, 0);
      const directiveEndPos = new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length);
      const directiveFullRange = new Range(directiveStartPos, directiveEndPos);

      if (elements.length === 0) {
        // If the list is now empty, delete the entire directive
        DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, directiveFullRange);
      } else {
        // Format the directive with remaining elements
        const formattedContent = directiveType === 'uses'
          ? this.formatUses2DirectiveWithElements(document, directiveObjectOrModuleName, elements)
          : this.formatUseModule2DirectiveWithElements(document, directiveObjectOrModuleName, elements);

        // Get indentation from the original directive
        const originalLineText = document.lineAt(warningLine).text;
        const indent = originalLineText.match(/^(\s*)/)[1];

        // Adjust indentation to match the original
        const formattedLines = formattedContent.split('\n');
        const adjustedLines = formattedLines.map((line: string) => {
          // Replace leading tab with the original indent
          if (line.startsWith('\t')) {
            return indent + line.substring(1);
          }
          return line;
        });
        const adjustedFormattedContent = adjustedLines.join('\n');

        // Replace the entire directive with the formatted version
        edit.replace(document.uri, directiveFullRange, adjustedFormattedContent);
      }

      // Create the code action
      const action = new CodeAction(
        `Remove unused predicate ${qualifiedIndicator} from ${directiveType}/2 directive`,
        CodeActionKind.QuickFix
      );
      action.edit = edit;
      action.diagnostics = [diagnostic];
      action.command = {
        title: 'Logtalk Dead Code Scanner',
        command: 'logtalk.update.diagnostics',
        arguments: [document.uri, diagnostic]
      };

      return action;
    } catch (error) {
      this.logger.error(`Error creating remove from uses action: ${error}`);
      return null;
    }
  }

  /**
   * Extract predicate/non-terminal indicator from diagnostic message
   */
  private extractIndicatorFromMessage(message: string): string | null {
    // Look for predicate indicator pattern: name/arity
    const predicateMatch = message.match(/\b([a-zA-Z_][a-zA-Z0-9_]*|'[^']*')\/(\d+)\b/);
    if (predicateMatch) {
      return `${predicateMatch[1]}/${predicateMatch[2]}`;
    }

    // Look for non-terminal indicator pattern: name//arity
    const nonTerminalMatch = message.match(/\b([a-zA-Z_][a-zA-Z0-9_]*|'[^']*')\/\/(\d+)\b/);
    if (nonTerminalMatch) {
      return `${nonTerminalMatch[1]}//${nonTerminalMatch[2]}`;
    }

    // If no indicator found, try to extract from common dead code message patterns
    // This may need adjustment based on actual Logtalk dead code scanner output
    const deadPredicateMatch = message.match(/dead predicate\s+([a-zA-Z_][a-zA-Z0-9_]*|'[^']*')\/(\d+)/i);
    if (deadPredicateMatch) {
      return `${deadPredicateMatch[1]}/${deadPredicateMatch[2]}`;
    }

    const deadNonTerminalMatch = message.match(/dead non-terminal\s+([a-zA-Z_][a-zA-Z0-9_]*|'[^']*')\/\/(\d+)/i);
    if (deadNonTerminalMatch) {
      return `${deadNonTerminalMatch[1]}//${deadNonTerminalMatch[2]}`;
    }

    return null;
  }

  /**
   * Find the exact position of the predicate/non-terminal name in the definition line
   * This is needed because the diagnostic range only provides line information with character position 0
   */
  private findPredicatePositionInDefinition(
    document: TextDocument,
    definitionLine: number,
    indicator: string
  ): Position {
    // Parse the indicator to get the predicate/non-terminal name
    const parsed = PredicateUtils.parseIndicator(indicator);
    if (!parsed) {
      // Fallback to start of line
      return new Position(definitionLine, 0);
    }

    const isNonTerminal = parsed.isNonTerminal;

    // Use the existing utility function from PredicateUtils
    return PredicateUtils.findPredicatePositionInDefinition(
      document,
      definitionLine,
      indicator,
      isNonTerminal
    );
  }

  private loadConfiguration(): void {
    let section = workspace.getConfiguration("logtalk");
    if (section) {
      if (this.documentListener) {
        this.documentListener.dispose();
      }
      if (this.openDocumentListener) {
        this.openDocumentListener.dispose();
      }
    }
  }

  public activate(subscriptions: any[]): void {

    this.diagnosticCollection = languages.createDiagnosticCollection('Logtalk Dead Code Scanner');

    workspace.onDidChangeConfiguration(
      this.loadConfiguration,
      this,
      subscriptions
    );

    workspace.onWillSaveTextDocument(
      textDocumentWillSaveEvent => {
        if (textDocumentWillSaveEvent.document.isDirty) {
          this.diagnosticCollection.delete(textDocumentWillSaveEvent.document.uri);
        }
      },
      this,
      subscriptions
    );

    workspace.onDidCloseTextDocument(
      textDocument => {
        // Only delete diagnostics if the document was modified but not saved
        if (textDocument.isDirty) {
          this.diagnosticCollection.delete(textDocument.uri);
          const filePath = textDocument.uri.fsPath;
          if (filePath in this.diagnostics) {
            this.diagnostics[filePath] = [];
          }
        }
      },
      null,
      subscriptions
    );

    this.loadConfiguration();
  }

  public dispose(): void {
    this.documentListener.dispose();
    this.openDocumentListener.dispose();
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
  }

}
