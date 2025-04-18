"use strict";

import {
  CancellationToken,
  DocumentHighlightProvider,
  Position,
  TextDocument,
  DocumentHighlight,
  Range
} from "vscode";

export default class LogtalkDocumentHighlightProvider
  implements DocumentHighlightProvider {
  public provideDocumentHighlights(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Thenable<DocumentHighlight[]> | DocumentHighlight[] {
    let docHighlight: DocumentHighlight[] = [];
    let wordRange = doc.getWordRangeAtPosition(position);
    if (!wordRange) {
      return;
    }

    let symbol = doc.getText(wordRange);
    let symbolLen = symbol.length;
    let line = 0;
    let re = new RegExp("\\b" + symbol + "\\b", "g");
    while (line < doc.lineCount) {
      let lineTxt = doc.lineAt(line).text;
      let match = re.exec(lineTxt);
      while (match) {
        docHighlight.push(
          new DocumentHighlight(
            new Range(line, match["index"], line, match["index"] + symbolLen)
          )
        );
        match = re.exec(lineTxt);
      }
      line++;
    }
    return docHighlight;
  }
}
