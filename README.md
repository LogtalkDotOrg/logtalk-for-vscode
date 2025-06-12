# Logtalk for VSCode

A VSCode extension that provides language support for Logtalk. Forked from the [original plugin](https://github.com/arthwang/vsc-logtalk) by Arthur Wang.

Requires Logtalk 3.87.0 or later and a supported [Prolog backend](https://logtalk.org/download.html#requirements).

🙏 Sponsored by [Permion](https://permion.ai/) and [GitHub Sponsors](https://github.com/sponsors/pmoura).

---

[Installation](#installation) | [Features](#features) | [Configuration](#configuration) | [Known Issues](#known-issues) | [Development](#development) | [Acknowledgements](#acknowledgements) | [Licence](#license)

---

## Installation

This extension can be installed directly from [VSCode](https://code.visualstudio.com/), from its [Marketplace](https://marketplace.visualstudio.com/items?itemName=LogtalkDotOrg.logtalk-for-vscode), or by [downloading](https://github.com/LogtalkDotOrg/logtalk-for-vscode/releases/latest) its `.vsix` file and selecting the "Extensions: Install from VSIX..." command from the command palette. It can also be installed directly from [VSCodium](https://vscodium.com/) or by downloading its `.vsix` file from its [Marketplace](https://marketplace.visualstudio.com/items?itemName=LogtalkDotOrg.logtalk-for-vscode). See [Development](#development) for details on how to generate the extension `.vsix` file for a git version.

This extension **must** be configured before it can be used. Notably, the following settings are required:

- Logtalk home path
- Logtalk user path
- Prolog backend

For details, see [Configuration](#configuration). This extension includes a walkthrough that can be accessed from the VSCode "Welcome" page after installing the extension. It can also be accessed from the command palette using the command "Welcome: Open Walkthrough...". The walkthrough guides you in configuring the extension and checking that basic functionality is working.

## Features

- [Syntax highlighting](#syntax-highlighting)
- [Snippets](#indentation-snippets-and-auto-completion)
- [Linter](#linter)
- [Commands](#commands)
- [Code Navigation](#code-navigation)
- [Debugging support](#debugging-support)
- [Hover contents](#hover-contents)
- [Chat Participant](#chat-participant)

### Syntax highlighting

- Full syntax highlight for all Logtalk built-in control constructs, directives, methods, and predicates
- Full syntax highlight for all ISO Prolog standard built-in control constructs, directives, and predicates

### Indentation, snippets, and auto-completion

- Indentation after new line
- Built-in directive, method, and predicate template auto-completion

Note: Relations between entities use choice snippets: `orel` triggers object relation choices and `crel` for category. There is only one relation between protocols, 'extends', so `ext` will trigger the snippet.

The snippets for entity opening directives and predicate scope directives are all triggered by natural prefix, i.e. `:- public` triggers `:- public()` directive. You don't need to type all characters to show up the suggestion list.

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
- Errors/warnings when compiling source files can also be navigated from the Logtalk terminal via Ctrl+click (Windows, Linux, ...) or Cmd+click (macOS).

### Commands

Most commands, notably those that run the developer tools, **require** the code to be loaded, typically by opening the project loader file and selecting the "Load File" menu or context menu item.

#### Project commands

Project (workspace) commands can be triggered from the command palette by typing 'Logtalk' in the input box to pop up the list of all commands of this extension. In this case, the commands resort to the first workspace root folder in the case of [multi-root workspaces](https://code.visualstudio.com/docs/editor/workspaces). Alternatively, these commands can be triggered from the explorer/context menu via right-click (Ctrl+click on Windows and Linux, Cmd+click on macOS) in a Logtalk source file in the Explorer.

|                         Command | Description                                                        |
| ------------------------------: | :----------------------------------------------------------------- |
|                    Open Logtalk | Opens Logtalk in an integrated terminal                            |
|                  Create Project | Creates a new project with renamed copies of the sample files      |
|                    Load Project | Loads the loader file found in the workspace root folder           |
|          Scan Project Dead Code | Recursively scans the workspace root folder for dead code          |
|  Generate Project Documentation | Recursively generates documentation for the workspace root folder  |
|       Generate Project Diagrams | Recursively generates diagrams for the workspace root folder       |
|             Run Project Testers | Runs the `logtalk_tester` script from the workspace root folder    |
|             Run Project Doclets | Runs the `logtalk_doclet` script from the workspace root folder    |

The "Create Project" command is usually called from the command palette. It asks for the folder where to copy the renamed sample files.

The "Load Project" command looks for a `loader.lgt` or `loader.logtalk` file in the workspace root folder, printing a warning if no loader file is found.

The "Scan Project Dead Code", "Generate Project Documentation", and "Generate Project Diagrams" commands require that the project code is already loaded.

The output of the "Run Project Testers" and "Run Project Doclets" commands is displayed in the "OUTPUT" pane "Logtalk Testers & Doclets" channel.

There are also "Test Documentation Cache" add "Refresh Documentation Cache" commands that can be used for testing and refreshing the documentation cache used by the Logtalk chat participant. These commands can only be called from the command palette.

#### Directory and source file commands

These commands can be triggered from the editor/context menu via right-click in the editor area. These commands can also be triggered from the command palette assuming there's an active editor window.

|                 Command | Description                                                         |
| ----------------------: | :------------------------------------------------------------------ |
|          Load Directory | Loads the current directory loader file into the Logtalk process    |
|               Load File | Loads the active source file into the Logtalk process               |
|         Compute Metrics | Computes metrics for all files in the active source file directory  |
|               Run Tests | Loads the tester file under the active source file directory        |
|        Toggle Code Lens | Toggles code lens of test results and cyclomatic complexity         |
|              Run Doclet | Loads the doclet file under the active source file directory        |
|          Scan Dead Code | Scans the active source file directory for dead code                |
|  Generate Documentation | Generates documentation for the active source file directory        |
|       Generate Diagrams | Generates diagrams for the active source file directory             |
|        Open Parent File | Opens the file that loaded the active source file if any            |

The "Load Directory" command looks for a `loader.lgt` or `loader.logtalk` file in the directory of the selected file, printing a warning if not found. The "Run Tests" command looks for a `tester.lgt` or `tester.logtalk` file in the directory of the selected file, printing a warning if not found. The "Run Doclet" command looks for a `doclet.lgt` or `doclet.logtalk` file in the directory of the selected file, printing a warning if not found.

The "Run Tests" command adds failed tests to the "PROBLEMS" pane.

#### Jupyter commands

These commands allow opening Logtalk source files and Markdown files as Jupyter notebooks, plus pairing and syncing notebook representations.

|                               Command | Description                                                           |
| ------------------------------------: | :-------------------------------------------------------------------- |
|                    Open as a Notebook | Opens the selected source file or Markdown file as a notebook         |
|             Open as a Paired Notebook | Opens the selected source file or Markdown file as a paired notebook  |
|  Sync paired Notebook Representations | Sync the paired notebook and its text representation                  |

These commands are only available when Jupytext 1.16.7 or a later version is installed. See also the "logtalk.jupytext.path" setting below.

#### Integrated terminal process commands

These commands don't depend on the directory of a file selected by right-clicking in a workspace file or in an active editor window but only on the Logtalk process running in the integrated terminal. They can be triggered from the editor/context menu via right-click in the editor area or from the command palette.

|          Command | Description                                                |
| ---------------: | :--------------------------------------------------------- |
|    Make - Reload | Reload files that have been modified since last loaded     |
|   Make - Optimal | Recompile loaded files in optimal mode                     |
|    Make - Normal | Recompile loaded files in normal mode                      |
|     Make - Debug | Recompile loaded files in debug mode                       |
|     Make - Check | Checks for code issues in the loaded files                 |
|  Make - Circular | Checks for code circular dependencies in the loaded files  |
|     Make - Clean | Deletes all intermediate files generated by the compiler   |
|    Make - Caches | Deletes the dynamic binding caches                         |

#### Extension logging commands

These commands are only available from the command palette. They are meant for helping with debugging and troubleshooting the extension.

|                      Command | Description                            |
| ---------------------------: | :------------------------------------- |
|  Set Extension Logging Level | Interactive log level configuration    |
|  Show Extension Log          | Display the extension's output channel |

### Code Navigation

Code navigation features **require** the code to be loaded, typically by using the "Load Project" command or by opening the project loader file and using the "Load File" command from the editor/context menu. Additionally, code must be compiled with the `source_data` flag set to `on` (default) and the `context_switching_calls` set to `allow` (default).

For all code navigation features except "Go to Definition", you can in alternative simply right-click in a (predicate or entity) name without first selecting it. See below the section on "VSCode notable usability issues" for an explanation of the exception.

#### Go to Declaration

Double-click to select a predicate name and then right-click and select the "Go to Declaration" menu or context menu item to go to the predicate scope directive.

#### Go to Definition

Double-click to select a predicate name in a goal or predicate directive and then right-click and select the "Go to Definition" menu or context menu item to go to the first clause defining the predicate. Note that definitions may only be resolved at runtime (e.g., in a message to _self_ goal or when dynamic predicates are used). When a definition is not found, try in alternative to go to the declaration and then to the references.

#### Go to Type Definition

Entities (objects, protocols, and categories) are interpreted as types. Double-click to select an entity name and then right-click and select the "Go to Type Definition" menu or context menu item to go to the entity opening directive.

#### Go to References

Double-click to select a predicate name in a scope directive, `uses/2` directive, fact, rule head, or goal and then right-click and select the "Go to References" or "Find All References" menu or context menu items. References are interpreted here as messages, super calls, predicate calls, and predicate declarations. For dynamic predicates, references include asserting or retracting clauses for them. Note that recursive calls and predicate definitions are not counted as references.

Double-click to select an entity name in an entity opening directive to find references to it in other entity opening directives (i.e., entities in an implementing, importing, complementing, extending, instantiating, or specializing relation with the selected entity), `alias/2` directives, `uses/1-2` directives, and multifile predicate clauses. In the case of an object, this also finds explicit messages to the object. Note that you can go to an entity opening directive by double-clicking to select an entity name and then right-clicking and selecting the "Go to Type Definition" menu or context menu item.

#### Go to Implementations

Double-click to select a predicate name in a scope directive and then right-click and select the "Go to Implementations" or "Find All Implementations" menu or context menu items. Note that you can go to a predicate scope directive by selecting the predicate name in a goal and right-clicking and selecting the "Go to Declaration" menu or context menu item.

Double-click to select a protocol name in its entity opening directive to find implementations of the protocol. Note that you can go to an entity opening directive by clicking in an entity name and then right-clicking and selecting the "Go to Type Definition" menu or context menu item.

#### Go to Symbol in Editor...

Symbols include object, protocol, and category identifiers in entity opening directives, plus predicate (and non-terminal) indicators in predicate scope directives. Note that VSCode doesn't support customization of symbol kind names and icons, thus forcing adapting the pre-defined names and icons. This feature doesn't require the code to be loaded. Assumes that a single predicate (or non-terminal) is declared per scope directive.

#### Go to Symbol in Workspace...

Symbols include object, protocol, and category identifiers in entity opening directives, plus predicate (and non-terminal) indicators in predicate scope directives. Note that VSCode doesn't support customization of symbol kind names and icons, thus forcing adapting the pre-defined names and icons. This feature doesn't require the code to be loaded. Assumes that a single predicate (or non-terminal) is declared per scope directive.

#### Show Call Hierarchy

Double-click to select a predicate name in a goal or in a clause head and then right-click and select the "Show Call Hierarchy" context menu item to browse callers and callees of the selected predicate. Note that callers and callees that can only be resolved at runtime (e.g., in a message to _self_ goal or when dynamic predicates are used) may not be returned.

#### Show Type Hierarchy

Double-click to select an entity name and then right-click and select the "Show Type Hierarchy" context menu item to browse ancestors and descendants of the selected entity. Here, ancestor is interpreted as any entity from which the selected entity inherits, and descendant is interpreted as any entity that inherits from the selected entity.

### Debugging support

When debugging in the integrated terminal using the `debugger` tool, the current clause (at leashed unification ports) is shown in the active editor window.

Spy points, log points, and conditional breakpoints can be added and removed using the "Run" menu breakpoint items. Function breakpoints are interpreted as predicate (or non-terminal) spy points by entering a predicate indicator (or a non-terminal indicator) or as context spy points by entering a `(Sender, This, Self, Goal)` tuple. Inline breakpoints are interpreted as line number spy points (note that they can only be set for clause heads). VSCode hit count breakpoints are interpreted as clause head successful unification count expressions. VSCode "Run" menu "New Breakpoint" > "Triggered Breakpoint..." item is not supported (as VSCode doesn't currently make available the necessary data). But triggered breakpoints can be set as conditional breakpoints where the condition is a `Entity-Line` term. The `debugger` tool is automatically loaded when setting spy points using the "Run" menu breakpoint items or when running the "Make - Debug" command. See the documentation of the `debugger` tool for details.

Although VSCode supports it, a breakpoint cannot be a combination of log point, conditional breakpoint, and hit count breakpoint. If you edit a breakpoint, you must keep its singular type.

Changes to spy points via user-typed queries in the integrated terminal are not reflected in the VSCode display of current breakpoints. A particular case is when, at a leashed port, you enter the `n` command to turn off debugging: a quick way to restore all the breakpoints still defined using the VSCode GUI is to select the "Run" menu "Disable All Breakpoints" followed by "Enable All Breakpoints".

### Hover contents

Hover contents is provided for built-in directives, built-in predicates, and built-in methods.

### Chat Participant

**Experimental.** The `@logtalk` chat participant provides intelligent assistance for Logtalk programming questions using VSCode's integrated Chat view. It combines documentation search with LLM-powered responses to help you learn and use Logtalk effectively. It uses the currently selected language model from the Copilot chat interface. It works best with recent models. Be aware that LLMs can and will generate incorrect or nonsensical answers.

**Requirements:**
- VSCode 1.90.0 or later
- GitHub Copilot extension installed and authenticated
- Configured Logtalk installation (for documentation access)
- [Context7 MCP server](https://github.com/upstash/context7) installed and running (for examples and documentation; optional)

**Usage:**

Type `@logtalk` in the Chat view followed by your question. The chat participant supports several slash commands for specific types of queries:

|           Command | Description                                                    |
| ----------------: | :------------------------------------------------------------- |
|        `/handbook` | Search the Logtalk Handbook documentation                     |
|            `/apis` | Search the Logtalk APIs documentation                         |
|        `/examples` | Get help with Logtalk code examples and patterns              |

The slash commands work best with keywords. For example, `/examples threaded engines` is better than `/examples How to use multi-threading with engines`.

**Examples:**

- `@logtalk How do I define a simple object?`
- `@logtalk /handbook object relations`
- `@logtalk /apis length/2`
- `@logtalk /examples recursive predicates`

**Features:**

- **Intelligent Documentation Search**: Automatically searches the official Logtalk Handbook and APIs documentation
- **RAG Integration**: Combines documentation context with AI responses for accurate, up-to-date information
- **Version-Aware Caching**: Documentation cache automatically updates when your Logtalk version changes
- **Contextual Follow-ups**: Provides relevant follow-up suggestions based on your queries
- **Graceful Fallbacks**: Works even when the language model is unavailable by showing documentation search results

The chat participant automatically detects your Logtalk version from `$LOGTALKHOME/VERSION.txt` and fetches the corresponding documentation from the Logtalk website. Documentation is cached locally and only refreshed when the version changes, ensuring fast responses while staying current.

## Configuration

The user can configure settings via the VSCode menu `Settings`. Entering `Logtalk` in the input box will show the Logtalk settings. Follows a description of all the settings in this extension with their default values (if any). On Windows, PowerShell 7.3.x or later must also be installed.

Settings are divided between _required_ and _optional_ settings. If you're migrating from an old version of this extension, you may need to delete the old settings (from the `settings.json` file) if you want to use only the defaults provided by the required settings.

### Required settings

#### Logtalk home and user paths

    "logtalk.home.path": ""
    "logtalk.user.path": ""

No defaults (VSCode doesn't support using environment variables to define settings). Must be set to the `LOGTALKHOME` and `LOGTALKUSER` environment variable **absolute path** values. On Windows, also use forward slashes (e.g., `C:/Program Files (x86)/Logtalk`).

#### Prolog backend

    "logtalk.backend": ""

No default. Possible values are `b`, `ciao`, `cx`, `eclipse`, `gnu`, `ji`, `sicstus`, `swi`, `tau`, `trealla`, `xsb`, `xvm`, and `yap`. Ensure that the backend you want to use is installed.

### Optional settings

In most cases, the required settings are enough for full extension functionality. But they assume default installations for Logtalk and the Prolog backends. On Windows, they also assume the default installation of PowerShell 7. When that's not the case, the optional settings listed below allow **overriding** the defaults that are derived from the required settings.

On Windows, use forward slashes in settings that require paths. Use the `where.exe` command to find the absolute path for the required scripts.

On a POSIX system (e.g., macOS or Linux), use the `which` command to find the absolute path for the integration and tool scripts. If you're running Logtalk from a clone of its git repo, you may need to add the `.sh` extension to all scripts in the settings.

For settings that specify scripts, see their [man pages](https://logtalk.org/documentation.html#man-pages) for their available options.

#### Logtalk executable

    "logtalk.executable.path": ""
    "logtalk.executable.arguments": [ ]

Absolute path to the Logtalk executable or integration script and its arguments. On POSIX systems (e.g., macOS or Linux), the `logtalk` executable can be created by running the `logtalk_backend_select` script. In alternative, set the integration script you want to use. For example, assuming a POSIX system, using SWI-Prolog as the backend, with the integration scripts installed at `/usr/local/bin`:

    "logtalk.executable.path": "/usr/local/bin/swilgt"
    "logtalk.executable.arguments": [ "-q" ]

On Windows systems, use the absolute path to the PowerShell 7 executable and set the arguments to load the Logtalk integration script. For example (assuming the default Logtalk installation) and using SWI-Prolog as the backend:

    "logtalk.executable.path": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.executable.arguments": [ "-file", "C:/Windows/swilgt.ps1" ]

#### Logtalk project testers

    "logtalk.tester.script": ""
    "logtalk.tester.arguments": [ ]

Absolute path to the `logtalk_tester` automation script and its arguments, which **must** include at least the `-p` option specifying the Prolog backend. For example, assuming a POSIX system (e.g., macOS or Linux), using SWI-Prolog as the backend, with the scripts installed at `/usr/local/bin`:

    "logtalk.tester.script": "/usr/local/bin/logtalk_tester"
    "logtalk.tester.arguments": [ "-p", "swi" ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation) and using SWI-Prolog as the backend:

    "logtalk.tester.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.tester.arguments": [
        "-file", "C:/Windows/logtalk_tester.ps1", "-p", "swi"
    ]

#### Logtalk project doclets

    "logtalk.doclet.script": ""
    "logtalk.doclet.arguments": [ ]

Absolute path to the `logtalk_doclet` automation script and its arguments, which **must** include at least the `-p` option specifying the Prolog backend. For example, assuming a POSIX system (e.g., macOS or Linux), using SWI-Prolog as the backend, with the integration scripts installed at `/usr/local/bin`:

    "logtalk.doclet.script": "/usr/local/bin/logtalk_doclet"
    "logtalk.doclet.arguments": [ "-p", "swi" ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation) and using SWI-Prolog as the backend:

    "logtalk.doclet.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.doclet.arguments": [
        "-file", "C:/Windows/logtalk_doclet.ps1", "-p", "swi"
    ]

#### Logtalk project documentation

    "logtalk.documentation.script": ""
    "logtalk.documentation.arguments": [ ]

Absolute path to the documentation script and its arguments for converting the XML files generated by the Logtalk `lgtdoc` tool to their final format. For example, assuming a POSIX system (e.g., macOS or Linux) with the scripts available from `/usr/local/bin`:

    "logtalk.documentation.script": "/usr/local/bin/lgt2html"
    "logtalk.documentation.arguments": [ "-t", "APIs documentation" ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation):

    "logtalk.documentation.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.documentation.arguments": [
        "-file", "C:/Windows/lgt2html.ps1", "-t", "APIs documentation"
    ]

#### Logtalk project diagrams

    "logtalk.diagrams.script": ""
    "logtalk.diagrams.arguments": [ ]

Absolute path to the script for converting the `.d2` and `.dot` files generated (by default) by the Logtalk `diagrams` tool to their final format (by default, SVG). For example, assuming a POSIX system (e.g., macOS or Linux) with the scripts available from `/usr/local/bin`:

    "logtalk.documentation.script": "/usr/local/bin/lgt2svg"
    "logtalk.documentation.arguments": [ ]

On Windows systems, these settings must be set differently. For example (assuming the default Logtalk installation):

    "logtalk.diagrams.script": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.diagrams.arguments": [ "-file", "C:/Windows/lgt2svg.ps1" ]

Diagrams script for converting the `.d2` and `.dot` files generated by the Logtalk `diagrams` tool. Requires d2 and Graphviz.

#### Timeout for waiting to run conversion scripts

    "logtalk.scripts.timeout": 480000

The number of milliseconds to wait before running the scripts that convert `.xml` documentation files and `.dot` diagram files to final formats when running the `lgtdoc` and `diagrams` tools. This timeout is also used to wait for a file compilation to finish before adding any compiler and tool errors or warnings to the "PROBLEMS" pane and for waiting for answers from the Logtalk reflection API when using code navigation features. You may need to set a value larger than the default value if you're compiling big applications.

#### Code metrics and test results code lens

    "logtalk.enableCodeLens": true

Enables displaying inline test results (including code coverage when collected) using code lens in both the test object and the tested entity source files opened in the editor. It also enables displaying inline entity cyclomatic complexity after computing code metrics. The tests and metrics data is persistent and can be updated by re-running tests and re-computing metrics (e.g., by simply clicking in the inline data). This setting can be toggled using the "Toggle Code Lens" command.

#### Jupytext path

    "logtalk.jupytext.path": "python3 -m jupytext"
	
Absolute path to the `jupytext` command if not available from the system path. Alternatively, it can also be a call to a Python interpreter run of the `jupytext` module (the default value). Jupytext 1.16.7 or later version required (available from [PyPI](https://pypi.org/project/jupytext/) and [Conda](https://anaconda.org/conda-forge/jupytext)).

## Known Issues

Code issues detected when running the "Make - Check" or "Make - Circular" commands are displayed in the integrated terminal but not added to the "PROBLEMS" pane. But when an issue is reported in a source file, you can right-click (Ctrl+click on Windows and Linux, Cmd+click on macOS) in the file path to navigate to the issue location.

On Windows systems, the file paths on the "PROBLEMS" pane may not be relative to the workspace directory depending on the Prolog backend. This is a consequence of some backends "normalizing" file paths in a way that breaks VSCode computing of the relative paths. E.g., paths are relative when using GNU Prolog but absolute when using SWI-Prolog or SICStus Prolog.

On Windows systems, some Prolog backends such as ECLiPSe and XSB are not usable due to file path representation issues.

If you're migrating from the old "VSC-Logtalk" extension, you may see duplicated context menu items even after uninstalling it. If that happens, delete any extension leftovers in the `%USERPROFILE%\.vscode\extensions` (for Windows) or `~/.vscode/extensions` (for Linux and macOS) directory.

### VSCode notable usability issues

VSCode provides a "Toggle Activate Breakpoints" button in the "Run and Debug" pane but doesn't generate an event that can be handled by extensions.

VSCode doesn't support disabling menu items that are not supported by language extensions (e.g., the "Run" menu "New Breakpoint" > "Triggered Breakpoint..." item).

When the "Run and Debug" pane is closed, selecting the "Run" menu "New Breakpoint > Function Breakpoint..." item doesn't open the pane to show the new breakpoint text insertion box.

VSCode triggers the "Go to Definition" computations if the cursor happens to be over some text pressing the command (macOS) or control (Windows, Linux) keys to type any keyboard command shortcut without waiting for or requiring cursor movement. It also doesn't allow disabling this "feature" or using the command or control keys as a keyboard shortcut. To avoid automatically creating a Logtalk terminal session if none exists (as required by the code navigation features), you must first select the text to go to a definition.

## Development

Developed and tested with **Logtalk 3.88.0** and **VSCode 1.96** on **macOS 14.7** and **Windows 10** with **Node 22**.

After running `npm install`, `npm run vsix:make` makes the `.vsix` file and `npm run vsix:install` installs it. Restart VSCode after installation.

See the [CHANGELOG.md](https://github.com/LogtalkDotOrg/logtalk-for-vscode/blob/master/CHANGELOG.md) file for the most recent changes. [Contributions](https://github.com/LogtalkDotOrg/logtalk-for-vscode/pulls) and [bug reports](https://github.com/LogtalkDotOrg/logtalk-for-vscode/issues) are most welcome.

## Acknowledgements

Due to Arthur's current unavailability and since-deprecated modules, this extension has been adopted by new maintainers.

### Arthur Wang (Original Author)

"The original author of this extension thanks Professor Paulo Moura, who is the author of Logtalk, for his patient help and support. Syntax highlighting, some snippets, and some commands are integrated from his distro of Logtalk."

## License

This extension is published under the [MIT](http://www.opensource.org/licenses/mit-license.php) license.
