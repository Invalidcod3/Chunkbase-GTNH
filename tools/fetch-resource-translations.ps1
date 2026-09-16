$ErrorActionPreference = 'Stop'
$translationOutput = Join-Path $PSScriptRoot '../artifacts/translation-source'
New-Item -ItemType Directory -Path $translationOutput -Force | Out-Null
$translationRevision = 'd2635d9e7137f7886ad29f9d20c8b445cefa9e09'
$translationFiles = @{
  'GregTech.lang' = 'GregTech.lang'
  'GregTech_US.lang' = 'GregTech_US.lang'
  'gregtech-zh_CN.lang' = 'resources/GregTech[gregtech]/lang/zh_CN.lang'
  'bartworks-zh_CN.lang' = 'resources/GregTech[bartworks]/lang/zh_CN.lang'
  'miscutils-zh_CN.lang' = 'resources/GregTech[miscutils]/lang/zh_CN.lang'
  'README.md' = 'README.md'
  'LICENSE' = 'LICENSE'
}
$translationSources = @()
foreach ($translationFile in $translationFiles.GetEnumerator()) {
  $translationUrl = "https://raw.githubusercontent.com/Kiwi233/Translation-of-GTNH/$translationRevision/" + $translationFile.Value.Replace('[','%5B').Replace(']','%5D')
  $translationTarget = Join-Path $translationOutput $translationFile.Key
  Invoke-WebRequest -Uri $translationUrl -OutFile $translationTarget
  $translationSources += @{ file=$translationFile.Key; path=$translationFile.Value; sha256=(Get-FileHash -LiteralPath $translationTarget -Algorithm SHA256).Hash.ToLower() }
}
@{repository='https://github.com/Kiwi233/Translation-of-GTNH'; revision=$translationRevision; files=$translationSources} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $translationOutput 'manifest.json') -Encoding utf8
Write-Output "Downloaded $($translationSources.Count) pinned translation source files."
