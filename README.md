# Logtalk for VSCode

A VSCode extension which provides language support for Logtalk. Forked from the [original plugin](https://github.com/arthwang/vsc-logtalk) by Arthur Wang.

Requires Logtalk 3.81.0 or later and a supported [Prolog backend](https://logtalk.org/download.html#requirements).

🙏 Sponsored by [Permion](https://permion.ai/) and [GitHub Sponsors](https://github.com/sponsors/pmoura).

---

[Installation](#installation) | [Features](#features) | [Configuration](#configuration) | [Known Issues](#known-issues) | [Development](#development) | [Acknowledgements](#acknowledgements) | [Licence](#license)

---

## Installation

This extension can be installed directly from [VSCode](https://code.visualstudio.com/), from its [Marketplace](https://marketplace.visualstudio.com/items?itemName=LogtalkDotOrg.logtalk-for-vscode), or by [downloading](https://github.com/LogtalkDotOrg/logtalk-for-vscode/releases/latest) its `.vsix` file and selecting the "Extensions: Install from VSIX..." command from the command palette. It can also be installed directly from [VSCodium](https://vscodium.com/) or by downloading its `.vsix` file from its [Marketplace](https://marketplace.visualstudio.com/items?itemName=LogtalkDotOrg.logtalk-for-vscode). See [Development](#development) for details on how the generate the extension `.vsix` file for a git version.

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
- [Debugging support](#debugging-support)
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

Most commands, notably those that run the developer tools, **require** the code to be loaded, typically by opening the project loader file and selecting the "Load File" menu or context menu item.

#### Workspace commands

Workspace commands can be triggered from command palette via entering 'Logtalk' to pop up the list of all commands of this extension. Alternatively, Ctrl+click (Windows, Linux, BSD, ...) or Cmd+click (macOS) in a Logtalk source file in the Explorer.

|                             Command | Description                                                      |
| ----------------------------------: | :--------------------------------------------------------------- |
|                        Open Logtalk | Opens Logtalk in an integrated terminal                          |
|          Scan Dead Code (workspace) | Recursively scans the workspace directory for dead code          |
|  Generate Documentation (workspace) | Recursively generates documentation for the workspace directory  |
|       Generate Diagrams (workspace) | Recursively generates diagrams for the workspace directory       |
|             Run Testers (workspace) | Runs the `logtalk_tester` script on the workspace directory      |
|             Run Doclets (workspace) | Runs the `logtalk_doclet` script on the workspace directory      |

The output of the `logtalk_tester` and `logtalk_doclet` scripts is displayed in the "OUTPUT" pane "Logtalk Testers & Doclets" channel.

### Directory and source file commands

These commands can be triggered from editor/context and explorer/context menus via right click editor area or Logtalk files in explorer area respectively. In explorer context, the file name at which right click occurs will be passed in the command as argument. File specified commands can also be triggered from command palette so that active file name in the editor will be passed in the command.

|                  Command | Description                                                         |
| -----------------------: | :------------------------------------------------------------------ |
|           Load Directory | Loads the current directory loader file into the Logtalk process    |
|                Load File | Loads the active source file into the Logtalk process               |
|            Make - Reload | Reload files that have been modified since last loaded              |
|           Make - Optimal | Recompile loaded files in optimal mode                              |
|            Make - Normal | Recompile loaded files in normal mode                               |
|             Make - Debug | Recompile loaded files in debug mode                                |
|             Make - Check | Checks for code issues in the loaded files                          |
|          Make - Circular | Checks for code circular dependencies in the loaded files           |
|             Make - Clean | Deletes all intermediate files generated by the compiler            |
|            Make - Caches | Deletes the dynamic binding caches                                  |
|          Compute Metrics | Computes metrics for all files in the active source file directory  |
|                Run Tests | Loads the tester file under the active source file directory        |
|         Toggle Code Lens | Toggles code lens of test results and cyclomatic complexity         |
|               Run Doclet | Loads the doclet file under the active source file directory        |
|           Scan Dead Code | Scans the active source file directory for dead code                |
|   Generate Documentation | Generates documentation for the active source file directory        |
|        Generate Diagrams | Generates diagrams for the active source file directory             |
|         Open Parent File | Opens the file that loaded the active source file if any            |

The "Load Directory" command assumes that a `loader.lgt` or `loader.logtalk` file exists in the directory of the selected file.

The "Run Tests" command adds failed tests to the "PROBLEMS" pane.

### Code Navigation

Code navigation **experimental** features **require** the code to be loaded, typically by opening the project loader file and selecting the "Load File" menu or context menu item.
Additionally, code must be compiled with the `source_data` flag set to `on` (default) and the `context_switching_calls` set to `allow` (default).

#### Go to Declaration

Click in a predicate name and select the "Go to Declaration" menu or context menu item to go to the predicate scope directive.

#### Go to Definition

Click in a predicate name in a goal or `uses/2` directive and select the "Go to Definition" menu or context menu item to go to the first clause defining the predicate. Note that definitions may only be resolved at runtime (e.g. in a message to _self_ goal or when dynamic predicates are used). When a definition is not found, try in alternative to go to the declaration and then to the references.

#### Go to Type Definition

Entities (objects, protocols, and categories) are interpreted as types. Click in an entity name and select the "Go to Type Definition" menu or context menu item to go to the entity opening directive.

#### Go to References

Click in a predicate name in a scope directive, goal, or `uses/2` directive and select the "Go to References" or "Find All References" menu or context menu items. References are interpreted here as messages, super calls, and predicate calls. Note that recursive calls are not counted as references.

Click in an entity name in an entity opening directive to find references to it in other entity opening directives (i.e. entities in an implementing, importing, complementing, extending, instantiating, or specializing relation with the with the selected entity), `alias/2` directives, `uses/1-2` directives, and multifile predicate clauses. In the case of an object, this also finds explicit messages to the object. Note that you can go to an entity opening directive by clicking in an entity name and selecting the "Go to Type Definition" menu or context menu item.

#### Go to Implementations

Click in the middle of a predicate name in a scope directive and select the "Go to Implementations" or "Find All Implementations" menu or context menu items. Note that you can go to a predicate scope directive by clicking the predicate name in a goal and selecting the "Go to Declaration" menu or context menu item.

Click in a protocol name in its entity opening directive to find implementations of the protocol. Note that you can go to an entity opening directive by clicking in an entity name and selecting the "Go to Type Definition" menu or context menu item.

#### Go to Symbol in Editor...

Symbols include object, protocol, and category identifiers in entity opening directives plus predicate (and non-terminal) indicators in predicate scope directives. Note that VSCode doesn't support customization of symbol kind names and icons, thus forcing adapting the pre-defined names and icons. This feature doesn't require the code to be loaded. Assumes that a single predicate (or non-terminal) is declared per scope directive.

#### Go to Symbol in Workspace...

Symbols include object, protocol, and category identifiers in entity opening directives plus predicate (and non-terminal) indicators in predicate scope directives. Note that VSCode doesn't support customization of symbol kind names and icons, thus forcing adapting the pre-defined names and icons. This feature doesn't require the code to be loaded. Assumes that a single predicate (or non-terminal) is declared per scope directive.

#### Show Call Hierarchy

Click in the middle of a predicate name in a goal or in a clause head and select the "Show Call Hierarchy" context menu item to browse callers and callees of the selected predicate. Note that callers and callees that can only be resolved at runtime (e.g. in a message to _self_ goal or when dynamic predicates are used) may not be returned.

#### Show Type Hierarchy

Click in the middle of an entity name and select the "Show Type Hierarchy" context menu item to browse ancestors and descendants of the selected entity. Here, ancestor is interpreted as any entity from which the selected entity inherits and descendant is interpreted as any entity that inherits from the selected entity.

### Debugging support

When debugging in the integrated terminal using the `debugger` tool, the current clause (at leashed unification ports) is show in the active editor window.

Spy points, log points, and conditional breakpoints can be added and removed using the "Run" menu breakpoint items. Function breakpoints are interpreted as predicate (or non-terminal) spy points by entering a predicate indicator (or a non-terminal indicator) or as context spy points by entering a `(Sender, This, Self, Goal)` tuple. Inline breakpoints are interpreted as line numbers spy points (note that they can only be set for clause heads). VSCode hit count breakpoints are interpreted as clause head successful unification count expressions. VSCode "Run" menu "New Breakpoint" > "Triggered Breakpoint..." item is not supported (as VSCode doesn't currently make available the necessary data). But triggered breakpoints can be set as conditional breakpoints where the condition is a `Entity-Line` term. The `debugger` tool is automatically loaded when setting spy points using the "Run" menu breakpoint items or when running the "Make - Debug" command. See the documentation of the `debugger` tool for details.

Although VSCode support its, a breakpoint cannot be a combination of log point, conditional breakpoint, and hit count breakpoint. If you edit a breakpoint, you must keep its singular type.

Changes to spy points via user-typed queries in the integrated terminal are not reflected in the VSCode display of current breakpoints. A particular case is when, at a leashed port, you enter the `n` command to turn off debugging: a quick way to restore all the breakpoints still defined using the VSCode GUI is to select the "Run" menu "Disable All Breakpoints" followed by "Enable All Breakpoints".

### Hover contents

Hover contents is provided for built-in directives, built-in predicates, and built-in methods.

## Configuration

The user can configure settings via VSCode menu `Settings`. Entering `Logtalk` in the input box will show up Logtalk settings. Follows a description of all the settings in this extension with their default values (if any). On Windows, use forward slashes in settings that require paths. Also on Windows, PowerShell 7.3.x or later is required for settings that call scripts., On a POSIX system (e.g. macOS, Linux, or BSD), if you're running Logtalk from a clone of its git repo, you may need to add the `.sh` extension to all scripts in the settings.

### Logtalk home and user paths

    "logtalk.home.path": ""
    "logtalk.user.path": ""

No defaults (VSCode doesn't support using environment variables to define settings). Must be set to the `LOGTALKHOME` and `LOGTALKUSER` environment variable **absolute path** values. On Windows, also use forward slashes (e.g. `C:/Program Files (x86)/Logtalk`).

### Logtalk executable

    "logtalk.executable.path": "/usr/local/bin/logtalk"
    "logtalk.executable.arguments": [ ]

Logtalk executable or integration script plus its arguments. On POSIX systems (e.g. macOS, Linux, or BSD), the `logtalk` executable can be created by running the `logtalk_backend_select` script. In alternative, use the integration script you want to use. Absolute paths **must** be used. For example, assuming a POSIX system and using SWI-Prolog as the backend:

    "logtalk.executable.path": "/usr/local/bin/swilgt"
    "logtalk.executable.arguments": [ "-q" ]

On Windows systems, use the absolute path to the Prolog backend executable **and** then set the arguments to load Logtalk (look into the properties of the Logtalk integration shortcuts that are available from the Start Menu after installing Logtalk). For example (assuming the default Logtalk installation) and using SWI-Prolog as the backend:

    "logtalk.executable.path": "C:/Program Files/swipl/bin/swipl.exe"
    "logtalk.executable.arguments": [
        "-s",
        "C:/Program Files (x86)/Logtalk/integration/logtalk_swi.pl"
    ]

### Logtalk project testers

    "logtalk.tester.script": "/usr/local/bin/logtalk_tester"
    "logtalk.tester.arguments": [ ]

Automation script for running tests and its arguments. The arguments **must** included at least the Prolog backend. For example, assuming a POSIX system (e.g. macOS, Linux, or BSD) and using SWI-Prolog as the backend:

    "logtalk.tester.script": "/usr/local/bin/logtalk_tester"
    "logtalk.tester.arguments": [ "-p", "swi" ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation) and using SWI-Prolog as the backend:

    "logtalk.tester.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.tester.arguments": [
        "-file", "C:/Windows/logtalk_tester.ps1", "-p", "swi"
    ]

### Logtalk project doclets

    "logtalk.doclet.script": "/usr/local/bin/logtalk_doclet"
    "logtalk.doclet.arguments": [ ]

Automation script for running doclets and its arguments. The arguments **must** included at least the Prolog backend. For example, assuming a POSIX system (e.g. macOS, Linux, or BSD) and using SWI-Prolog as the backend:

    "logtalk.doclet.script": "/usr/local/bin/logtalk_doclet"
    "logtalk.doclet.arguments": [ "-p", "swi" ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation) and using SWI-Prolog as the backend:

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

The number of milliseconds to wait before running the scripts that convert `.xml` documentation files and `.dot` diagram files to final formats when running the `lgtdoc` and `diagrams` tools. This timeout is also used to wait for a file compilation to finish before adding any compiler and tool errors or warnings to the "PROBLEMS" pane and for waiting to answers from the Logtalk reflection API when using code navigation features. You may need to set a value larger than the default value if you're compiling big applications.

### Code metrics and test results code lens

    "logtalk.enableCodeLens": true

Enables displaying inline test results (including code coverage when collected) using code lens in both the test object and the tested entity source files opened in the editor. It also enables displaying inline entity cyclomatic complexity after computing code metrics. The tests and metrics data is persistent and can be updated by re-running tests and re-computing metrics (e.g. by simply clicking in the inline data). This setting can be toggled using the "Toggle Code Lens" command.

## Known Issues

Code issues detected when running the "Make - Check" or "Make - Circular" commands are displayed in the integrated terminal but not added to the "PROBLEMS" pane.

On Windows systems, the file paths on the "PROBLEMS" pane may not be relative to the workspace directory depending on the Prolog backend. This is a consequence of some backends "normalizing" file paths in a way that seem to break VSCode computing of the relative paths. E.g. paths are relative when using GNU Prolog but absolute when using SWI-Prolog or SICStus Prolog.

On Windows systems, some Prolog backends such as ECLiPSe and XSB are not usable due to file path representation issues. Also, using GNU Prolog requires the following setting:

    "terminal.integrated.env.windows": {
        "LINEDIT": "gui=no"
    }

If you're migrating from the old "VSC-Logtalk" extension, you may see duplicated context menu items even after uninstalling it. If that happens, delete any extension leftovers in the `%USERPROFILE%\.vscode\extensions` (for Windows) or `~/.vscode/extensions` (for Linux and macOS) directory.

### VSCode notable usability issues

VSCode provides a "Toggle Activate Breakpoints" button in the "Run and Debug" pane but doesn't generate an event that can be handled by extensions.

VSCode doesn't support disabling menu items that are not supported by language extensions (e.g. the "Run" menu "New Breakpoint" > "Triggered Breakpoint..." item).

When the "Run and Debug" pane is closed, selecting the "Run" menu "New Breakpoint > Function Breakpoint..." item doesn't open the pane to show the new breakpoint text insertion box.

VSCode triggers the "Go to Definition" computations if the cursor happens to be over some text when typing the command (macOS) or control (Windows, Linux) keys to type any keyboard command without waiting for or requiring cursor movement.

## Development

Developed and tested with **Logtalk 3.81.0** and **VSCode 1.90** on **macOS 14.4** and **Windows 10** with **Node 22**.

After running `npm install`, `npm run vsix:make` makes the `.vsix` file and `npm run vsix:install` installs it. Restart VSCode after installation.

See the [CHANGELOG.md](https://github.com/LogtalkDotOrg/logtalk-for-vscode/blob/master/CHANGELOG.md) file for the most recent changes. [Contributions](https://github.com/LogtalkDotOrg/logtalk-for-vscode/pulls) and [bug reports](https://github.com/LogtalkDotOrg/logtalk-for-vscode/issues) are most welcome.

## Acknowledgements

Due to Arthur's current unavailability and since-deprecated modules, this extension has been adopted by new maintainers.

### Arthur Wang (Original Author)

"The original author of this extension thanks Professor Paulo Moura who is the author of Logtalk for his patient help and support. Syntax highlighting, some snippets, and some commands are integrated from his distro of Logtalk."

## License

This extension is published under the [MIT](http://www.opensource.org/licenses/mit-license.php) license.
