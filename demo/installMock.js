import { handleDemoRequest } from './handlers.js'
import { startDemoProgress } from './progress.js'

export function installDemoMock(axiosInstance) {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return

  startDemoProgress()

  axiosInstance.interceptors.request.use((config) => {
    config.adapter = (cfg) => demoAdapter(cfg)
    return config
  })
}

function demoAdapter(config) {
  const result = handleDemoRequest(config)
  return Promise.resolve({
    data: result.data,
    status: result.status,
    statusText: result.status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' },
    config,
    request: {}
  }).then(response => {
    if (result.status >= 400) {
      const error = new Error(`Request failed with status code ${result.status}`)
      error.response = response
      error.config = config
      return Promise.reject(error)
    }
    return response
  })
}
