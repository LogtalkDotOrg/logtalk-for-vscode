"use strict";

import {
  /* CommentRule, OnEnterRule, */
  Disposable, IndentAction, languages
} from "vscode";

export function loadEditHelpers(subscriptions: Disposable[]) {
  subscriptions.push(
    languages.setLanguageConfiguration("logtalk", {
      wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
      onEnterRules: [
        // Multiline entity opening directives
        {
          beforeText: /:- (object|protocol|category)\(.*,$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          // Rule heads: increase indentation after :-
          beforeText: /.*:-$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          // DCG rule heads: increase indentation after -->
          beforeText: /.*-->$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          // End-of-term: remove indentation after .
          beforeText: /.*\.$\s*/,
          afterText: /^\s*$/,
          action: { indentAction: IndentAction.Outdent, removeText: 1 }
        },
        {
          // Disjunctions and if-then-else: keep indentation after ;
          beforeText: /\s*;\s*.*$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          // if-then-else: keep indentation after -> if at start
          beforeText: /\s*->\s*.*$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          // soft-cut: keep indentation after *-> if at start
          beforeText: /\s*\*->\s*.*$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          // If-then-else: keep indentation after ->
          beforeText: /.*->$/,
          action: { indentAction: IndentAction.None }
        },
        {
          // Soft-cut: keep indentation after *->
          beforeText: /.*\*->$/,
          action: { indentAction: IndentAction.None }
        },
        {
          // Opening brackets: increase indentation
          beforeText: /.*[\[\{\(]\s*$/,
          action: { indentAction: IndentAction.IndentOutdent }
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
