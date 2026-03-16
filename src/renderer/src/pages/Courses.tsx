import { useEffect, useState } from 'react'
import { getVersion } from '../api/client'

function Courses(): JSX.Element {
  const [version, setVersion] = useState('')

  useEffect(() => {
    getVersion().then(setVersion).catch(console.error)
  }, [])

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">수강 과목</h1>
        {version && (
          <span className="text-xs text-gray-400">Core v{version}</span>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">
          과목 목록은 Phase 2 (LMS 브라우저 자동화 포팅) 후 표시됩니다.
        </p>
      </div>
    </div>
  )
}

export default Courses
