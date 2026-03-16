export interface ApiInfo {
  port: number
  token: string
}

export interface PythonStatus {
  running: boolean
  port: number
}

declare global {
  interface Window {
    electronAPI: {
      getApiInfo: () => Promise<ApiInfo>
      getPythonStatus: () => Promise<PythonStatus>
    }
  }
}
