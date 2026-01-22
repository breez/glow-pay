import initBreezSDK from '@breeztech/breez-sdk-spark'

let initialized = false

export const initWasm = async (): Promise<void> => {
  if (initialized) {
    return
  }

  try {
    console.log('Initializing WASM module...')
    await initBreezSDK()
    console.log('WASM module initialized successfully')
    initialized = true
  } catch (error) {
    console.error('Failed to initialize WASM module:', error)
    throw error
  }
}

export const isWasmInitialized = (): boolean => {
  return initialized
}
