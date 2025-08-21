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
interface ISnippet {
  [predIndicator: string]: {
    prefix: string;
    body: string[];
    description: string[];
  };
}
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as cp from "child_process";
import * as jsesc from "jsesc";
import * as path from "path";
import * as vscode from "vscode";
import { getLogger } from "./logger";

export class Utils {
  private static logtalkHome: string;
  private static backend: string;
  private static script: string;
  private static snippets: ISnippet = null;
  public static CONTEXT: ExtensionContext | null = null;
  public static RUNTIMEPATH: string = "logtalk";
  public static RUNTIMEARGS: string[] = [];
  public static REFMANPATH: string;
  private static logger = getLogger();

  constructor() {}
  public static init(context: ExtensionContext) {
    Utils.CONTEXT = context;
    Utils.REFMANPATH = `${process.env.LOGTALKHOME}/manuals/refman/`;

    Utils.RUNTIMEPATH = workspace
      .getConfiguration("logtalk")
      .get<string>("executable.path", process.env.LOGTALKHOME);
    Utils.RUNTIMEARGS = workspace
      .getConfiguration("logtalk")
      .get<string[]>("executable.arguments");
    Utils.loadSnippets(context);

    Utils.logtalkHome = workspace
      .getConfiguration("logtalk")
      .get<string>("home.path", process.env.LOGTALKHOME)

    Utils.backend = workspace
      .getConfiguration("logtalk")
      .get<string>("backend", process.env.LOGTALKHOME)

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
        case "ji":
          Utils.script = "jilgt"
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
      if (process.platform === 'win32') {
        Utils.RUNTIMEPATH = path.join(process.env.PROGRAMFILES, "/PowerShell/7/pwsh.exe");
        Utils.RUNTIMEARGS = ["-file", path.join(process.env.SystemRoot, Utils.script + ".ps1")];
      } else {
        Utils.RUNTIMEPATH = path.join(Utils.logtalkHome, path.join("integration", Utils.script + ".sh"));
        Utils.RUNTIMEPATH = path.resolve(Utils.RUNTIMEPATH).split(path.sep).join("/");
       }
    }

  }

  private static loadSnippets(context: ExtensionContext) {
    if (Utils.snippets) {
      return;
    }
    let snippetsPath = path.join(
      context.extensionPath,
      "/snippets/logtalk.json"
    );
    let snippets = fs.readFileSync(snippetsPath, "utf8").toString();
    Utils.snippets = JSON.parse(snippets);
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
        const contents = Utils.snippets[key].description.join('\n').split("Template and modes");
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
      let i = text.indexOf("(") + 1;
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
      let wholePred = jsesc(text.slice(0, i), { quotes: "double" });
      Utils.logger.debug("wholePred: " + wholePred);
      let env;
      if (process.platform === 'win32') {
        env = workspace.getConfiguration("terminal.integrated.env.windows", doc.uri);
      } else if (process.platform === 'darwin') {
        env = workspace.getConfiguration("terminal.integrated.env.osx", doc.uri);
      } else {
        env = workspace.getConfiguration("terminal.integrated.env.linux", doc.uri);
      }
      let pp = cp.spawnSync(Utils.RUNTIMEPATH, Utils.RUNTIMEARGS, {
        cwd: Utils.getWorkspaceFolderFromTextDocument(doc),
        env: Object.assign({}, process.env, env),
        encoding: "utf8",
        input: `functor(${wholePred}, N, A), write((name=N;arity=A)), nl.`
      });
      
      if (pp.status === 0) {
        let out = pp.stdout.toString();
        let match = out.match(/name=[(]?(\w+)[)]?;arity=(\d+)/);
        if (match) {
          [name, arity] = [match[1], parseInt(match[2])];
        }
      } else {
        Utils.logger.debug(pp.stderr.toString());
      }
    } else {
      let m = text.match(re1);
      if (m) {
        arity = parseInt(m[1]);
      }
    }
    return name + "/" + arity;
  }

  public static getCallUnderCursor(
    doc: TextDocument,
    position: Position
  ): string {
    let wordRange: Range = doc.getWordRangeAtPosition(
      position,
      /(\w+(\(.*\))?)?(::|\^\^)?\w+/
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
      let wholePred = text.slice(0, i);
      Utils.logger.debug("wholePred: " + wholePred);
      let env;
      if (process.platform === 'win32') {
        env = workspace.getConfiguration("terminal.integrated.env.windows", doc.uri);
      } else if (process.platform === 'darwin') {
        env = workspace.getConfiguration("terminal.integrated.env.osx", doc.uri);
      } else {
        env = workspace.getConfiguration("terminal.integrated.env.linux", doc.uri);
      }
      let pp = cp.spawnSync(Utils.RUNTIMEPATH, Utils.RUNTIMEARGS, {
        cwd: Utils.getWorkspaceFolderFromTextDocument(doc),
        env: Object.assign({}, process.env, env),
        encoding: "utf8",
        input: `(${wholePred} = (Obj::Pred) -> functor(Pred, N, A), write((arity=A;name=(Obj::N))); ${wholePred} = (::Pred) -> functor(Pred, N, A), write((arity=A;name=(::N))); ${wholePred} = (^^Pred) -> functor(Pred, N, A), write((arity=A;name=(^^N))); functor(${wholePred}, N, A), write((arity=A;name=N))), nl.`
      });

      if (pp.status === 0) {
        let out = pp.stdout.toString();
        Utils.logger.debug("out: " + out);
        let match = out.match(/arity=(\d+);name=(.*)/);
        if (match) {
          Utils.logger.debug("m1: " + match[1]);
          Utils.logger.debug("m2: " + match[2]);
          [arity, name] = [parseInt(match[1]), match[2]];
        }
      } else {
        Utils.logger.debug(pp.stderr.toString());
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
    if (fs.existsSync(uri.fsPath)) {
      let out = fs.readFileSync(uri.fsPath).toString();
      await fsp.rm(uri.fsPath, { force: true });
      let match = out.match(/File:(.+);Line:(\d+)/);
      if (match) {
        let fileName: string = match[1];
        let lineNum: number = parseInt(match[2]);
        workspace.openTextDocument(fileName).then(doc => {
          window.showTextDocument(doc, {selection: new Range(new Position(lineNum - 1, 0), new Position(lineNum - 1, 0)), preserveFocus: true});
        });
      }
    }
  }

}
