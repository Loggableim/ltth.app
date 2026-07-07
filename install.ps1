#!/usr/bin/env pwsh
# Legacy one-line installer shim.
# Kept for compatibility with existing documentation and automation.
# Trim a possible UTF-8 BOM from raw.githubusercontent responses before iex.
iex ((iwr -useb https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.ps1).Content.TrimStart([char]0xFEFF))
