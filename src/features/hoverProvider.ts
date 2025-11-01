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

    // Try to get the indicator under cursor (works for single-line terms)
    let pi = Utils.getIndicatorUnderCursor(doc, position);

    // If that fails, try to read the term starting at the position (handles multi-line directives)
    if (!pi) {
      pi = Utils.getIndicatorFromTermAtPosition(doc, position);
    }

    // If we still don't have an indicator, return null
    if (!pi) {
      return null;
    }

    let contents: vscode.MarkdownString;
    if (pi.startsWith("object/")) {
      contents = Utils.getSnippetDescription(doc, "object/1");
    } else if (pi.startsWith("category/")) {
      contents = Utils.getSnippetDescription(doc, "category/1");
    } else if (pi.startsWith("protocol/")) {
      contents = Utils.getSnippetDescription(doc, "protocol/1");
    } else {
      contents = Utils.getSnippetDescription(doc, pi);
    }

    contents.supportHtml = true;
    contents.isTrusted = true;
    return contents.value.length < 7 ? null : new Hover(contents, wordRange);

  }
  
}
