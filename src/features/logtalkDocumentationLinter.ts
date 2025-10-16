"use strict";

import {
  CancellationToken,
  CodeActionContext,
  CodeActionProvider,
  CodeAction,
  CodeActionKind,
  Command,
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
  WorkspaceEdit,
  workspace
} from "vscode";
import * as path from "path";
import { getLogger } from "../utils/logger";
import { DiagnosticsUtils } from "../utils/diagnostics";
import { PredicateUtils } from "../utils/predicateUtils";
import { Utils } from "../utils/utils";

export default class LogtalkDocumentationLinter implements CodeActionProvider {

  public  diagnosticCollection: DiagnosticCollection;
  public  diagnostics: { [docName: string]: Diagnostic[] } = {};
  public  diagnosticHash = [];
  private sortedDiagIndex: { [docName: string]: number[] } = {};
  private compilingFileRegex = /%\s\[\scompiling\s(.+)\s\.\.\.\s\]/;
  private msgRegex = /(((\*|\!)\s{5}.+\n[\*|\!]\s{7}.+\n)|((\*|\!)\s{5}.+\n))[\*|\!]\s{7}.+\n[\*|\!]\s{7}in file\s(.+)\s(below line\s(\d+))/;
  private documentListener: Disposable;
  private openDocumentListener: Disposable;
  private logger = getLogger();

  constructor(private context: ExtensionContext) {
    this.loadConfiguration();
  }

  public async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext,
    token: CancellationToken
  ): Promise<CodeAction[]> {
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
    if (diagnostic.message.includes('Missing directive: info/1')) {
      return true;
    } else if (diagnostic.message.includes('Missing info/2 directive for predicate:')) {
      return true;
    } else if (diagnostic.message.includes('Missing mode/2 directive for predicate:')) {
      return true;
    }
    return false;
  }

  private createQuickFix(document: TextDocument, diagnostic: Diagnostic): CodeAction | null {
    // Create the edit that will fix the issue
    const edit = new WorkspaceEdit();
    let action: CodeAction;

    if (diagnostic.message.includes('Missing directive: info/1')) {
      // Add info/1 directive after entity opening directive
      action = new CodeAction(
        'Add info/1 directive',
        CodeActionKind.QuickFix
      );

      // Find the entity opening directive from the warning location
      const entityLine = Utils.findEntityOpeningDirective(document, diagnostic.range.start.line);
      if (entityLine === null) {
        return null;
      }

      // Get the full range of the entity opening directive
      const directiveRange = PredicateUtils.getDirectiveRange(document, entityLine);

      // Get current date in YYYY-MM-DD format
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const currentDate = `${year}-${month}-${day}`;

      // Get indentation from the entity opening directive
      const entityLineText = document.lineAt(entityLine).text;
      const indent = entityLineText.match(/^(\s*)/)[1] + '\t';

      // Create the info/1 directive with the specified keys
      const infoDirective = `${indent}:- info([\n` +
        `${indent}\tversion is 1:0:0,\n` +
        `${indent}\tauthor is '',\n` +
        `${indent}\tdate is ${currentDate},\n` +
        `${indent}\tcomment is ''\n` +
        `${indent}]).\n`;

      // Insert the info/1 directive after the entity opening directive with an empty line
      const insertPosition = new Position(directiveRange.end + 1, 0);
      edit.insert(document.uri, insertPosition, '\n' + infoDirective);
    } else if (diagnostic.message.includes('Missing info/2 directive for predicate:')) {
      // Extract predicate indicator from the diagnostic message
      const indicatorMatch = diagnostic.message.match(/Missing info\/2 directive for predicate:\s*(.+)/);
      if (!indicatorMatch) {
        return null;
      }

      const indicator = indicatorMatch[1].trim();
      const parsed = PredicateUtils.parseIndicator(indicator);
      if (!parsed) {
        return null;
      }

      action = new CodeAction(
        `Add info/2 directive for predicate ${indicator}`,
        CodeActionKind.QuickFix
      );

      // The warning line is the line of the predicate scope directive
      const scopeLine = diagnostic.range.start.line;

      // Get the full range of the scope directive
      const directiveRange = PredicateUtils.getDirectiveRange(document, scopeLine);

      // Get indentation from the scope directive
      const scopeLineText = document.lineAt(scopeLine).text;
      const indent = scopeLineText.match(/^(\s*)/)[1];

      // Create the info/2 directive
      let infoDirective: string;
      if (parsed.arity === 0) {
        // No argnames for zero-arity predicates
        infoDirective = `${indent}:- info(${indicator}, [\n` +
          `${indent}\tcomment is ''\n` +
          `${indent}]).\n`;
      } else {
        // Create argnames list with empty strings based on arity
        const argnamesList = Array(parsed.arity).fill("''").join(', ');
        infoDirective = `${indent}:- info(${indicator}, [\n` +
          `${indent}\tcomment is '',\n` +
          `${indent}\targnames is [${argnamesList}]\n` +
          `${indent}]).\n`;
      }

      // Insert the info/2 directive after the scope directive
      const insertPosition = new Position(directiveRange.end + 1, 0);
      edit.insert(document.uri, insertPosition, infoDirective);
    } else if (diagnostic.message.includes('Missing mode/2 directive for predicate:')) {
      // Extract predicate indicator from the diagnostic message
      const indicatorMatch = diagnostic.message.match(/Missing mode\/2 directive for predicate:\s*(.+)/);
      if (!indicatorMatch) {
        return null;
      }

      const indicator = indicatorMatch[1].trim();
      const parsed = PredicateUtils.parseIndicator(indicator);
      if (!parsed) {
        return null;
      }

      action = new CodeAction(
        `Add mode/2 directive for predicate ${indicator}`,
        CodeActionKind.QuickFix
      );

      // The warning line is the line of the predicate scope directive
      const scopeLine = diagnostic.range.start.line;

      // Get the full range of the scope directive
      const directiveRange = PredicateUtils.getDirectiveRange(document, scopeLine);

      // Get indentation from the scope directive
      const scopeLineText = document.lineAt(scopeLine).text;
      const indent = scopeLineText.match(/^(\s*)/)[1];

      // Construct the predicate call template with ? for each argument
      let callTemplate: string;
      if (parsed.arity === 0) {
        callTemplate = parsed.name;
      } else {
        const args = Array(parsed.arity).fill('?').join(', ');
        callTemplate = `${parsed.name}(${args})`;
      }

      // Create the mode/2 directive
      const modeDirective = `${indent}:- mode(${callTemplate}, zero_or_more).\n`;

      // Insert the mode/2 directive after the scope directive
      const insertPosition = new Position(directiveRange.end + 1, 0);
      edit.insert(document.uri, insertPosition, modeDirective);
    }

    action.edit = edit;
    // Associate this action with the specific diagnostic
    action.diagnostics = [diagnostic];
    action.command = {
      title: 'Logtalk Documentation Linter',
      command: 'logtalk.update.diagnostics',
      arguments: [document.uri, diagnostic]
    };

    return action;
  }
  private parseIssue(issue: string) {

    if(this.diagnosticHash.includes(issue)) {
      return true
    } else {
      this.diagnosticHash.push(issue)
    }

    let match = issue.match(this.msgRegex)
    if (match == null) {
      return null;
    } else {
      this.logger.debug("match!");
    }

    let severity: DiagnosticSeverity;
    if(match[0][0] == '*') {
      severity = DiagnosticSeverity.Warning
    } else {
      severity = DiagnosticSeverity.Error
    }
    this.logger.debug("severity:", severity);

    let fileName = path.resolve(match[6]);
    this.logger.debug(fileName);
    let lineFrom = 0,
        lineTo   = 0;
    this.logger.debug("match:", match);

    // Position line and column numbers are zero-based
    if(match[8]) {
      lineFrom = parseInt(match[8])-1;
      lineTo   = parseInt(match[8]);
    }

    // Default horizontal range
    let fromCol = 0;
    let toCol = 240;
    let fromPos = new Position(lineFrom, fromCol);
    let toPos = new Position(lineTo, toCol);
    let range = new Range(fromPos, toPos);
    let errMsg = match[1].replace(new RegExp(/\*     /,'g'), '').replace(new RegExp(/\!     /,'g'), '');
    let diag = new Diagnostic(range, errMsg, severity);
    diag.source = "Logtalk Documentation Linter";
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

    this.diagnosticCollection = languages.createDiagnosticCollection('Logtalk Documentation Linter');

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
