import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BrandIcon,
  ChevronDownIcon,
  InboxIcon,
  LogoutIcon,
  MoonIcon,
  ProfileIcon,
  SearchIcon,
  SunIcon,
} from './Icons.jsx'

function getInitials(fullName) {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase())
    .join('')
}

function formatBadge(value) {
  if (!value) {
    return ''
  }
  return value > 99 ? '99+' : String(value)
}

export function AppLayout({
  dashboardData,
  onLogout,
  onRefresh,
  onRefreshSession,
  onThemeChange,
  theme,
  user,
}) {
  const location = useLocation()
  const [searchByPath, setSearchByPath] = useState({})
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const searchValue = searchByPath[location.pathname] || ''
  const unreadBadge = formatBadge(user?.unread_messages_count)

  useEffect(() => {
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  return (
    <div className="workspace-shell" data-theme={theme}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <BrandIcon />
            <div className="brand-copy">
              <strong>Inventary ERP</strong>
              <span>Sistema interno</span>
            </div>
          </div>

          <div className="nav-links" aria-label="Navegacion principal">
            <NavLink className="nav-link" end to="/">
              Panel
            </NavLink>
            <NavLink className="nav-link" to="/inventario">
              Inventario
            </NavLink>
          </div>
        </div>

        <label className="workspace-search" htmlFor="workspace-search">
          <SearchIcon />
          <input
            id="workspace-search"
            onChange={(event) =>
              setSearchByPath((current) => ({
                ...current,
                [location.pathname]: event.target.value,
              }))
            }
            placeholder="Buscar en el sistema"
            type="search"
            value={searchValue}
          />
        </label>

        <div className="topbar-right">
          <Link
            aria-label="Abrir mensajes"
            className={`topbar-icon-button ${user?.open_alarm_count ? 'has-alert' : ''}`}
            title="Mensajes"
            to="/mensajes"
          >
            <InboxIcon />
            {unreadBadge ? <span className="topbar-icon-badge">{unreadBadge}</span> : null}
            {user?.open_alarm_count ? <span className="topbar-icon-dot" /> : null}
          </Link>

          <button
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-pressed={theme === 'dark'}
            className={`theme-switch ${theme === 'dark' ? 'is-dark' : 'is-light'}`}
            onClick={() => {
              const nextTheme = theme === 'dark' ? 'light' : 'dark'
              void onThemeChange(nextTheme)
            }}
            title={theme === 'dark' ? 'Modo oscuro activo' : 'Modo claro activo'}
            type="button"
          >
            <span className="theme-switch-icon theme-switch-icon--sun">
              <SunIcon />
            </span>
            <span className="theme-switch-icon theme-switch-icon--moon">
              <MoonIcon />
            </span>
            <span className="theme-switch-thumb" />
          </button>

          <div className="user-menu-wrap" ref={menuRef}>
            <button
              aria-expanded={menuOpen}
              className="user-chip user-chip-button"
              onClick={() => setMenuOpen((current) => !current)}
              type="button"
            >
              {user?.avatar_url ? (
                <img
                  alt={user.full_name}
                  className="user-avatar user-avatar-image"
                  src={user.avatar_url}
                />
              ) : (
                <span className="user-avatar">{getInitials(user.full_name)}</span>
              )}
              <div>
                <span className="user-name">{user.full_name}</span>
                <span className="user-role">{user.role_label || user.username}</span>
              </div>
              <span className="user-chip-caret">
                <ChevronDownIcon />
              </span>
            </button>

            {menuOpen ? (
              <div className="user-menu">
                <Link
                  className="user-menu-link"
                  onClick={() => setMenuOpen(false)}
                  to="/perfil"
                >
                  <ProfileIcon />
                  Mi perfil
                </Link>
                <button
                  className="user-menu-link"
                  onClick={() => {
                    setMenuOpen(false)
                    void onRefreshSession()
                    void onRefresh()
                  }}
                  type="button"
                >
                  <SunIcon />
                  Actualizar shell
                </button>
                <button
                  className="user-menu-link is-danger"
                  onClick={() => {
                    setMenuOpen(false)
                    void onLogout()
                  }}
                  type="button"
                >
                  <LogoutIcon />
                  Salir
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="workspace-main">
        <Outlet
          context={{
            dashboardData,
            refreshSession: onRefreshSession,
            refreshWorkspace: onRefresh,
            searchValue,
            setWorkspaceTheme: onThemeChange,
            theme,
            user,
          }}
        />
      </main>
    </div>
  )
}
