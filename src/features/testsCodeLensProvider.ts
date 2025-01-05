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
  public static outdated: boolean = false;

  constructor() {
    workspace.onDidChangeConfiguration((_) => {
      LogtalkTestsCodeLensProvider.outdated = true;
      this._onDidChangeCodeLenses.fire();
    });

    workspace.onWillSaveTextDocument((_) => {
      LogtalkTestsCodeLensProvider.outdated = true;
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
        let regex = new RegExp("File:" + file + ";Line:(\\d+);Object:(.*);Test:(.*);Status:(.*)", "ig");
        let matches = out.matchAll(regex);
        var match = null;
        var outdated = ""
        var index = -1;
        if (doc.isDirty || LogtalkTestsCodeLensProvider.outdated) {
          outdated = " (may be outdated)"
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
                title: match[4] + outdated,
                tooltip: "Re-run test",
                command: "logtalk.run.test",
                arguments: [doc.uri, match[2], match[3]]
              }
            )
          );
        }
        // clause coverage and test results summary
        regex = new RegExp("File:" + file + ";Line:(\\d+);Status:(.*)", "ig");
        matches = out.matchAll(regex);
        match = null;
        for (match of matches) {
          index = codeLenses.findIndex((element) => (element.command.tooltip == "Re-run all tests") && (element.range.start.line == parseInt(match[1]) - 1));
          if (index != -1) {
            codeLenses[index].command.title = codeLenses[index].command.title + " (outdated)";
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
