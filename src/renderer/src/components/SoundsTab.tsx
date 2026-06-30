import { useState, useRef, useEffect } from 'react'
import { saveAppSound, listAppSounds, getAppSound, deleteAppSound, AppSound } from '../lib/soundsDb'

// ── WAV encoder ────────────────────────────────────────────────────────────────

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const n = samples.length
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const w = (off: number, s: string): void => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE')
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
  return buf
}

async function toEdgeTxWav(blob: Blob): Promise<ArrayBuffer> {
  const raw = await blob.arrayBuffer()
  const AC = window.AudioContext ?? (window as any).webkitAudioContext
  const ctx = new AC() as AudioContext
  const decoded = await ctx.decodeAudioData(raw)
  await ctx.close()
  const TARGET = 32000
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET), TARGET)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return encodeWav(rendered.getChannelData(0), TARGET)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SoundsTabProps {
  sdDrive: string | null
  onSoundSaved?: () => void   // called after Save to App so Voice & Switches refreshes
}

function fmt(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function SoundsTab({ sdDrive, onSoundSaved }: SoundsTabProps): JSX.Element {
  const getSoundsApi = (): typeof soundsApiShape | undefined => (window.api as any)?.sounds
  const soundsApiShape = {} as {
    listFiles: () => Promise<string[]>
    writeBinary: (path: string, data: ArrayBuffer) => Promise<{ success: boolean; error?: string }>
    readBinary: (path: string) => Promise<ArrayBuffer | null>
  }

  // SD card sounds
  const [sdFiles, setSdFiles] = useState<string[]>([])
  const [loadingSd, setLoadingSd] = useState(false)

  // App library (IndexedDB)
  const [appSounds, setAppSounds] = useState<AppSound[]>([])

  // Recording / upload
  const [mode, setMode] = useState<'record' | 'upload'>('record')
  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null)
  const [fileName, setFileName] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Playback
  const [playingFile, setPlayingFile] = useState<string | null>(null)   // SD card file
  const [playingApp, setPlayingApp] = useState<string | null>(null)      // app library file
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playCtxRef = useRef<AudioContext | null>(null)
  const playSrcRef = useRef<AudioBufferSourceNode | null>(null)
  const previewCtxRef = useRef<AudioContext | null>(null)
  const previewSrcRef = useRef<AudioBufferSourceNode | null>(null)
  const previewBufRef = useRef<AudioBuffer | null>(null)

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const loadSdFiles = async (): Promise<void> => {
    const api = getSoundsApi()
    if (!sdDrive || !api) return
    setLoadingSd(true)
    try { const files = await api.listFiles(); setSdFiles(files) }
    catch { /* ignore */ } finally { setLoadingSd(false) }
  }

  const loadAppSounds = async (): Promise<void> => {
    try { setAppSounds(await listAppSounds()) } catch { /* ignore */ }
  }

  useEffect(() => { loadAppSounds() }, [])
  useEffect(() => { if (sdDrive) loadSdFiles(); else setSdFiles([]) }, [sdDrive])

  // ── Preview playback ──────────────────────────────────────────────────────────

  const stopPreview = (): void => {
    if (previewSrcRef.current) { try { previewSrcRef.current.stop() } catch { /* already stopped */ } previewSrcRef.current = null }
    if (previewCtxRef.current) { previewCtxRef.current.close().catch(() => {}); previewCtxRef.current = null }
    previewBufRef.current = null
    setPreviewPlaying(false)
  }

  const stopFilePlayback = (): void => {
    if (playSrcRef.current) { try { playSrcRef.current.stop() } catch { /* ignore */ } playSrcRef.current = null }
    if (playCtxRef.current) { playCtxRef.current.close().catch(() => {}); playCtxRef.current = null }
    setPlayingFile(null)
    setPlayingApp(null)
  }

  const playBuffer = async (buf: ArrayBuffer, onEnd: () => void): Promise<void> => {
    stopFilePlayback()
    const AC = window.AudioContext ?? (window as any).webkitAudioContext
    const ctx = new AC() as AudioContext
    playCtxRef.current = ctx
    const decoded = await ctx.decodeAudioData(buf)
    const src = ctx.createBufferSource()
    playSrcRef.current = src
    src.buffer = decoded
    src.connect(ctx.destination)
    src.onended = onEnd
    src.start()
  }

  const clearSource = (): void => {
    stopPreview()
    setSourceBlob(null)
    setResult(null)
  }

  const playPreview = async (): Promise<void> => {
    if (!sourceBlob) return
    if (previewPlaying) { stopPreview(); return }
    setPreviewPlaying(true)
    try {
      if (!previewBufRef.current) {
        const raw = await sourceBlob.arrayBuffer()
        const AC = window.AudioContext ?? (window as any).webkitAudioContext
        const tmp = new AC() as AudioContext
        previewBufRef.current = await tmp.decodeAudioData(raw)
        await tmp.close()
      }
      const AC = window.AudioContext ?? (window as any).webkitAudioContext
      const ctx = new AC() as AudioContext
      previewCtxRef.current = ctx
      const src = ctx.createBufferSource()
      previewSrcRef.current = src
      src.buffer = previewBufRef.current
      src.connect(ctx.destination)
      src.onended = () => setPreviewPlaying(false)
      src.start()
    } catch { setPreviewPlaying(false) }
  }

  // ── Recording ─────────────────────────────────────────────────────────────────

  const startRecording = async (): Promise<void> => {
    setResult(null)
    clearSource()
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const mr = new MediaRecorder(stream)
      mrRef.current = mr
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        previewBufRef.current = null
        setSourceBlob(blob)
        setRecording(false)
        if (recTimerRef.current) clearInterval(recTimerRef.current)
        setFileName((prev) => prev || `rec_${Date.now().toString().slice(-6)}`.slice(0, 8))
      }
      mr.start()
      setRecording(true)
      setRecSeconds(0)
      recTimerRef.current = setInterval(() => setRecSeconds((p) => p + 1), 1000)
    } catch (e) {
      setResult({ ok: false, msg: `Microphone access denied: ${String(e)}` })
    }
  }

  const stopRecording = (): void => {
    mrRef.current?.stop()
    mrRef.current = null
    if (recTimerRef.current) clearInterval(recTimerRef.current)
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    clearSource()
    previewBufRef.current = null
    setSourceBlob(file)
    if (!fileName) {
      const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 8)
      setFileName(base)
    }
    e.target.value = ''
  }

  // ── Save actions ──────────────────────────────────────────────────────────────

  const safeFileName = (): string =>
    (fileName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 8) || 'sound')

  const saveToApp = async (): Promise<void> => {
    if (!sourceBlob) return
    const safeN = safeFileName()
    setSaving(true)
    setResult(null)
    try {
      const wav = await toEdgeTxWav(sourceBlob)
      await saveAppSound(safeN, wav)
      await loadAppSounds()
      onSoundSaved?.()
      setResult({ ok: true, msg: `"${safeN}" saved to App Library — now available in Voice & Switches` })
      clearSource()
      setFileName('')
    } catch (err) {
      setResult({ ok: false, msg: `Save failed: ${String(err)}` })
    } finally {
      setSaving(false)
    }
  }

  const saveToRadio = async (): Promise<void> => {
    const api = getSoundsApi()
    if (!sourceBlob || !api) return
    const safeN = safeFileName()
    setSaving(true)
    setResult(null)
    try {
      const wav = await toEdgeTxWav(sourceBlob)
      const res = await api.writeBinary(`SOUNDS/en/${safeN}.wav`, wav)
      if (res.success) {
        setResult({ ok: true, msg: `Saved "${safeN}.wav" to radio SOUNDS/en/` })
        setSdFiles((p) => [...new Set([...p, `${safeN}.wav`])].sort())
        clearSource()
        setFileName('')
      } else {
        setResult({ ok: false, msg: res.error ?? 'Write failed' })
      }
    } catch (err) {
      setResult({ ok: false, msg: `Conversion failed: ${String(err)}` })
    } finally {
      setSaving(false)
    }
  }

  const downloadWav = async (): Promise<void> => {
    if (!sourceBlob) return
    const safeN = safeFileName()
    setSaving(true)
    setResult(null)
    try {
      const wav = await toEdgeTxWav(sourceBlob)
      const wavFile = new File([wav], `${safeN}.wav`, { type: 'audio/wav' })
      if (navigator.canShare && navigator.canShare({ files: [wavFile] })) {
        await navigator.share({ files: [wavFile], title: `${safeN}.wav` })
      } else {
        const url = URL.createObjectURL(wavFile)
        const a = document.createElement('a')
        a.href = url; a.download = `${safeN}.wav`
        document.body.appendChild(a); a.click()
        document.body.removeChild(a); URL.revokeObjectURL(url)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setResult({ ok: false, msg: String(err) })
      }
    } finally {
      setSaving(false)
    }
  }

  // ── App library playback ──────────────────────────────────────────────────────

  const playAppSound = async (name: string): Promise<void> => {
    if (playingApp === name) { stopFilePlayback(); return }
    try {
      const buf = await getAppSound(name)
      if (!buf) return
      setPlayingApp(name)
      await playBuffer(buf, () => setPlayingApp(null))
    } catch { setPlayingApp(null) }
  }

  const deleteFromApp = async (name: string): Promise<void> => {
    await deleteAppSound(name)
    await loadAppSounds()
    onSoundSaved?.()
  }

  // ── SD card file playback ─────────────────────────────────────────────────────

  const playFromRadio = async (filename: string): Promise<void> => {
    const api = getSoundsApi()
    if (!api) return
    if (playingFile === filename) { stopFilePlayback(); return }
    try {
      const buf = await api.readBinary(`SOUNDS/en/${filename}`)
      if (!buf) return
      setPlayingFile(filename)
      await playBuffer(buf, () => setPlayingFile(null))
    } catch { setPlayingFile(null) }
  }

  const copyName = (name: string): void => {
    navigator.clipboard.writeText(name).catch(() => {})
    setCopied(name)
    setTimeout(() => setCopied(null), 1500)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="py-4 px-6 space-y-6">

      {/* ── App Library ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[#f1f5f9] text-sm font-semibold">App Library</span>
          <span className="text-[#94a3b8] text-xs">saved in this browser · always available</span>
          {appSounds.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-[#243044] text-[#94a3b8] text-[10px]">{appSounds.length}</span>
          )}
        </div>

        {appSounds.length === 0 ? (
          <div className="rounded-lg bg-[#1e293b] border border-[#334155] px-4 py-3 text-[#475569] text-xs italic">
            No sounds saved yet — record or upload below, then tap "Save to App"
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {appSounds.map((s) => {
                const isPlaying = playingApp === s.name
                const wasCopied = copied === s.name
                return (
                  <div
                    key={s.name}
                    className={`flex items-center gap-1.5 pl-2 pr-1 py-1.5 rounded-lg border transition-colors ${
                      isPlaying ? 'bg-[#22c55e]/10 border-[#22c55e]/40' : 'bg-[#1e293b] border-[#334155] hover:border-[#475569]'
                    }`}
                  >
                    <button
                      onClick={() => playAppSound(s.name)}
                      className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded transition-colors ${
                        isPlaying ? 'text-[#22c55e]' : 'text-[#94a3b8] hover:text-[#f1f5f9]'
                      }`}
                    >
                      {isPlaying ? '■' : '▶'}
                    </button>
                    <span className="text-[#f1f5f9] text-xs font-mono">{s.name}</span>
                    <button
                      onClick={() => copyName(s.name)}
                      title="Copy name"
                      className={`text-[11px] px-1 py-0.5 rounded transition-all ${
                        wasCopied ? 'text-[#22c55e]' : 'text-[#475569] hover:text-[#94a3b8]'
                      }`}
                    >
                      {wasCopied ? '✓' : '⎘'}
                    </button>
                    <button
                      onClick={() => deleteFromApp(s.name)}
                      title="Delete"
                      className="text-[11px] px-1 py-0.5 rounded text-[#475569] hover:text-[#ef4444] transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
            <p className="text-[#22c55e] text-[10px] mt-2 font-medium">
              ✓ These sounds appear in Voice &amp; Switches automatically
            </p>
          </>
        )}
      </div>

      <div className="border-t border-[#334155]" />

      {/* ── SD Card sounds ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[#f1f5f9] text-sm font-semibold">Radio SD Card</span>
          <span className="text-[#94a3b8] text-xs font-mono">SOUNDS/en/</span>
          {sdFiles.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-[#243044] text-[#94a3b8] text-[10px]">{sdFiles.length}</span>
          )}
          {sdDrive && (
            <button
              onClick={loadSdFiles}
              disabled={loadingSd}
              className="ml-auto text-[10px] text-[#94a3b8] hover:text-[#f1f5f9] border border-[#334155] rounded px-2 py-0.5 transition-colors disabled:opacity-40"
            >
              {loadingSd ? 'Scanning…' : '↻ Refresh'}
            </button>
          )}
        </div>

        {!sdDrive ? (
          <div className="rounded-lg bg-[#1e293b] border border-[#334155] px-4 py-3 text-[#94a3b8] text-xs">
            Connect your TX16S to browse and play existing sound files
          </div>
        ) : sdFiles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sdFiles.map((f) => {
              const name = f.replace(/\.wav$/i, '')
              const isPlaying = playingFile === f
              const wasCopied = copied === name
              return (
                <div
                  key={f}
                  className={`flex items-center gap-1.5 pl-2 pr-1.5 py-1.5 rounded-lg border transition-colors ${
                    isPlaying ? 'bg-[#22c55e]/10 border-[#22c55e]/40' : 'bg-[#1e293b] border-[#334155] hover:border-[#475569]'
                  }`}
                >
                  <button
                    onClick={() => playFromRadio(f)}
                    className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded ${
                      isPlaying ? 'text-[#22c55e]' : 'text-[#94a3b8] hover:text-[#f1f5f9]'
                    }`}
                  >
                    {isPlaying ? '■' : '▶'}
                  </button>
                  <span className="text-[#f1f5f9] text-xs font-mono">{name}</span>
                  <button
                    onClick={() => copyName(name)}
                    className={`text-[11px] px-1.5 py-0.5 rounded ml-1 ${
                      wasCopied ? 'text-[#22c55e]' : 'text-[#475569] hover:text-[#94a3b8]'
                    }`}
                  >
                    {wasCopied ? '✓' : '⎘'}
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-[#475569] text-xs italic">
            {loadingSd ? 'Scanning…' : 'No .wav files found in SOUNDS/en/'}
          </p>
        )}
      </div>

      <div className="border-t border-[#334155]" />

      {/* ── Record / Upload ── */}
      <div>
        <div className="text-[#f1f5f9] text-sm font-semibold mb-1">Add New Sound</div>
        <p className="text-[#94a3b8] text-xs mb-3">Record or upload · preview · save to app</p>

        <div className="flex gap-2 mb-4">
          {(['record', 'upload'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); if (recording) stopRecording(); clearSource() }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                mode === m
                  ? 'bg-[#3b82f6]/20 border-[#3b82f6]/50 text-[#3b82f6]'
                  : 'border-[#334155] text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              {m === 'record' ? '🎙 Record from Mic' : '📁 Upload File'}
            </button>
          ))}
        </div>

        {mode === 'record' && !sourceBlob && (
          <div className="rounded-xl bg-[#1e293b] border border-[#334155] p-5 text-center">
            {!recording ? (
              <div className="space-y-3">
                <p className="text-[#94a3b8] text-sm">Say your callout — "Flaps down", "Gear up", "SAFE on"…</p>
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white mx-auto hover:scale-105 transition-transform"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                >
                  🎙 Start Recording
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ef4444] animate-pulse" />
                  <span className="text-[#ef4444] font-mono font-bold text-2xl tracking-widest">{fmt(recSeconds)}</span>
                </div>
                <p className="text-[#94a3b8] text-sm">Recording… speak clearly</p>
                <button
                  onClick={stopRecording}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm border border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors mx-auto"
                >
                  ⏹ Stop
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'upload' && !sourceBlob && (
          <label className="block cursor-pointer">
            <div className="rounded-xl bg-[#1e293b] border border-[#334155] border-dashed p-8 text-center hover:border-[#475569] transition-colors">
              <span className="text-4xl block mb-3">🎵</span>
              <p className="text-[#f1f5f9] text-sm font-medium mb-1">Click to choose an audio file</p>
              <p className="text-[#94a3b8] text-xs">MP3, WAV, M4A, OGG — any format, any sample rate</p>
            </div>
            <input type="file" accept="audio/*" className="hidden" onChange={handleUpload} />
          </label>
        )}

        {sourceBlob && (
          <div className="rounded-xl bg-[#1e293b] border border-[#334155] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[#22c55e] text-xs font-semibold">✓ Audio captured</span>
              <button onClick={clearSource} className="ml-auto text-[#94a3b8] hover:text-[#ef4444] text-xs transition-colors">
                ✕ Discard
              </button>
            </div>

            <button
              onClick={playPreview}
              className={`w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm border transition-all ${
                previewPlaying
                  ? 'bg-[#22c55e]/10 border-[#22c55e]/40 text-[#22c55e]'
                  : 'bg-[#243044] border-[#334155] text-[#f1f5f9] hover:border-[#475569]'
              }`}
            >
              <span className="text-base">{previewPlaying ? '⏸' : '▶'}</span>
              {previewPlaying ? 'Stop' : 'Play Recording'}
            </button>

            {/* Filename */}
            <div className="space-y-1.5">
              <label className="text-[#f1f5f9] text-xs font-medium block">
                Filename <span className="text-[#94a3b8] font-normal">(max 8 chars · no extension)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={8}
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'))}
                  placeholder="flap_dn"
                  className="flex-1 bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-[#f1f5f9] text-sm font-mono focus:outline-none focus:border-[#3b82f6] transition-colors"
                />
                <span className="text-[#94a3b8] text-sm font-mono">.wav</span>
              </div>
            </div>

            {/* PRIMARY: Save to App */}
            <button
              onClick={saveToApp}
              disabled={saving}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                !saving
                  ? 'bg-[#22c55e] hover:bg-[#16a34a] text-black shadow-lg shadow-green-900/30'
                  : 'bg-[#243044] text-[#475569] cursor-not-allowed'
              }`}
            >
              {saving ? '⏳ Saving…' : '💾 Save to App Library'}
            </button>

            {/* Secondary: Save to Radio + Download */}
            <div className="flex gap-2">
              <button
                onClick={saveToRadio}
                disabled={saving || !sdDrive}
                title={!sdDrive ? 'Connect radio first' : ''}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  !saving && sdDrive
                    ? 'border-[#3b82f6]/50 text-[#3b82f6] hover:bg-[#3b82f6]/10'
                    : 'border-[#243044] text-[#334155] cursor-not-allowed'
                }`}
              >
                ⬆ {sdDrive ? 'Save to Radio SD' : 'Save to Radio (connect first)'}
              </button>
              <button
                onClick={downloadWav}
                disabled={saving}
                className={`flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  !saving
                    ? 'border-[#334155] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#475569]'
                    : 'border-[#243044] text-[#334155] cursor-not-allowed'
                }`}
              >
                ⬇ Download
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className={`mt-3 rounded-xl px-4 py-3 border text-sm ${
            result.ok
              ? 'bg-[#0d2818] border-[#22c55e]/40 text-[#22c55e]'
              : 'bg-[#2d0f0f] border-[#ef4444]/40 text-[#ef4444]'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <span>{result.ok ? '✓ ' : '✗ '}{result.msg}</span>
              <button onClick={() => setResult(null)} className="opacity-60 hover:opacity-100 shrink-0">×</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
