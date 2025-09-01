"use strict";

import {
  CancellationToken,
  CodeActionContext,
  CodeActionProvider,
  CodeAction,
  CodeActionKind,
  WorkspaceEdit,
  Diagnostic,
  TextDocument,
  Range,
  Position,
  Selection
} from "vscode";

export class LogtalkCodeActionsProvider implements CodeActionProvider {

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
    if (diagnostic.message.includes('Redundant entity qualification in predicate directive argument:')) {
      return true;
    } else if (diagnostic.message.includes('Duplicated clause:')) {
      return true;
    } else if (diagnostic.message.includes('Duplicated directive:')) {
      return true;
    } else if (diagnostic.message.includes('Duplicated grammar rule:')) {
      return true;
    } else if (diagnostic.message.includes('Missing scope directive for predicate:')) {
      return true;
    } else if (diagnostic.message.includes('Missing scope directive for non-terminal:')) {
      return true;
    } else if (diagnostic.message.includes('Missing dynamic/1 directive for predicate:')) {
      return true;
    } else if (diagnostic.message.includes('Missing multifile/1 directive for predicate:')) {
      return true;
    } else if (diagnostic.message.includes('Missing multifile/1 directive for non-terminal:')) {
      return true;
    } else if (diagnostic.message.includes('The encoding/1 directive is ignored')) {
      return true;
    } else if (diagnostic.message.includes('Missing meta_predicate/1 directive for predicate:')) {
      return true;
    } else if (diagnostic.message.includes('Missing meta_non_terminal/1 directive for non-terminal:')) {
      return true;
    }
    return false;
  }

  private createQuickFix(document: TextDocument, diagnostic: Diagnostic): CodeAction | null {
    // Create the edit that will fix the issue
    const edit = new WorkspaceEdit();
    let action: CodeAction;

    if (diagnostic.message.includes('Redundant entity qualification in predicate directive argument:')) {
      // Remove the redundant entity qualification
      action = new CodeAction(
        'Fix redundant entity qualification',
        CodeActionKind.QuickFix
      );
      const entityQualification = diagnostic.message.match(/Redundant entity qualification in predicate directive argument: (.+::).+/);
      const match = document.getText(diagnostic.range).match(entityQualification[1]);
      const deleteRange = new Range(
        diagnostic.range.start.line,
        match.index,
        diagnostic.range.end.line,
        match.index + match[0].length
      );
      edit.delete(document.uri, deleteRange);
    } else if (diagnostic.message.includes('Duplicated clause:')) {
      // Remove the duplicated clause
      action = new CodeAction(
        'Delete duplicated clause',
        CodeActionKind.QuickFix
      );
      edit.delete(document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Duplicated directive:')) {
      // Remove the duplicated directive
      action = new CodeAction(
        'Delete duplicated directive',
        CodeActionKind.QuickFix
      );
      edit.delete(document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Duplicated grammar rule:')) {
      // Remove the duplicated grammar rule
      action = new CodeAction(
        'Delete duplicated grammar rule',
        CodeActionKind.QuickFix
      );
      edit.delete(document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Missing scope directive for predicate:')) {
      // Add missing scope directive
      action = new CodeAction(
        'Add missing public/1 directive',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Missing scope directive for predicate: (.+\/\d+)/);
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- public(' + predicateIndicator[1] + ').\n');
    } else if (diagnostic.message.includes('Missing scope directive for non-terminal:')) {
      // Add missing scope directive
      action = new CodeAction(
        'Add missing public/1 directive',
        CodeActionKind.QuickFix
      );
      const nonTerminalIndicator = diagnostic.message.match(/Missing scope directive for non-terminal: (.+\/\/\d+)/);
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- public(' + nonTerminalIndicator[1] + ').\n');
    } else if (diagnostic.message.includes('Missing dynamic/1 directive for predicate:')) {
      // Add missing scope directive
      action = new CodeAction(
        'Add missing dynamic/1 directive',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Missing dynamic\/1 directive for predicate: (.+\/\d+)/);
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- dynamic(' + predicateIndicator[1] + ').\n');
    } else if (diagnostic.message.includes('Missing multifile/1 directive for predicate:')) {
      // Add missing scope directive
      action = new CodeAction(
        'Add missing multifile/1 directive',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Missing multifile\/1 directive for predicate: (.+\/\d+)/);
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- multifile(' + predicateIndicator[1] + ').\n');
    } else if (diagnostic.message.includes('Missing multifile/1 directive for non-terminal:')) {
      // Add missing scope directive
      action = new CodeAction(
        'Add missing multifile/1 directive',
        CodeActionKind.QuickFix
      );
      const nonTerminalIndicator = diagnostic.message.match(/Missing multifile\/1 directive for non-terminal: (.+\/\/\d+)/);
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- multifile(' + nonTerminalIndicator[1] + ').\n');
    } else if (diagnostic.message.includes('The encoding/1 directive is ignored')) {
      // Move encoding/1 directive to the first line
      action = new CodeAction(
        'Move encoding/1 directive to the first line',
        CodeActionKind.QuickFix
      );
      const text = document.getText(diagnostic.range).trim();
      edit.delete(document.uri, diagnostic.range);
      edit.insert(document.uri, new Position(0, 0), text + '\n');
    } else if (diagnostic.message.includes('Missing meta_predicate/1 directive for predicate:')) {
      // Add missing meta_predicate/1 directive
      action = new CodeAction(
        'Add missing meta_predicate/1 directive',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Missing meta_predicate\/1 directive for predicate: (.+)\/(\d+)/);
      const stars = Array(predicateIndicator[2]).fill('*').join(',');
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- meta_predicate(' + predicateIndicator[1] + '(' + stars+ ')).\n');
    } else if (diagnostic.message.includes('Missing meta_non_terminal/1 directive for non-terminal:')) {
      // Add missing meta_non_terminal/1 directive
      action = new CodeAction(
        'Add missing meta_non_terminal/1 directive',
        CodeActionKind.QuickFix
      );
      const nonTerminalIndicator = diagnostic.message.match(/Missing meta_non_terminal\/1 directive for non-terminal: (.+)\/\/(\d+)/);
      const stars = Array(nonTerminalIndicator[2]).fill('*').join(',');
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- meta_non_terminal(' + nonTerminalIndicator[1] + '(' + stars + ')).\n');
    }

    action.edit = edit;
    // Associate this action with the specific diagnostic
    action.diagnostics = [diagnostic];

    return action;
  }
}
