# Logtalk for VSCode

A VSCode extension which provides language support for Logtalk. Forked from the [original plugin](https://github.com/arthwang/vsc-logtalk) by Arthur Wang.

Developed and tested in **Logtalk 3.78.0** and **VSCode 1.88.1** on **macOS 14.4** and **Windows 10** with **Node 21**.

🙏 Sponsored by [Permion](https://permion.ai/) and GitHub Sponsors.

---

[Features](#features) | [Configuration](#configuration) | [Known Issues](#known-issues) | [Development](#development) | [Acknowledgements](#acknowledgements) | [Licence](#license)

---

## Installation

This extension can be installed directly from VSCode, from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=LogtalkDotOrg.logtalk-for-vscode&ssr=false#overview), or by downloading its `.vsix` file and selecting `'Extensions: Install from VSIX...'` command from the command palette. See [Development](#development) for details on how the generate the extension `.vsix` file for a git version.

This extension **must** be configured before it can be used. Notably, the following settings are required:

- Logtalk home and user paths
- Logtalk executable or integration script.

For details, see [Configuration](#configuration).

## Features

- [Syntax highlighting](#syntax-highlighting)
- [Snippets](#indentation-snippets-and-auto-completion)
- [Linter](#linter)
- [Commands](#commands)
- [Code Navigation](#code-navigation)
- [Hover contents](#hover-contents)

### Syntax highlighting

- Full syntax highlight for all Logtalk built-in control constructs, directives, methods, and predicates
- Full syntax highlight for all ISO Prolog standard built-in control constructs, directives, and predicates

### Indentation, snippets and auto-completion

- Indentation after new line
- Built-in directive, method, and predicate template auto-completion
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
- Errors/warnings when compiling source files can also be navigated from the Logtalk terminal via Ctrl+click (Windows, Linux, BSD, ...) or Cmd+click (macOS).

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
|                Run Tests | Loads the tester file under the active source file directory      |
|               Run Doclet | Loads the doclet file under the active source file directory      |
|           Scan Dead Code | Scans the active source file directory for dead code              |
|   Generate Documentation | Generates documentation for the active source file directory      |
|        Generate Diagrams | Generates diagrams for the active source file directory           |

### Code Navigation

Code navigation **experimental** features **require** the code to be loaded, typically by opening the project loader file and selecting the "Load File" menu or context menu item.
Additionally, code must be compiled with the `source_data` flag set to `on` (default) and the `context_switching_calls` set to `allow` (default).

Code navigation support require Logtalk 3.78.0 or a later version.

#### Go to Declaration

Click in the middle of a predicate name and select the "Go to Declaration" menu or context menu item.

#### Go to Definition

Click in the middle of a predicate name and select the "Go to Definition" menu or context menu item.

#### Go to Type Definition

Entities (objects, protocols, and categories) are interpreted as types. Click in the middle of an entity name and select the "Go to Type Definition" menu or context menu item.

#### Go to References

Click in the middle of a predicate name in a message goal or in a `uses/2` directive and select the "Go to References" or "Find All References" menu or context menu items. Alternatively, click on a predicate indicator in a predicate scope directive. References are interpreted here as messages, super calls, and predicate calls.

#### Go to Implementations

Click in the middle of a predicate name in a predicate indicator in a scope directive and select the "Go to Implementations" or "Find All Implementations" menu or context menu items.
Alternatively, click in an entity name to go/find all entities implementing, importing, extending, instantiating, or specializing the selected entity.

#### Go to Symbol in Editor...

Symbols include object, protocol, and category identifiers in entity opening directives plus predicate (and non-terminal) indicators in predicate scope directives. Note that VSCode doesn't support customization of symbol kind names and icons, thus forcing adapting the pre-defined names and icons. This feature doesn't require the code to be loaded.

#### Go to Symbol in Workspace...

Symbols include object, protocol, and category identifiers in entity opening directives plus predicate (and non-terminal) indicators in predicate scope directives. Note that VSCode doesn't support customization of symbol kind names and icons, thus forcing adapting the pre-defined names and icons. This feature doesn't require the code to be loaded.

### Hover contents

Hover contents is provided for built-in directives, built-in predicates, and built-in methods.

## Configuration

The user can configure settings via VS Code menu `Settings`. Entering `Logtalk` in the input box will show up Logtalk settings. Follows a description of all the settings in this extension with their default values (if any). On Windows, use forward slashes in settings that require paths. Also on Windows, PowerShell 7.3.x or later is required for settings that call scripts., On a POSIX system (e.g. macOS, Linux, or BSD), if you're running Logtalk from a clone of its git repo, you may need to add the `.sh` extension to all scripts in the settings.

### Logtalk home and user paths

    "logtalk.home.path": ""
    "logtalk.user.path": ""

No defaults (VSCode doesn't support using environment variables to define settings). Must be set to the `LOGTALKHOME` and `LOGTALKUSER` environment variable **absolute path** values. On Windows, also use forward slashes (e.g. `C:/Program Files (x86)/Logtalk`).

### Logtalk executable

    "logtalk.executable.path": "/usr/local/bin/logtalk"
    "logtalk.executable.arguments": [ ]

Logtalk executable or integration script plus its arguments. The `logtalk` executable can be created by running the `logtalk_backend_select` script. In alternative, use the integration script you want to use. Absolute paths **must** be used. For example, assuming a POSIX system (e.g. macOS, Linux, or BSD):

    "logtalk.executable.path": "/usr/local/bin/swilgt"
    "logtalk.executable.arguments": [ "-q" ]

On Windows systems, use the absolute path to the Prolog backend executable **and** then set the arguments to load Logtalk (look into the properties of the Logtalk integration shortcuts that are available from the Start Menu after installing Logtalk). For example (assuming the default Logtalk installation):

    "logtalk.executable.path": "C:/Program Files/swipl/bin/swipl.exe"
    "logtalk.executable.arguments": [
        "-s",
        "C:/Program Files (x86)/Logtalk/integration/logtalk_swi.pl"
    ]

### Logtalk project testers

    "logtalk.tester.script": "/usr/local/bin/logtalk_tester"
    "logtalk.tester.arguments": [ ]

Automation script for running tests and its arguments. The arguments **must** included at least the Prolog backend. For example, assuming a POSIX system (e.g. macOS, Linux, or BSD):

    "logtalk.tester.script": "/usr/local/bin/logtalk_tester"
    "logtalk.tester.arguments": [ "-p", "swi" ]

 On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation):

    "logtalk.tester.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.tester.arguments": [
        "-file", "C:/Windows/logtalk_tester.ps1", "-p", "swi"
    ]

### Logtalk project doclets

    "logtalk.doclet.script": "/usr/local/bin/logtalk_doclet"
    "logtalk.doclet.arguments": [ ]

Automation script for running doclets and its arguments. The arguments **must** included at least the Prolog backend. For example, assuming a POSIX system (e.g. macOS, Linux, or BSD):

    "logtalk.doclet.script": "/usr/local/bin/logtalk_doclet"
    "logtalk.doclet.arguments": [ "-p", "swi" ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation):

    "logtalk.doclet.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.doclet.arguments": [
        "-file", "C:/Windows/logtalk_doclet.ps1", "-p", "swi"
    ]

### Logtalk project documentation

    "logtalk.documentation.script": "/usr/local/bin/lgt2html"
    "logtalk.documentation.arguments": [ ]

Documentation script and its arguments for converting the XML files generated by the Logtalk `lgtdoc` tool to their final format. For example, assuming a POSIX system (e.g. macOS, Linux, or BSD):

    "logtalk.documentation.script": "/usr/local/bin/lgt2html"
    "logtalk.documentation.arguments":[ "-t", "APIs documentation" ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation):

    "logtalk.documentation.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.documentation.arguments": [
        "-file", "C:/Windows/lgt2html.ps1", "-t", "APIs documentation"
    ]

### Logtalk project diagrams

    "logtalk.diagrams.script": "/usr/local/bin/lgt2svg"
    "logtalk.diagrams.arguments": [ ]

Script and its arguments for converting the `.dot` files generated (by default) by the Logtalk `diagrams` tool to their final format (by default, SVG). The default above assumes a POSIX system (e.g. macOS, Linux, or BSD).

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation):

    "logtalk.diagrams.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.diagrams.arguments": [ "-file", "C:/Windows/lgt2svg.ps1" ]

Diagrams script for converting the `.dot` files generated by the Logtalk `diagrams` tool. Requires Graphviz.

### Timeout for waiting to run conversion scripts

    "logtalk.scripts.timeout": 480000

The number of milliseconds to wait before running the scripts that convert `.xml` documentation files and `.dot` diagram files to final formats when running the `lgtdoc` and `diagrams` tools. This timeout is also used to wait for a file compilation to finish before adding any compiler errors or warnings to the "Problems" pane. You may need to set a value larger than the default value if you're compiling big applications.

## Known Issues

On Windows systems, the file paths on the "Problems" pane are not relative to the workspace directory.

If you're migrating from the old "VSC-Logtalk" extension, you may see duplicated context menu items even after uninstalling it. If that happens, delete any extension leftovers in the `%USERPROFILE%\.vscode\extensions` (for Windows) or `~/.vscode/extensions` (for Linux and macOS) directory.

## Development

This extension has been package and tested with Node 21. After running `npm install`, `npm run vsix:make` makes the `.vsix` file and `npm run vsix:install` installs it. Restart VSCode after installation.

See the [CHANGELOG.md](https://github.com/LogtalkDotOrg/logtalk-for-vscode/blob/master/CHANGELOG.md) file for the most recent changes. [Contributions](https://github.com/LogtalkDotOrg/logtalk-for-vscode/pulls) and [bug reports](https://github.com/LogtalkDotOrg/logtalk-for-vscode/issues) are most welcome.

## Acknowledgements

Due to Arthur's current unavailability and since-deprecated modules, this extension has been adopted by new maintainers.

### Arthur Wang (Original Author)

"The original author of this extension thanks Professor Paulo Moura who is the author of Logtalk for his patient help and support. Syntax highlighting, some snippets, and some commands are integrated from his distro of Logtalk."

## License

This extension is published under the [MIT](http://www.opensource.org/licenses/mit-license.php) license.
