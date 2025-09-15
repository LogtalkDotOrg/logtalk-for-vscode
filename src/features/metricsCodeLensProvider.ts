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
import { getLogger } from "../utils/logger";
import LogtalkTerminal from "./logtalkTerminal";

export class LogtalkMetricsCodeLensProvider implements CodeLensProvider {
  private logger = getLogger();

  private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
  public readonly onDidChangeCodeLenses: Event<void> = this._onDidChangeCodeLenses.event;
  public static outdated: boolean = false;

  private configurationListener: Disposable;
  private textDocumentListener: Disposable;

  constructor() {
    this.configurationListener = workspace.onDidChangeConfiguration((_) => {
      LogtalkMetricsCodeLensProvider.outdated = true;
      this._onDidChangeCodeLenses.fire();
    });

    this.textDocumentListener = workspace.onDidChangeTextDocument((e) => {
      // Remove metrics results only for the edited file
      const editedFile = path.resolve(e.document.uri.fsPath).split(path.sep).join("/");
      const dir = path.dirname(e.document.uri.fsPath);
      const metricsFile = path.join(dir, ".vscode_metrics_results");
      if (fs.existsSync(metricsFile)) {
        const content = fs.readFileSync(metricsFile, 'utf8');
        const lines = content.split('\n');
        const updatedLines = lines.filter(line =>
          !line.toLowerCase().startsWith('file:' + editedFile.toLowerCase() + ';'));
        if (updatedLines.length < lines.length) {
          if (updatedLines.length > 0) {
            fs.writeFileSync(metricsFile, updatedLines.join('\n'));
          } else {
            fs.unlinkSync(metricsFile);
          }
        }
      }
      LogtalkMetricsCodeLensProvider.outdated = true;
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
      const results = path.join(dir, ".vscode_metrics_results");
      const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
      const recursiveResults = path.join(wdir, ".vscode_metrics_results");
      let out = null;
      if (fs.existsSync(results)) {
        out = fs.readFileSync(results).toString();
      } else if (fs.existsSync(recursiveResults)) {
        out = fs.readFileSync(recursiveResults).toString();
      }
      if (out) {
        // use case-insensitive matching to workaround Prolog
        // backends down-casing file paths on Windows
        const regex = new RegExp("File:" + file + ";Line:(\\d+);Score:(\\d+)", "ig");
        let matches = out.matchAll(regex);
        var match = null;
        for (match of matches) {
          const showOutdated = (doc.isDirty || LogtalkMetricsCodeLensProvider.outdated) && 
            fs.existsSync(results) && 
            fs.readFileSync(results).toString().toLowerCase().includes('file:' + file.toLowerCase() + ';');
          if (showOutdated) {
            codeLenses.push(
              new CodeLens(
                new Range(new Position(parseInt(match[1]) - 1, 0), new Position(parseInt(match[1]) - 1, 0)),
                {
                  title: "Cyclomatic complexity: " + match[2] + " (may be outdated)",
                  tooltip: "Re-compute metrics",
                  command: "logtalk.compute.metrics",
                  arguments: [doc.uri]
                }
              )
            );
          } else {
            codeLenses.push(
              new CodeLens(
                new Range(new Position(parseInt(match[1]) - 1, 0), new Position(parseInt(match[1]) - 1, 0)),
                {
                  title: "Cyclomatic complexity: " + match[2],
                  tooltip: "Re-compute metrics",
                  command: "logtalk.compute.metrics",
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
