"use strict";

import {
  TextDocument,
  Position,
  Range,
  ExtensionContext,
  workspace
} from "vscode";
interface ISnippet {
  [predIndicator: string]: {
    prefix: string;
    body: string[];
    description: string[];
  };
}
import * as fs from "fs";
import * as cp from "child_process";
import * as jsesc from "jsesc";
import * as path from "path";
import * as vscode from "vscode";

export class Utils {
  private static snippets: ISnippet = null;
  public static CONTEXT: ExtensionContext | null = null;
  public static RUNTIMEPATH: string = "logtalk";
  public static REFMANPATH: string;

  constructor() {}
  public static init(context: ExtensionContext) {
    Utils.CONTEXT = context;
    Utils.REFMANPATH = `${process.env.LOGTALKHOME}/manuals/refman/`;

    Utils.RUNTIMEPATH = workspace
      .getConfiguration("logtalk")
      .get<string>("executable.path", process.env.LOGTALKHOME);
    Utils.loadSnippets(context);
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
    let re = new RegExp("^" + name + "\\(");
    let re1 = new RegExp("^" + name + "/(\\d+)");
    let doctext = doc.getText();
    let text = doctext
      .split("\n")
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

      let pp = cp.spawnSync(Utils.RUNTIMEPATH, [], {
        cwd: Utils.getWorkspaceFolderFromTextDocument(doc),
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
        console.log(pp.stderr.toString());
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
//    console.log("name: " + name);
    let name_escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let re = new RegExp("^(?:" + name_escaped + ")\\(");
    let re1 = new RegExp("^(?:" + name_escaped + ")/[/]?(\\d+)");
    let doctext = doc.getText();
    let text = doctext
      .split("\n")
      .slice(position.line)
      .join("")
      .slice(wordRange.start.character)
      .replace(/\s+/g, " ");
//    console.log("text: " + text);
    if (re.test(text)) {
//      console.log("match");
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
      let wholePred = jsesc(text.slice(0, i), { quotes: "double" });
//      console.log("wholePred: " + wholePred);

      let pp = cp.spawnSync(Utils.RUNTIMEPATH, [], {
        cwd: Utils.getWorkspaceFolderFromTextDocument(doc),
        encoding: "utf8",
        input: `(${wholePred} = (Obj::Pred) -> functor(Pred, N, A), write((arity=A;name=(Obj::N))); ${wholePred} = (::Pred) -> functor(Pred, N, A), write((arity=A;name=(::N))); ${wholePred} = (^^Pred) -> functor(Pred, N, A), write((arity=A;name=(^^N))); functor(${wholePred}, N, A), write((arity=A;name=N))), nl.`
      });

      if (pp.status === 0) {
        let out = pp.stdout.toString();
        console.log("out: " + out);
        let match = out.match(/arity=(\d+);name=(.*)/);
        if (match) {
//          console.log("m1: " + match[1]);
//          console.log("m2: " + match[2]);
          [arity, name] = [parseInt(match[1]), match[2]];
        }
      } else {
        console.log(pp.stderr.toString());
      }
    } else {
      let m = text.match(re1);
      if (m) {
        arity = parseInt(m[1]);
      }
    }
//    console.log("call: " + name + "/" + arity);
    return name + "/" + arity;
  }

  public static getWorkspaceFolderFromTextDocument(doc: TextDocument): string {
    return vscode.workspace.workspaceFolders
      ?.map((folder) => folder.uri.fsPath)
      .filter((fsPath) => doc.fileName?.startsWith(fsPath))[0];
  }

}