import { useEffect, useState } from 'react'
import { Bookmark, ChevronRight, House, Menu, UserRound, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../app/workspace'
import { AddressSearch } from './AddressSearch'

export function Brand() {
  return <Link className="brand" to="/"><span className="brand-mark"><House size={17} strokeWidth={2.4} /></span>Hearthstone Hub</Link>
}

export function Layout() {
  const { housing, auth, compareIds } = useWorkspace()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    setMenu(false)
    window.scrollTo(0, 0)
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname])
  const report = pathname.startsWith('/building/')
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <button className="menu-toggle button secondary" aria-expanded={menu} aria-controls="site-navigation"
          aria-label={menu ? 'Close navigation' : 'Open navigation'} onClick={() => setMenu(!menu)}>
          {menu ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav id="site-navigation" aria-label="Main navigation" className={'site-nav' + (menu ? ' is-open' : '')}
          onKeyDown={event => { if (event.key === 'Escape' && menu) { setMenu(false); document.querySelector<HTMLButtonElement>('.menu-toggle')?.focus() } }}>
          <NavLink to="/search" className={report ? 'related-active' : undefined}>Search</NavLink>
          <NavLink to="/how-it-works">How it works</NavLink>
          <NavLink to="/compare">Compare{compareIds.length > 0 && <span className="nav-count">{compareIds.length}</span>}</NavLink>
          <NavLink to="/saved"><Bookmark size={15} /> Saved</NavLink>
          {auth.available && <NavLink to="/account"><UserRound size={15} /> Account</NavLink>}
        </nav>
        {report && <div className="header-search">
          <AddressSearch compact label="Search another address" onSearch={query => navigate('/search?q=' + encodeURIComponent(query))}
            onChoose={async (building, signal) => {
              const resolved = await housing.resolveBuilding(building, signal)
              signal.throwIfAborted()
              navigate('/building/' + encodeURIComponent(resolved.id))
            }} />
        </div>}
      </div>
    </header>
    {housing.mode === 'mock' && <div className="demo-banner"><div className="container">
      <strong>Demonstration · sample data only.</strong> Explore the experience using fictional NYC building reports.
    </div></div>}
    <main id="main" tabIndex={-1}><Outlet /></main>
    <footer className="site-footer"><div className="container footer-inner">
      <Brand /><Link to="/how-it-works" className="text-link">Sources and limitations <ChevronRight size={16} /></Link>
    </div></footer>
  </>
}
