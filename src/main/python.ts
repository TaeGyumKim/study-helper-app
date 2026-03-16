/**
 * Python 코어 프로세스 관리.
 *
 * FastAPI 서버를 자식 프로세스로 실행하고,
 * 헬스 체크, 종료, 재시작을 관리한다.
 */

import { ChildProcess, spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import { platform } from 'os'

const HEALTH_CHECK_INTERVAL = 3000 // ms
const STARTUP_TIMEOUT = 30000 // ms
const DEFAULT_PORT = 18090

export class PythonCore {
  private process: ChildProcess | null = null
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private _port: number = DEFAULT_PORT
  private _token: string = ''
  private _isRunning = false

  get port(): number {
    return this._port
  }

  get token(): string {
    return this._token
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  /**
   * Python 코어 FastAPI 서버를 시작한다.
   */
  async start(): Promise<void> {
    this._token = randomBytes(32).toString('hex')
    this._port = DEFAULT_PORT

    const pythonPath = this.resolvePythonPath()
    const dataDir = join(app.getPath('userData'), 'core-data')

    const env = {
      ...process.env,
      STUDY_HELPER_API_TOKEN: this._token,
      STUDY_HELPER_API_PORT: String(this._port),
      STUDY_HELPER_DATA_DIR: dataDir
    }

    console.log(`[PythonCore] Starting: ${pythonPath}`)
    console.log(`[PythonCore] Data dir: ${dataDir}`)
    console.log(`[PythonCore] Port: ${this._port}`)

    this.process = spawn(pythonPath, ['-m', 'src.api.server'], {
      env,
      cwd: this.resolveCoreDir(),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      console.log(`[Python] ${data.toString().trim()}`)
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[Python] ${data.toString().trim()}`)
    })

    this.process.on('exit', (code) => {
      console.log(`[PythonCore] Process exited with code ${code}`)
      this._isRunning = false
    })

    // 서버 시작 대기
    await this.waitForReady()
    this._isRunning = true

    // 주기적 헬스 체크
    this.healthTimer = setInterval(() => this.healthCheck(), HEALTH_CHECK_INTERVAL)
  }

  /**
   * Python 프로세스를 종료한다.
   */
  stop(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }

    if (this.process) {
      console.log('[PythonCore] Stopping...')
      this.process.kill('SIGTERM')

      // 3초 후에도 살아있으면 강제 종료
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          console.log('[PythonCore] Force killing...')
          this.process.kill('SIGKILL')
        }
      }, 3000)

      this.process = null
      this._isRunning = false
    }
  }

  /**
   * Python 실행 경로를 결정한다.
   * 개발: 시스템 python / 프로덕션: 번들된 PyInstaller 바이너리
   */
  private resolvePythonPath(): string {
    if (app.isPackaged) {
      const ext = platform() === 'win32' ? '.exe' : ''
      return join(process.resourcesPath, 'python-core', `study-helper-core${ext}`)
    }
    // 개발 모드: 시스템 python 사용
    return platform() === 'win32' ? 'python' : 'python3'
  }

  /**
   * 코어 프로젝트 루트 디렉토리를 결정한다.
   */
  private resolveCoreDir(): string {
    if (app.isPackaged) {
      return join(process.resourcesPath, 'python-core')
    }
    // 개발 모드: study-helper 프로젝트가 형제 디렉토리에 있다고 가정
    return join(__dirname, '..', '..', '..', '..', 'study-helper')
  }

  /**
   * 서버가 ready 상태가 될 때까지 대기한다.
   */
  private async waitForReady(): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < STARTUP_TIMEOUT) {
      try {
        const res = await fetch(`http://127.0.0.1:${this._port}/health`, {
          headers: this._token ? { Authorization: `Bearer ${this._token}` } : {}
        })
        if (res.ok) {
          console.log('[PythonCore] Server ready')
          return
        }
      } catch {
        // 아직 시작 안 됨
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('Python core failed to start within timeout')
  }

  /**
   * 헬스 체크를 수행하고, 실패 시 재시작한다.
   */
  private async healthCheck(): Promise<void> {
    try {
      const res = await fetch(`http://127.0.0.1:${this._port}/health`, {
        headers: this._token ? { Authorization: `Bearer ${this._token}` } : {},
        signal: AbortSignal.timeout(5000)
      })
      if (!res.ok) throw new Error(`Status ${res.status}`)
    } catch {
      console.warn('[PythonCore] Health check failed, restarting...')
      this._isRunning = false
      this.stop()
      try {
        await this.start()
      } catch (e) {
        console.error('[PythonCore] Restart failed:', e)
      }
    }
  }
}
