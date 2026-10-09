# Browser Console Warnings – Technical Notes

## Scope

This guide helps classify warnings in the current LTTH browser console. Messages vary by browser, version, and loaded assets. An example does not prove that a particular integration is currently loaded.

## Media and audio errors

Messages such as “Media resource could not be decoded” may affect playback. First inspect the exact URL and source file reported by the console. In this source version, the dashboard uses a short valid WAV data source to unlock audio playback. If the warning returns, reproduce it with the current version and inspect the audio resource actually loaded.

## CSS vendor prefixes

Browsers may report properties such as -webkit- or -moz-. These can be intentional compatibility fallbacks. Check the file and line shown by the warning, and remove a prefix only after confirming supported browsers will not be affected.

## Unknown selectors and rules

For an unknown pseudo-class or at-rule, the console usually identifies the stylesheet. Use that source to determine whether the warning comes from LTTH, a plugin, or a bundled dependency. Clean up obsolete rules when they originate in active project code.

## Troubleshooting steps

1. Record the browser and version, exact message, file, and line.
2. Reload the dashboard in a fresh session and check whether the message reproduces.
3. Identify the reported resource in the current session’s Network panel.
4. Investigate errors and failed requests from LTTH code; filter warnings only after checking their actual source.

Do not apply a blanket filter for an old filename or former integration. Use the source shown by the current console.
