$ErrorActionPreference = 'Stop'
$taskName = 'ZuquiCatalogoRaffinato'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if (-not $task) {
    Write-Host 'Instalação nova: informe os dados solicitados para configurar o conector.'
    python -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
    python (Join-Path $PSScriptRoot 'catalog_sync.py') --setup
    & (Join-Path $PSScriptRoot 'install-task.ps1')
    exit
}

$arguments = [string]$task.Actions[0].Arguments
$match = [regex]::Match($arguments, '"([^"]*catalog_sync\.py)"')
if (-not $match.Success) {
    throw 'Não foi possível localizar o arquivo do conector na tarefa agendada.'
}

$installedScript = [IO.Path]::GetFullPath($match.Groups[1].Value)
$installedDirectory = Split-Path -Parent $installedScript
if (-not (Test-Path -LiteralPath $installedDirectory -PathType Container)) {
    throw 'A pasta atualmente configurada no conector não foi encontrada.'
}

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'catalog_sync.py') -Destination $installedScript -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'requirements.txt') -Destination (Join-Path $installedDirectory 'requirements.txt') -Force
python -m pip install -r (Join-Path $installedDirectory 'requirements.txt')
Start-ScheduledTask -TaskName $taskName
Write-Host 'Conector do cardápio atualizado para 2.0.3 e reiniciado.'
