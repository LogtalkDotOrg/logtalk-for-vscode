"use strict";

import {
  TextDocument,
  Position,
  Range,
  ExtensionContext,
  Uri,
  workspace,
  window
} from "vscode";
import { LOGTALK_SNIPPETS, ISnippetDictionary } from "../data/snippetsData";
import * as fs from "fs";
import * as jsesc from "jsesc";
import * as path from "path";
import * as vscode from "vscode";
import { getLogger } from "./logger";
import { PatternSets } from "./symbols";

export class Utils {
  // Minimum required Logtalk version
  public static readonly LOGTALK_MIN_VERSION_MAJOR = 3;
  public static readonly LOGTALK_MIN_VERSION_MINOR = 97;
  public static readonly LOGTALK_MIN_VERSION_PATCH = 0;

  private static logtalkHome: string;
  private static backend: string;
  private static script: string;
  // Snippets are now imported from the centralized snippetsData module
  private static snippets: ISnippetDictionary = LOGTALK_SNIPPETS;
  public static CONTEXT: ExtensionContext | null = null;
  public static RUNTIMEPATH: string = "logtalk";
  public static RUNTIMEARGS: string[] = [];
  public static REFMANPATH: string;
  private static logger = getLogger();

  constructor() {}

  /**
   * Resolves executable arguments based on configuration and backend.
   * Supports both legacy array format and new dictionary format for backend-specific arguments.
   * @param configValue The configuration value for executable.arguments
   * @param backend The current backend identifier
   * @returns Array of arguments for the specified backend
   */
  public static resolveExecutableArguments(configValue: any, backend: string): string[] {
    if (!configValue) {
      return [];
    }

    // Check if it's the new dictionary format
    if (typeof configValue === 'object' && !Array.isArray(configValue)) {
      // Dictionary format: return backend-specific arguments
      return configValue[backend] || [];
    }

    // Legacy array format: return the array as-is
    if (Array.isArray(configValue)) {
      return configValue;
    }

    // Fallback for unexpected format
    return [];
  }

  /**
   * Updates runtime configuration from workspace settings.
   * This method is called both during initialization and when configuration changes.
   */
  private static updateRuntimeConfiguration(): void {
    Utils.REFMANPATH = `${process.env.LOGTALKHOME}/manuals/refman/`;

    Utils.RUNTIMEPATH = workspace
      .getConfiguration("logtalk")
      .get<string>("executable.path", process.env.LOGTALKHOME);

    Utils.logtalkHome = workspace
      .getConfiguration("logtalk")
      .get<string>("home.path", process.env.LOGTALKHOME)

    Utils.backend = workspace
      .getConfiguration("logtalk")
      .get<string>("backend", process.env.LOGTALKHOME)

    const executableArgsConfig = workspace
      .getConfiguration("logtalk")
      .get("executable.arguments");
    Utils.RUNTIMEARGS = Utils.resolveExecutableArguments(executableArgsConfig, Utils.backend);

    if (Utils.RUNTIMEPATH == "") {
      switch(Utils.backend) {
        case "b":
          Utils.script = "bplgt"
          break;
        case "ciao":
          Utils.script = "ciaolgt"
          break;
        case "cx":
          Utils.script = "cxlgt"
          break;
        case "eclipse":
          Utils.script = "eclipselgt"
          break;
        case "gnu":
          Utils.script = "gplgt"
          break;
        case "gnunc":
          Utils.script = "gplgtnc"
          break;
        case "ji":
          Utils.script = "jiplgt"
          break;
        case "sicstus":
          Utils.script = "sicstuslgt"
          break;
        case "swi":
          Utils.script = "swilgt"
          break;
        case "tau":
          Utils.script = "taulgt"
          break;
        case "trealla":
          Utils.script = "tplgt"
          break;
        case "xsb":
          Utils.script = "xsblgt"
          break;
        case "xvm":
          Utils.script = "xvmlgt"
          break;
        case "yap":
          Utils.script = "yaplgt"
          break;
        default:
          vscode.window.showErrorMessage("Configuration error: unknown logtalk.backend setting value!");
      }
      if (Utils.backend === "gnunc") {
          Utils.RUNTIMEPATH = Utils.script;
      } else if (process.platform === 'win32') {
        Utils.RUNTIMEPATH = path.join(process.env.PROGRAMFILES, "/PowerShell/7/pwsh.exe");
        Utils.RUNTIMEARGS = ["-file", path.join(process.env.SystemRoot, Utils.script + ".ps1")].concat(Utils.RUNTIMEARGS);
      } else {
        Utils.RUNTIMEPATH = path.join(Utils.logtalkHome, path.join("integration", Utils.script + ".sh"));
        Utils.RUNTIMEPATH = path.resolve(Utils.RUNTIMEPATH).split(path.sep).join("/");
      }
    }

    Utils.logger.debug(`Runtime configuration updated: RUNTIMEPATH=${Utils.RUNTIMEPATH}, RUNTIMEARGS=${JSON.stringify(Utils.RUNTIMEARGS)}`);
  }

  public static init(context: ExtensionContext) {
    Utils.CONTEXT = context;
    Utils.updateRuntimeConfiguration();

    // Listen for configuration changes and update runtime configuration
    context.subscriptions.push(
      workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("logtalk.executable.path") ||
            event.affectsConfiguration("logtalk.executable.arguments") ||
            event.affectsConfiguration("logtalk.backend") ||
            event.affectsConfiguration("logtalk.home.path")) {
          Utils.logger.info("Logtalk runtime configuration changed, updating...");
          Utils.updateRuntimeConfiguration();
        }
      })
    );
  }

  /**
   * Reads the Logtalk version from VERSION.txt file.
   * @returns The version string (e.g., "3.95.0"), or null if unable to read
   */
  public static getLogtalkVersionFromFile(): string | null {
    try {
      const logtalkHome = Utils.logtalkHome || workspace.getConfiguration("logtalk").get<string>("home.path");

      if (!logtalkHome) {
        Utils.logger.error("LOGTALKHOME not configured");
        return null;
      }

      const versionFile = path.join(logtalkHome, "VERSION.txt");
      if (!fs.existsSync(versionFile)) {
        Utils.logger.error(`VERSION.txt not found at ${versionFile}`);
        return null;
      }

      const versionContent = fs.readFileSync(versionFile, "utf8").trim();
      // Remove version suffixes (e.g., "-stable", "-beta", "-alpha", "-rc1")
      // Keep only the numeric version part (e.g., "3.92.0-stable" -> "3.92.0")
      const cleanVersion = versionContent.replace(/-[a-zA-Z0-9]+$/, '');

      if (versionContent !== cleanVersion) {
        Utils.logger.debug(`Logtalk version cleaned: "${versionContent}" -> "${cleanVersion}"`);
      }

      return cleanVersion;
    } catch (error) {
      Utils.logger.error("Error reading Logtalk version:", error);
      return null;
    }
  }

  /**
   * Parses a version string into major, minor, and patch numbers.
   * @param version Version string (e.g., "3.95.0")
   * @returns Object with major, minor, patch numbers, or null if invalid
   */
  private static parseVersion(version: string): { major: number; minor: number; patch: number } | null {
    const parts = version.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    const patch = parseInt(parts[2], 10);

    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
      return null;
    }

    return { major, minor, patch };
  }

  /**
   * Compares two versions.
   * @returns true if version1 >= version2, false otherwise
   */
  private static compareVersions(
    v1: { major: number; minor: number; patch: number },
    v2: { major: number; minor: number; patch: number }
  ): boolean {
    if (v1.major !== v2.major) {
      return v1.major > v2.major;
    }
    if (v1.minor !== v2.minor) {
      return v1.minor > v2.minor;
    }
    return v1.patch >= v2.patch;
  }

  /**
   * Checks if the installed Logtalk version meets the minimum required version.
   * @returns true if the installed version is >= minimum required version, false otherwise
   * @throws Error if the version cannot be determined
   */
  public static async checkLogtalkVersion(): Promise<boolean> {
    const versionString = Utils.getLogtalkVersionFromFile();

    if (!versionString) {
      throw new Error("Unable to read Logtalk version from VERSION.txt file");
    }

    const installedVersion = Utils.parseVersion(versionString);
    if (!installedVersion) {
      throw new Error(`Invalid version format in VERSION.txt: ${versionString}`);
    }

    const minVersion = {
      major: Utils.LOGTALK_MIN_VERSION_MAJOR,
      minor: Utils.LOGTALK_MIN_VERSION_MINOR,
      patch: Utils.LOGTALK_MIN_VERSION_PATCH
    };

    const isVersionSufficient = Utils.compareVersions(installedVersion, minVersion);

    if (!isVersionSufficient) {
      Utils.logger.warn(
        `Logtalk version ${versionString} is older than minimum required ` +
        `${minVersion.major}.${minVersion.minor}.${minVersion.patch}`
      );
    } else {
      Utils.logger.debug(`Logtalk version ${versionString} meets minimum requirements`);
    }

    return isVersionSufficient;
  }

  public static getSnippetKeys(doc: TextDocument, pred: string): string[] {
    const docTxt = doc.getText();
    let keys: string[] = [];
    const re = new RegExp("^\\w+:" + pred);
    for (let key in Utils.snippets) {
      if (re.test(key)) {
        keys.push(key.replace("/", "_").replace(":", "/"));
      }
    }
    return keys;
  }

  public static getSnippetDescription(
    doc: TextDocument,
    pred: string
  ): vscode.MarkdownString {
    const docTxt = doc.getText();
    const desc = new vscode.MarkdownString();
    const re = new RegExp("^(directives|predicates|methods):" + pred);
    for (let key in Utils.snippets) {
      if (re.test(key)) {
        const snippet = Utils.snippets[key];
        const descriptionText = Array.isArray(snippet.description) 
          ? snippet.description.join('\n') 
          : (snippet.description || '');
        const contents = descriptionText.split("Template and modes");
        desc.appendCodeblock(contents[1], "logtalk");
        desc.appendMarkdown(contents[0]);
      }
    }
    return desc;
  }

  public static getPredicateIndicatorUnderCursor(
    doc: TextDocument,
    position: Position
  ): string {
    let wordRange: Range = doc.getWordRangeAtPosition(
      position,
      /(\w+)[/](\d+)/
    );
    if (!wordRange) {
      return null;
    }
    let doctext = doc.getText(wordRange);
    let match = doctext.match(/(\w+)[/](\d+)/);
    let name: string = match[1];
    if (name[0].match(/[_A-Z0-9]/)) {
      return null;
    }
    let arity: number = parseInt(match[2]);
    return name + "/" + arity;
  }

  public static getNonTerminalIndicatorUnderCursor(
    doc: TextDocument,
    position: Position
  ): string {
    let wordRange: Range = doc.getWordRangeAtPosition(
      position,
      /(\w+)[/][/](\d+)/
    );
    if (!wordRange) {
      return null;
    }
    let doctext = doc.getText(wordRange);
    let match = doctext.match(/(\w+)[/][/](\d+)/);
    let name: string = match[1];
    if (name[0].match(/[_A-Z0-9]/)) {
      return null;
    }
    let arity: number = parseInt(match[2]);
    return name + "//" + arity;
  }

  public static getIndicatorUnderCursor(
    doc: TextDocument,
    position: Position
  ): string {
    const { ArgumentUtils } = require('./argumentUtils');

    let wordRange: Range = doc.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }
    let arity = 0;
    let name = doc.getText(wordRange);
    if (name[0].match(/[_A-Z0-9]/)) {
      return null;
    }
    let re = new RegExp("^" + name + "\\(");
    let re1 = new RegExp("^" + name + "/(\\d+)");
    let doctext = doc.getText();
    let text = doctext
      .split(/\r?\n/)
      .slice(position.line)
      .join("")
      .slice(wordRange.start.character)
      .replace(/\s+/g, " ");
    if (re.test(text)) {
      // Find the opening parenthesis position
      const openParenPos = text.indexOf("(");
      // Use ArgumentUtils to find the matching closing parenthesis
      const closeParenPos = ArgumentUtils.findMatchingCloseParen(text, openParenPos);
      if (closeParenPos === -1) {
        // No matching closing parenthesis found
        return null;
      }
      let wholePred = text.slice(0, closeParenPos + 1);
      Utils.logger.debug("wholePred: " + wholePred);

      // Parse the predicate call using ArgumentUtils
      const args = ArgumentUtils.extractArgumentsFromCall(wholePred);
      arity = args.length;
      Utils.logger.debug("Parsed arity: " + arity);
    } else {
      let m = text.match(re1);
      if (m) {
        arity = parseInt(m[1]);
      }
    }
    return name + "/" + arity;
  }

  /**
   * Get the indicator of a term starting at the given position.
   * This method handles multi-line terms by reading the complete term text.
   * @param doc The text document
   * @param position The position where the term starts
   * @returns The indicator (name/arity) or null if not found
   */
  public static getIndicatorFromTermAtPosition(
    doc: TextDocument,
    position: Position
  ): string | null {
    const { PredicateUtils } = require('./predicateUtils');
    const { ArgumentUtils } = require('./argumentUtils');

    // Get the word at the cursor position
    const wordRange = doc.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const word = doc.getText(wordRange);

    // Check if the word starts with a lowercase letter (valid atom)
    if (word[0].match(/[_A-Z0-9]/)) {
      return null;
    }

    const lineText = doc.lineAt(position.line).text;

    // Check if this is a directive (starts with :-)
    const isDirective = lineText.trim().startsWith(':-');

    if (isDirective) {
      // Get the complete multi-line directive content
      const directiveRange = PredicateUtils.getDirectiveRange(doc, position.line);
      let fullDirectiveText = '';

      for (let lineNum = directiveRange.start; lineNum <= directiveRange.end; lineNum++) {
        if (lineNum < doc.lineCount) {
          const line = doc.lineAt(lineNum).text;
          fullDirectiveText += line + (lineNum < directiveRange.end ? ' ' : '');
        }
      }

      // Normalize whitespace
      const normalizedText = fullDirectiveText.replace(/\s+/g, ' ').trim();

      // Find the word in the normalized text
      const wordPattern = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(');
      const match = wordPattern.exec(normalizedText);

      if (!match) {
        // Word not followed by parenthesis, might be a zero-arity directive
        return word + '/0';
      }

      // Find the opening parenthesis position
      const openParenPos = match.index + word.length;
      const actualOpenParen = normalizedText.indexOf('(', openParenPos);

      if (actualOpenParen < 0) {
        return word + '/0';
      }

      // Find the matching closing parenthesis
      const closeParenPos = ArgumentUtils.findMatchingCloseParen(normalizedText, actualOpenParen);

      if (closeParenPos < 0) {
        return null;
      }

      // Extract the content between parentheses
      const content = normalizedText.substring(actualOpenParen + 1, closeParenPos);

      // Parse the arguments to count them
      const args = ArgumentUtils.parseArguments(content);

      return word + '/' + args.length;
    }

    // Not a directive, try to handle as a regular term
    // Get text from current line onwards
    const doctext = doc.getText();
    const text = doctext
      .split(/\r?\n/)
      .slice(position.line)
      .join('')
      .slice(wordRange.start.character)
      .replace(/\s+/g, ' ');

    // Check if word is followed by parenthesis
    const re = new RegExp('^' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(');
    if (!re.test(text)) {
      // No parenthesis, zero arity
      return word + '/0';
    }

    // Find the opening parenthesis
    const openParenPos = text.indexOf('(');
    if (openParenPos < 0) {
      return word + '/0';
    }

    // Find the matching closing parenthesis
    let parenDepth = 1;
    let i = openParenPos + 1;
    while (parenDepth > 0 && i < text.length) {
      if (text.charAt(i) === '(') {
        parenDepth++;
      } else if (text.charAt(i) === ')') {
        parenDepth--;
      }
      i++;
    }

    if (parenDepth > 0) {
      // Unmatched parentheses
      return null;
    }

    // Extract the content between parentheses
    const content = text.substring(openParenPos + 1, i - 1);

    // Parse the arguments to count them
    const args = ArgumentUtils.parseArguments(content);

    return word + '/' + args.length;
  }

  public static getCallUnderCursor(
    doc: TextDocument,
    position: Position
  ): string {
    const { ArgumentUtils } = require('./argumentUtils');

    let wordRange: Range = doc.getWordRangeAtPosition(
      position,
      /(\w+(\(.*\))?)?(::|\^\^)?\w+|@\w+/
    );
    if (!wordRange) {
      return null;
    }
    let arity = 0;
    let name = doc.getText(wordRange);
    Utils.logger.debug("name: " + name);
    let name_escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let re = new RegExp("^(?:" + name_escaped + ")\\(");
    let re1 = new RegExp("^(?:" + name_escaped + ")/[/]?(\\d+)");
    let doctext = doc.getText();
    let text = doctext
      .split(/\r?\n/)
      .slice(position.line)
      .join("")
      .slice(wordRange.start.character)
      .replace(/\s+/g, " ");
    Utils.logger.debug("text: " + text);
    if (re.test(text)) {
      Utils.logger.debug("match");
      // Find the opening parenthesis position
      const openParenPos = wordRange.end.character - wordRange.start.character;
      // Use ArgumentUtils to find the matching closing parenthesis
      const closeParenPos = ArgumentUtils.findMatchingCloseParen(text, openParenPos);
      if (closeParenPos === -1) {
        // No matching closing parenthesis found
        return null;
      }
      let wholePred = text.slice(0, closeParenPos + 1);
      Utils.logger.debug("wholePred: " + wholePred);

      // Parse the predicate call using regular expressions
      // Check for Obj::Pred pattern
      let match = wholePred.match(/^(.+)\s*::\s*(.+)$/);
      if (match) {
        const obj = match[1];
        const pred = match[2];
        const args = ArgumentUtils.extractArgumentsFromCall(pred);
        arity = args.length;
        const predNameMatch = pred.match(/^(\w+)/);
        if (predNameMatch) {
          name = obj + "::" + predNameMatch[1];
        }
        Utils.logger.debug("Obj::Pred pattern - name: " + name + ", arity: " + arity);
      } else {
        // Check for ::Pred pattern
        match = wholePred.match(/^::\s*(.+)$/);
        if (match) {
          const pred = match[1];
          const args = ArgumentUtils.extractArgumentsFromCall(pred);
          arity = args.length;
          const predNameMatch = pred.match(/^(\w+)/);
          if (predNameMatch) {
            name = "::" + predNameMatch[1];
          }
          Utils.logger.debug("::Pred pattern - name: " + name + ", arity: " + arity);
        } else {
          // Check for ^^Pred pattern
          match = wholePred.match(/^\^\^\s*(.+)$/);
          if (match) {
            const pred = match[1];
            const args = ArgumentUtils.extractArgumentsFromCall(pred);
            arity = args.length;
            const predNameMatch = pred.match(/^(\w+)/);
            if (predNameMatch) {
              name = "^^" + predNameMatch[1];
            }
            Utils.logger.debug("^^Pred pattern - name: " + name + ", arity: " + arity);
          } else {
            // Regular predicate call
            const args = ArgumentUtils.extractArgumentsFromCall(wholePred);
            arity = args.length;
            const predNameMatch = wholePred.match(/^(\w+)/);
            if (predNameMatch) {
              name = predNameMatch[1];
            }
            Utils.logger.debug("Regular predicate - name: " + name + ", arity: " + arity);
          }
        }
      }
    } else {
      let m = text.match(re1);
      if (m) {
        arity = parseInt(m[1]);
      }
    }
    if (name[0].match(/[_A-Z0-9]/)) {
      return null;
    }
    Utils.logger.debug("call: " + name + "/" + arity);
    return name + "/" + arity;
  }

  public static getEntityNameUnderCursor(
    doc: TextDocument,
    position: Position
  ): string {
    let wordRange: Range = doc.getWordRangeAtPosition(
      position,
      /\w+/
    );

    if (!wordRange) {
      return null;
    }
    let name = doc.getText(wordRange);
    if (name[0].match(/[_A-Z0-9]/)) {
      return null;
    }
    let fullName = name;
    Utils.logger.debug("name: " + name);
    let name_escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let re = new RegExp("^(?:" + name_escaped + ")\\(");
    let doctext = doc.getText();
    let text = doctext
      .split(/\r?\n/)
      .slice(position.line)
      .join("")
      .slice(wordRange.start.character)
      .replace(/\s+/g, " ");
    Utils.logger.debug("text: " + text);
    if (re.test(text)) {
      Utils.logger.debug("match");
      let i = wordRange.end.character - wordRange.start.character + 2;
      let matched = 1;
      while (matched > 0) {
        if (text.charAt(i) === "(") {
          matched++;
          i++;
          continue;
        }
        if (text.charAt(i) === ")") {
          matched--;
          i++;
          continue;
        }
        i++;
      }
      fullName = jsesc(text.slice(0, i), { quotes: "double" });
      Utils.logger.debug("fullName: " + fullName);
    }
    return fullName;
  }

  public static getWorkspaceFolderFromTextDocument(doc: TextDocument): string {
    return vscode.workspace.workspaceFolders
      ?.map((folder) => folder.uri.fsPath)
      .filter((fsPath) => doc.fileName?.startsWith(fsPath))[0];
  }

  public static async openFileAt(uri: Uri) {
    try {
      const content = await workspace.fs.readFile(uri);
      const out = content.toString();
      // remove the temp file as before
      await workspace.fs.delete(uri, { useTrash: false });
      const match = out.match(/File:(.+);Line:(\d+)/);
      if (!match) {
        return;
      }
      // Trim and normalize path; handle Windows double-slash forms
      let fileName: string = match[1].trim();
      fileName = this.normalizeDoubleSlashPath(fileName);

      const lineNum: number = parseInt(match[2]);
      const fileUri = Uri.file(fileName);

      // Use await to ensure opening happens in the current VS Code window
      const doc = await workspace.openTextDocument(fileUri);
      await window.showTextDocument(doc, { selection: new Range(new Position(lineNum - 1, 0), new Position(lineNum - 1, 0)), preserveFocus: true });
    } catch (err) {
      this.logger.error(`openFileAt error: ${err}`);
    }
  }

  /**
   * Determines the type of term at the given position in a document.
   * @param uri The URI of the document
   * @param position The position in the document
   * @returns The term type: 'predicate_rule', 'predicate_fact', 'non_terminal_rule', 'entity_directive', or 'predicate_directive'
   */
  public static async termType(uri: Uri, position: Position): Promise<string | null> {
    try {
      const doc = await workspace.openTextDocument(uri);
      const lineText = doc.lineAt(position.line).text;

      // Simple case: check if the current line has clear indicators
      const simpleType = Utils.checkSimpleTermType(lineText);
      if (simpleType) {
        return simpleType;
      }

      // Complex case: multi-line term - search backwards to find the start
      const termStart = Utils.findTermStart(doc, position.line);
      if (termStart === null) {
        return null;
      }

      const startLineText = doc.lineAt(termStart).text;
      return Utils.analyzeTermType(doc, termStart, startLineText);

    } catch (error) {
      Utils.logger.error(`Error determining term type: ${error}`);
      return null;
    }
  }

  /**
   * Check for simple term type indicators on the current line
   */
  private static checkSimpleTermType(lineText: string): string | null {
    const trimmed = lineText.trim();

    // Check for directive start
    if (trimmed.startsWith(':-')) {
      return Utils.classifyDirective(lineText);
    }
    // Check if line contains --> (non-terminal rule)
    if (trimmed.includes('-->')) {
      return 'non_terminal_rule';
    }
    // Check if line contains :- (predicate rule)
    if (trimmed.includes(':-')) {
      return 'predicate_rule';
    }

    return null;
  }

  /**
   * Find the start of a multi-line term by searching backwards
   */
  public static findTermStart(doc: TextDocument, currentLine: number): number | null {
    let lineNum = currentLine;

    // Search backwards to find the start of the term
    while (lineNum >= 0) {
      const lineText = doc.lineAt(lineNum).text;
      const trimmed = lineText.trim();

      // Skip empty lines and comments
      if (trimmed === '' || trimmed.startsWith('%')) {
        lineNum--;
        continue;
      }

      // Check if this line could be the start of a term (directive, rule, or non-terminal)
      if (Utils.isTermStart(lineText)) {
        return lineNum;
      }

      // If this line ends with a period, we need to determine if it's:
      // 1. A single-line fact (current line) - return current line
      // 2. End of a multi-line clause (current line) - continue searching backwards
      // 3. End of a previous term (previous line) - return next line
      if (trimmed.endsWith('.')) {
        if (lineNum === currentLine) {
          // Special case: if the current line is just ")." or ")" followed by ".",
          // it's definitely a continuation line (end of a multi-line clause body)
          if (/^\s*\)\.?\s*$/.test(lineText)) {
            lineNum--;
            continue;
          }

          // We're on a line ending with period - could be a fact or end of multi-line clause
          // Check if there's a previous non-empty, non-comment line
          let prevLineNum = lineNum - 1;
          while (prevLineNum >= 0) {
            const prevLineText = doc.lineAt(prevLineNum).text;
            const prevTrimmed = prevLineText.trim();

            // Skip empty lines and comments
            if (prevTrimmed === '' || prevTrimmed.startsWith('%')) {
              prevLineNum--;
              continue;
            }

            // If previous line ends with comma, we're in a multi-line clause/directive
            // Continue searching backwards from the previous line
            if (prevTrimmed.endsWith(',')) {
              lineNum = prevLineNum;
              break;
            }

            // If previous line ends with period, current line is a single-line fact
            if (prevTrimmed.endsWith('.')) {
              return currentLine;
            }

            // If previous line contains :- or -->, it's the clause/rule head
            // Check if it's a term start (it should be)
            if (prevTrimmed.includes(':-') || prevTrimmed.includes('-->')) {
              // The previous line is the term start
              return prevLineNum;
            }

            // If previous line ends with ), we might be in a multi-line clause
            // Continue searching backwards to be safe
            if (prevTrimmed.endsWith(')')) {
              lineNum = prevLineNum;
              break;
            }

            // If previous line doesn't end with comma, period, or paren, current line is likely a single-line fact
            return currentLine;
          }

          // If we didn't find a previous line, current line is a single-line fact
          if (prevLineNum < 0) {
            return currentLine;
          }
          // Continue the outer loop with the new lineNum
        } else {
          // We found a period on a previous line - the term starts on the next line
          return lineNum + 1 <= currentLine ? lineNum + 1 : null;
        }
      } else {
        // Line doesn't end with period, continue searching backwards
        lineNum--;
      }
    }

    // If we reach the beginning of the file, the term starts at line 0
    return 0;
  }

  /**
   * Check if a line could be the start of a term
   */
  public static isTermStart(lineText: string): boolean {
    const trimmed = lineText.trim();

    // Directive start
    if (trimmed.startsWith(':-')) {
      return true;
    }

    // Predicate clause rule
    if (/^\s*([a-z][a-zA-Z0-9_]*|'[^']*')(\(.*\))?\s*:-/.test(lineText)) {
      return true;
    }

    // Non-terminal rule
    if (/^\s*([a-z][a-zA-Z0-9_]*|'[^']*')(\(.*\))?\s*-->/.test(lineText)) {
      return true;
    }

    // Note: We don't check for facts here (lines ending with .)
    // because we can't distinguish between a single-line fact and the last line
    // of a multi-line clause without looking at previous lines.
    // This is handled in findTermStart() instead.

    return false;
  }

  /**
   * Analyze the complete term to determine its type
   */
  private static analyzeTermType(doc: TextDocument, startLine: number, startLineText: string): string | null {
    // Collect the complete term text
    const termText = Utils.collectTermText(doc, startLine);

    // Check for directive
    if (startLineText.trim().startsWith(':-')) {
      return Utils.classifyDirective(termText);
    }

    // Check for non-terminal rule
    if (termText.includes('-->')) {
      return 'non_terminal_rule';
    }

    // Check for predicate rule
    if (termText.includes(':-')) {
      return 'predicate_rule';
    }

    // Must be a fact
    return 'predicate_fact';
  }

  /**
   * Collect the complete text of a term starting from a given line
   */
  private static collectTermText(doc: TextDocument, startLine: number): string {
    let termText = '';
    let lineNum = startLine;

    while (lineNum < doc.lineCount) {
      const lineText = doc.lineAt(lineNum).text;
      termText += lineText + ' ';

      // Check if term is complete (ends with period)
      if (lineText.trim().endsWith('.')) {
        break;
      }

      lineNum++;
    }

    return termText.trim();
  }

  /**
   * Classify a directive as entity, predicate, or conditional compilation directive
   */
  private static classifyDirective(directiveText: string): string {
    // Normalize the directive text for multi-line matching
    const normalizedText = directiveText.replace(/\s+/g, ' ').trim();

    // Check for conditional compilation directives
    for (const pattern of PatternSets.conditionalCompilationDirectives) {
      if (pattern.regex.test(normalizedText)) {
        return 'conditional_compilation_directive';
      }
    }

    // Check for entity directives
    for (const pattern of PatternSets.entityOpening) {
      if (pattern.regex.test(normalizedText)) {
        return 'entity_directive';
      }
    }

    for (const pattern of PatternSets.entityEnding) {
      if (pattern.regex.test(normalizedText)) {
        return 'entity_directive';
      }
    }

    // Check for entity-specific directives (like entity info/1)
    for (const pattern of PatternSets.entityDirectives) {
      if (pattern.regex.test(normalizedText)) {
        return 'entity_directive';
      }
    }

    // Check for predicate directives (scope and other predicate-related)
    for (const pattern of PatternSets.allScopes) {
      if (pattern.regex.test(normalizedText)) {
        return 'predicate_directive';
      }
    }

    for (const pattern of PatternSets.scopeOpenings) {
      if (pattern.regex.test(normalizedText)) {
        return 'predicate_directive';
      }
    }

    for (const pattern of PatternSets.predicateDirectives) {
      if (pattern.regex.test(normalizedText)) {
        return 'predicate_directive';
      }
    }

    // Default to predicate directive for unknown directives
    return 'predicate_directive';
  }

  /**
   * Find the entity opening directive by searching backwards from the given line
   * @param document The text document
   * @param startLine The line to start searching from (usually the warning location)
   * @returns The line number of the entity opening directive, or null if not found
   */
  public static findEntityOpeningDirective(document: TextDocument, startLine: number): number | null {
    const { SymbolRegexes } = require('./symbols');

    // Search backwards from the warning location
    for (let lineNum = startLine; lineNum >= 0; lineNum--) {
      const lineText = document.lineAt(lineNum).text.trim();

      // Check if this line contains an entity opening directive
      if (SymbolRegexes.openingObject.test(lineText) ||
          SymbolRegexes.openingProtocol.test(lineText) ||
          SymbolRegexes.openingCategory.test(lineText)) {
        return lineNum;
      }

      // Stop if we hit another entity's end directive
      if (SymbolRegexes.endObject.test(lineText) ||
          SymbolRegexes.endProtocol.test(lineText) ||
          SymbolRegexes.endCategory.test(lineText)) {
        break;
      }
    }

    return null;
  }

  /**
   * Normalize paths starting with double slash followed by drive letter on Windows.
   * Converts paths like //C/path to C:/path on Windows systems.
   * On non-Windows systems, returns the path unchanged.
   * @param filePath The file path to normalize
   * @returns The normalized file path
   */
  public static normalizeDoubleSlashPath(filePath: string): string {
    // Handle paths starting with double slash followed by drive letter (e.g., //C/path -> C:/path)
    if (process.platform === 'win32' && /^\/\/[a-zA-Z]\//.test(filePath)) {
      return filePath[2] + ':' + filePath.substring(3);
    }
    return filePath;
  }

  /**
   * Normalize a file path to use forward slashes and ensure uppercase drive letter on Windows.
   * This is critical for consistent path comparison, as VSCode's uri.fsPath normalizes
   * drive letters to lowercase, but the Logtalk backend uses uppercase.
   * @param filePath The file path to normalize
   * @returns The normalized path with forward slashes and uppercase drive letter
   */
  public static normalizeFilePath(filePath: string): string {
    let normalized = path.resolve(filePath).split(path.sep).join("/");
    // Ensure uppercase drive letter on Windows
    if (process.platform === 'win32' && /^[a-z]:/.test(normalized)) {
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }
    return normalized;
  }

  /**
   * Get the range of the entity (object/protocol/category) containing the position.
   * @param document The text document
   * @param position The position in the document
   * @returns The range of the entity, or null if not in an entity
   */
  public static getEntityRange(
    document: TextDocument,
    position: Position
  ): Range | null {
    const { SymbolRegexes } = require('./symbols');

    // Search backwards to find the entity opening directive
    let entityStartLine: number | null = null;
    let entityType: string | null = null;

    for (let lineNum = position.line; lineNum >= 0; lineNum--) {
      const lineText = document.lineAt(lineNum).text.trim();

      // Check for entity opening directives
      if (SymbolRegexes.openingObject.test(lineText)) {
        entityStartLine = lineNum;
        entityType = 'object';
        break;
      } else if (SymbolRegexes.openingProtocol.test(lineText)) {
        entityStartLine = lineNum;
        entityType = 'protocol';
        break;
      } else if (SymbolRegexes.openingCategory.test(lineText)) {
        entityStartLine = lineNum;
        entityType = 'category';
        break;
      }

      // If we hit an entity end directive, we're not inside an entity
      if (SymbolRegexes.endObject.test(lineText) ||
          SymbolRegexes.endProtocol.test(lineText) ||
          SymbolRegexes.endCategory.test(lineText)) {
        return null;
      }
    }

    if (entityStartLine === null || entityType === null) {
      return null;
    }

    // Search forwards to find the entity closing directive
    let entityEndLine: number | null = null;
    const endRegex = entityType === 'object' ? SymbolRegexes.endObject :
                     entityType === 'protocol' ? SymbolRegexes.endProtocol :
                     SymbolRegexes.endCategory;

    for (let lineNum = entityStartLine + 1; lineNum < document.lineCount; lineNum++) {
      const lineText = document.lineAt(lineNum).text.trim();
      if (endRegex.test(lineText)) {
        entityEndLine = lineNum;
        break;
      }
    }

    if (entityEndLine === null) {
      // Entity not properly closed, return range to end of file
      entityEndLine = document.lineCount - 1;
    }

    return new Range(
      new Position(entityStartLine, 0),
      new Position(entityEndLine, document.lineAt(entityEndLine).text.length)
    );
  }

  /**
   * Clean up temporary files from a given directory.
   * Silently ignores errors if a file cannot be deleted.
   * @param directory The root directory path (can be undefined if no workspace is open)
   * @param fileNames Array of file names to delete
   */
  public static async cleanupTemporaryFiles(directory: string | undefined, fileNames: string[]): Promise<void> {
    // Early exit if no workspace folders are open or directory is undefined
    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0 || !directory) {
      return;
    }

    for (const fileName of fileNames) {
      const pattern = new vscode.RelativePattern(directory, '**/' + fileName);
      const files = await workspace.findFiles(pattern);
      for (const file of files) {
        try {
        // Use VSCode's file system API instead of Node.js fs to ensure VSCode's file explorer is updated
          await workspace.fs.delete(file, { recursive: false, useTrash: false });
          this.logger.debug(`Deleted old temporary file: ${file.fsPath}`);
        } catch (error) {
          this.logger.error(`Error deleting old temporary file ${file.fsPath}:`, error);
        }
      }
    }
  }

}
