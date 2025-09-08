"use strict";

import {
  CancellationToken,
  CodeActionContext,
  CodeActionProvider,
  CodeAction,
  CodeActionKind,
  WorkspaceEdit,
  Diagnostic,
  DiagnosticCollection,
  DiagnosticSeverity,
  Disposable,
  ExtensionContext,
  Position,
  Range,
  TextDocument,
  TextDocumentContentChangeEvent,
  TextDocumentChangeEvent,
  Uri,
  languages,
  workspace
} from "vscode";
import * as path from "path";

export default class LogtalkLinter implements CodeActionProvider {

  public  diagnosticCollection: DiagnosticCollection;
  public  diagnostics: { [docName: string]: Diagnostic[] } = {};
  public  diagnosticHash = [];
  private sortedDiagIndex: { [docName: string]: number[] } = {};
  private compilingFileRegex = /%\s\[\scompiling\s(.+)\s\.\.\.\s\]/;
  private msgRegex = /(((\*|\!)\s{5}.+\n[\*|\!]\s{7}.+\n)|((\*|\!)\s{5}.+\n))[\*|\!]\s{7}.+\n[\*|\!]\s{7}in file\s(.+)\s((at or above line\s(\d+))|(between lines\s(\d+)[-](\d+))|(at line\s(\d+)))([\s\S]*?(?=(\*|\!)\s{5}$))/m;
  private documentListener: Disposable;
  private openDocumentListener: Disposable;

  constructor(private context: ExtensionContext) {
    this.loadConfiguration();
  }

  public async provideCodeActions(
    document: TextDocument, range: Range | Selection,
    context: CodeActionContext, token: CancellationToken):
    Promise<CodeAction[]> {
      const actions: CodeAction[] = [];
      // Iterate through diagnostics (errors/warnings) in the current context
      for (const diagnostic of context.diagnostics) {
        // Check if this diagnostic has an associated quick fix
        if (this.canFix(diagnostic)) {
          const action = this.createQuickFix(document, diagnostic);
          if (action) {
            actions.push(action);
          }
        }
      }  
      return actions;
    }

  private canFix(diagnostic: Diagnostic): boolean {
    // Errors
    if (diagnostic.message.includes('Permission error: modify meta_non_terminal_template ')) {
      return true;
    } else if (diagnostic.message.includes('Permission error: modify meta_predicate_template ')) {
      return true;
    } else if (diagnostic.message.includes('Permission error: modify predicate_scope ')) {
      return true;
    } else if (diagnostic.message.includes('Permission error: modify predicate_declaration ')) {
      return true;
    // Warnings
    } else if (diagnostic.message.includes('Redundant entity qualification in predicate directive argument:')) {
      return true;
    } else if (diagnostic.message.includes('Duplicated clause:')) {
      return true;
    } else if (diagnostic.message.includes('Duplicated directive:')) {
      return true;
    } else if (diagnostic.message.includes('Duplicated grammar rule:')) {
      return true;
    } else if (diagnostic.message.includes('Missing scope directive for predicate:')) {
      return true;
    } else if (diagnostic.message.includes('Missing scope directive for non-terminal:')) {
      return true;
    } else if (diagnostic.message.includes('Missing dynamic/1 directive for predicate:')) {
      return true;
    } else if (diagnostic.message.includes('Missing multifile/1 directive for predicate:')) {
      return true;
    } else if (diagnostic.message.includes('Missing multifile/1 directive for non-terminal:')) {
      return true;
    } else if (diagnostic.message.includes('The encoding/1 directive is ignored')) {
      return true;
    } else if (diagnostic.message.includes('Missing meta_predicate/1 directive for predicate:')) {
      return true;
    } else if (diagnostic.message.includes('Missing meta_non_terminal/1 directive for non-terminal:')) {
      return true;
    }
    return false;
  }

  private createQuickFix(document: TextDocument, diagnostic: Diagnostic): CodeAction | null {
    // Create the edit that will fix the issue
    const edit = new WorkspaceEdit();
    let action: CodeAction;

    // Errors
    if (diagnostic.message.includes('Permission error: modify meta_non_terminal_template ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove meta_non_terminal/1 directive',
        CodeActionKind.QuickFix
      );
      edit.delete(document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Permission error: modify meta_predicate_template ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove meta_predicate/1 directive',
        CodeActionKind.QuickFix
      );
      edit.delete(document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Permission error: modify predicate_scope ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove predicate scope directive',
        CodeActionKind.QuickFix
      );
      edit.delete(document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Permission error: modify predicate_declaration ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove predicate declaration directive',
        CodeActionKind.QuickFix
      );
      edit.delete(document.uri, diagnostic.range);
    // Warnings
    } else if (diagnostic.message.includes('Redundant entity qualification in predicate directive argument:')) {
      // Remove the redundant entity qualification
      action = new CodeAction(
        'Fix redundant entity qualification',
        CodeActionKind.QuickFix
      );
      const entityQualification = diagnostic.message.match(/Redundant entity qualification in predicate directive argument: (.+::).+/);
      const match = document.getText(diagnostic.range).match(entityQualification[1]);
      const deleteRange = new Range(
        diagnostic.range.start.line,
        match.index,
        diagnostic.range.end.line,
        match.index + match[0].length
      );
      edit.delete(document.uri, deleteRange);
    } else if (diagnostic.message.includes('Duplicated clause:')) {
      // Remove the duplicated clause
      action = new CodeAction(
        'Delete duplicated clause',
        CodeActionKind.QuickFix
      );
      edit.delete(document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Duplicated directive:')) {
      // Remove the duplicated directive
      action = new CodeAction(
        'Delete duplicated directive',
        CodeActionKind.QuickFix
      );
      edit.delete(document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Duplicated grammar rule:')) {
      // Remove the duplicated grammar rule
      action = new CodeAction(
        'Delete duplicated grammar rule',
        CodeActionKind.QuickFix
      );
      edit.delete(document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Missing scope directive for predicate:')) {
      // Add missing scope directive
      action = new CodeAction(
        'Add missing public/1 directive',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Missing scope directive for predicate: (.+\/\d+)/);
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- public(' + predicateIndicator[1] + ').\n');
    } else if (diagnostic.message.includes('Missing scope directive for non-terminal:')) {
      // Add missing scope directive
      action = new CodeAction(
        'Add missing public/1 directive',
        CodeActionKind.QuickFix
      );
      const nonTerminalIndicator = diagnostic.message.match(/Missing scope directive for non-terminal: (.+\/\/\d+)/);
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- public(' + nonTerminalIndicator[1] + ').\n');
    } else if (diagnostic.message.includes('Missing dynamic/1 directive for predicate:')) {
      // Add missing scope directive
      action = new CodeAction(
        'Add missing dynamic/1 directive',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Missing dynamic\/1 directive for predicate: (.+\/\d+)/);
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- dynamic(' + predicateIndicator[1] + ').\n');
    } else if (diagnostic.message.includes('Missing multifile/1 directive for predicate:')) {
      // Add missing scope directive
      action = new CodeAction(
        'Add missing multifile/1 directive',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Missing multifile\/1 directive for predicate: (.+\/\d+)/);
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- multifile(' + predicateIndicator[1] + ').\n');
    } else if (diagnostic.message.includes('Missing multifile/1 directive for non-terminal:')) {
      // Add missing scope directive
      action = new CodeAction(
        'Add missing multifile/1 directive',
        CodeActionKind.QuickFix
      );
      const nonTerminalIndicator = diagnostic.message.match(/Missing multifile\/1 directive for non-terminal: (.+\/\/\d+)/);
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- multifile(' + nonTerminalIndicator[1] + ').\n');
    } else if (diagnostic.message.includes('The encoding/1 directive is ignored')) {
      // Move encoding/1 directive to the first line
      action = new CodeAction(
        'Move encoding/1 directive to the first line',
        CodeActionKind.QuickFix
      );
      const text = document.getText(diagnostic.range).trim();
      edit.delete(document.uri, diagnostic.range);
      edit.insert(document.uri, new Position(0, 0), text + '\n');
    } else if (diagnostic.message.includes('Missing meta_predicate/1 directive for predicate:')) {
      // Add missing meta_predicate/1 directive
      action = new CodeAction(
        'Add missing meta_predicate/1 directive',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Missing meta_predicate\/1 directive for predicate: (.+)\/(\d+)/);
      const stars = Array(predicateIndicator[2]).fill('*').join(',');
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- meta_predicate(' + predicateIndicator[1] + '(' + stars+ ')).\n');
    } else if (diagnostic.message.includes('Missing meta_non_terminal/1 directive for non-terminal:')) {
      // Add missing meta_non_terminal/1 directive
      action = new CodeAction(
        'Add missing meta_non_terminal/1 directive',
        CodeActionKind.QuickFix
      );
      const nonTerminalIndicator = diagnostic.message.match(/Missing meta_non_terminal\/1 directive for non-terminal: (.+)\/\/(\d+)/);
      const stars = Array(nonTerminalIndicator[2]).fill('*').join(',');
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- meta_non_terminal(' + nonTerminalIndicator[1] + '(' + stars + ')).\n');
    }

    action.edit = edit;
    // Associate this action with the specific diagnostic
    action.diagnostics = [diagnostic];
    action.command = {
      title: 'Logtalk Linter',
      command: 'logtalk.linter.update.diagnostics',
      arguments: [document.uri, diagnostic]
    };

    return action;
  }

  private parseIssue(issue: string) {
    if(this.diagnosticHash.includes(issue)) {
      return;  // Skip duplicate issues
    }
    
    let match = issue.match(this.msgRegex);
    if (match == null) { return; }

    let severity: DiagnosticSeverity;
    if(match[0][0] == '*') {
      severity = DiagnosticSeverity.Warning
    } else {
      severity = DiagnosticSeverity.Error
    } 

    let fileName = path.resolve(match[6]);
    let lineFrom = 0,
        lineTo   = 0;

    // Position line and column numbers are zero-based
    if(match[9]) {
      lineFrom = parseInt(match[9])-1;
      lineTo   = parseInt(match[9])-1;
    } else if(match[14]) {
      lineFrom = parseInt(match[14])-1;
      lineTo   = parseInt(match[14])-1;
    } else {
      lineFrom = parseInt(match[11])-1;
      lineTo   = parseInt(match[12])-1;
    }

    // Default horizontal range
    let fromCol = 0;
    let toCol = 240;
    let fromPos = new Position(lineFrom, fromCol);
    let toPos = new Position(lineTo, toCol);
    let range = new Range(fromPos, toPos);
    let errMsg = "";
    errMsg = (match[1] + match[15]).replace(new RegExp(/\*     /,'g'), '').replace(new RegExp(/\!     /,'g'), '').trim();
    let diag = new Diagnostic(range, errMsg, severity);
    diag.source = "Logtalk Linter";
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
      const filePath = path.resolve(match[1]);
      this.diagnosticCollection.delete(Uri.file(filePath));
      if (filePath in this.diagnostics) {
        this.diagnostics[filePath] = [];
      }
      // Clear the diagnostic hash as we're starting a new compilation
      this.diagnosticHash = [];
    }
  }

  public updateDiagnostics(uri: Uri, diagnosticToRemove: Diagnostic) {
    const existingDiagnostics = this.diagnosticCollection.get(uri) || [];
    const filteredDiagnostics = existingDiagnostics.filter(
      diagnostic => !this.areDiagnosticsEqual(diagnostic, diagnosticToRemove)
    );
    this.diagnosticCollection.set(uri, filteredDiagnostics);
  }
  
  private areDiagnosticsEqual(a: Diagnostic, b: Diagnostic): boolean {
    return a.message === b.message && 
           a.severity === b.severity &&
           a.code === b.code;
  }

  public updateDiagnosticsOnChange(event: TextDocumentChangeEvent) {
    const existingDiagnostics = this.diagnosticCollection.get(event.document.uri);

    if (!existingDiagnostics || existingDiagnostics.length === 0) {
      return;
    }

    const updatedDiagnostics: Diagnostic[] = [];

    for (const diagnostic of existingDiagnostics) {
      const newRange = this.adjustRangeForChanges(diagnostic.range, event.contentChanges);

      if (newRange) {
        // Create new diagnostic with updated position
        const newDiagnostic = new Diagnostic(
          newRange,
          diagnostic.message,
          diagnostic.severity
        );
        // Copy other properties
        newDiagnostic.source = diagnostic.source;
        newDiagnostic.code = diagnostic.code;
        updatedDiagnostics.push(newDiagnostic);
      }
      // If newRange is null, the diagnostic should be removed
    }

    // Update the diagnostic collection
    this.diagnosticCollection.set(event.document.uri, updatedDiagnostics);
  }

  private adjustRangeForChanges(
    range: Range,
    changes: readonly TextDocumentContentChangeEvent[]
  ): Range | null {
    let adjustedRange = range;

    // Process changes in reverse order (from end to beginning)
    const sortedChanges = [...changes].sort((a, b) => {
      const aStart = a.range?.start || new Position(0, 0);
      const bStart = b.range?.start || new Position(0, 0);
      return bStart.compareTo(aStart);
    });

    for (const change of sortedChanges) {
      if (!change.range) continue;

      adjustedRange = this.adjustRangeForSingleChange(adjustedRange, change);

      // If the diagnostic range was completely removed, return null
      if (!adjustedRange) {
        return null;
      }
    }

    return adjustedRange;
  }

  private adjustRangeForSingleChange(
    range: Range,
    change: TextDocumentContentChangeEvent
  ): Range | null {
    if (!change.range) return range;

    const changeStart = change.range.start;
    const changeEnd = change.range.end;
    const newText = change.text;
    const newLines = newText.split('\n');
    const lineDelta = newLines.length - 1 - (changeEnd.line - changeStart.line);

    // If change is completely after the diagnostic, no adjustment needed
    if (changeStart.isAfterOrEqual(range.end)) {
      return range;
    }

    // If change completely contains the diagnostic, remove it
    if (changeStart.isBeforeOrEqual(range.start) && changeEnd.isAfterOrEqual(range.end)) {
      return null;
    }

    let newStart = range.start;
    let newEnd = range.end;

    // Adjust start position
    if (changeEnd.isBeforeOrEqual(range.start)) {
      // Change is completely before diagnostic
      if (changeEnd.line < range.start.line) {
        newStart = new Position(range.start.line + lineDelta, range.start.character);
      } else if (changeEnd.line === range.start.line) {
        // const charDelta = newText.length - (changeEnd.character - changeStart.character);
        const charDelta = 0;
        newStart = new Position(
          range.start.line + lineDelta,
          range.start.character + charDelta
        );
      }
    }

    // Adjust end position similarly
    if (changeEnd.isBeforeOrEqual(range.end)) {
      if (changeEnd.line < range.end.line) {
        newEnd = new Position(range.end.line + lineDelta, range.end.character);
      } else if (changeEnd.line === range.end.line) {
        // const charDelta = newText.length - (changeEnd.character - changeStart.character);
        const charDelta = 240;
        newEnd = new Position(
          range.end.line + lineDelta,
          range.end.character + charDelta
        );
      }
    }

    return new Range(newStart, newEnd);
  }

  private removeDuplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    const seen = new Set<string>();
    return diagnostics.filter(diag => {
      const key = `${diag.range.start.line},${diag.range.start.character},${diag.range.end.line},${diag.range.end.character},${diag.message},${diag.severity}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
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

  public activate(subscriptions): void {

    this.diagnosticCollection = languages.createDiagnosticCollection('Logtalk Linter');

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
