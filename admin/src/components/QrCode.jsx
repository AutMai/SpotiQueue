import { useState, useEffect, useRef } from 'react'
import axios from '@/lib/api'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Download, ImageIcon, RefreshCw, ShieldAlert, Loader2, Eye, EyeOff } from 'lucide-react'

function QrCode() {
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rotating, setRotating] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [overlay, setOverlay] = useState(false)
  const [overlayBusy, setOverlayBusy] = useState(false)

  useEffect(() => {
    axios.get('/api/admin/room')
      .then(res => {
        setRoom(res.data)
        setCustomUrl(res.data.base_url || '')
      })
      .catch(() => setError('Could not load the current room.'))
      .finally(() => setLoading(false))
  }, [])

  // Reflects the live flag, so the button is right even if another helper toggled it
  useEffect(() => {
    const read = () => axios.get('/api/config/public')
      .then(res => setOverlay(!!res.data?.karaoke_qr_overlay))
      .catch(() => {})
    read()
    const timer = setInterval(read, 5000)
    return () => clearInterval(timer)
  }, [])

  const toggleOverlay = async () => {
    setOverlayBusy(true)
    setError('')
    try {
      const next = !overlay
      await axios.put('/api/config/karaoke_qr_overlay', { value: next ? 'true' : 'false' })
      setOverlay(next)
    } catch (e) {
      setError(e.response?.data?.error || 'Could not toggle the big QR.')
    } finally {
      setOverlayBusy(false)
    }
  }

  const qrCanvasRef = useRef(null)

  // Typing a one-off base URL re-points the QR without saving it to config.
  const baseUrl = customUrl.trim() || room?.base_url || ''
  const displayUrl = (() => {
    if (!baseUrl) return ''
    if (!room?.rooms_enabled || !room?.code) return baseUrl
    try {
      const url = new URL(baseUrl)
      url.searchParams.set('room', room.code)
      return url.toString()
    } catch {
      return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}room=${encodeURIComponent(room.code)}`
    }
  })()

  const handleCopy = () => {
    if (!displayUrl) return
    navigator.clipboard.writeText(displayUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleNewRoom = async () => {
    if (!window.confirm(
      'Create a new room?\n\n' +
      'The current QR code and link stop working immediately. Everyone has to rescan, ' +
      'and the pending approval list, votes and cooldowns are cleared.\n\n' +
      'Songs already sent to Spotify keep playing.'
    )) return

    setRotating(true)
    setError('')
    try {
      const res = await axios.post('/api/admin/room/new', { base_url: customUrl.trim() || undefined })
      setRoom(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create a new room.')
    } finally {
      setRotating(false)
    }
  }

  const handleDownloadQR = () => {
    if (!displayUrl || !qrCanvasRef.current) return
    const link = document.createElement('a')
    link.download = `queue-qr-${room?.code || 'code'}.png`
    link.href = qrCanvasRef.current.toDataURL('image/png')
    link.click()
  }

  const handleDownloadShareableImage = () => {
    if (!displayUrl || !qrCanvasRef.current) return
    const qrCanvas = qrCanvasRef.current
    const qrSize = 200
    const padding = 32
    const textHeight = 104
    const canvas = document.createElement('canvas')
    canvas.width = qrSize + padding * 2
    canvas.height = qrSize + padding * 2 + textHeight
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(qrCanvas, padding, padding, qrSize, qrSize)
    ctx.fillStyle = '#1a1a1a'
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Scan to queue music', canvas.width / 2, qrSize + padding + 28)

    if (room?.rooms_enabled && room?.code) {
      ctx.font = 'bold 15px ui-monospace, monospace'
      ctx.fillStyle = '#1a1a1a'
      ctx.fillText(`Room ${room.code}`, canvas.width / 2, qrSize + padding + 52)
    }

    ctx.font = '13px system-ui, sans-serif'
    ctx.fillStyle = '#666'
    const line = displayUrl
    if (ctx.measureText(line).width > canvas.width - 24) {
      ctx.font = '10px system-ui, sans-serif'
    }
    ctx.fillText(line, canvas.width / 2, qrSize + padding + 78)

    const link = document.createElement('a')
    link.download = `queue-scan-me-${room?.code || 'code'}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Loading...</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Room QR Code</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Guests can only queue through the current room link. If people start abusing the
                queue, create a new room and show the fresh QR &mdash; the old link dies instantly.
              </p>
            </div>
            {room?.rooms_enabled && room?.code && (
              <div className="shrink-0 text-right">
                <div className="text-xs text-muted-foreground">Current room</div>
                <div className="font-mono text-xl font-bold tracking-widest">{room.code}</div>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          {!room?.rooms_enabled && (
            <div className="mb-4 flex gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Rooms are disabled in Configuration, so the queue is open to anyone with the link.
                Enable &ldquo;Require a room code&rdquo; to use rotating QR codes.
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {displayUrl && (
              <div className="flex flex-col items-center gap-3 shrink-0">
                <div className="bg-white p-4 rounded-xl">
                  <QRCodeSVG value={displayUrl} size={200} level="M" />
                </div>
                <div className="fixed -left-[9999px] top-0 w-[200px] h-[200px]" aria-hidden="true">
                  <QRCodeCanvas ref={qrCanvasRef} value={displayUrl} size={200} level="M" />
                </div>
                <span className="text-xs text-muted-foreground">Scan to open queue</span>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={handleDownloadQR}>
                    <Download className="h-4 w-4 mr-1" /> Download QR
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadShareableImage}>
                    <ImageIcon className="h-4 w-4 mr-1" /> Shareable image
                  </Button>
                </div>
              </div>
            )}

            <div className="flex-1 min-w-0 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Guest link</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={displayUrl}
                    readOnly
                    className="font-mono text-sm w-full"
                  />
                  <Button variant="outline" size="sm" onClick={handleCopy} disabled={!displayUrl} className="sm:shrink-0">
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  This is what the QR code encodes. Send it directly or save the image above.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Base URL</label>
                <Input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://your-queue.com"
                  className="font-mono text-sm w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  From Configuration &rarr; URLs (Queue URL), or CLIENT_URL env. Override here for one-off use.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-1">Show it big on the karaoke screen</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Fills the beamer with this QR code so a whole group can scan at once. The
            lyrics come back the moment you switch it off. Takes a few seconds to appear.
          </p>
          <Button
            variant={overlay ? 'destructive' : 'default'}
            onClick={toggleOverlay}
            disabled={overlayBusy}
            className="min-h-[44px]"
          >
            {overlayBusy
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Working…</>
              : overlay
                ? <><EyeOff className="h-4 w-4 mr-2" /> Hide the big QR</>
                : <><Eye className="h-4 w-4 mr-2" /> Show the big QR</>}
          </Button>
          {overlay && (
            <p className="mt-3 text-sm text-amber-600 dark:text-amber-500">
              The karaoke screen is showing the QR instead of lyrics right now.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-1">Start a new room</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Generates a new code and QR. The old link stops working immediately, and the pending
            approval list, votes and cooldowns are cleared. Songs already handed to Spotify keep
            playing &mdash; Spotify does not allow removing them from the queue.
          </p>
          <Button variant="destructive" onClick={handleNewRoom} disabled={rotating} className="min-h-[44px]">
            {rotating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
            ) : (
              <><RefreshCw className="h-4 w-4 mr-2" /> Create new room</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default QrCode
