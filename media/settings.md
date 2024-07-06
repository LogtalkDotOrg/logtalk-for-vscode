The configure the extension, you need:

The value of the `LOGTALKHOME` and `LOGTALKUSER` environment variables as absolute paths. On macOS or Linux, you can use a terminal to run the commands:

	echo $LOGTALKHOME
	echo $LOGTALKUSER

On Windows, use a PowerShell terminal to run the commands:

	Get-Item Env:LOGTALKHOME
	Get-Item Env:LOGTALKUSER

Some of the settings are for scripts, e.g. the `logtalk_tester` automation script, that take as argument the Prolog backend you intend to use, specified using its identifier:

* B-Prolog: `b`
* Ciao Prolog: `ciao`
* CxProlog: `cx`
* ECLiPSe: `eclipse`
* GNU Prolog: `gnu`
* JIProlog: `ji`
* XVM: `xvm`
* Quintus Prolog: `quintus`
* SICStus Prolog: `sicstus`
* SWI-Prolog: `swi`
* Tau Prolog: `tau`
* Trealla Prolog: `trealla`
* XSB: `xsb`
* YAP: `yap`

See the scripts [man pages](https://logtalk.org/documentation.html#man-pages) for their available options.
