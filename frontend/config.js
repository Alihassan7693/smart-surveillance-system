// ─────────────────────────────────────────────────────────────────────────────
//  BACKEND URL CONFIG
//  Change BACKEND_HTTP and BACKEND_WS when switching between local and Colab.
// ─────────────────────────────────────────────────────────────────────────────

export const BACKEND_HTTP = 'http://127.0.0.1:8000'
export const BACKEND_WS   = 'ws://127.0.0.1:8000'

// For Colab + ngrok, change both to:
//   export const BACKEND_HTTP = 'https://xxxx-xxxx.ngrok-free.app'
//   export const BACKEND_WS   = 'wss://xxxx-xxxx.ngrok-free.app'
