# Logtalk for VSCode

A VSCode extension that provides language support for Logtalk. Forked from the [original plugin](https://github.com/arthwang/vsc-logtalk) by Arthur Wang.

Requires Logtalk 3.94.0 or later and a supported [Prolog backend](https://logtalk.org/download.html#requirements). As this extension uses supporting code that's part of the Logtalk distribution, use of the latest Logtalk version is strongly recommended.

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
- [Formatting support](#formatting-support)
- [Linter](#linter)
- [Commands](#commands)
- [Code Navigation](#code-navigation)
- [Refactoring support](#refactoring-support)
- [Debugging support](#debugging-support)
- [Testing support](#testing-support)
- [Profiling support](#profiling-support)
- [Hover contents](#hover-contents)
- [Chat Participant](#chat-participant)
- [Virtual workspaces support](#virtual-workspaces-support)

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

### Formatting support

Experimental support for the "Format Document" and "Format Selection" commands is provided. The formatting rules follow the Logtalk [coding style guidelines](https://logtalk.org/coding_style_guidelines.html). Currently, the following formatting rules are supported:

- Space-to-tab conversion is performed using the editor's tab size setting
- Mixed indentation is handled by converting all spaces to tabs based on the tab size setting
- Consecutive empty lines are collapsed into a single empty line
- Entity opening and closing directives are formatted to start at column 0 with empty lines before and after
- Multiple entities in the same file are separated by two or more empty lines
- Entity opening directives are formatted to use multi-line layout when there are multiple relations
- Content inside entity opening and closing directives is indented by one tab
- Directives with list arguments are formatted to use multi-line syntax (depending on the `editor.rulers` and `editor.tabSize` settings)
- Documentation directives key values that are lists of pairs are formatted to use multi-line syntax (depending on the `editor.rulers` and `editor.tabSize` settings)
- Documentation directives key values that are lists of non-pair elements are formatted to use either single- or multi-line syntax (depending on the `editor.rulers` and `editor.tabSize` settings)
- An empty line is added if missing between declarations of different predicates/non-terminals
- An empty line is added if missing between definitions of different predicates/non-terminals
- A space is added if missing after the neck operator (`:-`) in directives
- A space is added if missing before the neck operator (`:-` or `-->`) in predicate/non-terminal rules
- Any comment or goal after the neck operator (`:-` or `-->`) is moved to the next line and indented
- Conditional compilation blocks are formatted by aligning conditional compilation directives according to their nesting level
- Line comments are indented if they start at character zero but are not followed by indented content
- Block comments content are indented when the comment delimiters are on separate lines; otherwise, the full block comment is indented

You can verify the changes before saving them using the "File: Compare Active File with Saved" command, which also allow selectively undoing formatting changes.

### Linter

- Errors/warnings when compiling source files are added to the "PROBLEMS" pane.
- Errors/warnings when compiling source files can also be navigated from the Logtalk terminal via Ctrl+click (Windows, Linux, ...) or Cmd+click (macOS).

Quick fixes are provided for some errors and warnings. When applying quick fixes, notably those that delete and insert code, the _positions_ of the warnings and errors later in the file may not be updated, thus preventing further quick fixes to be applied or applied correctly. In this case, save your changes and re-run the linter by using the "Make - Reload" command (note that this command can be called automatically when saving a file using the `logtalk.make.onSave` setting).

### Commands

Most commands, notably those that run the developer tools, **require** the code to be loaded, typically by opening the project loader file and selecting the "Load File" menu or context menu item. In the command palette and context menus, all commands have a "Logtalk:" prefix.

#### Project commands

Project (workspace) commands can be triggered from the command palette by typing 'Logtalk' in the input box to pop up the list of all commands of this extension. In this case, the commands resort to the first workspace root folder in the case of [multi-root workspaces](https://code.visualstudio.com/docs/editor/workspaces). Alternatively, these commands can be triggered from the explorer/context menu via right-click (Ctrl+click on Windows and Linux, Cmd+click on macOS) in a Logtalk source file in the Explorer.

|                         Command | Description                                                        |
| ------------------------------: | :----------------------------------------------------------------- |
|                  Create Project | Creates a new project with renamed copies of the sample files      |
|                    Load Project | Loads the loader file found in the workspace root folder           |
|                    Open Logtalk | Opens Logtalk in an integrated terminal                            |
|                            Make | Sub-menu with available make targets                               |
|          Scan Project Dead Code | Recursively scans the workspace root folder for dead code          |
|         Compute Project Metrics | Recursively computes metrics for the workspace root folder         |
|                       Profiling | Sub-menu with code profiling commands                              |
|  Generate Project Documentation | Recursively generates documentation for the workspace root folder  |
|       Generate Project Diagrams | Recursively generates diagrams for the workspace root folder       |
|             Run Project Testers | Runs the `logtalk_tester` script from the workspace root folder    |
|             Run Project Doclets | Runs the `logtalk_doclet` script from the workspace root folder    |
|                         Jupyter | Sub-menu with Jupyter commands                                     |

The "Create Project" command is usually called from the command palette. It asks for the folder where to copy the renamed sample files.

The "Load Project" command looks for a `loader.lgt` or `loader.logtalk` file in the workspace root folder, printing a warning if no loader file is found.

The "Scan Project Dead Code", "Compute Project Metrics", "Generate Project Documentation", and "Generate Project Diagrams" commands require that the project code is already loaded. Quick fixes are provided for some of the documentation and dead code linter warnings.

The output of the "Run Project Testers" and "Run Project Doclets" commands is displayed in the "OUTPUT" pane "Logtalk Testers & Doclets" channel.

There are also "Test Documentation Cache" add "Refresh Documentation Cache" commands that can be used for testing and refreshing the documentation cache used by the Logtalk chat participant. These commands can only be called from the command palette.

The output of the "Generate Project Documentation" and "Generate Project Diagrams" commands assume that the documentation and the diagrams will be browsed locally in VSCode (with the entry point being the main diagram, which can be opened using the "Open SVG in Viewer" command). To generate documentation and diagrams for publication, define a _doclet_ and run it using the "Run Project Doclets" command.

#### Directory and source file commands

These commands can be triggered from the editor/context menu via right-click in the editor area. These commands can also be triggered from the command palette assuming there's an active editor window.

|                 Command | Description                                                                      |
| ----------------------: | :------------------------------------------------------------------------------- |
|          Load Directory | Loads the current directory loader file into the Logtalk process                 |
|               Load File | Loads the active source file into the Logtalk process                            |
|        Open Parent File | Opens the file that loaded the active source file if any                         |
|                    Make | Sub-menu with available make targets                                             |
|          Scan Dead Code | Scans the active source file directory for dead code                             |
|         Compute Metrics | Computes metrics for all files in the active source file directory               |
|               Profiling | Sub-menu with code profiling commands                                            |
|  Generate Documentation | Generates documentation for the active source file directory                     |
|       Generate Diagrams | Generates diagrams for the active source file directory                          |
|               Run Tests | Loads the tester file under the active source file directory                     |
| Run Tests with Coverage | Loads the tester file under the active source file directory and report coverage |
|              Run Doclet | Loads the doclet file under the active source file directory                     |
|                 Jupyter | Sub-menu with Jupyter commands                                                   |
|        Toggle Code Lens | Toggles code lens of test results and cyclomatic complexity                      |

The "Load Directory" command looks for a `loader.lgt` or `loader.logtalk` file in the directory of the selected file, printing a warning if not found. The "Run Tests" command looks for a `tester.lgt` or `tester.logtalk` file in the directory of the selected file, printing a warning if not found. The "Run Doclet" command looks for a `doclet.lgt` or `doclet.logtalk` file in the directory of the selected file, printing a warning if not found.

The "Run Tests" and "Run Tests with Coverage" commands adds failed tests to the "PROBLEMS" pane. Quick fixes are provided for some test definition warnings.

The "Generate Documentation" and "Scan Dead Code" commands add linter warnings to the "PROBLEMS" pane. Quick fixes are provided for some of the warnings.

The output of the "Generate Documentation" and "Generate Diagrams" commands assume that the documentation and the diagrams will be browsed locally in VSCode (with the entry point being the main diagram, which can be opened using the "Logtalk: Open SVG in Viewer" command). To generate documentation and diagrams for publication, define a _doclet_ and run it using the "Run Doclet" command.

#### Jupyter commands

These commands are available from the "Jupyter" sub-menu and allow opening Logtalk source files and Markdown files as Jupyter notebooks, plus pairing and syncing notebook representations. They can be triggered from the explorer and editor context menus via right-click in the editor area or from the command palette.

|                               Command | Description                                                           |
| ------------------------------------: | :-------------------------------------------------------------------- |
|                    Open as a Notebook | Opens the selected source file or Markdown file as a notebook         |
|             Open as a Paired Notebook | Opens the selected source file or Markdown file as a paired notebook  |
|  Sync paired Notebook Representations | Sync the paired notebook and its text representation                  |

These commands are only available when Jupytext 1.16.7 or a later version is installed. See also the "logtalk.jupytext.path" setting below.

#### Make commands

These commands are available from the "Make" sub-menu. They can be triggered from the explorer and editor context menus via right-click in the editor area or from the command palette.

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

#### Profiling commands

These commands are available from the "Profiling" sub-menu. They can be triggered from the explorer and editor context menus via right-click in the editor area or from the command palette.

|          Command | Description                                      |
| --------------------: | :------------------------------------------ |
|      Toggle Profiling | Toggles profiling on/off                    |
|   Show Profiling Data | Show profiling data in a webview            |
|  Reset Profiling Data | Reset profiling data and close the webview  |

The profiling webview allows navigating to the source file location of entities, predicates, and clauses.

#### Diagram commands

Right-click on a Logtalk diagram SVG file in the Explorer and select the "Open SVG in Viewer" context menu item to open the selected file in a webview. This webview provides navigation and link handling with zoom and reload controls. Links to other SVG files and HTML documentation files open in the same viewer. This assumes that the commands that generate the diagrams and documentation were used with their default output directories.

#### Extension logging commands

These commands are only available from the command palette. They are meant for helping with debugging and troubleshooting the extension.

|                      Command | Description                            |
| ---------------------------: | :------------------------------------- |
|  Set Extension Logging Level | Interactive log level configuration    |
|  Show Extension Log          | Display the extension's output channel |

### Code Navigation

Code navigation features **require** the code to be loaded, typically by using the "Load Project" command or by opening the project loader file and using the "Load File" command from the editor/context menu. Additionally, code must be compiled with the `source_data` flag set to `on` (default) and the `context_switching_calls` set to `allow` (default).

#### Go to Declaration

Right-click on a predicate (or non-terminal) name and select the "Go to Declaration" context menu item to go to the predicate (or non-terminal) scope directive.

#### Go to Definition

Right-click on a predicate (or non-terminal) name in a goal or predicate directive and select the "Go to Definition" context menu item to go to the first clause defining the predicate. Note that some definitions may only be resolved at runtime (e.g., in a message to _self_ goal or when dynamic predicates are used). When a definition is not found, try in alternative to go to the declaration and then to the implementations.

#### Go to Type Definition

Entities (objects, protocols, and categories) are interpreted as types. Right-click on an entity name and select the "Go to Type Definition" context menu item to go to the entity opening directive.

#### Go to References

Right-click on a predicate (or non-terminal) name in a scope directive, `alias/2` directive, `uses/2` directive, `synchronized/1` directive, fact, rule head, or goal and select the "Go to References" or "Find All References" context menu items. References are interpreted here as messages, super calls, and predicate calls. For dynamic predicates, references include asserting or retracting clauses for them. Note that recursive calls, predicate declarations, and predicate definitions are not interpreted as references.

Right-click on an entity name in an entity opening directive to find references to it in other entity opening directives (i.e., entities in an implementing, importing, complementing, extending, instantiating, or specializing relation with the selected entity), `alias/2` directives, `uses/1-2` directives, and multifile predicate clauses. In the case of an object, this also finds explicit messages to the object. Note that you can go to an entity opening directive by right-clicking in an entity name and selecting the "Go to Type Definition" context menu item.

#### Go to Implementations

Right-click on a predicate (or non-terminal) name in a scope directive and select the "Go to Implementations" or "Find All Implementations" context menu items. Note that you can go to a predicate scope directive by right-clicking in the predicate name in a goal and selecting the "Go to Declaration" context menu item.

Right-click on a protocol name in its entity opening directive to find implementations of the protocol. Note that you can go to an entity opening directive by right-clicking in an entity name and selecting the "Go to Type Definition" context menu item.

#### Go to Symbol in Editor...

Symbols include entity identifiers in entity opening directives, predicate (and non-terminal) indicators in predicate scope directives, first predicate clause, and first non-terminal rule. Note that VSCode doesn't support customization of symbol kind names and icons, thus forcing adapting the pre-defined names and icons. This feature doesn't require the code to be loaded.

#### Go to Symbol in Workspace...

Symbols include entity identifiers in entity opening directives, predicate (and non-terminal) indicators in predicate scope directives, first predicate clause, and first non-terminal rule. Note that VSCode doesn't support customization of symbol kind names and icons, thus forcing adapting the pre-defined names and icons. This feature doesn't require the code to be loaded.

#### Show Call Hierarchy

Right-click on a predicate (or non-terminal) name in a goal or in a clause head and select the "Show Call Hierarchy" context menu item to browse callers and callees of the selected predicate (or non-terminal). Note that callers and callees that can only be resolved at runtime (e.g., in a message to _self_ goal or when dynamic predicates are used) may not be returned.

#### Show Type Hierarchy

Right-click on an entity name and select the "Show Type Hierarchy" context menu item to browse ancestors and descendants of the selected entity. Here, ancestor is interpreted as any entity from which the selected entity inherits, and descendant is interpreted as any entity that inherits from the selected entity.

### Refactoring support

Several refactoring operations are supported. Users should commit their work before using this feature and preview the changes (when available) before applying them (see also the `files.refactoring.autoSave` setting). After, the "Make - Reload" and "Make - Check" commands can be used to verify the changes before committing them (note that this command can be called automatically when saving files using the `logtalk.make.onSave` setting). Due to VSCode limitations, refactoring operations that require user input cannot be previewed. But the files changed are opened in the editor and the user can verify the changes before saving them (using e.g. the "File: Compare Active File with Saved" command, which also allow selectively undoing refactoring changes). Note that most refactoring operations require the code to be loaded.

#### Code extraction

An "Extract protocol" refactoring operation is available when the user right-clicks on an object or category name in their opening entity directive and uses the "Refactor" context menu item or the "Refactor" command palette item. The name of the protocol is derived from the name of the selected entity. The user is asked to confirm the file name and file location. The extracted code includes all predicate declarations for the selected entity. The extracted code is always copied verbatim, with no changes to the indentation or whitespace.

A "Replace magic number with predicate call" refactoring operation is available when the user selects a number in a rule body and uses the "Refactor" context menu item or the "Refactor" command palette item. The user is asked to enter the name of the predicate to be created and its scope. The predicate is created with the number as its single argument and added to the entity. The selected number is replaced with a variable derived from the predicate name and the rule body is updated with a call to the new predicate inserted after the clause head.

Three other code extraction refactoring operations are supported when the user selects one or more lines and uses the "Refactor" context menu item or the "Refactor" command palette item:

- "Extract to new Logtalk entity" (the user is asked to select the entity type, entity name, file name, and file location)
- "Extract to new Logtalk file" (the user is asked to select the file name and file location)
- "Replace with include/1 directive" (the user is asked to select the file name and file location)

#### Resolve include/1 directive

When the user selects a region of code that contains an `include/1` directive, the "Refactor" context menu item or the "Refactor" command palette item provides a "Replace include/1 directive with file contents" action. The included file is resolved if it's a relative or absolute path, with or without a common Logtalk or Prolog extension. The included file contents are indented to match the indentation of the `include/1` directive.

#### Symbol renaming

Entity, predicate, and non-terminal rename support is available. To rename a predicate (non-terminal), right-click on the predicate (non-terminal) name in a predicate directive, fact, rule head, or goal and select the "Rename Symbol" context menu item. To rename an entity, right-click on the entity name and use the "Go to Type Definition" context menu item to go to the entity opening directive. Then, right-click on the entity name and select the "Rename Symbol" context menu item.

#### Entity parameters refactoring

To add a new parameter to an object (or category), right-click on the object (or category) name in its opening directive and select the "Add parameter to object/category" context menu item. To reorder the parameters of an object (or category), right-click on the object (or category) name in its opening directive and select the "Reorder object/category parameters" context menu item. To remove a parameter from an object (or category), right-click on the object (or category) name in its opening directive and select the "Remove parameter from object/category" context menu item. New parameters must use _parameter variable syntax_ (i.e., `_VariableName_`).

#### Predicate and non-terminal argument refactoring

To add a new argument to a predicate (or non-terminal), right-click on the predicate name in a directive, goal, or clause head and select the "Add argument to predicate/non-terminal" context menu item and enter the new argument name and position. To reorder the arguments of a predicate (or non-terminal), right-click on the predicate name in a directive, goal, or clause head and select the "Reorder predicate/non-terminal arguments" context menu item and enter the new argument order. To remove an argument from a predicate (or non-terminal), right-click on the predicate name in a directive, goal, or clause head and select the "Remove argument from predicate/non-terminal" context menu item and enter the argument position.

#### Converting between object, protocol, and category entity types

Right-click on an entity name in its opening directive and select the "Convert to object", "Convert to protocol", or "Convert to category" context menu items. The applicability of these operations depends on the entity type and its opening directive arguments. Note that the entity name is not changed and further edits may be required to the entity code after the conversion to make it valid (for example, removing predicate definitions that are not allowed in a protocol).

#### Known issues

- Some refactoring operations may not be complete, notably due to the use of dynamic binding or meta-predicate features.
- In some cases, refactoring operations may be made available when the user selection doesn't qualify for the operation.
- When saving all files modified by a refactoring operation using the "Save All" command, the saving order may result in loading warnings.

### Debugging support

When debugging in the integrated terminal using the `debugger` tool, the current clause (at leashed unification ports) is shown in the active editor window. The `debugger` tool is automatically loaded when setting spy points using the "Run" menu breakpoint items or when running the "Make - Debug" command. See the documentation of the `debugger` tool for details.

This extension provides a button with a Logtalk icon at the top-right corner to toggle debugging (equivalent to the `debugger` messages `debug/0` and `nodebug/0`), also removing and re-adding the defined breakpoints and log points (that were set using the VSCode GUI). Alternatively, use the "Run > Start Debugging" and "Run > Run Without Debugging" commands.

Breakpoints and log points can be added and removed using the "Run" menu breakpoint items. Clicking at the left of a line number in an editor window, in the same line as a clause head, creates a clause breakpoint represented by a red dot. Control-clicking in this red dot allows the breakpoint to be removed, edited, or disabled. But, although VSCode supports it, a Logtalk breakpoint cannot be a combination of log point and different types of breakpoints. If you edit a breakpoint, you must keep its singular type.

Function breakpoints are interpreted as predicate (or non-terminal) spy points by entering a predicate indicator (or a non-terminal indicator) or as context spy points by entering a `(Sender, This, Self, Goal)` tuple. Inline breakpoints are interpreted as clause breakpoints (note that they can only be set for clause heads). VSCode hit count breakpoints are interpreted as clause head successful unification count expressions. VSCode "Run" menu "New Breakpoint" > "Triggered Breakpoint..." item is not supported (as VSCode doesn't make available the data to extensions). But triggered breakpoints can still be set by creating conditional breakpoints where the expression is a `Entity-Line` term. For details on hit count expressions and conditional expressions, see the Logtalk Handbook section on debugging.

Changes to spy points via user-typed queries in the integrated terminal are not reflected in the VSCode display of current breakpoints. A particular case is when, at a leashed port, you enter the `n` command to turn off debugging: a quick way to restore all the breakpoints still defined using the VSCode GUI is to select the "Run" menu "Disable All Breakpoints" followed by "Enable All Breakpoints".

VSCode usability issues that affect debugging support:

- VSCode "Run" menu "New Breakpoint" > "Triggered Breakpoint..." item doesn't make the data available to language extensions. See above for the workaround.
- VScode "Toggle Activate Breakpoints" button in the "Run and Debug" pane doesn't generate an event that can be handled by extensions. Use instead the Logtalk icon in the top-right corner to toggle debugging.
- VSCode doesn't support disabling menu items that are not supported by language extensions.
- When the "Run and Debug" pane is closed, selecting the "Run" menu "New Breakpoint > Function Breakpoint..." item doesn't open the pane to show the new breakpoint text insertion box.

### Testing support

Support for the VS Code Testing API is provided. This allows browsing and running tests from the "Testing" pane. After running the "Logtalk: Run Tests" or "Logtalk: Run Tests with Coverage" commands at least once, the "Testing" pane shows all the test results. Alternatively, you can also click in the "Run Tests" or "Run Tests with Coverage" buttons at the top of the "Testing" pane. You can then run individual tests or groups of tests from the "Testing" pane by clicking on the play button next to a test, a test object, or a test file. You can also navigate to a test by clicking its name. In the "Testing" and "Tests Results" panes, you can also use the "Rerun Last Run" button to re-run the last test run. When available, code coverage information is also shown in the covered source files. Note that coverage data is per predicate clause (or non-terminal rule). Clauses used by the tests will be marked using a green color overlay in the gutter while clauses not used by the tests will be marked using a red color overlay. Use the editor window "Toggle Inline Coverage" button to toggle the coverage overlay.

In the "Testing" pane, a warning triangle emoji (⚠️) is shown after the test name when the test is declared as flaky. You can navigate to the test by clicking its name or using the "Go to Test" context menu item. For directory, file, and object items, the "Go to Test" context menu item allows you to navigate to, respectively, the tests driver file, the file, and the object in the test file.

Note that collecting code coverage data depends solely on the tests being run. The option between running tests with or without coverage is only used to determine whether to display coverage data when available.

### Profiling support

Support for profiling is provided. This allows browsing and analyzing profiling data from the "Logtalk: Profiling" sub-menu in the explorer and editor context menus. After running the "Logtalk: Toggle Profiling" command, loaded code is recompiled in debug mode and profiling is enabled. The "Logtalk: Show Profiling Data" command can be used to show the profiling data in a webview. The webview allows navigating to the source file location of entities, predicates, and clauses. Collected profiling data can be reset using the "Logtalk: Reset Profiling Data" command. The profiling commands are also available from the command palette. See the documentation of the `ports_profiler` tool for details and hints on how to interpret profiling data.

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

### Virtual workspaces support

Virtual workspaces support is limited as the extension is fundamentally designed for local development with a local Logtalk installation. Only basic language features such as syntax highlighting, symbol navigation, and document formatting work in virtual workspaces. Assuming a local Logtalk installation is available, you can start a Logtalk process by running the "Open Logtalk" command. But this process will not be able to load files from the virtual workspace.

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

Absolute path to the Logtalk executable or integration script and its arguments. The `logtalk.executable.arguments` setting supports two formats:

1. A simple array of arguments that applies to all backends (legacy array format for backwards compatibility).
2. An object where keys are backend identifiers and values are arrays of backend-specific arguments.

On POSIX systems (e.g., macOS or Linux), the `logtalk` executable can be created by running the `logtalk_backend_select` script. In alternative, set the integration script you want to use.

Example using the legacy array format (assuming a POSIX system, using SWI-Prolog as the backend, with the integration scripts installed at `/usr/local/bin`):

    "logtalk.executable.path": "/usr/local/bin/swilgt"
    "logtalk.executable.arguments": [ "-q" ]

Example using the dictionary format for multiple backends (assuming a POSIX system with integration scripts installed at `/usr/local/bin`):

    "logtalk.executable.path": ""
    "logtalk.executable.arguments": {
        "swi": [ "-q" ],
        "gnu": [ "--quiet" ],
        "sicstus": [ "--nologo" ]
    }

On Windows systems, use the absolute path to the PowerShell 7 executable and set the arguments to load the Logtalk integration script. For example (assuming the default Logtalk installation) and using SWI-Prolog as the backend:

    "logtalk.executable.path": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.executable.arguments": [ "-file", "C:/Windows/swilgt.ps1" ]

Example using the dictionary format on Windows for multiple backends:

    "logtalk.executable.path": "C:/Program Files/PowerShell/7/pwsh.exe"
    "logtalk.executable.arguments": {
        "swi": [ "-file", "C:/Windows/swilgt.ps1", "-q" ],
        "gnu": [ "-file", "C:/Windows/gplgt.ps1", "--quiet" ],
        "sicstus": [ "-file", "C:/Windows/sicstuslgt.ps1", "--nologo" ]
    }

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

#### Run Logtalk make on save

    "logtalk.make.onSave": false

Automatically call the "Logtalk: Make - Reload" command when saving a Logtalk source file.

## Known Issues

Code issues detected when running the "Make - Check" or "Make - Circular" commands are displayed in the integrated terminal but not added to the "PROBLEMS" pane. But when an issue is reported in a source file, you can right-click (Ctrl+click on Windows and Linux, Cmd+click on macOS) in the file path to navigate to the issue location.

On Windows systems, the file paths on the "PROBLEMS" pane may not be relative to the workspace directory depending on the Prolog backend. This is a consequence of some backends "normalizing" file paths in a way that breaks VSCode computing of the relative paths. E.g., paths are relative when using GNU Prolog but absolute when using SWI-Prolog or SICStus Prolog.

On Windows systems, some Prolog backends such as ECLiPSe and XSB are not usable due to file path representation issues.

If you're migrating from the old "VSC-Logtalk" extension, you may see duplicated context menu items even after uninstalling it. If that happens, delete any extension leftovers in the `%USERPROFILE%\.vscode\extensions` (for Windows) or `~/.vscode/extensions` (for Linux and macOS) directory.

VSCode triggers the "Go to Definition" computations if the cursor happens to be in the middle of some text when pressing the command (macOS) or control (Windows, Linux) keys to type any keyboard command shortcut without waiting for or requiring cursor movement. It also doesn't allow disabling this "feature". This extension implements mitigation measures to avoid most accidental "Go to Definition" computations.

## Development

Developed and tested with **Logtalk 3.94.0** and **VSCode 1.103** on **macOS 14.7** and **Windows 10** with **Node 24.6**.

After running `npm install`, `npm run vsix:make` makes the `.vsix` file and `npm run vsix:install` installs it. Restart VSCode after installation.

See the [CHANGELOG.md](https://github.com/LogtalkDotOrg/logtalk-for-vscode/blob/master/CHANGELOG.md) file for the most recent changes. [Contributions](https://github.com/LogtalkDotOrg/logtalk-for-vscode/pulls) and [bug reports](https://github.com/LogtalkDotOrg/logtalk-for-vscode/issues) are most welcome.

## Publishing

- VSCode Marketplace: run the `vsce package && vsce publish` command.
- Open VSX Registry (VSCodium): run the `npx ovsx publish logtalk-for-vscode-VERSION.vsix -p TOKEN` command, replacing `VERSION` and `TOKEN`.

## Acknowledgements

This extension started as a fork of the [VSC-Logtalk](https://github.com/arthwang/vsc-logtalk) extension by Arthur Wang. Due to Arthur's current unavailability and since-deprecated modules, this extension has been adopted by new maintainers. Renaming the fork was necessary to allow publishing to the VSCode Marketplace and avoid conflicts with the original extension.

### Arthur Wang (Original Author)

"The original author of this extension thanks Professor Paulo Moura, who is the author of Logtalk, for his patient help and support. Syntax highlighting, some snippets, and some commands are integrated from his distro of Logtalk."

## License

This extension is published under the [MIT](http://www.opensource.org/licenses/mit-license.php) license.
