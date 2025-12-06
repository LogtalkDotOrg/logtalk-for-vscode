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
  languages,
  Position,
  Range,
  TextDocument,
  Uri,
  workspace
} from "vscode";
import * as fs from "fs";
import { getLogger } from "../utils/logger";
import { DiagnosticsUtils } from "../utils/diagnostics";
import { Utils } from "../utils/utils";

export default class LogtalkTestsReporter implements CodeActionProvider {

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
    // Warnings
    if (diagnostic.message.includes('code coverage requested for protocol:')) {
      return true;
    } else if (diagnostic.message.includes('unknown entity declared covered:')) {
      return true;
    } else if (diagnostic.message.includes('assertion uses a unification goal:')) {
      return true;
    }
    return false;
  }

  private createQuickFix(document: TextDocument, diagnostic: Diagnostic): CodeAction | null {
    // Create the edit that will fix the issue
    const edit = new WorkspaceEdit();
    let action: CodeAction;

    // Warnings
    if (diagnostic.message.includes('code coverage requested for protocol:')) {
      // Delete useless cover/1 fact
      action = new CodeAction(
        'Delete cover/1 fact for the protocol',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('unknown entity declared covered:')) {
      // Delete useless cover/1 fact
      action = new CodeAction(
        'Delete cover/1 fact for the unknown entity',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('assertion uses a unification goal:')) {
      const assertion = diagnostic.message.match(/test (.+) assertion uses a unification goal: (.+)(\s*)=(\s*)(.+)/);
      if (assertion) {
        // Extract the left and right operands from the diagnostic message
        const leftOperand = assertion[2].trim();
        const rightOperand = assertion[5].trim();

        // Check if either operand is a float (contains a decimal point and is numeric)
        const isFloat = (operand: string): boolean => {
          // Remove any surrounding whitespace and check for float pattern
          const trimmed = operand.trim();
          // Match float patterns like: 3.14, -2.5, 0.0, .5, 5., +1.23
          return /^[+-]?(\d+\.\d*|\d*\.\d+|\d+\.)$/.test(trimmed);
        };

        const hasFloatOperand = isFloat(leftOperand) || isFloat(rightOperand);
        const operator = hasFloatOperand ? '=~=' : '==';
        const description = hasFloatOperand
          ? 'Fix assertion to use a (=~=)/2 float approximate equality goal'
          : 'Fix assertion to use a (==)/2 term equality goal';

        // Fix assertion to use appropriate operator
        action = new CodeAction(description, CodeActionKind.QuickFix);

        // Get the actual line text from the document
        const lineText = document.lineAt(diagnostic.range.start.line).text;

        // Find the = operator by looking for the pattern: leftOperand...=...rightOperand
        // We'll search for = characters and check if they're surrounded by the correct operands
        let equalStartCol = -1;

        for (let i = 0; i < lineText.length; i++) {
          if (lineText[i] === '=') {
            // Check if this = is not part of == or =~= (avoid replacing == with === or =~= with =~==)
            if (i > 0 && lineText[i - 1] === '=') continue;
            if (i < lineText.length - 1 && lineText[i + 1] === '=') continue;
            if (i > 0 && lineText[i - 1] === '~') continue;

            // Extract text before and after this = to see if it matches our operands
            const beforeEqual = lineText.substring(0, i).trim();
            const afterEqual = lineText.substring(i + 1).trim();

            // Check if the left operand appears at the end of beforeEqual
            // and right operand appears at the start of afterEqual
            if (beforeEqual.endsWith(leftOperand) && afterEqual.startsWith(rightOperand)) {
              equalStartCol = i;
              break;
            }
          }
        }

        if (equalStartCol !== -1) {
          // Create a range that covers only the = operator
          const equalRange = new Range(
            new Position(diagnostic.range.start.line, equalStartCol),
            new Position(diagnostic.range.start.line, equalStartCol + 1)
          );

          edit.replace(document.uri, equalRange, operator);
        }
      }
    }

    action.edit = edit;
    // Associate this action with the specific diagnostic
    action.diagnostics = [diagnostic];
    action.command = {
      title: 'Logtalk Testing',
      command: 'logtalk.update.diagnostics',
      arguments: [document.uri, diagnostic]
    };

    return action;
  }

  private parseIssue(issue: string) {
    if(this.diagnosticHash.includes(issue)) {
      return;  // Skip duplicate issues
    }
    
    let match = issue.match(this.msgRegex)
    if (match == null) { return; }

    // Add to hash to prevent duplicates
    this.diagnosticHash.push(issue);

    let severity: DiagnosticSeverity;
    if(match[0][0] == '*') {
      severity = DiagnosticSeverity.Warning
    } else {
      severity = DiagnosticSeverity.Error
    }

    // Handle paths starting with double slash followed by drive letter (e.g., //C/path -> C:/path)
    let filePath = Utils.normalizeDoubleSlashPath(match[6]);

    let fileName = fs.realpathSync.native(filePath);
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
    diag.source = "Logtalk Tests Reporter";
    diag.code = lineFrom + 1;

    if (diag) {
      if (!this.diagnostics[fileName]) {
        this.diagnostics[fileName] = [diag];
      } else {
          this.diagnostics[fileName].push(diag);
      }
    }

  }

  public lint(textDocument: TextDocument, message: string) {
    message = message.replace(/ \(in.*cpu\/wall seconds\)/, "");
    this.logger.debug(message);
    
    this.parseIssue(message);
    
    // Update the diagnostics collection with all accumulated diagnostics
    for (let doc in this.diagnostics) {
      if (this.diagnostics[doc].length === 0) {
        continue;
      }
      
      // Remove any duplicate diagnostics within the same file
      this.diagnostics[doc] = this.removeDuplicateDiagnostics(this.diagnostics[doc]);
      
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
      // Handle paths starting with double slash followed by drive letter (e.g., //C/path -> C:/path)
      let filePath = Utils.normalizeDoubleSlashPath(match[1]);

      filePath = fs.realpathSync.native(filePath);
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

    this.diagnosticCollection = languages.createDiagnosticCollection('Logtalk Testing');

    workspace.onDidChangeConfiguration(
      this.loadConfiguration,
      this,
      subscriptions
    );

    workspace.onWillSaveTextDocument(
      textDocumentWillSaveEvent => {
        if (textDocumentWillSaveEvent.document.isDirty) {
          this.diagnosticCollection.delete(textDocumentWillSaveEvent.document.uri);
          const filePath = textDocumentWillSaveEvent.document.uri.fsPath;
          if (filePath in this.diagnostics) {
            this.diagnostics[filePath] = [];
          }
        }
      },
      this,
      subscriptions
    );

    this.loadConfiguration();

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
  }

  public dispose(): void {
    this.documentListener.dispose();
    this.openDocumentListener.dispose();
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
  }

}
