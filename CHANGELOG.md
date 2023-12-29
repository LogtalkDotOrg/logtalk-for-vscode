# Changelog

## [0.9.0]

* Remove all extension defined key bindings
* Remove editor/context menu commands to navigate to the next/previous error/warning
* Rename editor/context menu item "Load Project" to "Load Directory"

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
