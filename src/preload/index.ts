import { contextBridge, ipcRenderer } from 'electron'

export interface ApiInfo {
  port: number
  token: string
}

export interface PythonStatus {
  running: boolean
  port: number
}

const api = {
  /** Python API 서버 접속 정보를 가져온다. */
  getApiInfo: (): Promise<ApiInfo> => ipcRenderer.invoke('get-api-info'),

  /** Python 코어 프로세스 상태를 확인한다. */
  getPythonStatus: (): Promise<PythonStatus> => ipcRenderer.invoke('get-python-status')
}

contextBridge.exposeInMainWorld('electronAPI', api)
