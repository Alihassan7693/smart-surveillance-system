import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { BACKEND_WS } from '../config.js'

const StreamContext = createContext(null)

export function StreamProvider({ children }) {
  // State — drives UI, kept minimal to avoid re-rendering on every frame
  const [rtspMode,          setRtspMode]          = useState('idle')   // 'idle' | 'connecting' | 'streaming'
  const [connecting,        setConnecting]         = useState(false)
  const [processedResult,   setProcessedResult]    = useState(null)
  const [bufferingProgress, setBufferingProgress]  = useState(null)
  const [error,             setError]              = useState('')

  // Refs — updated per-frame without triggering re-renders
  const wsRef            = useRef(null)   // live RTSP WebSocket
  const latestFrameRef   = useRef(null)   // base64 JPEG of most recent frame (for canvas on remount)
  const latestResultRef  = useRef(null)   // most recent inference result  (for canvas on remount)
  const frameListenerRef = useRef(null)   // LiveFeedPage registers its canvas renderer here

  // Auto-clear error after 5 s
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(''), 5000)
    return () => clearTimeout(t)
  }, [error])

  const stopRTSP = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null   // prevent re-entrant call
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }
    latestFrameRef.current   = null
    latestResultRef.current  = null
    frameListenerRef.current = null
    setRtspMode('idle')
    setConnecting(false)
    setProcessedResult(null)
    setBufferingProgress(null)
  }, [])

  const startRTSP = useCallback((url) => {
    if (!url.trim()) { setError('Enter camera IP address'); return }
    stopRTSP()
    setError('')

    const ws = new WebSocket(`${BACKEND_WS}/ws/rtsp`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start', url }))
      setRtspMode('connecting')
      setConnecting(true)
      setProcessedResult(null)
      setBufferingProgress(null)
      latestResultRef.current = null
      latestFrameRef.current  = null
    }

    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data)
      if (data.type === 'connecting') {
        setConnecting(true)
      } else if (data.type === 'frame') {
        latestFrameRef.current = data.frame   // update ref only — no re-render on every frame
        setConnecting(false)
        setRtspMode('streaming')
        if (data.buffering) {
          setBufferingProgress({ buffered: data.frames_buffered, needed: data.frames_needed })
        } else {
          setBufferingProgress(null)
          latestResultRef.current = data
          setProcessedResult(data)
        }
        // Notify canvas renderer if LiveFeedPage is currently mounted
        if (frameListenerRef.current) frameListenerRef.current(data)
      } else if (data.type === 'error') {
        setConnecting(false)
        setError(data.message)
      }
    }

    ws.onerror = () => { setError('Camera stream error'); setConnecting(false) }
    ws.onclose = () => stopRTSP()
  }, [stopRTSP])

  const value = useMemo(() => ({
    rtspMode, connecting, processedResult, bufferingProgress, error,
    wsRef, latestFrameRef, latestResultRef, frameListenerRef,
    startRTSP, stopRTSP,
  }), [rtspMode, connecting, processedResult, bufferingProgress, error, startRTSP, stopRTSP])

  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>
}

export function useStream() {
  const ctx = useContext(StreamContext)
  if (!ctx) throw new Error('useStream must be used inside <StreamProvider>')
  return ctx
}
