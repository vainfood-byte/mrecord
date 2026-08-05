# 마리코 용 폰트 폴더에서 앱 public/fonts 로 복사
$src = Join-Path $env:USERPROFILE 'Desktop\폰트\마리코 용 폰트'
$dst = Join-Path $PSScriptRoot '..\src\renderer\public\fonts'

if (-not (Test-Path $src)) {
  Write-Error "폰트 원본 폴더를 찾을 수 없습니다: $src"
  exit 1
}

New-Item -ItemType Directory -Force -Path $dst | Out-Null

$files = @(
  'BookkMyungjo_Bold.ttf',
  'Mabinogi_Classic_TTF.ttf',
  'Paperlogy-5Medium.ttf'
)

foreach ($file in $files) {
  Copy-Item (Join-Path $src $file) (Join-Path $dst $file) -Force
  Write-Host "Copied $file"
}

Write-Host "Done."
