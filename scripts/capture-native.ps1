param([long]$WindowHandle,[string]$OutputPath)
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class AstraCapture {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int n);
 public delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h,EnumProc p,IntPtr l);
 [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h,System.Text.StringBuilder b,int n);
 public static void Describe(IntPtr h) { Rect r;GetWindowRect(h,out r);var b=new System.Text.StringBuilder(256);GetClassName(h,b,256);Console.WriteLine(h+" "+b+" "+r.Left+","+r.Top+" "+(r.Right-r.Left)+"x"+(r.Bottom-r.Top)+" style="+GetWindowLong(h,-16).ToString("X")+" ex="+GetWindowLong(h,-20).ToString("X")); }
}
"@
[AstraCapture]::Describe([IntPtr]$WindowHandle)
[AstraCapture]::EnumChildWindows([IntPtr]$WindowHandle, {[AstraCapture]::Describe($args[0]);return $true},[IntPtr]::Zero) | Out-Null
$rect = New-Object AstraCapture+Rect
if (-not [AstraCapture]::GetWindowRect([IntPtr]$WindowHandle,[ref]$rect)) { throw 'Native video window not found' }
$bitmap = New-Object System.Drawing.Bitmap(($rect.Right-$rect.Left),($rect.Bottom-$rect.Top))
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try { $graphics.CopyFromScreen($rect.Left,$rect.Top,0,0,$bitmap.Size); $tl=$bitmap.GetPixel([int]($bitmap.Width*.25),[int]($bitmap.Height*.25));$tr=$bitmap.GetPixel([int]($bitmap.Width*.75),[int]($bitmap.Height*.25));$bl=$bitmap.GetPixel([int]($bitmap.Width*.25),[int]($bitmap.Height*.75));
 $metrics=@{blueGradient=[int]$tr.B-[int]$tl.B;greenGradient=[int]$tl.G-[int]$bl.G}
 $metrics | ConvertTo-Json -Compress
 if ([Math]::Abs($metrics.blueGradient) -lt 35 -or $metrics.greenGradient -lt 35) { Remove-Item -LiteralPath $OutputPath -ErrorAction SilentlyContinue; throw 'Desktop capture does not show the expected generated video pattern' }
 $bitmap.Save($OutputPath,[System.Drawing.Imaging.ImageFormat]::Png)
 } finally { $graphics.Dispose(); $bitmap.Dispose() }
