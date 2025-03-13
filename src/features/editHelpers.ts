"use strict";

import {
  /* CommentRule, OnEnterRule, */
  Disposable, IndentAction, languages
} from "vscode";

export function loadEditHelpers(subscriptions: Disposable[]) {
  subscriptions.push(
    languages.setLanguageConfiguration("logtalk", {
      indentationRules: {
        decreaseIndentPattern: /(?:)/,
        increaseIndentPattern: /(?:)/
      },
      wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
      onEnterRules: [
        {
          beforeText: /(^\s*|.*%.+)$/,
          action: { indentAction: IndentAction.None }
        },
        {
          beforeText: /.*:-$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          beforeText: /.*-->$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          beforeText: /.+\.$/,
          action: { indentAction: IndentAction.Outdent }
        },
        {
          beforeText: /.*->$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          beforeText: /:- object\(.+\.|:- protocol\(.+\.|:- category\(.+\.|.+\([^\)]*$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          // e.g. /** | */
          beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
          afterText: /^\s*\*\/$/,
          action: {
            indentAction: IndentAction.IndentOutdent,
            appendText: " * "
          }
        },
        {
          // e.g. /** ...|
          beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
          action: { indentAction: IndentAction.None, appendText: " * " }
        },
        {
          // e.g.  * ...|
          beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
          action: { indentAction: IndentAction.None, appendText: "* " }
        },
        {
          // e.g.  */|
          beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
          action: { indentAction: IndentAction.None, removeText: 1 }
        },
        {
          // e.g.  *-----*/|
          beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
          action: { indentAction: IndentAction.None, removeText: 1 }
        }
      ]
    })
  );
}
