The configure the extension, you need:

The value of the `LOGTALKHOME` and `LOGTALKUSER` environment variables as absolute paths. On macOS or Linux, you can use a terminal to run the commands:

	echo $LOGTALKHOME
	echo $LOGTALKUSER

On Windows, use a PowerShell terminal to run the commands:

	Get-Item Env:LOGTALKHOME
	Get-Item Env:LOGTALKUSER

The identifier of the Prolog backend that you intend to use:

* B-Prolog: `b`
* Ciao Prolog: `ciao`
* CxProlog: `cx`
* ECLiPSe: `eclipse`
* GNU Prolog: `gnu`
* JIProlog: `ji`
* LVM: `lvm`
* Quintus Prolog: `quintus`
* SICStus Prolog: `sicstus`
* SWI-Prolog: `swi`
* Tau Prolog: `tau`
* Trealla Prolog: `trealla`
* XSB: `xsb`
* YAP: `yap`
