$ErrorActionPreference = 'Stop'
$taskName = 'ZuquiCatalogoRaffinato'
$scriptPath = Join-Path $PSScriptRoot 'catalog_sync.py'
$python = (Get-Command python).Source
$action = New-ScheduledTaskAction -Execute $python -Argument ('"{0}"' -f $scriptPath) -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 2) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Sincroniza catálogo do Raffinato com o cardápio Zuqui por conexão de saída.' -Force
Start-ScheduledTask -TaskName $taskName
Write-Host "Tarefa $taskName instalada e iniciada."
