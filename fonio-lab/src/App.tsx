import { useEffect, useState } from 'react'
import OrbPage from './pages/OrbPage'
import WavePage from './pages/WavePage'

function usePath(): [string, (p: string) => void] {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (p: string) => {
    window.history.pushState(null, '', p)
    setPath(p)
  }

  return [path, navigate]
}

export default function App() {
  const [path, navigate] = usePath()

  const link = (to: string, label: string) => (
    <a
      href={to}
      className={`nav-link${path === to ? ' active' : ''}`}
      onClick={(e) => {
        e.preventDefault()
        navigate(to)
      }}
    >
      {label}
    </a>
  )

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">
          <span className="nav-logo-dot" />
          fonio visual lab
        </div>
        {link('/', 'Orb')}
        {link('/wave', 'Soundwave')}
      </nav>
      {path === '/wave' ? <WavePage /> : <OrbPage />}
    </>
  )
}
