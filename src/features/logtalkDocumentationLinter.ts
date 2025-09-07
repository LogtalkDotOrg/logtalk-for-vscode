"use strict";

import {
  CancellationToken,
  CodeActionContext,
  CodeActionProvider,
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
  workspace
} from "vscode";
import * as path from "path";
import { getLogger } from "../utils/logger";

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

  provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext,
    token: CancellationToken
  ): Command[] | Thenable<Command[]> {
    let codeActions: Command[] = [];
    return codeActions;
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

    if(match[8]) {
      lineFrom = parseInt(match[8])-1;
      lineTo   = parseInt(match[8]);
    }

    let fromCol = 0;
    let toCol = 240; // Default horizontal range
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
