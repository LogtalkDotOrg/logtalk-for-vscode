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
  Uri,
  languages,
  workspace
} from "vscode";
import * as path from "path";
import { DiagnosticsUtils } from "../utils/diagnostics";

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
    } else if (diagnostic.message.includes('Singleton variable: ')) {
      return true;
    } else if (diagnostic.message.includes('Singleton variables: ')) {
      return true;
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
    } else if (diagnostic.message.includes('Deprecated date format:')) {
      return true;
    } else if (diagnostic.message.includes('Deprecated predicate: not/1 (compiled as a call to')) {
      return true;
    } else if (diagnostic.message.includes('as the goal compares numbers using unification')) {
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
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Permission error: modify meta_predicate_template ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove meta_predicate/1 directive',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Permission error: modify predicate_scope ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove predicate scope directive',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Permission error: modify predicate_declaration ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove predicate declaration directive',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    // Warnings
    } else if (diagnostic.message.includes('Singleton variable: ')) {
      // Rename the singleton variable to named anonymous variable
      action = new CodeAction(
        'Rename singleton variable to named anonymous variable',
        CodeActionKind.QuickFix
      );
      const message = diagnostic.message.match(/Singleton variable: (.+)/);
      const singletonVariable = message[1];
      const namedSingleton = '_' + singletonVariable;
      // Find the exact range of the singleton variable within the diagnostic range
      const singletonRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, singletonVariable);
      if (singletonRange) {
        edit.replace(document.uri, singletonRange, namedSingleton);
      } else {
        return null;
      }
    } else if (diagnostic.message.includes('Singleton variables: ')) {
      // Rename the singleton variables to named anonymous variables
      action = new CodeAction(
        'Rename singleton variables to named anonymous variables',
        CodeActionKind.QuickFix
      );
      const message = diagnostic.message.match(/Singleton variables: (.+)/);
      // Remove brackets and spaces, then split on comma - handles all formats: [A,B], [A, B], A,B, A, B
      const variablesString = message[1].replace(/[\[\]\s]/g, ''); // Remove [, ], and spaces
      const singletonVariables = variablesString.split(',');
      // Compute replacements
      let hasAnyReplacement = false;
      for (const singletonVariable of singletonVariables) {
        const namedSingleton = '_' + singletonVariable;
        // Find the exact range of the singleton variable within the diagnostic range
        const singletonRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, singletonVariable);
        if (singletonRange) {
          edit.replace(document.uri, singletonRange, namedSingleton);
          hasAnyReplacement = true;
        }
        // Continue with other variables even if this one can't be renamed
      }
      // Only return null if no variables could be renamed at all
      if (!hasAnyReplacement) {
        return null;
      }
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
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Duplicated directive:')) {
      // Remove the duplicated directive
      action = new CodeAction(
        'Delete duplicated directive',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Duplicated grammar rule:')) {
      // Remove the duplicated grammar rule
      action = new CodeAction(
        'Delete duplicated grammar rule',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
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
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
      edit.insert(document.uri, new Position(0, 0), text + '\n');
    } else if (diagnostic.message.includes('Missing meta_predicate/1 directive for predicate:')) {
      // Add missing meta_predicate/1 directive
      action = new CodeAction(
        'Add missing meta_predicate/1 directive (edit as needed)',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Missing meta_predicate\/1 directive for predicate: (.+)\/(\d+)/);
      const stars = Array(predicateIndicator[2]).fill('*').join(',');
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- meta_predicate(' + predicateIndicator[1] + '(' + stars+ ')).\n');
    } else if (diagnostic.message.includes('Missing meta_non_terminal/1 directive for non-terminal:')) {
      // Add missing meta_non_terminal/1 directive
      action = new CodeAction(
        'Add missing meta_non_terminal/1 directive (edit as needed)',
        CodeActionKind.QuickFix
      );
      const nonTerminalIndicator = diagnostic.message.match(/Missing meta_non_terminal\/1 directive for non-terminal: (.+)\/\/(\d+)/);
      const stars = Array(nonTerminalIndicator[2]).fill('*').join(',');
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- meta_non_terminal(' + nonTerminalIndicator[1] + '(' + stars + ')).\n');
    } else if (diagnostic.message.includes('Deprecated date format:')) {
      // Replace deprecated date format with ISO 8601 format
      action = new CodeAction(
        'Replace deprecated date format with ISO 8601 format',
        CodeActionKind.QuickFix
      );
      const deprecatedMessage = diagnostic.message.match(/Deprecated date format: (.+) \(use instead ISO 8601 format (.+)\)/);
      if (deprecatedMessage) {
        const deprecatedDate = deprecatedMessage[1];
        const isoDate = deprecatedMessage[2];

        // Find the exact range of the deprecated date within the diagnostic range
        const deprecatedDateRange = DiagnosticsUtils.findTextInRange(document, diagnostic.range, deprecatedDate);

        if (deprecatedDateRange) {
          // Replace only the deprecated date part with the ISO date
          edit.replace(document.uri, deprecatedDateRange, isoDate);
        } else {
          return null;
        }
      }
    } else if (diagnostic.message.includes('Deprecated predicate: not/1 (compiled as a call to')) {
      // Replace deprecated not/1 predicate with (\+)/1 control construct
      action = new CodeAction(
        'Replace deprecated not/1 predicate with (\\+/1) control construct',
        CodeActionKind.QuickFix
      );
      // Find the matching parentheses for the not/1 goal within the diagnostic range
      const parenthesesMatch = DiagnosticsUtils.findMatchingParentheses(document, diagnostic.range, 'not(');
      if (parenthesesMatch) {
        // Replace 'not(' with '\+ ' and remove the closing parenthesis
        edit.replace(document.uri, parenthesesMatch.openRange, '\\+ ');
        edit.delete(document.uri, parenthesesMatch.closeRange);
      } else {
        // Fallback to the original approach if parentheses matching fails
        const notRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, 'not(');
        if (notRange) {
          edit.replace(document.uri, notRange, '\\+ (');
        } else {
          return null;
        }
      }
    } else if (diagnostic.message.includes('as the goal compares numbers using unification')) {
      // Replace unification with number equality operator
      action = new CodeAction(
        'Replace unification with number equality operator',
        CodeActionKind.QuickFix
      );
      const comparison = diagnostic.message.match(/Suspicious call: (.+)\s*=\s*(.+) as the goal compares numbers using unification/);
      if (comparison) {
        const leftOperand = comparison[1].trim();
        const rightOperand = comparison[2].trim();
        // Find the exact range of the comparison within the diagnostic range
        let comparisonRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, ' = ');
        if (comparisonRange) {
          edit.replace(document.uri, comparisonRange, ' =:= ');
        } else {
          comparisonRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, '=');
          if (comparisonRange) {
            edit.replace(document.uri, comparisonRange, '=:=');
          } else {
            return null;
          }
          return null;
        }
      }
    }

    action.edit = edit;
    // Associate this action with the specific diagnostic
    action.diagnostics = [diagnostic];
    action.command = {
      title: 'Logtalk Linter',
      command: 'logtalk.update.diagnostics',
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
    DiagnosticsUtils.updateDiagnostics(this.diagnosticCollection, uri, diagnosticToRemove);
  }

  private removeDuplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    return DiagnosticsUtils.removeDuplicateDiagnostics(diagnostics);
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
