import axios from 'axios'
import { installDemoMock } from '@demo/installMock.js'

axios.defaults.withCredentials = true
installDemoMock(axios)

/** Set from App.jsx so 401 clears login UI */
export const authHandlers = {
  onUnauthorized: null
}

axios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status !== 401) return Promise.reject(err)
    const url = err.config?.url || ''
    if (url.includes('/api/admin/login') || url.includes('/api/admin/session')) {
      return Promise.reject(err)
    }
    if (
      url.includes('/api/admin/') ||
      (url.includes('/api/config') && !url.includes('/public')) ||
      url.includes('/api/prequeue/') ||
      url.includes('/api/auth/disconnect')
    ) {
      authHandlers.onUnauthorized?.()
    }
    return Promise.reject(err)
  }
)

export default axios
