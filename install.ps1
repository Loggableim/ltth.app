#!/usr/bin/env pwsh
# Legacy one-line installer shim.
# Kept for compatibility with existing documentation and automation.
# Download the installer as bytes and decode it explicitly so the bootstrap
# works the same in Windows PowerShell and PowerShell 7.
$installer = [Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://ltth.app/install/install.ps1'))
iex ($installer.TrimStart([char]0xFEFF))
