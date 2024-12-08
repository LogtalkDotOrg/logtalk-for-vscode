"use strict";

import {
  CancellationToken,
  CodeLensProvider,
  CodeLens,
  Range,
  Position,
  Command,
  TextDocument,
  Uri,
  EventEmitter,
  Event,
  workspace
} from "vscode";
import LogtalkTerminal from "./logtalkTerminal";
import { Utils } from "../utils/utils";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";

export class LogtalkTestsCodeLensProvider implements CodeLensProvider {

  private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
  public readonly onDidChangeCodeLenses: Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    workspace.onDidChangeConfiguration((_) => {
      this._onDidChangeCodeLenses.fire();
    });

    workspace.onDidChangeTextDocument(
      textDocumentChangeEvent => {
        const results = path.join(path.dirname(textDocumentChangeEvent.document.uri.fsPath), ".vscode_test_results");
        if (fs.existsSync(results)) {
          fs.unlinkSync(results);
        }
    });
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
        let out = await fs.readFileSync(results).toString();
        // use case-insensitive matching to workaround Prolog
        // backends down-casing file paths on Windows
        const regex = new RegExp("File:" + file + ";Line:(\\d+);Status:(.*)", "ig");
        let matches = out.matchAll(regex);
        var match = null;
        for (match of matches) {
          codeLenses.push(
            new CodeLens(
              new Range(new Position(parseInt(match[1]) - 1, 0), new Position(parseInt(match[1]) - 1, 0)),
              {
                title: match[2],
                tooltip: "Re-run tests",
                command: "logtalk.run.tests",
                arguments: [doc.uri]
              }
            )
          );
        }
      }
      return codeLenses;
    } else {
      return [];
    }
  }
}
