import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initWasm } from './lib/wallet/wasmLoader'

async function init() {
  try {
    // Initialize WASM module BEFORE rendering React
    console.log('Initializing WASM...')
    await initWasm()
    console.log('WASM initialized, rendering app...')

    // Render the app only after WASM is ready
    createRoot(document.getElementById('root')!).render(<App />)
  } catch (error) {
    console.error('Failed to initialize app:', error)
    document.getElementById('root')!.innerHTML = `
      <div style="color: #ef4444; padding: 20px; text-align: center; background: #0a0a0f; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; font-family: system-ui;">
        <h2 style="margin-bottom: 16px;">Failed to load application</h2>
        <p style="color: #9ca3af;">There was an error initializing the application.</p>
        <p style="color: #9ca3af; margin-top: 8px;">Please refresh the page and try again.</p>
        <pre style="color: #f87171; margin-top: 16px; font-size: 12px;">${error}</pre>
      </div>
    `
  }
}

init()
