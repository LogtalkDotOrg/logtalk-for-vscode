# Changelog

## [0.85.1]

* Fix updating the `loader.lgt` and `tester.lgt` files when moving a file to a subdirectory

## [0.85.0]

* Add "Go to Definition" support for file paths in `logtalk_load/1-2` calls that don't use library notation
* Fix a regression where code navigation features could hang due to the migration to the VSCode API for file system operations

## [0.84.0]

* Add "Create Loader File" command to create a `loader.lgt` file from selected files or directory
* Improve the "Convert module to object" refactoring to handle multi-line module export lists with interspersed comments
* Workaround a timing issue when using the "Help: Logtalk Handbook" command for the first time that may cause the Handbook to not open
* Fix the "Sort files by dependencies" refactoring to properly handle file relative paths in `logtalk_load/1-2` calls

## [0.83.1]

* Fix renaming entities and predicates when the entity or predicate name includes an underscore and the user right-clicks to the right of the underscore

## [0.83.0]

* Show tests as needing re-run when the tests file is modified
* Fix the "Problems" pane not being cleared when the tests file is modified
* Fix the "Problems" pane not updating when re-running tests when the test files were not modified

## [0.82.0]

* Changed file system calls to use the VSCode API instead of the Node API
* Add support for hot-reloading of all changed optional and default settings
* Fix running tests using the editor context menu when the tester file is in a parent directory
* Fix loading a directory when the loader file is in a parent directory
* Fix the "Sort files by dependencies" refactoring to properly handle `logtalk_load/2` calls
* Fix reporting of scripts errors in the output channel missing a newline at the end

## [0.81.0]

* Add support for the GNU Prolog native code backend
* Fix the "logtalk.executable.arguments" setting being ignored on Windows when the "logtalk.executable.path" setting is set to the empty string (its default value)

## [0.80.0]

* Add support for the ECLiPSe backend on Windows
* Add test results from running the "Logtalk: "Run Project Testers" command to the Test Explorer
* Add `logtalk.tests.createAllureReport` boolean setting to generate Allure reports after running tests
* Add support for skipping and un-skipping tests using the test item context menu
* Automatically recompile code in debug/normal mode when starting/stopping debugging
* Add support for the debug toolbar with additional buttons for common port commands
* Add partial support for the "Variables" and "Call Stack" panes in the "Run and Debug" sidebar
* Add "Help: Logtalk Handbook" command to open the Logtalk Handbook using Live Preview if installed, or the default browser otherwise
* Add multi-root workspace support for code navigation, refactoring, testing, documentation, and chat participant features
* Add "Use implicit message sending" refactoring for replacing explicit message sending calls with a `uses/2` directive
* Add completions for the first argument of the `logtalk_load/1-2` predicates based on the standard libraries
* Add completions for the first argument of the `logtalk_load_context/2` predicate
* Add completions for the arguments of the `current_logtalk_flag/2` and `set_logtalk_flag/2` predicates
* Add completions for the argument of the `logtalk_make/1` and `logtalk_make_target_action/1` predicates
* Add completions for the first argument of the `logtalk::print_message/3`, `logtalk::message_prefix_stream/4`, and `logtalk::question_prompt_stream/4` predicates
* Add completions for the argument of the `throw/1` predicate
* Add snippet for the `logtalk_make_target_action/1` predicate
* Remove the "Logtalk: Toggle Debugging" button from the editor title bar (subsumed by the "Run" menu commands)
* Remove the "Logtalk:" prefix from all context menu items
* Add actionable status bar indicators for profiling and CodeLens on/off state
* Show an error message when the Logtalk terminal crashes with a button to restart the terminal
* Refresh active editor tests and metrics CodeLens when results files change without waiting for user interaction
* Improve performance of the tests and metrics CodeLens providers
* Improve predicate call parsing performance when using the code navigation features
* Improve extension documentation
* Fix showing current source file positions when debugging sometimes opening the file in a different VSCode instance
* Fix error when calling the "Load File" and "Load Directory" commands from the command palette when no file is open or selected
* Fix potential race condition when loading a project on activation
* Fix displaying of inline code coverage data on Windows
* Fix clearing diagnostics for failed tests when editing and saving the tests file
* Workaround for SICStus Prolog requiring a newline after a deterministic query when it contains variables

## [0.79.0]

* Add support for ctrl-click on file paths in "loaded" comment messages in the terminal
* Fix handling of terminal links on Windows with drive letters in the file path
* Workaround driver letter casing issues on Windows due to inconsistent path handling between Windows, VSCode, and Node.js APIs

## [0.78.0]

* Add "Sort predicates/non-terminals" refactoring support for predicate directives with a list argument
* Simplify the "Split in individual directives" refactoring by not requiring the user to select a region containing the directive
* Fix walkthrough listing of supported Prolog backends

## [0.77.0]

* Fix the settings grouping in the VS Code settings editor

## [0.76.0]

* Rename the "Renumber variables" refactoring to "Increment numbered variables" and add a corresponding "Decrement numbered variables" refactoring
* Update the "Wrap file contents as an object" refactoring to insert the object opening directive after any comments at the beginning of the file
* Update the "Open parent file" command to show a message if no parent file is found

## [0.75.0]

* Add support for renaming variables within the scope of a predicate clause, grammar rule, or directive
* Add support for renaming parameter variables within the scope of an entity
* Add "Extract predicate/non-terminal" refactoring support for selected code in predicate clauses and grammar rules
* Add "Increment numbered variables" refactoring support for variables ending with numbers within the scope of a predicate clause or grammar rule
* Add "Decrement numbered variables" refactoring support for variables ending with numbers within the scope of a predicate clause or grammar rule
* Add "Unify with new variable" refactoring support for selected terms in predicate rules and grammar rules
* Add "Inline variable" refactoring support for replacing variable unification goals in predicate rules and grammar rules
* Add "Wrap file contents as an object" refactoring support for converting plain Prolog files to Logtalk objects
* Add "Infer public predicates" refactoring support for inferring public predicates in objects and categories
* Add "Sort files by dependencies" refactoring support for `logtalk_load/1-2` calls with a list of atoms in the first argument
* Improve performance of the entity parameter refactorings
* Fix the "Extract protocol" refactoring to only be offered for objects and categories that contain scope directives
* Fix extract code refactorings to only be offered when the selection contains complete terms
* Fix the "Convert object to protocol" and "Convert category to protocol" refactorings to only be offered when the entity contains no predicate clauses or grammar rules
* Fix extension activation to only attempt to load the project loader file when the activation resulted from opening a Logtalk file

## [0.74.0]

* Add refactoring support for converting a Prolog module to an object
* Update the `README.md` file section on known issues
* Fix predicate refactorings to not be offered for conditional compilation directives
* Fix predicate argument refactorings applied to predicate directives to ensure they are only offered for the directive arguments
* Fix predicate declaration refactoring to not be offered for arguments of scope directives
* Fix quick fixes for missing `meta_predicate/1` and `meta_non_terminal/1` directives to correctly handle predicate arity

## [0.73.0]

* Propagate file renames and deletions to loader and tester driver files with a preview
* Provide completions for list tail variables after typing the `|` character based on the head variable name
* Add detailed `README.md` file section on automatic indentation

## [0.72.0]

* Add support for the "Expand selection" and "Shrink selection" commands
* Add "Add predicate/non-terminal declaration" refactoring support
* Improve documentation of optional settings
* Fix missing configuration update listener in the `Utils` class

## [0.71.0]

* Create diagnostics from the "Logtalk: Run Project Testers" and "Logtalk: Run Project Doclets" commands output
* Clear output channel before running the "Logtalk: Run Project Testers" and "Logtalk: Run Project Doclets" commands
* Add "Split in individual directives" refactoring support
* Add "Extract to Logtalk entity" refactoring support

## [0.70.0]

* Await for the deletion of any existing `.vscode_*_done` temporary files at extension activation

## [0.69.0]

* Fix regression where the "No code loaded from selected directory as required by command." warning would be printed despite the code being loaded

## [0.68.0]

* Add chat participant `/docs` slash command for getting help with documenting code
* Add chat participant `/tests` slash command for getting help with writing and running tests
* Add chat participant `/workspace` slash command for searching workspace-specific documentation
* Update the chat participant to also include recent chat history in requests to the language model
* Explicitly dispose of the Logtalk terminal to prevent restoration when the extension is deactivated

## [0.67.0]

* Add "logtalk.loadProject.onActivation" setting for loading the project on extension activation
* Fix extension activation errors when only a file but no workspace folder is open
* Fix chat participant resolving of concrete language models to use for requests

## [0.66.0]

* Improve performance of the tests explorer and CodeLens providers by only invalidating results when files are saved with unsaved changes
* Improve profiling and chat participant commands documentation in the readme file
* Simplify Context7 MCP server tools name handling in the chat participant
* Fix chat participant follow-up prompts to include the correct slash command and the previous query

## [0.65.0]

* Remove JIProlog from the list of supported backends as its console is not compatible with the Terminal API
* Update the readme file list of known issues
* Delete any existing `.vscode_*_done` temporary files created by the `LogtalkTerminal` class at initialization time
* Faster check for minimum required Logtalk version at extension activation
* Add snippet for the `mode_non_terminal/2` directive
* Fix hover provider to also handle multi-line terms

## [0.64.0]

* Add "logtalk.diagrams.format" setting for specifying the diagrams format (default is `dot`; Graphviz)
* Add support for viewing SVG diagrams and HTML files in a webview with navigation and link handling
* Add "Logtalk: Open SVG in Viewer" command to open SVG files in a webview
* Add support for displaying code profiling results in a webview
* Add "Logtalk: Profiling" sub-menu with profiling commands
* Add support for the VS Code Testing API
* Add command "Logtalk: Run Tests with Coverage" to run all tests with coverage reporting
* Delete any existing `.vscode_*` temporary files at extension activation
* Changed test results summary displayed using CodeLens in the tests object to re-run only the object tests
* Add refactoring support for converting between object, protocol, and category entity types
* Add quick fixes for documentation linter warnings
* Additional quick fixes for compiler linter errors and warnings
* Additional quick fixes for the dead code scanner warnings
* Clear diagnostics from all diagnostic collections when a file is deleted or moved
* Clear diagnostics from all diagnostic collections when the Logtalk terminal is closed
* Provide limited support for virtual workspaces
* Fix running the documentation, diagrams, testing, and doclets scripts on Windows using default settings
* Fix diagnostics showing absolute paths instead of relative paths on Windows with some backends
* Fix test results CodeLens showing multiple occurrences of the `(outdated)` text after running individual tests
* Fix timing issue that could result in multiple Logtalk terminals being created at startup
* Fix bug where closing a non-Logtalk terminal would mark the Logtalk terminal as closed
* Fix the delete action for the dead code scanner to correctly check for predicate arity
* Fix predicate argument parsing bugs with commas and parentheses in quoted atoms
* Fix bug when computing a predicate definition range that would include clauses from other predicates
* Fix bugs handling diagnostic collections that could result in duplicated diagnostics after fixing and reloading files
* Fix errors with the debugging commands when the Logtalk terminal unexpectedly doesn't exist
* Fix walkthrough to prevent being closed when performing some of the steps
* Fix type hierarchy "Show Subtypes" and "Show Supertypes" context menu items

## [0.63.0]

* Update `info/1` and `info/2` formatting to decide between single- or multi-line format based on the editor ruler length for keys whose values are lists of non-pairs elements
* Ensure basic spacing formatting of most directives (outside conditional compilation blocks)
* When using the "Save All" command, call the "Logtalk: Make - Reload" command once after all files are saved rather than per file
* After formatting a conditional compilation block, don't reset the data on the latest term type, term indicator, and predicate indicator

## [0.62.0]

* Improve predicate declarations formatting when predicates are also operators
* Fix formatting of facts with occurrences of the `:-` or `-->` operators in their arguments

## [0.61.0]

* Improve formatting of `initialization/1` directives
* Fix formatting commands bug where whitespace in quoted atoms would be changed
* Fix formatting commands bug where consecutive empty lines before an ending entity directive could prevent document formatting

## [0.60.0]

* Add support for syntax highlighting and formatting of `mode_non_terminal/2` directives
* Update the formatting commands to collapse consecutive empty lines into a single empty line
* Ensure that multiple entities in the same file are separated by two or more empty lines
* Improve insertion of empty lines before different types of terms
* Improve formatting of line comments to only indent if they start at character zero but not followed by indented content
* Improve formatting of block comments to indent just the content or the full block comment depending on whether the comment delimiters are on separate lines
* Fix bug in parsing quoted atoms in entity and predicate names in directives
* Fix bug where multiple empty lines would be added at the end of the file

## [0.59.0]

* More compact formatting of list-based directives
* Move any comment or goal after the neck operator (`:-` or `-->`) to the next line and indented
* Make the "logtalk.format.withIndentationConversion" command an internal command
* Improve insertion of empty lines before different types of directives
* Fix formatting of rules with occurrences of the `:-` or `-->` operators in head arguments
* Fix bug parsing `0'Char` character code notation in predicate/non-terminal arguments

## [0.58.0]

* Improve "Replace magic number with predicate call" refactoring applicability check performance
* Fix refreshing the editor indentation guides/rulers after running the formatting commands
* Fix case where applying the formatting commands to documents with mixed and inconsistent indentation could cause an infinite loop

## [0.57.0]

* Improve formatting of `info/1` and `info/2` directives
* Improve formatting of predicate directives, predicate definitions, and non-terminal definitions by inserting an empty line when switching to a different predicate/non-terminal
* Improve formatting of conditional compilation blocks
* Fix formatting of multi-line facts
* Fix formatting bug in moving comment after the neck operator to the next line

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
