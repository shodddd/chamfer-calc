# Простой HTTP-сервер для локального тестирования PWA
param([int]$Port = 8765)

$root = $PSScriptRoot
$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix (Ctrl+C to stop)"

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.png'  = 'image/png'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.txt'  = 'text/plain; charset=utf-8'
    '.md'   = 'text/markdown; charset=utf-8'
}

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
        $path = Join-Path $root $rel
        try {
            if (Test-Path $path -PathType Leaf) {
                $ext = [IO.Path]::GetExtension($path).ToLower()
                $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
                $bytes = [IO.File]::ReadAllBytes($path)
                $res.ContentType = $ct
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
                $msg = [Text.Encoding]::UTF8.GetBytes("Not found: $rel")
                $res.OutputStream.Write($msg, 0, $msg.Length)
            }
        } catch {
            $res.StatusCode = 500
            $msg = [Text.Encoding]::UTF8.GetBytes($_.Exception.Message)
            $res.OutputStream.Write($msg, 0, $msg.Length)
        } finally {
            $res.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
}
