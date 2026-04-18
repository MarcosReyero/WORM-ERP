import { startTransition, useEffect, useState } from 'react'
import { Navigate, Outlet, useOutletContext } from 'react-router-dom'
import { fetchDepositsOverview } from '../../lib/api.js'
import { RefreshIcon } from '../Icons.jsx'
import { ModuleWorkspaceLayout } from '../modules/ModuleWorkspace.jsx'

export function DepositsLayout() {
  const { refreshSession, refreshWorkspace, searchValue, user } = useOutletContext()
  const [depositsState, setDepositsState] = useState({
    loading: true,
    error: '',
    data: null,
  })

  useEffect(() => {
    let active = true

    async function loadDepositsModule() {
      try {
        const overview = await fetchDepositsOverview()
        if (!active) {
          return
        }

        startTransition(() => {
          setDepositsState({
            loading: false,
            error: '',
            data: overview,
          })
        })
      } catch (error) {
        if (!active) {
          return
        }

        startTransition(() => {
          setDepositsState({
            loading: false,
            error: error.message || 'No se pudo cargar Depositos.',
            data: null,
          })
        })
      }
    }

    loadDepositsModule()

    return () => {
      active = false
    }
  }, [])

  async function refreshDepositsModule() {
    setDepositsState((current) => ({
      ...current,
      loading: true,
      error: '',
    }))

    try {
      const overview = await fetchDepositsOverview()
      if (refreshWorkspace) {
        refreshWorkspace().catch(() => null)
      }

      startTransition(() => {
        setDepositsState({
          loading: false,
          error: '',
          data: overview,
        })
      })
      return overview
    } catch (error) {
      startTransition(() => {
        setDepositsState((current) => ({
          ...current,
          loading: false,
          error: error.message || 'No se pudo actualizar Depositos.',
        }))
      })
      throw error
    }
  }

  const permissions = depositsState.data?.permissions
  const canAccessModule = permissions?.can_view_module ?? true

  if (!depositsState.loading && depositsState.data && !canAccessModule) {
    return <Navigate replace to="/" />
  }

  return (
    <ModuleWorkspaceLayout
      headerTitle=""
      headerSubtitle=""
      moduleTitle={depositsState.data?.header?.title || 'Depositos'}
      moduleSubtitle={depositsState.data?.header?.subtitle || 'Operacion de pallets y movimientos'}
      variant="erp"
      workspaceClassName="deposits-workspace"
      sidebarActions={
        <button
          aria-label="Actualizar depositos"
          className="module-icon-button"
          disabled={depositsState.loading}
          onClick={() => {
            void refreshDepositsModule()
          }}
          title={depositsState.loading ? 'Actualizando depositos' : 'Actualizar depositos'}
          type="button"
        >
          <RefreshIcon />
        </button>
      }
      navGroups={[
        {
          title: 'Operacion',
          items: [
            ...(permissions?.can_view_registry
              ? [
                  {
                    to: '/depositos/resumen',
                    label: 'Resumen',
                    hint: 'Movimientos y pallets recientes',
                    shortLabel: 'Rs',
                    badge: depositsState.data?.pallets_recent?.length || 0,
                  },
                ]
              : []),
            ...(permissions?.can_scan || permissions?.can_manage_registry
              ? [
                  {
                    to: '/depositos/registro',
                    label: 'Registro',
                    hint: 'Alta manual, QR y reubicacion',
                    shortLabel: 'Rg',
                    badge: depositsState.data?.events_recent?.length || 0,
                  },
                ]
              : []),
          ],
        },
      ]}
    >
      {depositsState.error ? <div className="form-error">{depositsState.error}</div> : null}

      {depositsState.loading && !depositsState.data ? (
        <div className="module-empty-state">
          <strong>Cargando Depositos</strong>
          <p>Armando pallets, layout fisico y ultimos eventos de escaneo.</p>
        </div>
      ) : (
        <Outlet
          context={{
            depositsOverview: depositsState.data,
            refreshDepositsModule,
            refreshSession,
            searchValue,
            user,
          }}
        />
      )}
    </ModuleWorkspaceLayout>
  )
}

