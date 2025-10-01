# Changelog

## [0.57.0]

* Improve formatting of predicate directives, predicate definitions, and non-terminal definitions by inserting an empty line when switching to a different predicate/non-terminal
* Improve formatting of conditional compilation blocks
* Fix formatting of multi-line facts

## [0.56.0]

* Improve formatting of predicate and non-terminal rules
* Fix the "Format Document" and "Format Selection" commands to also convert space-based indentation to tabs
* Fix formatting commands to set the editor to use tabs for indentation after converting spaces to tabs

## [0.55.0]

* Fix typo in minimum Logtalk required version

## [0.54.0]

* Add Logtalk version checking at extension activation to ensure compatibility with minimum required version

## [0.53.0]

* Change caching of loaded directory paths to use an in-memory set to avoid workspace persistent state issues
* Add experimental support for the "Format Document" and "Format Selection" commands
* Add "Add argument to predicate/non-terminal" refactoring support
* Add "Reorder predicate/non-terminal arguments" refactoring support
* Add "Remove argument from predicate/non-terminal" refactoring support
* Add "Add parameter to object/category" refactoring support
* Add "Reorder object/category parameters" refactoring support
* Add "Remove parameter from object/category" refactoring support
* Add "Extract protocol" refactoring support
* Add "Extract to new Logtalk entity" refactoring support
* Add "Extract to new Logtalk file" refactoring support
* Add "Replace magic number with predicate call" refactoring support
* Add "Replace with include/1 directive" refactoring support
* Add "Replace include/1 directive with file contents" refactoring support
* Add entity, predicate, and non-terminal rename support
* Add "Logtalk: Compute Project Metrics" command
* Add settings support for multi-backend Logtalk executable arguments
* Add quick fixes for some linter errors and warnings
* Add quick fixes for some tests reporter warnings
* Add quick fixes for some dead code scanner warnings
* Add code navigation support for `(@)/1` goals
* Add "Logtalk: Make" submenu to the explorer context menu
* Add "logtalk.make.onSave" setting for automatically calling the "Logtalk: Make - Reload" command when saving a Logtalk source file
* Streamline presentation of symbols for the "Go to Symbol in Editor..." and "Go to Symbol in Workspace..." features
* Update "Go to Symbol in Workspace..." support to also include predicate clauses and non-terminal rules
* Improve performance of "Go to Symbol in Workspace..." and "Go to Symbol in Editor..." support
* Improve context menus items grouping and ordering
* Improve readme section on code navigation
* Improve extension logging for internal debugging
* Improve resource cleanup on extension deactivation
* Group settings into "Required", "Optional", and "Defaults" groups
* Set debugging off and ensure any existing breakpoints are disabled at extension activation
* Fix toggling debugging to always send the `debug`/`nodebug` messages after enabling/disabling the breakpoints
* Fix call hierarchy "Show Incoming Calls" and "Show Outgoing Calls" context menu items
* Fix "Go to Symbol in Editor..." and "Go to Symbol in Workspace..." support to parse multi-line predicate scope directives
* Fix "Go to Symbol in Editor..." and "Go to Symbol in Workspace..." support when entity, predicate, and non-terminal names contain single quotes
* Fix "Go to Symbol in Editor..." parsing of predicates and non-terminals with the same name but different arity
* Fix "Go to Symbol in Editor..." support when constructing predicate and non-terminal indicators from definitions with arguments using character code notation
* Fix code navigation commands to reject calls from inside line comments and support cancellation

## [0.52.0]

* Update "Go to Symbol in Editor..." support to also include predicate clauses and non-terminal rules
* Add support for the "Run > Start Debugging" and "Run > Run Without Debugging" commands
* Add support for toggling debugging using a Logtalk icon in the top-right corner
* Improve readme section on requirements
* Fix spurious "No code loaded from selected directory as required by command." warning for the Logtalk built-in entities directory
* Fix spurious "No code loaded from selected directory as required by command." warning for loaded dependencies
* Fix cases where the number of arguments in a predicate call or entity identifier would be miscounted

## [0.51.0]

* Remove workaround of requiring selecting a predicate or entity name to enable the "Got to Definition" command
* Filter accidental code navigation calls with invalid predicate or entity indicators
* Fix possible file write permission errors when using the code navigation features

## [0.48.0]

* Fix goal error when cancelling the creation of a function breakpoint

## [0.47.0]

* Create a Logtalk terminal when the extension is first activated
* Show the Logtalk terminal also when loading a project, loading a directory, loading a file, and computing metrics

## [0.46.0]

* Fix cases where the "Problems" pane would show duplicated diagnostics

## [0.45.0]

* Remove code lens data for a source file when edited

## [0.44.0]

* Improve automatic indentation support

## [0.43.0]

* Improve automatic indentation support

## [0.42.0]

* Add Copilot chat participant `@logtalk` for answering questions about the Logtalk programming language
* Add chat participant `/handbook` slash command to search the Logtalk Handbook documentation
* Add chat participant `/apis` slash command to search the Logtalk APIs documentation
* Add chat participant `/examples` slash command to get help with Logtalk code examples and patterns
* Add intelligent documentation caching system that automatically updates when Logtalk version changes
* Add RAG (Retrieval-Augmented Generation) integration with VSCode's Language Model API
* Integrate Context7 MCP server for enhanced examples retrieval in `/examples` slash command
* Add "Logtalk: Test Documentation Cache" command for testing documentation functionality
* Add "Logtalk: Refresh Documentation Cache" command for manually refreshing cached documentation
* Update minimum VSCode version requirement to 1.90.0 (required for Chat API support)
* Add centralized configurable logging system for extension debugging and troubleshooting
* Add "logtalk.logging.level" setting with 5 levels: `off`, `error`, `warn`, `info`, `debug` (default: `warn`)
* Add "Logtalk: Set Extension Logging Level" command for interactive log level configuration
* Add "Logtalk: Show Extension Log" command to display the extension's output channel

## [0.41.0]

* Update the "Create Project" command to account for the new location of sample files in upcoming Logtalk versions
* Fix description of the "logtalk.jupytext.path" setting

## [0.40.0]

* Add default value for the "logtalk.jupytext.path" setting
* Improve descriptions of the "logtalk.diagrams.arguments" and "logtalk.jupytext.path" settings

## [0.39.0]

* Improve rejection of spurious find definition queries when the text under the cursor is parsed as a variable
* Fix code navigation regression

## [0.38.0]

* Add source information to diagnostics
* Improve rejection of spurious find definition queries when the text under the cursor is parsed as a variable

## [0.37.0]

* Improve readme section on settings
* Update author information in the license file

## [0.36.0]

* Improve implementation of the Jupyter commands
* Update the documentation on the code navigation features

## [0.35.0]

* Update the documentation on the code navigation features

## [0.34.0]

* Update readme section on "Go To References" support
* Fix spurious find definition queries when the text under the cursor is a variable
* Fix most spurious find definition queries when pressing the Command (macOS) or Control (Windows, Linux) keys with the cursor over some random (but not selected) text

## [0.33.0]

* Add "Logtalk: Jupyter" commands (requires Juyptext 1.16.7 or later version)
* Provide a menu with the valid choices for the backend setting instead of requiring typing it

## [0.32.0]

* Add support for re-running a single test using CodeLens
* Fix case where duplicated items could be created in the "PROBLEMS" pane

## [0.31.0]

* Fix "Logtalk: Toggle Code Lens" command to preserve code lens outdated status

## [0.30.0]

* Fix code navigation issues on Windows
* Fix code navigation false warnings of code not loaded on Windows

## [0.29.0]

* Label file tests and metrics data displayed using CodeLens as possibly outdated when editing the file
* Display `tutor` tool explanations in the "PROBLEMS" pane
* Fix reporting of failed tests when re-running tests

## [0.28.0]

* Delete previous tests and metrics data (displayed using CodeLens) when a file is changed
* Code cleanup

## [0.27.0]

* Improve description of project (workspace) commands
* Fix code navigation issues when defining only the required settings

## [0.26.0]

* Add backend setting
* Change required settings to be only the LOGTALKHOME and LOGTALKUSER environment variable full paths plus the backend
* Fix settings order so that required settings are listed first
* Fix spurious empty lines in the output of the `logtalk_tester` and `logtalk_doclet` scripts
* Fix "Logtalk: ... Project ..." commands on Windows

## [0.25.0]

* Improve settings descriptions

## [0.24.0]

* Remove edit helper for repeating the last clause head when writing recursive predicates
* Add syntax highlighting and snippet for the new `consistency_error/3` built-in method

## [0.23.0]

* Rename workspace commands to include instead the word "Project"
* Show only project (workspace) commands in the explorer context menu
* Change the "Logtalk: Make ..." commands to show a warning when no Logtalk process is running
* Add "Logtalk: Create Project" command
* Add "Logtalk: Load Project" command
* Add getting started walkthrough
* Add failed tests to the "Problems" pane (when using the "Logtalk: Run Tests" command)
* Add support for conditional and triggered breakpoints
* Escape log point messages to ensure they are valid quoted atoms
* More informative error message when a script is not found
* Fix workspace commands when run from the command palette by using the first workspace folder
* Fix the "Logtalk: Load Directory" command to show a warning if the loader file doesn't exist
* Fix the "Logtalk: Run Tests" command to show a warning if the tester file doesn't exist
* Fix the "Logtalk: Run Doclet" command to show a warning if the doclet file doesn't exist

## [0.22.0]

* Change linters to no longer create and write to an "OUTPUT" pane channel
* Show current clause in the active text editor when debugging
* Add support for adding and removing spy points and log points
* Add Logtalk source file icons
* Add "Logtalk: Make - Circular" command
* Add "Logtalk: Make - Optimal" command
* Add "Logtalk: Make - Normal" command
* Add "Logtalk: Make - Debug" command
* Add "Logtalk: Make - Clean" command
* Add "Logtalk: Make - Caches" command
* Improve usability by only showing the terminal if hidden when advisable by the command
* Update minimum VSCode version required to 1.64.0
* Update the "Go to Implementations" command to also find protocol implementations
* Fix file recompilation to clear previous diagnostics for the file
* Fix possible JavaScript error in the "Go to Symbol in Editor..." implementation
* Fix occasional glitch where code navigation would return a previous result
* Fix and simplify auto-indentation patterns
* Fix parsing of predicate calls with double-quoted arguments

## [0.21.0]

* Warn the user when no code is loaded for a command that requires it
* Change commands that run the developer tools to require the code to be loaded first
* Inform the user when commands that spawn processes complete
* Add experimental code lens support for test results
* Add experimental code lens support for entity cyclomatic complexity
* Add "Logtalk: Compute Metrics" command
* Add "Logtalk: Toggle Code Lens" command
* Add "Logtalk: Generate Documentation (workspace)" command
* Add "Logtalk: Generate Diagrams (workspace)" command
* Add "Logtalk: Scan Dead Code (workspace)" command
* Add `dead_code_scanner` tool warnings to the "Problems" pane
* Add `lgtdoc` tool warnings to the "Problems" pane
* Add `make` tool warnings to the "Problems" pane
* Add tests compilation warnings and errors to the "Problems" pane
* Add doclet compilation warnings and errors to the "Problems" pane
* Update the "Known Issues" section in the readme file
* Fix taking into account environment settings when spawning auxiliary Logtalk processes
* Fix off-by-one error when parsing linter warnings lines
* Fix deleting an atom or variable when typing an underscore before the first character

## [0.20.0]

* Add "Go to Declaration" and "Go to Definition" support
* Add "Go to Type Definition" support (with objects, protocols, and categories interpreted as types)
* Add "Go to References" and "Go to Implementations" support
* Add "Go to Symbol in Editor..." and "Go to Symbol in Workspace..." support
* Add "Show Call Hierarchy" and "Show Type Hierarchy" support
* Add "Open Parent File" command
* Fix JavaScript error when parsing terminal output

## [0.19.0]

* Update the syntax test file
* Improve the readme file configuration section
* Update the "Known Issues" section in the readme file

## [0.18.0]

* Fix hover contents to work with more strictly compliant Prolog backends
* Update minimum VSCode version required to 1.31.0

## [0.17.0]

* Fix missing hover contents for directives where the name is declared as an operator by the backend Prolog compiler

## [0.16.0]

* Add missing snippet for the `endif/0` directive
* Improve hover contents styling
* Snippets fixes and improvements

## [0.15.0]

* Mention hover contents provider in the readme file

## [0.14.0]

* Fix some snippets typos
* Fix hover provider for recent changes to snippets
* Fix typos in snippets for the `logtalk_make/0` predicate and `eos//0` non-terminal

## [0.13.0]

* Improve descriptions of some of the settings
* Update readme file "Known Issues" section
* Remove `logtalk.scratch.path` and `logtalk.vscode.messagefile` settings

## [0.12.0]

* Fix syntax error in the snippets JSON file

## [0.11.0]

* Add code completion support for the opening and closing entity directives
* Add code completion support for the error handling built-in methods
* Improve code completion for built-in features
* Improve description of some of the configuration settings
* Update readme file installation instructions

## [0.10.0]

* Add make check command

## [0.9.3]

* Allow running commands from the command palette

## [0.9.2]

* Update readme section on code navigation

## [0.9.1]

* Add readme section on code navigation

## [0.9.0]

* Remove all extension defined key bindings
* Remove editor/context menu commands to navigate to the next/previous error/warning
* Remove from the editor/context menu all commands that are workspace specific
* Rename editor/context menu item "Load Project" to "Load Directory"
* Fixed scanning for dead code, generating documentation, and generating diagrams to load the current directory loader file first

## [0.8.4]

* Add setting for the default timeout for waiting to run the scripts that convert documentation files and diagram files to final formats when running the lgtdoc and diagrams tools
* Minor code cleanup

## [0.8.3]

* Update for compatibility with recent changes to the "diagrams" tool

## [0.8.2]

* Fix Windows broken file paths in the "Problems" pane

## [0.8.1]

* Fix Windows compatibility issue when loading files

## [0.8.0]

* Add compiler errors and warnings to the "Problems" pane

## [0.7.0]

* Delete temporary marker files created when generating diagrams and documentation

## [0.6.1]

* Improve generation of diagrams and documentation in the final format

## [0.6.0]

* Change settings for configuring the script to be used to generate diagrams
* Update Windows configuration instructions
* Fix generating documentation in the final format
* Fix generating diagrams in the final format

## [0.5.5]

* Fix syntax highlight of the uninstantiation_error/1 built-in method

## [0.5.4]

* Fix syntax highlight of operators

## [0.5.3]

* Fix syntax highlight of term and arithmetic comparison operators

## [0.5.1]

* Rename "Load Document" menu option to "Load File"
* Add load project menu option
* Fix running tests, doclets, generating documentation, and generating diagrams on Windows by using forward slashes for paths
* Fix the menu options for generating documentation and diagrams
* Fix detection of warnings and errors with "at line" location string

## [0.5.0]

* Fix syntax highlighting of escape sequences in double-quoted terms

## [0.4.9]

* Warnings/errors are parsed in the terminal as links (jump-to with ctrl+click)

## [0.4.8]

* Fix snippets deprecated version and date formats

## [0.4.7]

* TMLanguage Update

## [0.4.6]

* Regex overhaul & document lint
* Logtalk linter does not run upon opening a document or workspace anymore (to avoid running multiple instances of Logtalk)
* F8 performs logtalk_make
* F9 loads via logtalk_load

## [0.3.14]

* add threaded_cancel/1 highlighting
* fix 0'\Char number highlighting

## [0.3.11]

* updated for syntax from the distro 3.19.0

## [0.3.8]

* fixed snippets for the date snippet variables introduced in VSC 1.20.0
* removed donation in README.md

## [0.3.7]

* updated snippets for the date snippet variables introduced in VSC 1.20.0

## [0.3.6]

* updated for syntax from the distro 3.14.0

## [0.3.5]

* cancel of recursive linting

## [0.3.3]

* merged a pr from Paulo Moura

## [0.3.2]

* just use snippet descriptions for hover

## [0.3.1]

* bug fix for 'run tester' and 'run doclets'

## [0.3.0]

* hover information

## [0.2.5]

* merged pr from Paulo Moura

## [0.2.4]

* added saving dirty files before exec commands

## [0.2.3]

* refined commands

## [0.2.2]

* updated readme

## [0.2.1]

* fixed some bugs in terminal

## [0.2.0]

* merged tasks.json commands from the distro

## [0.1.5]

* fixed 2 bugs of snippets generator

## [0.1.3]

* fixed tiny bugs and typos

## [0.1.2]

* tuned linter output

## [0.1.1]

* tried to fix markdown table issue in readme
* changed compile to load in linter

## [0.1.0]

* Initial release
