import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Courses from './pages/Courses'
import CourseDetail from './pages/CourseDetail'
import Settings from './pages/Settings'

function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-white">
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/course/:courseIdx" element={<CourseDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  )
}

export default App
