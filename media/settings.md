To configure the extension, you need:

The value of the `LOGTALKHOME` and `LOGTALKUSER` environment variables as **absolute paths**. On macOS or Linux, you can use a terminal to run the commands:

	echo $LOGTALKHOME
	echo $LOGTALKUSER

On Windows, use a PowerShell terminal to run the commands:

	Get-Item Env:LOGTALKHOME
	Get-Item Env:LOGTALKUSER

The Prolog backend you intend to use, specified using its identifier:

* B-Prolog: `b`
* Ciao Prolog: `ciao`
* CxProlog: `cx`
* ECLiPSe: `eclipse`
* GNU Prolog: `gnu`
* SICStus Prolog: `sicstus`
* SWI-Prolog: `swi`
* Tau Prolog: `tau`
* Trealla Prolog: `trealla`
* XSB: `xsb`
* XVM: `xvm`
* YAP: `yap`

In most cases, these required settings are enough for full extension functionality. But they assume default installations for Logtalk and the Prolog backends. On Windows, they also assume the default installation of PowerShell 7. When that's not the case, optional settings are also available to allow overriding the defaults that are derived from the required settings.
