#!/usr/bin/env pwsh
# Legacy one-line installer shim.
# Kept for compatibility with existing documentation and automation.
# Trim a possible UTF-8 BOM from raw.githubusercontent responses before iex.
iex ((iwr -useb https://ltth.app/install/install.ps1).Content.TrimStart([char]0xFEFF))
