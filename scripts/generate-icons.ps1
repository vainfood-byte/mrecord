$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Remove-ConnectedBlackBackground {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [int]$ChannelMax = 40
  )

  $width = $Bitmap.Width
  $height = $Bitmap.Height
  $result = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $isBackground = New-Object 'bool[,]' $width, $height
  $queue = New-Object System.Collections.Generic.Queue[object]

  for ($x = 0; $x -lt $width; $x++) {
    $queue.Enqueue(@($x, 0))
    $queue.Enqueue(@($x, ($height - 1)))
  }
  for ($y = 1; $y -lt ($height - 1); $y++) {
    $queue.Enqueue(@(0, $y))
    $queue.Enqueue(@(($width - 1), $y))
  }

  while ($queue.Count -gt 0) {
    $point = $queue.Dequeue()
    $x = $point[0]
    $y = $point[1]
    if ($x -lt 0 -or $y -lt 0 -or $x -ge $width -or $y -ge $height) { continue }
    if ($isBackground[$x, $y]) { continue }

    $pixel = $Bitmap.GetPixel($x, $y)
    if ($pixel.R -gt $ChannelMax -or $pixel.G -gt $ChannelMax -or $pixel.B -gt $ChannelMax) { continue }

    $isBackground[$x, $y] = $true
    $queue.Enqueue(@(($x - 1), $y))
    $queue.Enqueue(@(($x + 1), $y))
    $queue.Enqueue(@($x, ($y - 1)))
    $queue.Enqueue(@($x, ($y + 1)))
  }

  for ($y = 0; $y -lt $height; $y++) {
    for ($x = 0; $x -lt $width; $x++) {
      if ($isBackground[$x, $y]) {
        $result.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
      } else {
        $pixel = $Bitmap.GetPixel($x, $y)
        $result.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $pixel.R, $pixel.G, $pixel.B))
      }
    }
  }

  return $result
}

function Save-SquareTransparentIcon {
  param(
    [System.Drawing.Bitmap]$Source,
    [string]$DestPng,
    [int]$Size = 512,
    [double]$Padding = 0.88
  )

  $canvas = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $scale = [Math]::Min($Size / $Source.Width, $Size / $Source.Height) * $Padding
  $drawWidth = [int][Math]::Round($Source.Width * $scale)
  $drawHeight = [int][Math]::Round($Source.Height * $scale)
  $offsetX = [int][Math]::Round(($Size - $drawWidth) / 2)
  $offsetY = [int][Math]::Round(($Size - $drawHeight) / 2)

  $graphics.DrawImage($Source, $offsetX, $offsetY, $drawWidth, $drawHeight)
  $graphics.Dispose()
  $canvas.Save($DestPng, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
}

function New-MultiSizeIco {
  param(
    [string]$SourcePath,
    [string]$DestIco,
    [int[]]$Sizes = @(256, 128, 64, 48, 32, 16)
  )

  $images = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]
  try {
    foreach ($size in $Sizes) {
      $source = [System.Drawing.Bitmap]::FromFile($SourcePath)
      try {
        $canvas = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($canvas)
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

        $scale = [Math]::Min($size / $source.Width, $size / $source.Height) * 0.88
        $drawWidth = [int][Math]::Round($source.Width * $scale)
        $drawHeight = [int][Math]::Round($source.Height * $scale)
        $offsetX = [int][Math]::Round(($size - $drawWidth) / 2)
        $offsetY = [int][Math]::Round(($size - $drawHeight) / 2)

        $graphics.DrawImage($source, $offsetX, $offsetY, $drawWidth, $drawHeight)
        $graphics.Dispose()
        [void]$images.Add($canvas)
      } finally {
        $source.Dispose()
      }
    }

    $stream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter $stream
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$images.Count)

    $offset = 6 + (16 * $images.Count)
    $pngBytesList = New-Object System.Collections.Generic.List[byte[]]

    foreach ($image in $images) {
      $pngStream = New-Object System.IO.MemoryStream
      $image.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
      [void]$pngBytesList.Add($pngStream.ToArray())
      $pngStream.Dispose()
    }

    for ($i = 0; $i -lt $images.Count; $i++) {
      $image = $images[$i]
      $bytes = $pngBytesList[$i]
      $writer.Write([byte][Math]::Min(255, $image.Width))
      $writer.Write([byte][Math]::Min(255, $image.Height))
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$bytes.Length)
      $writer.Write([uint32]$offset)
      $offset += $bytes.Length
    }

    foreach ($bytes in $pngBytesList) {
      $writer.Write($bytes)
    }

    [System.IO.File]::WriteAllBytes($DestIco, $stream.ToArray())
    $writer.Dispose()
    $stream.Dispose()
  } finally {
    foreach ($image in $images) {
      $image.Dispose()
    }
  }
}

$root = Join-Path $PSScriptRoot '..'
$sourcePath = Join-Path $root 'resources\icons\app-icon-source.png'
$outDir = Join-Path $root 'resources\icons'
$publicDir = Join-Path $root 'src\renderer\public\icons'
$pngOut = Join-Path $outDir 'app-icon.png'
$icoOut = Join-Path $outDir 'app-icon.ico'

New-Item -ItemType Directory -Force -Path $outDir, $publicDir | Out-Null

$raw = [System.Drawing.Bitmap]::FromFile($sourcePath)
try {
  $cutout = Remove-ConnectedBlackBackground -Bitmap $raw
  try {
    Save-SquareTransparentIcon -Source $cutout -DestPng $pngOut -Size 512 -Padding 0.88
  } finally {
    $cutout.Dispose()
  }
} finally {
  $raw.Dispose()
}

Copy-Item -Force $pngOut (Join-Path $publicDir 'app-icon.png')

Write-Host "Created: $pngOut"
Write-Host "Regenerating ICO via Node..."
& node (Join-Path $PSScriptRoot 'generate-ico.mjs') | Out-Host
Write-Host "Done!"
