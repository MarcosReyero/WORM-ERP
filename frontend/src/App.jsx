import { lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { BrandIcon } from './components/Icons.jsx'
import {
  fetchCsrfCookie,
  fetchDashboard,
  fetchSession,
  loginRequest,
  logoutRequest,
  updateProfile,
} from './lib/api.js'

const AppLayout = lazy(() =>
  import('./components/AppLayout.jsx').then((module) => ({ default: module.AppLayout })),
)
const LoginView = lazy(() =>
  import('./components/LoginView.jsx').then((module) => ({ default: module.LoginView })),
)
const MessagesPage = lazy(() =>
  import('./components/messages/MessagesPage.jsx').then((module) => ({ default: module.MessagesPage })),
)
const ModuleHub = lazy(() =>
  import('./components/ModuleHub.jsx').then((module) => ({ default: module.ModuleHub })),
)
const DepositsLayout = lazy(() =>
  import('./components/deposits/DepositsLayout.jsx').then((module) => ({ default: module.DepositsLayout })),
)
const DepositsRegistryPage = lazy(() =>
  import('./components/deposits/DepositsRegistryPage.jsx').then((module) => ({
    default: module.DepositsRegistryPage,
  })),
)
const DepositsScanPage = lazy(() =>
  import('./components/deposits/DepositsScanPage.jsx').then((module) => ({ default: module.DepositsScanPage })),
)
const InventoryAlarmsPage = lazy(() =>
  import('./components/inventory/InventoryAlarmsPage.jsx').then((module) => ({ default: module.InventoryAlarmsPage })),
)
const InventoryCheckoutsPage = lazy(() =>
  import('./components/inventory/InventoryCheckoutsPage.jsx').then((module) => ({
    default: module.InventoryCheckoutsPage,
  })),
)
const InventoryArticleDetailPage = lazy(() =>
  import('./components/inventory/InventoryArticleDetailPage.jsx').then((module) => ({
    default: module.InventoryArticleDetailPage,
  })),
)
const InventoryCountsPage = lazy(() =>
  import('./components/inventory/InventoryCountsPage.jsx').then((module) => ({ default: module.InventoryCountsPage })),
)
const InventoryDiscrepanciesPage = lazy(() =>
  import('./components/inventory/InventoryDiscrepanciesPage.jsx').then((module) => ({
    default: module.InventoryDiscrepanciesPage,
  })),
)
const InventoryLayout = lazy(() =>
  import('./components/inventory/InventoryLayout.jsx').then((module) => ({ default: module.InventoryLayout })),
)
const InventoryMovementsPage = lazy(() =>
  import('./components/inventory/InventoryMovementsPage.jsx').then((module) => ({ default: module.InventoryMovementsPage })),
)
const InventoryOverviewPage = lazy(() =>
  import('./components/inventory/InventoryOverviewPage.jsx').then((module) => ({ default: module.InventoryOverviewPage })),
)
const InventoryStockPage = lazy(() =>
  import('./components/inventory/InventoryStockPage.jsx').then((module) => ({ default: module.InventoryStockPage })),
)
const PersonalLayout = lazy(() =>
  import('./components/personal/PersonalLayout.jsx').then((module) => ({ default: module.PersonalLayout })),
)
const PersonalReportsPage = lazy(() =>
  import('./components/personal/PersonalReportsPage.jsx').then((module) => ({ default: module.PersonalReportsPage })),
)
const PurchasingLayout = lazy(() =>
  import('./components/purchasing/PurchasingLayout.jsx').then((module) => ({ default: module.PurchasingLayout })),
)
const RequestsPage = lazy(() =>
  import('./components/purchasing/RequestsPage.jsx').then((module) => ({ default: module.RequestsPage })),
)
const PurchasingAlarmsPage = lazy(() =>
  import('./components/purchasing/PurchasingAlarmsPage.jsx').then((module) => ({
    default: module.PurchasingAlarmsPage,
  })),
)
const ProfileDetailsPage = lazy(() =>
  import('./components/profile/ProfileDetailsPage.jsx').then((module) => ({ default: module.ProfileDetailsPage })),
)
const ProfileLayout = lazy(() =>
  import('./components/profile/ProfileLayout.jsx').then((module) => ({ default: module.ProfileLayout })),
)
const ProfileUsersPage = lazy(() =>
  import('./components/profile/ProfileUsersPage.jsx').then((module) => ({ default: module.ProfileUsersPage })),
)
const AdminLayout = lazy(() =>
  import('./components/admin/AdminLayout.jsx').then((module) => ({ default: module.AdminLayout })),
)
const AdminPermissionsPage = lazy(() =>
  import('./components/admin/AdminPermissionsPage.jsx').then((module) => ({ default: module.AdminPermissionsPage })),
)
const AdminRolesGuidePage = lazy(() =>
  import('./components/admin/AdminRolesGuidePage.jsx').then((module) => ({ default: module.AdminRolesGuidePage })),
)
const AdminUsersPage = lazy(() =>
  import('./components/admin/AdminUsersPage.jsx').then((module) => ({ default: module.AdminUsersPage })),
)
const TiaAiReportsPage = lazy(() =>
  import('./components/tia/TiaAiReportsPage.jsx').then((module) => ({ default: module.TiaAiReportsPage })),
)
const TiaLayout = lazy(() =>
  import('./components/tia/TiaLayout.jsx').then((module) => ({ default: module.TiaLayout })),
)
const TiaVariableDashboardPage = lazy(() =>
  import('./components/tia/TiaVariableDashboardPage.jsx').then((module) => ({
    default: module.TiaVariableDashboardPage,
  })),
)
const ModuleNavIndexRedirect = lazy(() =>
  import('./components/modules/ModuleNavIndexRedirect.jsx').then((module) => ({
    default: module.ModuleNavIndexRedirect,
  })),
)

const THEME_STORAGE_KEY = 'inventary-workspace-theme'

const DEFAULT_POLL_SESSION_MS = 30_000
const DEFAULT_POLL_DASHBOARD_MS = 60_000

function getInitialTheme() {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [session, setSession] = useState({
    checking: true,
    user: null,
  })
  const [dashboardData, setDashboardData] = useState(null)
  const [theme, setTheme] = useState(getInitialTheme)
  const pollSessionMs = useMemo(() => {
    const raw = Number(import.meta.env.VITE_POLL_SESSION_MS)
    return Number.isFinite(raw) && raw >= 5_000 ? raw : DEFAULT_POLL_SESSION_MS
  }, [])
  const pollDashboardMs = useMemo(() => {
    const raw = Number(import.meta.env.VITE_POLL_DASHBOARD_MS)
    return Number.isFinite(raw) && raw >= pollSessionMs ? raw : DEFAULT_POLL_DASHBOARD_MS
  }, [pollSessionMs])
  const routeFallback = useMemo(
    () => (
      <div className="boot-screen">
        <div className="boot-card">
          <BrandIcon />
          <p className="boot-eyebrow">Worm ERP</p>
          <h1>Cargando</h1>
          <p>Preparando mÃ³dulo.</p>
        </div>
      </div>
    ),
    [],
  )

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  function applyUser(user, { syncTheme = false } = {}) {
    startTransition(() => {
      setSession({
        checking: false,
        user,
      })
    })

    if (syncTheme && user?.preferred_theme) {
      setTheme(user.preferred_theme)
    }
  }

  const loadWorkspaceData = useCallback(async () => {
    const dashboard = await fetchDashboard()

    startTransition(() => {
      setDashboardData(dashboard)
    })

    return dashboard
  }, [])

  const refreshSessionData = useCallback(async ({ syncTheme = false } = {}) => {
    const data = await fetchSession()
    if (!data.authenticated) {
      startTransition(() => {
        setSession({ checking: false, user: null })
        setDashboardData(null)
      })
      return null
    }

    applyUser(data.user, { syncTheme })
    return data.user
  }, [])

  const refreshWorkspace = useCallback(async () => {
    const [user] = await Promise.all([
      refreshSessionData(),
      loadWorkspaceData(),
    ])
    return user
  }, [loadWorkspaceData, refreshSessionData])

  const handleThemeChange = useCallback(async (nextTheme, { persist = true } = {}) => {
    setTheme(nextTheme)
    startTransition(() => {
      setSession((current) => ({
        ...current,
        user: current.user ? { ...current.user, preferred_theme: nextTheme } : null,
      }))
    })

    if (!persist || !session.user) {
      return
    }

    try {
      const response = await updateProfile({ preferred_theme: nextTheme })
      if (response?.item) {
        applyUser(response.item)
      }
    } catch {
      // Keep local theme even if the preference could not be persisted.
    }
  }, [session.user])

  useEffect(() => {
    let active = true

    async function bootstrap() {
      try {
        await fetchCsrfCookie()
        const data = await fetchSession()
        if (!active) {
          return
        }

        if (!data.authenticated) {
          setSession({ checking: false, user: null })
          return
        }

        try {
          await loadWorkspaceData()
          if (active) {
            applyUser(data.user, { syncTheme: true })
          }
        } catch {
          if (active) {
            setSession({ checking: false, user: null })
          }
        }
      } catch {
        if (active) {
          setSession({ checking: false, user: null })
        }
      }
    }

    bootstrap()

    return () => {
      active = false
    }
  }, [loadWorkspaceData])

  useEffect(() => {
    if (!session.user) {
      return undefined
    }

    let cancelled = false
    let timeoutId = 0
    let sinceDashboardRefreshMs = 0

    const scheduleNext = () => {
      if (cancelled) {
        return
      }
      timeoutId = window.setTimeout(tick, pollSessionMs)
    }

    const tick = async () => {
      if (cancelled) {
        return
      }

      if (document.visibilityState !== 'visible') {
        scheduleNext()
        return
      }

      try {
        await refreshSessionData()
      } catch {
        // noop
      }

      sinceDashboardRefreshMs += pollSessionMs
      if (sinceDashboardRefreshMs >= pollDashboardMs) {
        sinceDashboardRefreshMs = 0
        try {
          await loadWorkspaceData()
        } catch {
          // noop
        }
      }

      scheduleNext()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      refreshSessionData().catch(() => null)
      loadWorkspaceData().catch(() => null)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    scheduleNext()

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadWorkspaceData, pollDashboardMs, pollSessionMs, refreshSessionData, session.user])

  async function handleLogin(credentials) {
    await fetchCsrfCookie()
    const response = await loginRequest(credentials)

    try {
      await loadWorkspaceData()
      applyUser(response.user, { syncTheme: true })
    } catch (error) {
      startTransition(() => {
        setSession({ checking: false, user: null })
        setDashboardData(null)
      })
      throw error
    }

    return response.user
  }

  async function handleLogout() {
    await logoutRequest()
    startTransition(() => {
      setSession({ checking: false, user: null })
      setDashboardData(null)
    })
  }

  if (session.checking) {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <BrandIcon />
          <p className="boot-eyebrow">Worm ERP</p>
          <h1>Inicializando panel</h1>
          <p>Comprobando sesion, modulos y datos del inventario.</p>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={routeFallback}>
      <Routes>
        <Route
          path="/login"
          element={session.user ? <Navigate to="/" replace /> : <LoginView onLogin={handleLogin} />}
        />
        <Route
          path="/"
          element={
            session.user ? (
              <AppLayout
                dashboardData={dashboardData}
                onLogout={handleLogout}
                onRefresh={refreshWorkspace}
                onRefreshSession={refreshSessionData}
                onThemeChange={handleThemeChange}
                theme={theme}
                user={session.user}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<ModuleHub />} />
          <Route path="mensajes" element={<MessagesPage />} />
          <Route path="perfil" element={<ProfileLayout />}>
            <Route index element={<ProfileDetailsPage />} />
            <Route path="usuarios" element={<Navigate replace to="/administracion/usuarios" />} />
          </Route>
          <Route path="administracion" element={<AdminLayout />}>
            <Route index element={<Navigate replace to="usuarios" />} />
            <Route path="usuarios" element={<AdminUsersPage />} />
            <Route path="permisos" element={<AdminPermissionsPage />} />
            <Route path="guia-roles" element={<AdminRolesGuidePage />} />
          </Route>
          <Route path="inventario" element={<InventoryLayout />}>
            <Route index element={<ModuleNavIndexRedirect fallbackTo="/inventario/stock" />} />
            <Route path="resumen" element={<InventoryOverviewPage />} />
            <Route path="stock" element={<InventoryStockPage />} />
            <Route path="stock/:articleId" element={<InventoryArticleDetailPage />} />
            <Route path="movimientos" element={<InventoryMovementsPage />} />
            <Route path="prestamos" element={<InventoryCheckoutsPage />} />
            <Route path="conteos" element={<InventoryCountsPage />} />
            <Route path="diferencias" element={<InventoryDiscrepanciesPage />} />
            <Route path="alarmas" element={<InventoryAlarmsPage />} />
          </Route>
          <Route path="depositos" element={<DepositsLayout />}>
            <Route index element={<ModuleNavIndexRedirect fallbackTo="/depositos/resumen" />} />
            <Route path="resumen" element={<DepositsRegistryPage />} />
            <Route path="registro" element={<DepositsScanPage />} />
            <Route path="escaneo" element={<Navigate replace to="../registro" />} />
          </Route>
          <Route path="personal" element={<PersonalLayout />}>
            <Route index element={<ModuleNavIndexRedirect fallbackTo="/personal/informes" />} />
            <Route path="informes" element={<PersonalReportsPage />} />
          </Route>
          <Route path="compras" element={<PurchasingLayout />}>
            <Route index element={<ModuleNavIndexRedirect fallbackTo="/compras/solicitudes" />} />
            <Route path="solicitudes" element={<RequestsPage />} />
            <Route path="alarmas" element={<PurchasingAlarmsPage />} />
          </Route>
          <Route path="tia" element={<TiaLayout />}>
            <Route index element={<ModuleNavIndexRedirect fallbackTo="/tia/enlace-s7" />} />
            <Route path="enlace-s7" element={<TiaVariableDashboardPage />} />
            <Route path="analisis-ia" element={<TiaAiReportsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to={session.user ? '/' : '/login'} replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
