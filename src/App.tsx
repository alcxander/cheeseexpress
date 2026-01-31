import DriverPage from './pages/DriverPage'
import AdminTrackingPage from './pages/AdminTrackingPage'

const App = () => {
  const path = window.location.pathname
  if (path.startsWith('/admin/tracking')) {
    return <AdminTrackingPage />
  }
  return <DriverPage />
}

export default App
