Add-Type -AssemblyName System.Drawing

$splashSrc = 'C:\Users\Student_CY\hatuv-bli-menu\resources\splash.png'
$logoSrc = 'C:\Users\Student_CY\hatuv-bli-menu\public\new logo.jpg'
$baseDir = 'C:\Users\Student_CY\hatuv-bli-menu\android\app\src\main\res'
$bgColor = [System.Drawing.ColorTranslator]::FromHtml('#F5A623')

$src = [System.Drawing.Image]::FromFile($logoSrc)

function ResizeSplash($w, $h, $outPath) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $g.FillRectangle($brush, 0, 0, $w, $h)
    $logoSize = [int]([Math]::Min($w, $h) * 0.6)
    $x = [int](($w - $logoSize) / 2)
    $y = [int](($h - $logoSize) / 2)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, $x, $y, $logoSize, $logoSize)
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $brush.Dispose()
}

$sizes = @(
    @{ dir = 'drawable-port-mdpi';    w = 480;  h = 800  }
    @{ dir = 'drawable-port-hdpi';    w = 720;  h = 1280 }
    @{ dir = 'drawable-port-xhdpi';   w = 960;  h = 1600 }
    @{ dir = 'drawable-port-xxhdpi';  w = 1440; h = 2560 }
    @{ dir = 'drawable-port-xxxhdpi'; w = 1920; h = 3200 }
    @{ dir = 'drawable-land-mdpi';    w = 800;  h = 480  }
    @{ dir = 'drawable-land-hdpi';    w = 1280; h = 720  }
    @{ dir = 'drawable-land-xhdpi';   w = 1600; h = 960  }
    @{ dir = 'drawable-land-xxhdpi';  w = 2560; h = 1440 }
    @{ dir = 'drawable-land-xxxhdpi'; w = 3200; h = 1920 }
)

foreach ($s in $sizes) {
    $dir = Join-Path $baseDir $s.dir
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $outPath = Join-Path $dir 'splash.png'
    ResizeSplash $s.w $s.h $outPath
    Write-Host "Generated $($s.dir)"
}

# Main drawable splash
ResizeSplash 2732 2732 (Join-Path $baseDir 'drawable\splash.png')
Write-Host "Generated drawable/splash.png"

$src.Dispose()
Write-Host "Done!"
