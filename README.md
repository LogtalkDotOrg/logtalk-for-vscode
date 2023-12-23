# Logtalk for VSCode

A VSCode extension which provides language support for Logtalk. Forked from the [original plugin](https://github.com/arthwang/vsc-logtalk) by Arthur Wang.

Developed and tested in **Logtalk 3.67.0** and **VSCode 1.80.1** on **macOS 13.4** and **Windows 10** with **Node 16**. Not yet tested under other environments.

🙏 Sponsored by [Permion](https://permion.ai/).

---

[Features](#features) | [Configurations](#configurations) | [Bug Reporting](https://github.com/LogtalkDotOrg/logtalk-for-vscode/issues)

---

## Installation

This extension can be installed via the 'Extensions: Install from VSIX...' command from the command palette. See [Development](#development) for details on how the generate the extension `.vsix` file.

## Configuration

This extension **must** be configured before it can be used. Notably, the following settings are required:

- `LOGTALKUSER` and `LOGTALKHOME` environment variable values (as full paths).
- Logtalk executable or integration script.

For details, see [Configuration](#configurations).

## Features

- [Syntax highlighting](#syntax-highlighting)
- [Snippets](#indentation-snippets-and-auto-completion)
- [Grammar Linter](#grammar-linter)
- [Commands](#commands)

## Feature descriptions and usages

### Syntax highlighting

- Full syntax highlight for all Logtalk built-in control constructs, directives, methods, and predicates
- Full syntax highlight for all ISO Prolog standard built-in control constructs, directives, and predicates
- Built-ins pattern support

### Indentation, snippets and auto-completion

- Indentation after new line
- Built-in directive, method and predicate template auto-completion
- Auto-complete recursive parameters: When `.` (dot) occurs as first non-space character, this extension will repeat the nearest above head of clause and automatically change the parameters if possible.

Note: Relations between entities use choice snippets: `orel` triggers object relation choices and `crel` for category. There is only one relation between protocols, 'extends', so `ext` will trigger the snippet.

The snippets for built-ins all are triggered by natural prefix, i.e. `:- public` triggers `:- public()` directive. You don't need to type all characters to show up the suggestion list.

Refer to the table below for other snippets:

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

|                  Command | Description                                                                  | Key binding |
| -----------------------: | :--------------------------------------------------------------------------- | :---------- |
|                Load File | Loads the active source file into the Logtalk process                        | F9          |
|            Make (Reload) | Reloads the active source files into the Logtalk process                     | F8          |
|                Run Tests | Runs the tester file under the active source file directory                  |             |
|               Run Doclet | Run the doclet file under the active source file directory                   |             |
|           Scan Dead Code | Scans active file for dead code                                              |             |
|   Generate Documentation | Generates documentation for the files under the active source file directory |             |
|        Generate Diagrams | Generates diagrams for the files under the active source file directory      |             |

## Configurations

The user can configure settings via VS Code menu `File/Preferences/Settings`. Entering `Logtalk` in the input box will show up Logtalk settings. Follows a description of all the settings in this extension with their default values.

### Logtalk environment variables

Until VSCode allows defining settings from environment variable values, the following two settings must be manually defined:

    "logtalk.home.path": ""
    "logtalk.user.path": ""

No defaults. Must be set to the `LOGTALKHOME` and `LOGTALKUSER` environment variable absolute paths.

### Logtalk executable

    "logtalk.executable.path": "/usr/local/bin/logtalk"
    "logtalk.executable.arguments": [ ]

These settings points to the Logtalk executable and its arguments. The executable can be created by running the `logtalk_backend_select` script. In alternative, use the absolute path to the integration script you want to use. For example:

    "logtalk.executable.path": "/usr/local/bin/swilgt"
    "logtalk.executable.arguments": [ "-q" ]

On Windows systems, use the absolute path to the Prolog backend executable **and** then set the arguments to load Logtalk (look into the properties of the Logtalk integration shortcuts that are available from the Start Menu after installing Logtalk). For example:

    "logtalk.executable.path": "C:\\Program Files\\swipl\\bin\\swipl.exe"
    "logtalk.executable.arguments": [
        "-s",
        "C:\\Program Files (x86)\\Logtalk\\integration\\logtalk_swi.pl"
    ]

Recent Windows versions allows using forward slashes in paths.

### Logtalk project testers

    "logtalk.tester.script": "/usr/local/bin/logtalk_tester"
    "logtalk.tester.arguments": [ ]

Automation script for running tests and its arguments. The arguments **must** included at least the Prolog backend. For example:

    "logtalk.tester.script": "/usr/local/bin/logtalk_tester"
    "logtalk.tester.arguments": [ "-p", "swi" ]

 On Windows systems, these settings must be set differently. For example:

    "logtalk.tester.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.tester.arguments": [ "-file", "C:/Windows/logtalk_tester.ps1", "-p", "swi" ]

### Logtalk project doclets

    "logtalk.doclet.script": "/usr/local/bin/logtalk_doclet"
    "logtalk.doclet.arguments": [ ]

Automation script for running doclets and its arguments. The arguments **must** included at least the Prolog backend. For example:

    "logtalk.doclet.script": "/usr/local/bin/logtalk_doclet"
    "logtalk.doclet.arguments": [ "-p", "swi" ]

On Windows systems, these settings must be set differently. For example:

    "logtalk.doclet.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.doclet.arguments": [ "-file", "C:/Windows/logtalk_doclet.ps1", "-p", "swi" ]

### Logtalk project documentation

    "logtalk.documentation.script": "/usr/local/bin/lgt2html"
    "logtalk.documentation.arguments": [ ]

Documentation script and its arguments for converting the XML files generated by the Logtalk `lgtdoc` tool to their final format. For example:

    "logtalk.documentation.script": "/usr/local/bin/lgt2html"
    "logtalk.documentation.arguments":[ "-t", "APIs documentation" ]

On Windows systems, these settings must be set differently. For example:

    "logtalk.documentation.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.documentation.arguments": [ "-file", "C:/Windows/lgt2html.ps1", "-t", "APIs documentation" ]

### Logtalk project diagrams

    "logtalk.diagrams.script": "/usr/local/bin/lgt2svg"
    "logtalk.diagrams.arguments": [ ]

On Windows systems, these settings must be set differently. For example:

    "logtalk.diagrams.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.diagrams.arguments": [ "-file", "C:/Windows/lgt2svg.ps1" ]

Diagrams script for converting the `.dot` files generated by the Logtalk `diagrams` tool. Requires Graphviz.


## Development

This extension has been package and tested with Node 16.

After running `npm install`, `npm run vsix:make` makes the `.vsix` file and `npm run vsix:install` installs it. Restart VSCode after installation.

## Update Notes

Please see the [Changelog](https://github.com/LogtalkDotOrg/logtalk-for-vscode/blob/master/CHANGELOG.md).

## Contributions

[Pull requests](https://github.com/LogtalkDotOrg/logtalk-for-vscode/pulls) are most welcome.

## Acknowledgements & Contributors

### Arthur Wang (Original Author)

Due to Arthur's current unavailability and since-deprecated modules, this extension has been adopted by new authors.

"The original author of this extension thanks Professor Paulo Moura who is the author of Logtalk for his patient help and support. Syntax highlighting, some snippets, and some commands are integrated from his distro of Logtalk."

## License

[MIT](http://www.opensource.org/licenses/mit-license.php)
