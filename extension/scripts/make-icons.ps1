# Generates the Chrome Web Store icon set (16/48/128) with no image dependencies.
# Shield silhouette on a dark slate field with a bright keyhole, drawn with GDI+.
param(
  [string]$OutDir = (Join-Path $PSScriptRoot '..\public')
)

Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function New-Shield([int]$Size) {
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = [double]$Size

  # Rounded-square background (Chrome renders the small sizes best this way).
  $radius = $s * 0.22
  $bg = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bg.AddArc(0, 0, $radius, $radius, 180, 90)
  $bg.AddArc($s - $radius, 0, $radius, $radius, 270, 90)
  $bg.AddArc($s - $radius, $s - $radius, $radius, $radius, 0, 90)
  $bg.AddArc(0, $s - $radius, $radius, $radius, 90, 90)
  $bg.CloseFigure()
  $bgBrush = $null
  $bg1 = New-Object System.Drawing.PointF 0, 0
  $bg2 = New-Object System.Drawing.PointF ([single]$s), ([single]$s)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bg1, $bg2,
    [System.Drawing.Color]::FromArgb(255, 30, 41, 59),
    [System.Drawing.Color]::FromArgb(255, 15, 23, 42))
  $g.FillPath($bgBrush, $bg)

  # Shield body: top edge plus two tapering sides down to a point.
  $shield = New-Object System.Drawing.Drawing2D.GraphicsPath
  $sw = $s * 0.62
  $left = ($s - $sw) / 2
  $top = $s * 0.18
  $shield.AddLine($left, $top, $left + $sw, $top)
  $shield.AddLine($left + $sw, $top, $left + $sw, $s * 0.52)
  $shield.AddLine($left + $sw, $s * 0.52, $left + ($sw / 2), $s * 0.80)
  $shield.AddLine($left + ($sw / 2), $s * 0.80, $left, $s * 0.52)
  $shield.AddLine($left, $s * 0.52, $left, $top)
  $shield.CloseFigure()
  $shieldBrush = $null
  $p1 = New-Object System.Drawing.PointF ([single]$left), ([single]$top)
  $p2 = New-Object System.Drawing.PointF ([single]($left + $sw)), ([single]($s * 0.80))
  $shieldBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($p1, $p2,
    [System.Drawing.Color]::FromArgb(255, 96, 165, 250),
    [System.Drawing.Color]::FromArgb(255, 37, 99, 235))
  $g.FillPath($shieldBrush, $shield)

  # Keyhole (circle + stem) = "secret under protection".
  $kR = $s * 0.075
  $kCx = $s / 2
  $kCy = $s * 0.40
  $keyBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
  $g.FillEllipse($keyBrush, $kCx - $kR, $kCy - $kR, $kR * 2, $kR * 2)
  $g.FillRectangle($keyBrush, [single]($kCx - $kR * 0.42), [single]($kCy), [single]($kR * 0.84), [single]($s * 0.11))

  $g.Dispose()
  return $bmp
}

foreach ($size in 16, 48, 128) {
  $bmp = New-Shield $size
  $path = Join-Path $OutDir "icon$size.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "wrote $path ($((Get-Item $path).Length) bytes)"
}
