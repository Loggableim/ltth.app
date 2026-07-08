#!/usr/bin/env pwsh
# Legacy one-line installer shim.
# Kept for compatibility with existing documentation and automation.
# Trim a possible UTF-8 BOM from raw.githubusercontent responses before iex.
$installer = irm https://ltth.app/install/install.ps1
iex ($installer.TrimStart([char]0xFEFF))
