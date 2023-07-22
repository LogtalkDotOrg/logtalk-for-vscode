# Logtalk for VSCode

A VSCode extension which provides language support for Logtalk. Forked from the [original plugin](https://github.com/arthwang/vsc-logtalk) by Arthur Wang.

🙏 Sponsored by [Permion](https://permion.ai/).

---

[Features](#features) | [Configurations](#configurations) | [Bug Reporting](https://github.com/LogtalkDotOrg/logtalk-for-vscode/issues)

---

## Note before installation

This extension can be installed via extensions viewlet of VSCode or 'Extensions: Install from VSIX...' command from the command palette.

Developed and tested in **_Logtalk 3.67.0_** and **_VSCode 1.80.1_** on **_macOS 13.4_** with **Node 16** . Not yet tested under other environments.

## ⚠️ Known Issues

- `$LOGTALKUSER` and `$LOGTALKHOME`'s full path must be entered in the extension settings (see [Configuration](#configurations)).
- The number of reported warnings and errors may be limited based on your Operating System (see below). 

### Errors & Warnings

This extension uses `tail` to pull streamed warning and error messages from logtalk hooks into your scratch directory (`$LOGTALKUSER/scratch/.messages`). Some operating systems will not parse a large throughput with `tail`. *One suggestion is to write code with less errors or warnings...*

## Features

* [Syntax highlighting](#syntax-highlighting)
* [Snippets](#indentation-snippets-and-auto-completion)
* [Grammar Linter](#grammar-linter)
* [Commands](#commands)

## Feature descriptions and usages

### Syntax highlighting

* Full syntax highlight for all Logtalk built-in control constructs, directives, methods, and predicates
* Full syntax highlight for all ISO Prolog standard built-in control constructs, directives, and predicates
* Built-ins pattern support

### Indentation, snippets and auto-completion

* Indentation after new line
* Built-in directive, method and predicate template auto-completion
* Auto-complete recursive parameters: When '.'(dot) occurs as first non-space character, this extension will repeat the nearest above head of clause and automatically change the parameters if possible.

> Note: Relations between entities use choice snippets. 'orel' triggers object relation choices and 'crel' for category. There is only one relation between protocols 'extends', so 'ext' will trigger the snippet.

> The snippets for built-ins all are triggered by natural prefix, i.e. ':- public' triggers ':- public()' directive. You needn't to type all characters to show up the suggestion list.

> Refter to the table below for other snippets:

|    Prefix | Description                          |
| --------: | ------------------------------------ |
|    :- obj | Object                               |
|    :- cat | Category                             |
|    :- pro | Protocol                             |
|      orel | relations between objects(choice)    |
|      crel | relations between categories(choice) |
|       ext | relations between categories         |
|  category | Category with protocol               |
|  category | Category                             |
|     class | Class with all                       |
|     class | Class with category                  |
|     class | Class with metaclass                 |
|     class | Class with protocol                  |
|     class | Class                                |
|  category | Complementing category               |
|  category | Extended category                    |
|  protocol | Extended protocol                    |
|  instance | Instance with all                    |
|  instance | Instance with category               |
|  instance | Instance with protocol               |
|  instance | Instance                             |
|   private | (with no arguments)                  |
|   private | Private predicate                    |
| protected | (with no arguments)                  |
| protected | Protected predicate                  |
|  protocol | Protocol                             |
|    object | Prototype with all                   |
|    object | Prototype with category              |
|    object | Prototype with parent                |
|    object | Prototype with protocol              |
|    object | Prototype                            |
|    public | (with no arguments)                  |
|    public | Public predicate                     |

![snippets](images/snippets.gif)

### Grammar linter

- Errors/warnings from file sources in the Logtalk terminal can be jumped to with ctrl+click.
- The grammar errors (if any) will display in OUTPUT channel when active source file is saved.
- Command 'Goto next/previous error': see section Commands below.

![linter](images/linter.gif)

### Commands

#### Project specified commands

Project specified commands can be triggered from command palette via entering 'Logtalk' to pop up the list of all commands of this extension.

|      Command | Description                                                  | Key binding |
| -----------: | :----------------------------------------------------------- | :---------- |
| Open Logtalk | Opens Logtalk in an integrated terminal                      | alt-x o     |
|  Run Testers | Runs the logtalk_tester script on the project root directory |             |
|  Run Doclets | Runs the logtalk_doclet script on the project root directory |             |

### Source file specified commands

These commands can be triggered from editor/context and explorer/context menus via right click editor area or Logtalk files in explorer area respectively. In explorer context, the file name at which right click occurs will be passed in the command as argument. File specified commands can also be triggered from command palette so that active file name in the editor will be passed in the command.

|                  Command | Description                                                                                                                                              | Key binding |
| -----------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
|            Load Document | Loads the active source file into the Logtalk process                                                                                                    | F9          |
|            Make Document | Reloads the active source files into the Logtalk process                                                                                                 | F8          |
|                Run Tests | Runs the tester file under the active source file directory                                                                                              |             |
|               Run Doclet | Run the doclet file under the active source file directory                                                                                               |             |
|           Scan Dead Code | Scans active file for dead code                                                                                                                          |             |
|   Generate Documentation | Generates documentation for the files under the active source file directory                                                                             |             |
|        Generate Diagrams | Generates diagrams for the files under the active source file directory                                                                                  |             |

* Command 'Logtalk: load document'

![loader](images/loader.gif)

## Configurations

The user can configure settings via VS Code menu `File/Preferences/Settings`. Entering `Logtalk` in the input box will show up Logtalk settings. Follows a descrition of all the settings in this extension with their default values.

### Logtalk environment variables and executable

    "logtalk.executable.path": "/usr/local/bin/logtalk"

This setting points to the Logtalk executable, which can be created by running the `logtalk_backend_select` script. In alternative, use the absolute path to the integration script you want to use (e.g. `/usr/local/bin/swilgt`). On Windows systems, use the absolute path to the Prolog backend (e.g. `C:\\Program Files\\swipl\\bin\\swipl.exe`) **and** then set the executable argument to load Logtalk (look into the properties of the Logtalk integration shortcuts that are available from the Start Menu after installing Logtalk).

    "logtalk.executable.arguments": [ ]

Arguments of Logtalk executable run in terminal. On Windows systems, this would be set to the argument that loads Logtalk at startup. For example:

    "logtalk.executable.arguments": [
        "-s",
        "C:\\Program Files (x86)\\Logtalk\\integration\\logtalk_swi.pl"
    ]

Recent Windows versions allows using forward slashes in paths.

    "logtalk.home.path": ""

No default. Must be set to the `LOGTALKHOME` environment variable absolute path.

    "logtalk.user.path": ""

No default; must be set to the `LOGTALKUSER` environment variable absolute path.

### Logtalk project testers

    "logtalk.tester.script": "/usr/local/bin/logtalk_tester"

Automation script for running tests.

    "logtalk.tester.arguments": [ ]

Arguments for the automation script for running tests.

### Logtalk project doclets

    "logtalk.doclet.script": "/usr/local/bin/logtalk_doclet"

Automation script for running doclets.

    "logtalk.doclet.arguments": [ ]

Arguments for the automation script for running doclets.

### Logtalk project documentation

    "logtalk.documentation.script": "/usr/local/bin/lgt2html"

Script for converting the XML files generated by the Logtalk `lgtdoc` tool.

    "logtalk.documentation.arguments": ""

Arguments for the script that converts the XML files generated by the Logtalk `lgtdoc` tool.

### Logtalk project diagrams

    "logtalk.graphviz.executable": "/usr/local/bin/dot"

Graphviz executable for converting the `.dot` files generated by the Logtalk `diagrams` tool.

    "logtalk.graphviz.arguments": "-Tsvg"

Arguments for the Graphviz executable that converts the `.dot` files generated by the Logtalk `diagrams` tool.

    "logtalk.graphviz.extension": "svg"

File name extension for the diagram files generated by the Graphviz executable.

### Windows

Please see this [discussion](https://github.com/LogtalkDotOrg/logtalk3/discussions/128#discussioncomment-1912911) for a Windows configuration example.  

## Development 

This extension has been package and tested with node v16.
You may install the extension directly from the `.vsix` file included in this repo.

After running `npm install`, `npm run vsix:make` makes the `.vsix` file and `npm run  vsix:install` installs it. Restart VSCode after installation.

## Update Notes

Please see the [Changelog](https://github.com/LogtalkDotOrg/logtalk-for-vscode/blob/master/CHANGELOG.md).

## Contributions

[Pull requests](https://github.com/LogtalkDotOrg/logtalk-for-vscode/pulls) are welcome.

## Acknowledgements & Contributors

### Arthur Wang (Original Author)

Due to Arthur's unavailability at the time of this plugin's development and since-deprecated modules, this extension has been adopted by new authors.

"The original author of this extension thanks Professor Paulo Moura who is the author of Logtalk for his patient help and support. Syntax highlighting, some snippets, and some commands are integrated from his distro of Logtalk."

## License

[MIT](http://www.opensource.org/licenses/mit-license.php)

