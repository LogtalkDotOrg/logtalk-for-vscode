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
      return true
    } else {
      this.diagnosticHash.push(issue)
    }

    let match = issue.match(this.msgRegex)
    if (match == null) { return null; }

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

  public updateDiagnostics(uri: Uri, diagnosticToRemove: Diagnostic) {
    DiagnosticsUtils.updateDiagnostics(this.diagnosticCollection, uri, diagnosticToRemove);
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
           // Look for predicate/non-terminal indicators in the message
           /\b\w+\/\d+\b/.test(message) ||  // predicate indicator: name/arity
           /\b\w+\/\/\d+\b/.test(message);  // non-terminal indicator: name//arity
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
      action.diagnostics = [diagnostic];

      return action;
    } catch (error) {
      this.logger.error(`Error creating delete action: ${error}`);
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

    this.loadConfiguration();

    workspace.onDidCloseTextDocument(
      textDocument => {
        this.diagnosticCollection.delete(textDocument.uri);
      },
      null,
      subscriptions
    );
  }

  public dispose(): void {
    this.documentListener.dispose();
    this.openDocumentListener.dispose();
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
  }

}
