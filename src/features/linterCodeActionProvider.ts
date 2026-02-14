"use strict";

import {
  CancellationToken,
  CodeActionContext,
  CodeActionProvider,
  CodeAction,
  CodeActionKind,
  WorkspaceEdit,
  Diagnostic,
  DiagnosticCollection,
  DiagnosticSeverity,
  Disposable,
  ExtensionContext,
  Position,
  Range,
  TextDocument,
  Uri,
  languages,
  workspace
} from "vscode";
import * as fs from "fs";
import { DiagnosticsUtils } from "../utils/diagnostics";
import { PredicateUtils } from "../utils/predicateUtils";
import { ArgumentUtils } from "../utils/argumentUtils";
import { Utils } from "../utils/utils";

export default class LogtalkLinter implements CodeActionProvider {

  public  diagnosticCollection: DiagnosticCollection;
  public  diagnostics: { [docName: string]: Diagnostic[] } = {};
  public  diagnosticHash = [];
  private sortedDiagIndex: { [docName: string]: number[] } = {};
  private compilingFileRegex = /%\s\[\scompiling\s(.+)\s\.\.\.\s\]/;
  private msgRegex = /(((\*|\!)\s{5}.+\n[\*|\!]\s{7}.+\n)|((\*|\!)\s{5}.+\n))[\*|\!]\s{7}.+\n[\*|\!]\s{7}in file\s(.+)\s((at or above line\s(\d+))|(between lines\s(\d+)[-](\d+))|(at line\s(\d+)))([\s\S]*?(?=(\*|\!)\s{5}$))/m;
  private documentListener: Disposable;
  private openDocumentListener: Disposable;

  constructor(private context: ExtensionContext) {
    this.loadConfiguration();
  }

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
    // Errors
    if (diagnostic.message.includes('Permission error: modify meta_non_terminal_template ')) {
      return true;
    } else if (diagnostic.message.includes('Permission error: modify meta_predicate_template ')) {
      return true;
    } else if (diagnostic.message.includes('Permission error: modify predicate_scope ')) {
      return true;
    } else if (diagnostic.message.includes('Permission error: modify predicate_declaration ')) {
      return true;
    } else if (diagnostic.message.includes('Permission error: define dynamic_predicate ')) {
      return true;
    // Warnings
    } else if (diagnostic.message.includes('Entity parameter name not in parameter variable syntax:')) {
      return true;
    } else if (diagnostic.message.includes('Singleton variable:')) {
      return true;
    } else if (diagnostic.message.includes('Singleton variables:')) {
      return true;
    } else if (diagnostic.message.includes('Redundant entity qualification in predicate directive argument:')) {
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
    } else if (diagnostic.message.includes('Deprecated version format:')) {
      return true;
    } else if (diagnostic.message.includes('Deprecated date format:')) {
      return true;
    } else if (diagnostic.message.includes('Deprecated predicate:') && diagnostic.message.includes('compiled as a call to')) {
      return true;
    } else if (diagnostic.message.includes('Deprecated function:') && diagnostic.message.includes('replaceable by')) {
      return true;
    } else if (diagnostic.message.includes('as the goal compares numbers using unification')) {
      return true;
    } else if (diagnostic.message.includes('Non-terminal called as a predicate:')) {
      return true;
    } else if (diagnostic.message.includes('Predicate called as a non-terminal:')) {
      return true;
    } else if (diagnostic.message.includes('Missing reference to the built-in protocol: ')) {
      return true;
    } else if (diagnostic.message.includes('Suspicious call: \\+') && diagnostic.message.includes('instead of \\+')) {
      return true;
    } else if (diagnostic.message.includes('Suspicious call: repeat loop without a cut in clause for predicate ')) {
      return true;
    }
    return false;
  }

  private createQuickFix(document: TextDocument, diagnostic: Diagnostic): CodeAction | null {
    // Create the edit that will fix the issue
    const edit = new WorkspaceEdit();
    let action: CodeAction;

    // Errors
    if (diagnostic.message.includes('Permission error: modify meta_non_terminal_template ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove meta_non_terminal/1 directive',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Permission error: modify meta_predicate_template ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove meta_predicate/1 directive',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Permission error: modify predicate_scope ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove predicate scope directive',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Permission error: modify predicate_declaration ')) {
      // Remove the directive
      action = new CodeAction(
        'Remove predicate declaration directive',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Permission error: define dynamic_predicate ')) {
      // Delete the dynamic/1 directive for the predicate
      // Message format: "Permission error: define dynamic_predicate <indicator>"
      const indicatorMatch = diagnostic.message.match(/Permission error: define dynamic_predicate (.+\/\d+)/);
      if (!indicatorMatch) {
        return null;
      }

      const predicateIndicator = indicatorMatch[1];

      action = new CodeAction(
        `Remove dynamic/1 directive for ${predicateIndicator}`,
        CodeActionKind.QuickFix
      );

      // Search backwards from the diagnostic line to find the dynamic/1 directive
      // Stop when reaching a category opening directive
      // Only delete if the directive contains exactly this single predicate indicator
      const diagnosticLine = diagnostic.range.start.line;
      let dynamicDirectiveLine: number | null = null;

      for (let lineNum = diagnosticLine - 1; lineNum >= 0; lineNum--) {
        const lineText = document.lineAt(lineNum).text.trim();

        // Stop if we hit a category opening directive
        if (lineText.match(/^:-\s*category\(/)) {
          break;
        }

        // Check if this is a dynamic/1 directive containing our predicate indicator
        if (lineText.match(/^:-\s*dynamic\(/)) {
          // Get the full directive range (handles multi-line directives)
          const directiveRange = PredicateUtils.getDirectiveRange(document, lineNum);

          // Get the complete directive text
          let directiveText = '';
          for (let i = directiveRange.start; i <= directiveRange.end; i++) {
            directiveText += document.lineAt(i).text + '\n';
          }

          // Normalize the directive text (remove whitespace and newlines)
          const normalizedDirective = directiveText.replace(/\s+/g, ' ').trim();

          // Check if this directive contains EXACTLY the single predicate indicator
          // Pattern: ":- dynamic(Name/Arity)."
          const exactPattern = new RegExp(`^:-\\s*dynamic\\(\\s*${predicateIndicator.replace(/\//g, '\\/')}\\s*\\)\\.`);

          if (exactPattern.test(normalizedDirective)) {
            dynamicDirectiveLine = lineNum;
            break;
          }
        }
      }

      if (dynamicDirectiveLine === null) {
        return null;
      }

      // Get the full range of the dynamic/1 directive
      const directiveRange = PredicateUtils.getDirectiveRange(document, dynamicDirectiveLine);
      const directiveStartPos = new Position(directiveRange.start, 0);
      const directiveEndPos = new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length);
      const directiveFullRange = new Range(directiveStartPos, directiveEndPos);

      // Delete the entire directive using smart delete
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, directiveFullRange);
    // Warnings
    } else if (diagnostic.message.includes('Entity parameter name not in parameter variable syntax:')) {
      // Rename the parameter to use parameter variable syntax
      action = new CodeAction(
        'Rename parameter to use parameter variable syntax',
        CodeActionKind.QuickFix
      );
      const message = diagnostic.message.match(/Entity parameter name not in parameter variable syntax: (.+)/);
      const parameterName = message[1];
      let newParameterName: string;
      if (parameterName.startsWith('_')) {
        newParameterName = parameterName + '_';
      } else if (parameterName.endsWith('_')) {
        newParameterName = '_' + parameterName;
      } else {
        newParameterName = '_' + parameterName + '_';
      }
      // Find the exact range of the parameter name within the diagnostic range
      const parameterRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, parameterName);
      if (parameterRange) {
        edit.replace(document.uri, parameterRange, newParameterName);
      } else {
        return null;
      }
    } else if (diagnostic.message.includes('Singleton variable:')) {
      // Rename the singleton variable to named anonymous variable
      action = new CodeAction(
        'Rename singleton variable to named anonymous variable',
        CodeActionKind.QuickFix
      );
      const message = diagnostic.message.match(/Singleton variable: (.+)/);
      const singletonVariable = message[1];
      const namedSingleton = '_' + singletonVariable;
      // Find the exact range of the singleton variable within the diagnostic range
      const singletonRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, singletonVariable);
      if (singletonRange) {
        edit.replace(document.uri, singletonRange, namedSingleton);
      } else {
        return null;
      }
    } else if (diagnostic.message.includes('Singleton variables:')) {
      // Rename the singleton variables to named anonymous variables
      action = new CodeAction(
        'Rename singleton variables to named anonymous variables',
        CodeActionKind.QuickFix
      );
      const message = diagnostic.message.match(/Singleton variables: (.+)/);
      // Remove brackets and spaces, then split on comma - handles all formats: [A,B], [A, B], A,B, A, B
      const variablesString = message[1].replace(/[\[\]\s]/g, ''); // Remove [, ], and spaces
      const singletonVariables = variablesString.split(',');
      // Compute replacements
      let hasAnyReplacement = false;
      for (const singletonVariable of singletonVariables) {
        const namedSingleton = '_' + singletonVariable;
        // Find the exact range of the singleton variable within the diagnostic range
        const singletonRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, singletonVariable);
        if (singletonRange) {
          edit.replace(document.uri, singletonRange, namedSingleton);
          hasAnyReplacement = true;
        }
        // Continue with other variables even if this one can't be renamed
      }
      // Only return null if no variables could be renamed at all
      if (!hasAnyReplacement) {
        return null;
      }
    } else if (diagnostic.message.includes('Redundant entity qualification in predicate directive argument:')) {
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
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Duplicated directive:')) {
      // Remove the duplicated directive
      action = new CodeAction(
        'Delete duplicated directive',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
    } else if (diagnostic.message.includes('Duplicated grammar rule:')) {
      // Remove the duplicated grammar rule
      action = new CodeAction(
        'Delete duplicated grammar rule',
        CodeActionKind.QuickFix
      );
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
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
      DiagnosticsUtils.addSmartDeleteOperation(edit, document, document.uri, diagnostic.range);
      edit.insert(document.uri, new Position(0, 0), text + '\n');
    } else if (diagnostic.message.includes('Missing meta_predicate/1 directive for predicate:')) {
      // Add missing meta_predicate/1 directive
      action = new CodeAction(
        'Add missing meta_predicate/1 directive (edit as needed)',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Missing meta_predicate\/1 directive for predicate: (.+)\/(\d+)/);
      const stars = Array(parseInt(predicateIndicator[2])).fill('*').join(',');
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- meta_predicate(' + predicateIndicator[1] + '(' + stars + ')).\n');
    } else if (diagnostic.message.includes('Missing meta_non_terminal/1 directive for non-terminal:')) {
      // Add missing meta_non_terminal/1 directive
      action = new CodeAction(
        'Add missing meta_non_terminal/1 directive (edit as needed)',
        CodeActionKind.QuickFix
      );
      const nonTerminalIndicator = diagnostic.message.match(/Missing meta_non_terminal\/1 directive for non-terminal: (.+)\/\/(\d+)/);
      const stars = Array(parseInt(nonTerminalIndicator[2])).fill('*').join(',');
      const indent = document.getText(diagnostic.range).match(/(\s*)/);
      edit.insert(document.uri, diagnostic.range.start, indent[1] + ':- meta_non_terminal(' + nonTerminalIndicator[1] + '(' + stars + ')).\n');
    } else if (diagnostic.message.includes('Deprecated version format:')) {
      // Replace deprecated version format with Major:Minor:Patch format
      action = new CodeAction(
        'Replace deprecated version format with Major:Minor:Patch format',
        CodeActionKind.QuickFix
      );
      const deprecatedMessage = diagnostic.message.match(/Deprecated version format: (.+) \(use instead a Major:Minor:Patch compound term\)/);
      if (deprecatedMessage) {
        const deprecatedVersion = deprecatedMessage[1];

        // Compute newVersion as "Major:Minor:0"
        // If deprecatedVersion is an integer, Major = integer, Minor = 0
        // If deprecatedVersion is a float, Major = integer part, Minor = decimal part
        let major: number;
        let minor: number;

        const versionNumber = parseFloat(deprecatedVersion);
        if (Number.isInteger(versionNumber)) {
          // Integer version (e.g., "1" -> "1:0:0")
          major = versionNumber;
          minor = 0;
        } else {
          // Float version (e.g., "1.5" -> "1:5:0")
          major = Math.floor(versionNumber);
          // Extract decimal part: "1.5" -> 5, "1.23" -> 23
          const decimalPart = deprecatedVersion.split('.')[1];
          minor = parseInt(decimalPart, 10);
        }

        const newVersion = `${major}:${minor}:0`;

        // Find the exact range of the deprecated version within the diagnostic range
        const deprecatedVersionRange = DiagnosticsUtils.findTextInRange(document, diagnostic.range, deprecatedVersion);
        if (deprecatedVersionRange) {
          // Replace only the deprecated version part with the new version
          edit.replace(document.uri, deprecatedVersionRange, newVersion);
        } else {
          return null;
        }
      }
    } else if (diagnostic.message.includes('Deprecated date format:')) {
      // Replace deprecated date format with ISO 8601 format
      action = new CodeAction(
        'Replace deprecated date format with ISO 8601 format',
        CodeActionKind.QuickFix
      );
      const deprecatedMessage = diagnostic.message.match(/Deprecated date format: (.+) \(use instead ISO 8601 format (.+)\)/);
      if (deprecatedMessage) {
        const deprecatedDate = deprecatedMessage[1];
        const isoDate = deprecatedMessage[2];

        // Find the exact range of the deprecated date within the diagnostic range
        const deprecatedDateRange = DiagnosticsUtils.findTextInRange(document, diagnostic.range, deprecatedDate);

        if (deprecatedDateRange) {
          // Replace only the deprecated date part with the ISO date
          edit.replace(document.uri, deprecatedDateRange, isoDate);
        } else {
          return null;
        }
      }
    } else if (diagnostic.message.includes('Deprecated predicate:') && diagnostic.message.includes('compiled as a call to')) {
      // Replace deprecated predicate with the replacement predicate
      // Message format: "Deprecated predicate: <name>/<arity> (compiled as a call to <replacement>/<arity>)"
      const deprecatedMatch = diagnostic.message.match(/Deprecated predicate: ([^/]+)\/(\d+) \(compiled as a call to ([^/]+)\/\d+\)/);
      if (!deprecatedMatch) {
        return null;
      }

      const deprecatedName = deprecatedMatch[1];
      const arity = parseInt(deprecatedMatch[2], 10);
      let replacementName = deprecatedMatch[3];

      // Remove parentheses from replacement name if present (e.g., "(\+)" -> "\+")
      // This indicates it's an operator
      const isOperator = replacementName.startsWith('(') && replacementName.endsWith(')');
      if (isOperator) {
        replacementName = replacementName.slice(1, -1);
      }

      action = new CodeAction(
        `Replace deprecated ${deprecatedName}/${arity} predicate with ${isOperator ? "(" + replacementName + ")" : replacementName}/${arity}`,
        CodeActionKind.QuickFix
      );

      if (isOperator) {
        // For operators like (\+), we need to replace "name(" with "\+ " and remove the closing parenthesis
        const parenthesesMatch = DiagnosticsUtils.findMatchingParentheses(document, diagnostic.range, `${deprecatedName}(`);
        if (parenthesesMatch) {
          // Replace 'deprecated(' with 'replacement ' and remove the closing parenthesis
          edit.replace(document.uri, parenthesesMatch.openRange, `${replacementName} `);
          edit.delete(document.uri, parenthesesMatch.closeRange);
        } else {
          // Fallback: just replace the opening part
          const callRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, `${deprecatedName}(`);
          if (callRange) {
            edit.replace(document.uri, callRange, `${replacementName} (`);
          } else {
            return null;
          }
        }
      } else {
        // For regular predicates, just replace "deprecated(" with "replacement("
        const callRange = DiagnosticsUtils.findTextInRange(document, diagnostic.range, `${deprecatedName}(`);
        if (callRange) {
          edit.replace(document.uri, callRange, `${replacementName}(`);
        } else {
          return null;
        }
      }
    } else if (diagnostic.message.includes('Deprecated function:') && diagnostic.message.includes('replaceable by')) {
      // Replace deprecated function with the replacement function
      // Message format: "Deprecated function: <name>/<arity> (replaceable by the standard <replacement>/<arity> function)"
      const deprecatedMatch = diagnostic.message.match(/Deprecated function: ([^/]+)\/(\d+) \(replaceable by the (?:standard )?([^/]+)\/\d+ function\)/);
      if (!deprecatedMatch) {
        return null;
      }

      const deprecatedName = deprecatedMatch[1];
      const arity = parseInt(deprecatedMatch[2], 10);
      const replacementName = deprecatedMatch[3];

      action = new CodeAction(
        `Replace deprecated ${deprecatedName}/${arity} function with ${replacementName}/${arity}`,
        CodeActionKind.QuickFix
      );

      // For functions, just replace "deprecated(" with "replacement("
      const callRange = DiagnosticsUtils.findTextInRange(document, diagnostic.range, `${deprecatedName}(`);
      if (callRange) {
        edit.replace(document.uri, callRange, `${replacementName}(`);
      } else {
        return null;
      }
    } else if (diagnostic.message.includes('Suspicious call: \\+') && diagnostic.message.includes('instead of \\+')) {
      // Replace \+call(Goal) or \+once(Goal) with \+Goal
      // Message format: "Suspicious call: \+ call(Goal) instead of \+ Goal" or "Suspicious call: \+ once(Goal) instead of \+ Goal"
      // Note: There may or may not be a space after \+

      action = new CodeAction(
        'Simplify (\\+)/1 goal',
        CodeActionKind.QuickFix
      );

      // Try to find and match parentheses for call( or once(
      let parenthesesMatch = DiagnosticsUtils.findMatchingParentheses(document, diagnostic.range, 'call(');
      if (!parenthesesMatch) {
        parenthesesMatch = DiagnosticsUtils.findMatchingParentheses(document, diagnostic.range, 'once(');
      }

      if (parenthesesMatch) {
        // Remove 'call(' or 'once(' and the closing parenthesis
        // This leaves just the Goal argument
        edit.delete(document.uri, parenthesesMatch.openRange);
        edit.delete(document.uri, parenthesesMatch.closeRange);
      } else {
        return null;
      }
    } else if (diagnostic.message.includes('Suspicious call: repeat loop without a cut in clause for predicate ')) {
      // Add a cut before the clause ending period
      // Message format: "Suspicious call: repeat loop without a cut in clause for predicate <indicator>"
      const indicatorMatch = diagnostic.message.match(/Suspicious call: repeat loop without a cut in clause for predicate (.+\/\d+)/);
      if (!indicatorMatch) {
        return null;
      }

      const predicateIndicator = indicatorMatch[1];

      action = new CodeAction(
        `Add cut to repeat loop in ${predicateIndicator} clause`,
        CodeActionKind.QuickFix
      );

      // Get the clause range using the warning line
      const warningLine = diagnostic.range.start.line;
      const clauseRange = PredicateUtils.getClauseRange(document, warningLine);

      // Get the last line of the clause
      const lastLine = clauseRange.end;
      const lastLineText = document.lineAt(lastLine).text;

      // Find the position of the period on the last line
      const periodIndex = lastLineText.lastIndexOf('.');
      if (periodIndex === -1) {
        return null;
      }

      // Get the indentation of the last line
      const indentMatch = lastLineText.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';

      // Insert ",\n<indent>!" before the period
      const insertPosition = new Position(lastLine, periodIndex);
      edit.insert(document.uri, insertPosition, `,\n${indent}!`);
    } else if (diagnostic.message.includes('as the goal compares numbers using unification')) {
      // Replace unification with number equality operator
      action = new CodeAction(
        'Replace unification with number equality operator',
        CodeActionKind.QuickFix
      );
      const comparison = diagnostic.message.match(/Suspicious call: (.+)\s*=\s*(.+) as the goal compares numbers using unification/);
      if (comparison) {
        const leftOperand = comparison[1].trim();
        const rightOperand = comparison[2].trim();
        // Find the exact range of the comparison within the diagnostic range
        let comparisonRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, ' = ');
        if (comparisonRange) {
          edit.replace(document.uri, comparisonRange, ' =:= ');
        } else {
          comparisonRange = DiagnosticsUtils.findSingleTextInRange(document, diagnostic.range, '=');
          if (comparisonRange) {
            edit.replace(document.uri, comparisonRange, '=:=');
          } else {
            return null;
          }
          return null;
        }
      }
    } else if (diagnostic.message.includes('Non-terminal called as a predicate:')) {
      // Replace predicate call with a phrase/3 call to the non-terminal
      action = new CodeAction(
        'Replace predicate call with a phrase/3 call to the non-terminal',
        CodeActionKind.QuickFix
      );
      const nonTerminalIndicator = diagnostic.message.match(/Non-terminal called as a predicate: (.+)\/\/(\d+)/);
      const predicateArity = parseInt(nonTerminalIndicator[2], 10) + 2;
      const predicateIndicator = nonTerminalIndicator[1] + '/' + predicateArity.toString();
      const callRange = PredicateUtils.findPredicateCallRange(document, diagnostic.range.start, predicateIndicator);
      if (callRange) {
        // Get the original predicate call text
        const originalCall = document.getText(callRange);
        // Split the call to get the non-terminal part and the last two arguments
        const { mainCall, removedArgs } = ArgumentUtils.splitCallArguments(originalCall, -2);
        // The main call becomes the non-terminal call
        const nonTerminalCall = mainCall;
        // The removed arguments are the input and output arguments
        const inputArg = removedArgs.length > 0 ? removedArgs[0] : 'Input';
        const outputArg = removedArgs.length > 1 ? removedArgs[1] : 'Output';
        edit.replace(document.uri, callRange, 'phrase(' + nonTerminalCall + ', ' + inputArg + ', ' + outputArg + ')');
      } else {
        return null;
      }
    } else if (diagnostic.message.includes('Predicate called as a non-terminal:')) {
      // Use call//1 to call the predicate
      action = new CodeAction(
        'Use call//1 to call the predicate',
        CodeActionKind.QuickFix
      );
      const predicateIndicator = diagnostic.message.match(/Predicate called as a non-terminal: (.+)\/(\d+)/);
      const nonTerminalArity = parseInt(predicateIndicator[2], 10) - 2;
      const callRange = PredicateUtils.findPredicateCallRange(document, diagnostic.range.start, predicateIndicator[1] + '/' + nonTerminalArity);
      if (callRange) {
        const call = document.getText(callRange);
        edit.replace(document.uri, callRange, 'call(' + call + ')');
      } else {
        return null;
      }
    } else if (diagnostic.message.includes('Missing reference to the built-in protocol: ')) {
      // Add implements(Protocol) to entity opening directive
      const protocolMatch = diagnostic.message.match(/Missing reference to the built-in protocol: (.+)/);
      if (!protocolMatch) {
        return null;
      }
      const protocolName = protocolMatch[1];
      action = new CodeAction(
        `Add implements(${protocolName}) to entity opening directive`,
        CodeActionKind.QuickFix
      );

      // Find the entity opening directive from the warning location
      const entityLine = Utils.findEntityOpeningDirective(document, diagnostic.range.start.line);
      if (entityLine === null) {
        return null;
      }

      // Add implements(Protocol) to the entity opening directive
      const success = this.addImplementsToEntityDirective(document, entityLine, protocolName, edit);
      if (!success) {
        return null;
      }
    }

    action.edit = edit;
    // Associate this action with the specific diagnostic
    action.diagnostics = [diagnostic];
    action.command = {
      title: 'Logtalk Linter',
      command: 'logtalk.update.diagnostics',
      arguments: [document.uri, diagnostic]
    };

    return action;
  }

  /**
   * Add implements(Protocol) to an entity opening directive
   * @param document The text document
   * @param entityLine The line number of the entity opening directive
   * @param protocolName The name of the protocol to implement
   * @param edit The workspace edit to add changes to
   * @returns true if successful, false otherwise
   */
  private addImplementsToEntityDirective(
    document: TextDocument,
    entityLine: number,
    protocolName: string,
    edit: WorkspaceEdit
  ): boolean {
    // Get the full range of the entity opening directive
    const directiveRange = PredicateUtils.getDirectiveRange(document, entityLine);

    // Get the full directive text
    const directiveText = document.getText(new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    ));

    // Parse the directive to extract arguments
    const lines = directiveText.split('\n');

    if (lines.length === 1) {
      // Single-line directive
      return this.addImplementsToSingleLineDirective(document, directiveRange, directiveText, protocolName, edit);
    } else {
      // Multi-line directive
      return this.addImplementsToMultiLineDirective(document, directiveRange, lines, protocolName, edit);
    }
  }

  /**
   * Add implements(Protocol) to a single-line entity opening directive
   */
  private addImplementsToSingleLineDirective(
    document: TextDocument,
    directiveRange: { start: number; end: number },
    directiveText: string,
    protocolName: string,
    edit: WorkspaceEdit
  ): boolean {
    // Find the opening parenthesis of the directive
    const openParenPos = directiveText.indexOf('(');
    if (openParenPos < 0) {
      return false;
    }

    // Find the matching closing parenthesis
    const closeParenPos = ArgumentUtils.findMatchingCloseParen(directiveText, openParenPos);
    if (closeParenPos < 0) {
      return false;
    }

    // Extract the content between parentheses
    const directiveContent = directiveText.substring(openParenPos + 1, closeParenPos);
    const args = ArgumentUtils.parseArguments(directiveContent);

    if (args.length === 0) {
      return false;
    }

    const entityIdentifier = args[0]; // First argument is the entity identifier

    if (args.length === 1) {
      // Only one argument (entity name) - add implements as second argument
      const beforeEntity = directiveText.substring(0, openParenPos + 1);
      const afterEntity = directiveText.substring(closeParenPos);
      const newDirective = `${beforeEntity}${entityIdentifier},\n\timplements(${protocolName})${afterEntity}`;

      const fullRange = new Range(
        new Position(directiveRange.start, 0),
        new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
      );
      edit.replace(document.uri, fullRange, newDirective);
    } else {
      // Multiple arguments - check if implements/1 already exists
      const hasImplements = args.slice(1).some(arg => arg.trim().startsWith('implements('));

      if (hasImplements) {
        // Find the implements argument and add protocol to it
        return this.addProtocolToExistingImplements(document, directiveRange, directiveText, args, protocolName, edit);
      } else {
        // Insert implements between first and second argument
        return this.insertImplementsBetweenArguments(document, directiveRange, directiveText, args, protocolName, edit);
      }
    }

    return true;
  }

  /**
   * Add implements(Protocol) to a multi-line entity opening directive
   */
  private addImplementsToMultiLineDirective(
    document: TextDocument,
    directiveRange: { start: number; end: number },
    lines: string[],
    protocolName: string,
    edit: WorkspaceEdit
  ): boolean {
    // Parse all arguments from the multi-line directive
    const fullText = lines.join('\n');
    const openParenPos = fullText.indexOf('(');
    if (openParenPos < 0) {
      return false;
    }

    const closeParenPos = ArgumentUtils.findMatchingCloseParen(fullText, openParenPos);
    if (closeParenPos < 0) {
      return false;
    }

    const directiveContent = fullText.substring(openParenPos + 1, closeParenPos);
    const args = ArgumentUtils.parseArguments(directiveContent);

    if (args.length === 0) {
      return false;
    }

    if (args.length === 1) {
      // Only entity name - add implements after the first line
      const firstLine = lines[0];
      const firstLineRange = new Range(
        new Position(directiveRange.start, 0),
        new Position(directiveRange.start, document.lineAt(directiveRange.start).text.length)
      );

      // Add comma to first line if needed
      if (!firstLine.trim().endsWith(',')) {
        const modifiedFirstLine = firstLine.replace(/\s*$/, ',');
        edit.replace(document.uri, firstLineRange, modifiedFirstLine);
      }

      // Insert implements line
      const insertPosition = new Position(directiveRange.start + 1, 0);
      edit.insert(document.uri, insertPosition, `\timplements(${protocolName})\n`);
    } else {
      // Multiple arguments - check if implements/1 already exists
      const hasImplements = args.slice(1).some(arg => arg.trim().startsWith('implements('));

      if (hasImplements) {
        // Find and modify the implements argument
        return this.addProtocolToExistingImplementsMultiLine(document, directiveRange, lines, protocolName, edit);
      } else {
        // Insert implements after the first line
        const firstLine = lines[0];
        const firstLineRange = new Range(
          new Position(directiveRange.start, 0),
          new Position(directiveRange.start, document.lineAt(directiveRange.start).text.length)
        );

        // Add comma to first line if needed
        if (!firstLine.trim().endsWith(',')) {
          const modifiedFirstLine = firstLine.replace(/\s*$/, ',');
          edit.replace(document.uri, firstLineRange, modifiedFirstLine);
        }

        // Insert implements line after first line
        const insertPosition = new Position(directiveRange.start + 1, 0);
        edit.insert(document.uri, insertPosition, `\timplements(${protocolName}),\n`);
      }
    }

    return true;
  }

  /**
   * Add protocol to an existing implements/1 argument in a single-line directive
   */
  private addProtocolToExistingImplements(
    document: TextDocument,
    directiveRange: { start: number; end: number },
    directiveText: string,
    args: string[],
    protocolName: string,
    edit: WorkspaceEdit
  ): boolean {
    // Find which argument contains implements(...)
    let implementsArgIndex = -1;
    for (let i = 1; i < args.length; i++) {
      if (args[i].trim().startsWith('implements(')) {
        implementsArgIndex = i;
        break;
      }
    }

    if (implementsArgIndex === -1) {
      return false;
    }

    const implementsArg = args[implementsArgIndex].trim();

    // Extract the content inside implements(...)
    const openParen = implementsArg.indexOf('(');
    const closeParen = ArgumentUtils.findMatchingCloseParen(implementsArg, openParen);

    if (openParen < 0 || closeParen < 0) {
      return false;
    }

    const implementsContent = implementsArg.substring(openParen + 1, closeParen);

    // Create new implements argument with protocol added as a conjunction
    const newImplementsArg = `implements((${implementsContent}, ${protocolName}))`;

    // Find the position of the implements argument in the directive text
    const implementsPos = directiveText.indexOf(implementsArg);
    if (implementsPos < 0) {
      return false;
    }

    // Calculate the absolute position in the document
    const beforeImplements = directiveText.substring(0, implementsPos);
    const afterImplements = directiveText.substring(implementsPos + implementsArg.length);
    const newDirective = beforeImplements + newImplementsArg + afterImplements;

    const fullRange = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );
    edit.replace(document.uri, fullRange, newDirective);

    return true;
  }

  /**
   * Insert implements(Protocol) between first and second argument in a single-line directive
   */
  private insertImplementsBetweenArguments(
    document: TextDocument,
    directiveRange: { start: number; end: number },
    directiveText: string,
    args: string[],
    protocolName: string,
    edit: WorkspaceEdit
  ): boolean {
    // Find the position after the first argument
    const openParenPos = directiveText.indexOf('(');
    if (openParenPos < 0) {
      return false;
    }

    const firstArg = args[0];
    const firstArgPos = directiveText.indexOf(firstArg, openParenPos);
    if (firstArgPos < 0) {
      return false;
    }

    const afterFirstArg = firstArgPos + firstArg.length;

    // Find the comma after the first argument
    let commaPos = afterFirstArg;
    while (commaPos < directiveText.length && directiveText[commaPos] !== ',') {
      commaPos++;
    }

    if (commaPos >= directiveText.length) {
      return false;
    }

    // Insert implements after the comma
    const beforeInsert = directiveText.substring(0, commaPos + 1);
    const afterInsert = directiveText.substring(commaPos + 1);
    const newDirective = `${beforeInsert}\n\timplements(${protocolName}),${afterInsert}`;

    const fullRange = new Range(
      new Position(directiveRange.start, 0),
      new Position(directiveRange.end, document.lineAt(directiveRange.end).text.length)
    );
    edit.replace(document.uri, fullRange, newDirective);

    return true;
  }

  /**
   * Add protocol to an existing implements/1 argument in a multi-line directive
   */
  private addProtocolToExistingImplementsMultiLine(
    document: TextDocument,
    directiveRange: { start: number; end: number },
    lines: string[],
    protocolName: string,
    edit: WorkspaceEdit
  ): boolean {
    // Find the line containing implements(...)
    let implementsLineIndex = -1;
    let implementsLine = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('implements(')) {
        implementsLineIndex = i;
        implementsLine = lines[i];
        break;
      }
    }

    if (implementsLineIndex === -1) {
      return false;
    }

    const trimmedLine = implementsLine.trim();

    // Extract the content inside implements(...)
    const openParen = trimmedLine.indexOf('(');
    const closeParen = ArgumentUtils.findMatchingCloseParen(trimmedLine, openParen);

    if (openParen < 0 || closeParen < 0) {
      return false;
    }

    const implementsContent = trimmedLine.substring(openParen + 1, closeParen);

    // Get the indentation from the original line
    const indent = implementsLine.match(/^(\s*)/)[1];

    // Create new implements line with protocol added as a conjunction
    const afterCloseParen = trimmedLine.substring(closeParen + 1);
    const newImplementsLine = `${indent}implements((${implementsContent}, ${protocolName}))${afterCloseParen}`;

    // Replace the implements line
    const lineRange = new Range(
      new Position(directiveRange.start + implementsLineIndex, 0),
      new Position(directiveRange.start + implementsLineIndex, document.lineAt(directiveRange.start + implementsLineIndex).text.length)
    );
    edit.replace(document.uri, lineRange, newImplementsLine);

    return true;
  }

  private parseIssue(issue: string) {
    if(this.diagnosticHash.includes(issue)) {
      return;  // Skip duplicate issues
    }

    let match = issue.match(this.msgRegex);
    if (match == null) { return; }

    // Add to hash to prevent duplicates
    this.diagnosticHash.push(issue);

    let severity: DiagnosticSeverity;
    if(match[0][0] == '*') {
      severity = DiagnosticSeverity.Warning
    } else {
      severity = DiagnosticSeverity.Error
    }

    // Handle paths starting with double slash followed by drive letter (e.g., //C/path -> C:/path)
    let filePath = Utils.normalizeDoubleSlashPath(match[6]);

    let fileName = fs.realpathSync.native(filePath);
    let lineFrom = 0,
        lineTo   = 0;

    // Position line and column numbers are zero-based
    if(match[9]) {
      lineFrom = parseInt(match[9])-1;
      lineTo   = parseInt(match[9])-1;
    } else if(match[14]) {
      lineFrom = parseInt(match[14])-1;
      lineTo   = parseInt(match[14])-1;
    } else {
      lineFrom = parseInt(match[11])-1;
      lineTo   = parseInt(match[12])-1;
    }

    // Default horizontal range
    let fromCol = 0;
    let toCol = 240;
    let fromPos = new Position(lineFrom, fromCol);
    let toPos = new Position(lineTo, toCol);
    let range = new Range(fromPos, toPos);
    let errMsg = "";
    errMsg = (match[1] + match[15]).replace(new RegExp(/\*     /,'g'), '').replace(new RegExp(/\!     /,'g'), '').trim();
    let diag = new Diagnostic(range, errMsg, severity);
    diag.source = "Logtalk Linter";
    diag.code = lineFrom + 1;

    if (diag) {
      if (!this.diagnostics[fileName]) {
        this.diagnostics[fileName] = [diag];
      } else {
        this.diagnostics[fileName].push(diag);
      }
      this.diagnostics[fileName] = this.removeDuplicateDiagnostics(this.diagnostics[fileName]);
    }

  }

  public lint(message: string) {
    // Skip test result messages - they should be handled only by the tests reporter
    // This is a workaround for a bug elsewhere where tests results are wrongly routed to the linter
    // The bug may be a timing issue cleaning up the scratch messages file
    if (message.includes('cpu/wall seconds')) {
      return;
    }
    this.parseIssue(message);
    for (let doc in this.diagnostics) {
      let index = this.diagnostics[doc]
        .map((diag, i) => {
          return [diag.range.start.line, i];
        })
        .sort((a, b) => {
          return a[0] - b[0];
        });
      this.sortedDiagIndex[doc] = index.map(item => {
        return item[1];
      });
      this.diagnosticCollection.set(Uri.file(doc), this.diagnostics[doc]);
    }
  }

  public clear(line: string) {
    let match = line.match(this.compilingFileRegex)
    if (match) {
      // Handle paths starting with double slash followed by drive letter (e.g., //C/path -> C:/path)
      let filePath = Utils.normalizeDoubleSlashPath(match[1]);

      filePath = fs.realpathSync.native(filePath);
      this.diagnosticCollection.delete(Uri.file(filePath));
      if (filePath in this.diagnostics) {
        this.diagnostics[filePath] = [];
      }
      // Clear the diagnostic hash as we're starting a new compilation
      this.diagnosticHash = [];
    }
  }

  public updateDiagnostics(uri: Uri, diagnosticToRemove: Diagnostic) {
    DiagnosticsUtils.updateDiagnostics(this.diagnosticCollection, uri, diagnosticToRemove);
  }

  private removeDuplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    return DiagnosticsUtils.removeDuplicateDiagnostics(diagnostics);
  }

  private loadConfiguration(): void {
    let section = workspace.getConfiguration("logtalk");
    if (section) {
      if (this.documentListener) {
        this.documentListener.dispose();
      }
      if (this.openDocumentListener) {
        this.openDocumentListener.dispose();
      }
    }
  }

  public activate(subscriptions): void {

    this.diagnosticCollection = languages.createDiagnosticCollection('Logtalk Linter');

    workspace.onDidChangeConfiguration(
      this.loadConfiguration,
      this,
      subscriptions
    );

    workspace.onWillSaveTextDocument(
      textDocumentWillSaveEvent => {
        if (textDocumentWillSaveEvent.document.isDirty) {
          this.diagnosticCollection.delete(textDocumentWillSaveEvent.document.uri);
          const filePath = textDocumentWillSaveEvent.document.uri.fsPath;
          if (filePath in this.diagnostics) {
            this.diagnostics[filePath] = [];
          }
        }
      },
      this,
      subscriptions
    );

    workspace.onDidCloseTextDocument(
      textDocument => {
        // Only delete diagnostics if the document was modified but not saved
        if (textDocument.isDirty) {
          this.diagnosticCollection.delete(textDocument.uri);
          const filePath = textDocument.uri.fsPath;
          if (filePath in this.diagnostics) {
            this.diagnostics[filePath] = [];
          }
        }
      },
      null,
      subscriptions
    );

    this.loadConfiguration();
  }

  public dispose(): void {
    this.documentListener.dispose();
    this.openDocumentListener.dispose();
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
  }

}
