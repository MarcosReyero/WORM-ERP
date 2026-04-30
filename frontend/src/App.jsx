import { startTransition, useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout.jsx'
import { LoginView } from './components/LoginView.jsx'
import { MessagesPage } from './components/messages/MessagesPage.jsx'
import { ModuleHub } from './components/ModuleHub.jsx'
import { BrandIcon } from './components/Icons.jsx'
import { DepositsLayout } from './components/deposits/DepositsLayout.jsx'
import { DepositsRegistryPage } from './components/deposits/DepositsRegistryPage.jsx'
import { DepositsScanPage } from './components/deposits/DepositsScanPage.jsx'
import { InventoryAlarmsPage } from './components/inventory/InventoryAlarmsPage.jsx'
import { InventoryCheckoutsPage } from './components/inventory/InventoryCheckoutsPage.jsx'
import { InventoryArticleDetailPage } from './components/inventory/InventoryArticleDetailPage.jsx'
import { InventoryCountsPage } from './components/inventory/InventoryCountsPage.jsx'
import { InventoryDiscrepanciesPage } from './components/inventory/InventoryDiscrepanciesPage.jsx'
import { InventoryLayout } from './components/inventory/InventoryLayout.jsx'
import { InventoryMovementsPage } from './components/inventory/InventoryMovementsPage.jsx'
import { InventoryOverviewPage } from './components/inventory/InventoryOverviewPage.jsx'
import { InventoryStockPage } from './components/inventory/InventoryStockPage.jsx'
import { PersonalLayout } from './components/personal/PersonalLayout.jsx'
import { PersonalReportsPage } from './components/personal/PersonalReportsPage.jsx'
import { PurchasingLayout } from './components/purchasing/PurchasingLayout.jsx'
import { RequestsPage } from './components/purchasing/RequestsPage.jsx'
import { PurchasingAlarmsPage } from './components/purchasing/PurchasingAlarmsPage.jsx'
import { ProfileDetailsPage } from './components/profile/ProfileDetailsPage.jsx'
import { ProfileLayout } from './components/profile/ProfileLayout.jsx'
import { ProfileUsersPage } from './components/profile/ProfileUsersPage.jsx'
import { AdminLayout } from './components/admin/AdminLayout.jsx'
import { AdminPermissionsPage } from './components/admin/AdminPermissionsPage.jsx'
import { AdminRolesGuidePage } from './components/admin/AdminRolesGuidePage.jsx'
import { AdminUsersPage } from './components/admin/AdminUsersPage.jsx'
import { TiaAiReportsPage } from './components/tia/TiaAiReportsPage.jsx'
import { TiaLayout } from './components/tia/TiaLayout.jsx'
import { TiaVariableDashboardPage } from './components/tia/TiaVariableDashboardPage.jsx'
import {
  fetchCsrfCookie,
  fetchDashboard,
  fetchSession,
  loginRequest,
  logoutRequest,
  updateProfile,
} from './lib/api.js'

const THEME_STORAGE_KEY = 'inventary-workspace-theme'

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

    const intervalId = window.setInterval(() => {
      refreshSessionData().catch(() => null)
      loadWorkspaceData().catch(() => null)
    }, 15000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadWorkspaceData, refreshSessionData, session.user])

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
    <Routes>
      <Route
        path="/login"
        element={
          session.user ? (
            <Navigate to="/" replace />
          ) : (
            <LoginView onLogin={handleLogin} />
          )
        }
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
          <Route index element={<Navigate replace to="stock" />} />
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
          <Route index element={<Navigate replace to="resumen" />} />
          <Route path="resumen" element={<DepositsRegistryPage />} />
          <Route path="registro" element={<DepositsScanPage />} />
          <Route path="escaneo" element={<Navigate replace to="../registro" />} />
        </Route>
        <Route path="personal" element={<PersonalLayout />}>
          <Route index element={<Navigate replace to="informes" />} />
          <Route path="informes" element={<PersonalReportsPage />} />
        </Route>
        <Route path="compras" element={<PurchasingLayout />}>
          <Route index element={<Navigate replace to="solicitudes" />} />
          <Route path="solicitudes" element={<RequestsPage />} />
          <Route path="alarmas" element={<PurchasingAlarmsPage />} />
        </Route>
        <Route path="tia" element={<TiaLayout />}>
          <Route index element={<Navigate replace to="enlace-s7" />} />
          <Route path="enlace-s7" element={<TiaVariableDashboardPage />} />
          <Route path="analisis-ia" element={<TiaAiReportsPage />} />
        </Route>
      </Route>
      <Route
        path="*"
        element={<Navigate to={session.user ? '/' : '/login'} replace />}
      />
    </Routes>
  )
}

export default App
