import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ChevronDownIcon, InboxIcon, LogoutIcon, MoonIcon, ProfileIcon, SunIcon } from './Icons.jsx'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { PlatformSidebar } from './shell/PlatformSidebar.jsx'
import { PlatformShellProvider } from './shell/PlatformShellContext.jsx'

const SIDEBAR_STORAGE_KEY = 'inventary-platform-sidebar-open'

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

function getInitialSidebarOpen() {
  if (typeof window === 'undefined') {
    return true
  }

  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== '0'
}

function getWorkspaceHeading(pathname, sidebarConfig) {
  if (sidebarConfig?.moduleTitle) {
    return {
      title: sidebarConfig.moduleTitle,
      subtitle: sidebarConfig.moduleSubtitle || '',
    }
  }

  if (pathname.startsWith('/mensajes')) {
    return {
      title: 'Mensajes',
      subtitle: '',
    }
  }

  if (pathname.startsWith('/perfil')) {
    return {
      title: 'Perfil',
      subtitle: '',
    }
  }

  return {
    title: 'Panel principal',
    subtitle: '',
  }
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarConfig, setSidebarConfigState] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen)
  const menuRef = useRef(null)
  const unreadBadge = formatBadge(user?.unread_messages_count)
  const workspaceHeading = getWorkspaceHeading(location.pathname, sidebarConfig)

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarOpen ? '1' : '0')
  }, [sidebarOpen])

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

  const setSidebarConfig = useCallback((nextConfig) => {
    setSidebarConfigState((current) => {
      if (!nextConfig) {
        return current
      }

      if (current?.signature && nextConfig.signature && current.signature === nextConfig.signature) {
        return current
      }

      return nextConfig
    })
  }, [])

  const clearSidebarConfig = useCallback(() => {
    setSidebarConfigState(null)
  }, [])

  const shellContextValue = useMemo(
    () => ({
      clearSidebarConfig,
      setSidebarConfig,
      sidebarConfig,
    }),
    [clearSidebarConfig, setSidebarConfig, sidebarConfig],
  )

  return (
    <SidebarProvider
      className={`platform-shell ${sidebarConfig?.variant === 'erp' ? 'is-erp' : ''} ${sidebarConfig?.workspaceClassName || ''} ${theme === 'dark' ? 'dark' : ''}`}
      onOpenChange={setSidebarOpen}
      open={sidebarOpen}
    >
      <PlatformShellProvider value={shellContextValue}>
        <PlatformSidebar
          dashboardData={dashboardData}
          onLogout={onLogout}
          sidebarConfig={sidebarConfig}
          user={user}
        />

        <SidebarInset className="workspace-shell platform-shell-inset" data-theme={theme}>
          <header className="topbar topbar--shell">
            <div className="topbar-left topbar-left--shell">
              <SidebarTrigger className="topbar-sidebar-trigger" />
              <div className="topbar-section-copy">
                <strong>{workspaceHeading.title}</strong>
                {workspaceHeading.subtitle ? <span>{workspaceHeading.subtitle}</span> : null}
              </div>
            </div>

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
                searchValue: '',
                setWorkspaceTheme: onThemeChange,
                theme,
                user,
              }}
            />
          </main>
        </SidebarInset>
      </PlatformShellProvider>
    </SidebarProvider>
  )
}
