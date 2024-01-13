# Logtalk for VSCode

A VSCode extension which provides language support for Logtalk. Forked from the [original plugin](https://github.com/arthwang/vsc-logtalk) by Arthur Wang.

Developed and tested in **Logtalk 3.73.0** and **VSCode 1.85.1** on **macOS 14.2** and **Windows 10** with **Node 21**.

🙏 Sponsored by [Permion](https://permion.ai/).

---

[Features](#features) | [Configuration](#configuration) | [Bug Reporting](https://github.com/LogtalkDotOrg/logtalk-for-vscode/issues)

---

## Installation

This extension can be installed from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=LogtalkDotOrg.logtalk-for-vscode&ssr=false#overview) or by downloading its `.vsix` file and selecting `'Extensions: Install from VSIX...'` command from the command palette. See [Development](#development) for details on how the generate the extension `.vsix` file.

This extension **must** be configured before it can be used. Notably, the following settings are required:

- `LOGTALKUSER` and `LOGTALKHOME` environment variable values (as full paths).
- Logtalk executable or integration script.

For details, see [Configuration](#configuration).

## Features

- [Syntax highlighting](#syntax-highlighting)
- [Snippets](#indentation-snippets-and-auto-completion)
- [Linter](#linter)
- [Commands](#commands)
- [Code Navigation](#code-navigation)

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

### Linter

- Errors/warnings when compiling source files are added to the "PROBLEMS" pane.
- Errors/warnings when compiling source files can also be navigated from the Logtalk terminal via Ctrl+click (Windows, Linux) or Cmd+click (macOS).

### Commands

#### Workspace commands

Workspace commands can be triggered from command palette via entering 'Logtalk' to pop up the list of all commands of this extension.

|      Command | Description                                                 |
| -----------: | :---------------------------------------------------------- |
| Open Logtalk | Opens Logtalk in an integrated terminal                     |
|  Run Testers | Runs the `logtalk_tester` script on the workspace directory |
|  Run Doclets | Runs the `logtalk_doclet` script on the workspace directory |

The output of the `logtalk_tester` and `logtalk_doclet` scripts is displayed in the "OUTPUT" pane.

### Directory and source file specified commands

These commands can be triggered from editor/context and explorer/context menus via right click editor area or Logtalk files in explorer area respectively. In explorer context, the file name at which right click occurs will be passed in the command as argument. File specified commands can also be triggered from command palette so that active file name in the editor will be passed in the command.

|                  Command | Description                                                       |
| -----------------------: | :---------------------------------------------------------------- |
|           Load Directory | Loads the current directory loader file into the Logtalk process  |
|                Load File | Loads the active source file into the Logtalk process             |
|            Make - Reload | Reloads the active source files into the Logtalk process          |
|             Make - Check | Checks for code issues in the Logtalk process                     |
|                Run Tests | Runs the tester file under the active source file directory       |
|               Run Doclet | Run the doclet file under the active source file directory        |
|           Scan Dead Code | Scans the active source file directory for dead code              |
|   Generate Documentation | Generates documentation for the active source file directory      |
|        Generate Diagrams | Generates diagrams for the active source file directory           |

### Code Navigation

Install the [ctagsx](https://marketplace.visualstudio.com/items?itemName=jtanx.ctagsx) extension and generate a `tags` or `.tags` file for your projects.
The Logtalk support for [Exuberant Ctags](https://ctags.sourceforge.net) must be installed separately. See the `coding/ctags` directory in the Logtalk distribution for details.

You can then select an entity name, a predicate indicator, or a non-terminal indicator and use the "Go to Definition" menu option. You can also use `Cmd+T` or `Ctrl+T` to search for a tag.

## Configuration

The user can configure settings via VS Code menu `Settings`. Entering `Logtalk` in the input box will show up Logtalk settings. Follows a description of all the settings in this extension with their default values.

### Logtalk environment variables

    "logtalk.home.path": ""
    "logtalk.user.path": ""

No defaults (VSCode doesn't support using environment variables to define settings). Must be set to the `LOGTALKHOME` and `LOGTALKUSER` environment variable absolute paths. On Windows, also use forward slashes (e.g. `C:/Program Files (x86)/Logtalk`).

### Logtalk executable

    "logtalk.executable.path": "/usr/local/bin/logtalk"
    "logtalk.executable.arguments": [ ]

These settings points to the Logtalk executable and its arguments. The executable can be created by running the `logtalk_backend_select` script. In alternative, use the absolute path to the integration script you want to use. For example:

    "logtalk.executable.path": "/usr/local/bin/swilgt"
    "logtalk.executable.arguments": [ "-q" ]

On Windows systems, use the absolute path to the Prolog backend executable **and** then set the arguments to load Logtalk (look into the properties of the Logtalk integration shortcuts that are available from the Start Menu after installing Logtalk). For example (assuming the default Logtalk installation):

    "logtalk.executable.path": "C:/Program Files/swipl/bin/swipl.exe"
    "logtalk.executable.arguments": [
        "-s",
        "C:/Program Files (x86)/Logtalk/integration/logtalk_swi.pl"
    ]

Recent Windows versions allows using forward slashes in paths.

### Logtalk project testers

    "logtalk.tester.script": "/usr/local/bin/logtalk_tester"
    "logtalk.tester.arguments": [ ]

Automation script for running tests and its arguments. The arguments **must** included at least the Prolog backend. For example:

    "logtalk.tester.script": "/usr/local/bin/logtalk_tester"
    "logtalk.tester.arguments": [ "-p", "swi" ]

 On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation):

    "logtalk.tester.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.tester.arguments": [ "-file", "C:/Windows/logtalk_tester.ps1", "-p", "swi" ]

### Logtalk project doclets

    "logtalk.doclet.script": "/usr/local/bin/logtalk_doclet"
    "logtalk.doclet.arguments": [ ]

Automation script for running doclets and its arguments. The arguments **must** included at least the Prolog backend. For example:

    "logtalk.doclet.script": "/usr/local/bin/logtalk_doclet"
    "logtalk.doclet.arguments": [ "-p", "swi" ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation):

    "logtalk.doclet.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.doclet.arguments": [ "-file", "C:/Windows/logtalk_doclet.ps1", "-p", "swi" ]

### Logtalk project documentation

    "logtalk.documentation.script": "/usr/local/bin/lgt2html"
    "logtalk.documentation.arguments": [ ]

Documentation script and its arguments for converting the XML files generated by the Logtalk `lgtdoc` tool to their final format. For example:

    "logtalk.documentation.script": "/usr/local/bin/lgt2html"
    "logtalk.documentation.arguments":[ "-t", "APIs documentation" ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation):

    "logtalk.documentation.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.documentation.arguments": [ "-file", "C:/Windows/lgt2html.ps1", "-t", "APIs documentation" ]

### Logtalk project diagrams

    "logtalk.diagrams.script": "/usr/local/bin/lgt2svg"
    "logtalk.diagrams.arguments": [ ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation):

    "logtalk.diagrams.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.diagrams.arguments": [ "-file", "C:/Windows/lgt2svg.ps1" ]

Diagrams script for converting the `.dot` files generated by the Logtalk `diagrams` tool. Requires Graphviz.

### Default timeout (in milliseconds) for waiting to run conversion scripts

    "logtalk.scripts.timeout": 480000

Conversion scripts include those that convert `.xml` documentation files and `.dot` diagram files to final formats when running the `lgtdoc` and `diagrams` tools.
This timeout is also used to wait for a file compilation to finish before adding any compiler errors or warnings to the "Problems" pane.

## Known Issues

On Windows systems, the file paths on the "Problems" pane are not relative to the workspace directory.

## Development

This extension has been package and tested with Node 21.

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
