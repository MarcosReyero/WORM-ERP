import { startTransition, useEffect, useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { fetchInventoryOverview } from '../../lib/api.js'
import { RefreshIcon } from '../Icons.jsx'
import { ModuleWorkspaceLayout } from '../modules/ModuleWorkspace.jsx'

export function InventoryLayout() {
  const { refreshSession, refreshWorkspace, searchValue, user } = useOutletContext()
  const [inventoryState, setInventoryState] = useState({
    loading: true,
    error: '',
    data: null,
  })

  useEffect(() => {
    let active = true

    async function loadInventoryModule() {
      try {
        const inventoryOverview = await fetchInventoryOverview()
        if (!active) {
          return
        }

        startTransition(() => {
          setInventoryState({
            loading: false,
            error: '',
            data: inventoryOverview,
          })
        })
      } catch (error) {
        if (!active) {
          return
        }

        startTransition(() => {
          setInventoryState({
            loading: false,
            error: error.message || 'No se pudo cargar Inventario.',
            data: null,
          })
        })
      }
    }

    loadInventoryModule()

    return () => {
      active = false
    }
  }, [])

  async function refreshInventoryModule() {
    setInventoryState((current) => ({
      ...current,
      error: '',
      loading: true,
    }))

    try {
      const inventoryOverview = await fetchInventoryOverview()
      if (refreshWorkspace) {
        refreshWorkspace().catch(() => null)
      }

      startTransition(() => {
        setInventoryState({
          loading: false,
          error: '',
          data: inventoryOverview,
        })
      })
      return inventoryOverview
    } catch (error) {
      startTransition(() => {
        setInventoryState((current) => ({
          ...current,
          loading: false,
          error: error.message || 'No se pudo actualizar Inventario.',
        }))
      })
      throw error
    }
  }

  return (
    <ModuleWorkspaceLayout
      headerTitle=""
      moduleTitle={inventoryState.data?.header?.title || 'Inventario'}
      sidebarActions={
        <button
          aria-label="Actualizar inventario"
          className="module-icon-button"
          disabled={inventoryState.loading}
          onClick={() => {
            void refreshInventoryModule()
          }}
          title={inventoryState.loading ? 'Actualizando inventario' : 'Actualizar inventario'}
          type="button"
        >
          <RefreshIcon />
        </button>
      }
      navGroups={[
        {
          title: 'Vista',
          items: [
            {
              to: '/inventario/resumen',
              label: 'Resumen',
              hint: 'Stock actual y alertas',
              shortLabel: 'R',
            },
            {
              to: '/inventario/stock',
              label: 'Stock',
              hint: 'Maestro y existencias',
              shortLabel: 'S',
              badge: inventoryState.data?.articles.length || 0,
            },
          ],
        },
        {
          title: 'Operacion',
          items: [
            {
              to: '/inventario/movimientos',
              label: 'Movimientos',
              hint: 'Ingresos, egresos y transferencias',
              shortLabel: 'M',
            },
            {
              to: '/inventario/prestamos',
              label: 'Prestamos',
              hint: 'Herramientas y unidades',
              shortLabel: 'P',
              badge:
                inventoryState.data?.checkouts.filter((item) => item.status === 'open').length || 0,
            },
          ],
        },
        {
          title: 'Control',
          items: [
            {
              to: '/inventario/conteos',
              label: 'Conteos',
              hint: 'Inventario fisico',
              shortLabel: 'C',
              badge:
                inventoryState.data?.count_sessions.filter((item) => item.status !== 'closed').length ||
                0,
            },
            {
              to: '/inventario/diferencias',
              label: 'Diferencias',
              hint: 'Ajustes pendientes',
              shortLabel: 'D',
              badge:
                inventoryState.data?.discrepancies.filter((item) => item.status === 'open').length ||
                0,
            },
            ...(inventoryState.data?.permissions?.can_manage_alarms
              ? [
                  {
                    to: '/inventario/alarmas',
                    label: 'Alarmas',
                    hint: 'Stock de seguridad y avisos',
                    shortLabel: 'A',
                    badge:
                      (inventoryState.data?.safety_alerts.filter(
                        (item) => item.is_enabled && item.status === 'triggered',
                      ).length || 0) +
                      (inventoryState.data?.alarms.filter((item) => item.status !== 'closed').length ||
                        0),
                  },
                ]
              : []),
          ],
        },
      ]}
    >
      {inventoryState.error ? <div className="form-error">{inventoryState.error}</div> : null}

      {inventoryState.loading && !inventoryState.data ? (
        <div className="module-empty-state">
          <strong>Cargando Inventario</strong>
          <p>Armando el resumen operativo, el stock y la trazabilidad del modulo.</p>
        </div>
      ) : (
        <Outlet
          context={{
            inventoryOverview: inventoryState.data,
            refreshInventoryModule,
            refreshSession,
            searchValue,
            user,
          }}
        />
      )}
    </ModuleWorkspaceLayout>
  )
}
