import { startTransition, useEffect, useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { fetchTiaOverview } from '../../lib/api.js'
import { RefreshIcon } from '../Icons.jsx'
import { ModuleWorkspaceLayout } from '../modules/ModuleWorkspace.jsx'

export function TiaLayout() {
  const { refreshSession, refreshWorkspace, searchValue, user } = useOutletContext()
  const [tiaState, setTiaState] = useState({
    loading: true,
    error: '',
    data: null,
  })

  useEffect(() => {
    let active = true

    async function loadTiaModule() {
      try {
        const overview = await fetchTiaOverview()
        if (!active) {
          return
        }

        startTransition(() => {
          setTiaState({
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
          setTiaState({
            loading: false,
            error: error.message || 'No se pudo cargar TIA.',
            data: null,
          })
        })
      }
    }

    loadTiaModule()

    return () => {
      active = false
    }
  }, [])

  async function refreshTiaModule() {
    setTiaState((current) => ({
      ...current,
      loading: true,
      error: '',
    }))

    try {
      const overview = await fetchTiaOverview()
      if (refreshWorkspace) {
        refreshWorkspace().catch(() => null)
      }

      startTransition(() => {
        setTiaState({
          loading: false,
          error: '',
          data: overview,
        })
      })
      return overview
    } catch (error) {
      startTransition(() => {
        setTiaState((current) => ({
          ...current,
          loading: false,
          error: error.message || 'No se pudo actualizar TIA.',
        }))
      })
      throw error
    }
  }

  const connection = tiaState.data?.connection
  const alertCount = tiaState.data?.tags?.filter((tag) => tag.health?.pill !== 'ok').length || 0

  return (
    <ModuleWorkspaceLayout
      headerTitle=""
      headerSubtitle=""
      moduleTitle={tiaState.data?.header?.title || 'TIA'}
      moduleSubtitle={tiaState.data?.header?.subtitle || 'Integracion Siemens S7-300 y diagnostico operativo'}
      variant="erp"
      workspaceClassName="tia-workspace erp-platform-workspace"
      sidebarActions={
        <button
          aria-label="Actualizar TIA"
          className="module-icon-button"
          disabled={tiaState.loading}
          onClick={() => {
            void refreshTiaModule()
          }}
          title={tiaState.loading ? 'Actualizando TIA' : 'Actualizar TIA'}
          type="button"
        >
          <RefreshIcon />
        </button>
      }
      sidebarUtility={
        connection ? (
          <span className={`module-chip ${connection.pill === 'ok' ? '' : 'is-muted'}`}>
            {connection.label}
          </span>
        ) : null
      }
      navGroups={[
        {
          title: 'Operacion',
          items: [
            {
              to: '/tia/enlace-s7',
              label: 'Enlace S7-300',
              hint: 'Integracion, diagnostico y monitoreo',
              shortLabel: 'S7',
              badge: alertCount,
            },
          ],
        },
        {
          title: 'Analitica',
          items: [
            {
              to: '/tia/analisis-ia',
              label: 'Analisis IA',
              hint: 'Reportes periodicos y recomendaciones',
              shortLabel: 'IA',
            },
          ],
        },
      ]}
    >
      {tiaState.error ? <div className="form-error">{tiaState.error}</div> : null}

      {tiaState.loading && !tiaState.data ? (
        <div className="module-empty-state">
          <strong>Cargando TIA</strong>
          <p>Preparando tags S7-300, diagnostico MCP y panel operativo.</p>
        </div>
      ) : (
        <Outlet
          context={{
            refreshSession,
            refreshTiaModule,
            searchValue,
            tiaOverview: tiaState.data,
            user,
          }}
        />
      )}
    </ModuleWorkspaceLayout>
  )
}
