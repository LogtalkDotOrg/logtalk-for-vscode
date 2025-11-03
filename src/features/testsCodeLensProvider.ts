"use strict";

import {
  CancellationToken,
  CodeLensProvider,
  CodeLens,
  Range,
  Position,
  TextDocument,
  EventEmitter,
  Event,
  workspace,
  Disposable
} from "vscode";
import * as path from "path";
import * as fs from "fs";

export class LogtalkTestsCodeLensProvider implements CodeLensProvider {

  private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
  public readonly onDidChangeCodeLenses: Event<void> = this._onDidChangeCodeLenses.event;
  public static outdated: boolean = false;

  private configurationListener: Disposable;
  private textDocumentListener: Disposable;

  constructor() {
    this.configurationListener = workspace.onDidChangeConfiguration((_) => {
      LogtalkTestsCodeLensProvider.outdated = true;
      this._onDidChangeCodeLenses.fire();
    });

    this.textDocumentListener = workspace.onWillSaveTextDocument((e) => {
      // Only process Logtalk files that have unsaved changes
      if (e.document.languageId !== 'logtalk' || !e.document.isDirty) {
        return;
      }

      // Remove test results only for the edited file
      const editedFile = path.resolve(e.document.uri.fsPath).split(path.sep).join("/");
      const dir = path.dirname(e.document.uri.fsPath);
      const testsFile = path.join(dir, ".vscode_test_results");
      if (fs.existsSync(testsFile)) {
        const content = fs.readFileSync(testsFile, 'utf8');
        const lines = content.split('\n');
        const updatedLines = lines.filter(line =>
          !line.toLowerCase().startsWith('file:' + editedFile.toLowerCase() + ';'));
        if (updatedLines.length < lines.length) {
          if (updatedLines.length > 0) {
            fs.writeFileSync(testsFile, updatedLines.join('\n'));
          } else {
            fs.unlinkSync(testsFile);
          }
        }
      }
      LogtalkTestsCodeLensProvider.outdated = true;
      this._onDidChangeCodeLenses.fire();
    });
  }

  /**
   * Dispose of event listeners and clean up resources
   */
  public dispose(): void {
    if (this.configurationListener) {
      this.configurationListener.dispose();
    }
    if (this.textDocumentListener) {
      this.textDocumentListener.dispose();
    }
    if (this._onDidChangeCodeLenses) {
      this._onDidChangeCodeLenses.dispose();
    }
  }

  public async provideCodeLenses(
    doc: TextDocument,
    token: CancellationToken
  ): Promise<CodeLens[]> {
    if (workspace.getConfiguration("logtalk").get("enableCodeLens", true)) {
      let codeLenses: CodeLens[] = [];
      const file0 = doc.uri.fsPath;
      const file = path.resolve(file0).split(path.sep).join("/");
      const dir0 = path.dirname(doc.uri.fsPath);
      const dir = path.resolve(dir0).split(path.sep).join("/");
      const results = path.join(dir, ".vscode_test_results");
      if (fs.existsSync(results)) {
        let out = fs.readFileSync(results).toString();
        // use case-insensitive matching to workaround Prolog
        // backends down-casing file paths on Windows
        let regex = new RegExp("File:" + file + ";Line:(\\d+);Object:(.*);Test:(.*);Status:(.*)", "ig");
        let matches = out.matchAll(regex);
        var match = null;
        var outdated = "";
        var index = -1;
        // Only show outdated message for files that weren't just edited
        if ((doc.isDirty || LogtalkTestsCodeLensProvider.outdated) && fs.existsSync(results)) {
          const content = fs.readFileSync(results).toString();
          if (content.toLowerCase().includes('file:' + file.toLowerCase() + ';')) {
            outdated = " (may be outdated)";
          }
        }
        // individual test results
        for (match of matches) {
          index = codeLenses.findIndex((element) => element.command.arguments[2] == match[3]);
          if (index != -1) {
            codeLenses.splice(index, 1);
          }
          codeLenses.push(
            new CodeLens(
              new Range(new Position(parseInt(match[1]) - 1, 0), new Position(parseInt(match[1]) - 1, 0)),
              {
                title: match[4].split(';Reason:')[0] + outdated,
                tooltip: "Re-run test",
                command: "logtalk.run.test",
                arguments: [doc.uri, match[2], match[3]]
              }
            )
          );
        }
        // test results summary (object-level summaries without Test field)
        regex = new RegExp("File:" + file + ";Line:(\\d+);Object:([^;]+);Status:(.*)", "ig");
        matches = out.matchAll(regex);
        match = null;
        for (match of matches) {
          index = codeLenses.findIndex((element) => (element.command.tooltip == "Re-run all tests") && (element.range.start.line == parseInt(match[1]) - 1));
          if (index != -1) {
            if (!codeLenses[index].command.title.includes('(outdated)')) {
              codeLenses[index].command.title = codeLenses[index].command.title + " (outdated)";  
            }
          } else {
            codeLenses.push(
              new CodeLens(
                new Range(new Position(parseInt(match[1]) - 1, 0), new Position(parseInt(match[1]) - 1, 0)),
                {
                  title: match[3] + outdated,
                  tooltip: "Re-run object tests",
                  command: "logtalk.run.object.tests",
                  arguments: [doc.uri, match[2]]
                }
              )
            );
          }
        }
        // clause coverage
        regex = new RegExp("File:" + file + ";Line:(\\d+);Status:(.*)", "ig");
        matches = out.matchAll(regex);
        match = null;
        for (match of matches) {
          index = codeLenses.findIndex((element) => (element.command.tooltip == "Re-run all tests") && (element.range.start.line == parseInt(match[1]) - 1));
          if (index != -1) {
            if (!codeLenses[index].command.title.includes('(outdated)')) {
              codeLenses[index].command.title = codeLenses[index].command.title + " (outdated)";  
            }
          } else {
            codeLenses.push(
              new CodeLens(
                new Range(new Position(parseInt(match[1]) - 1, 0), new Position(parseInt(match[1]) - 1, 0)),
                {
                  title: match[2] + outdated,
                  tooltip: "Re-run all tests",
                  command: "logtalk.run.tests",
                  arguments: [doc.uri]
                }
              )
            );
          }
        }
      }
      return codeLenses;
    } else {
      return [];
    }
  }
}
