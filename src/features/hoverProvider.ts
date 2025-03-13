"use strict";

import {
  HoverProvider,
  TextDocument,
  Position,
  CancellationToken,
  Hover,
  Range
} from "vscode";
import { Utils } from "../utils/utils";
import * as vscode from "vscode";
export default class LogtalkHoverProvider implements HoverProvider {

  public provideHover(
    doc: TextDocument,
    position: Position,
    token: CancellationToken
  ): Hover {

    let wordRange: Range = doc.getWordRangeAtPosition(position);
    if (!wordRange) {
      return;
    }
    let pi = Utils.getIndicatorUnderCursor(doc, position);
    let contents: vscode.MarkdownString = Utils.getSnippetDescription(doc, pi);
    contents.supportHtml = true;
    contents.isTrusted = true;
    return contents.value.length < 7 ? null : new Hover(contents, wordRange);

  }
  
}
