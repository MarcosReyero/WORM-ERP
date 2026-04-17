import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchPallets } from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModuleSurface,
  ModuleTableSection,
} from '../modules/ModuleWorkspace.jsx'
import { eventMatchesQuery, formatDateTime, formatQuantity, palletMatchesQuery } from './utils.js'

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const DEFAULT_PAGE_SIZE = 20

export function DepositsRegistryPage() {
  const { depositsOverview, refreshDepositsModule, searchValue } = useOutletContext()
  const deferredGlobalQuery = useDeferredValue((searchValue || '').trim().toLowerCase())
  const [palletState, setPalletState] = useState({
    loading: true,
    error: '',
    items: [],
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [localQuery, setLocalQuery] = useState('')
  const [filters, setFilters] = useState({
    locationId: '',
    status: 'all',
  })
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPalletId, setSelectedPalletId] = useState(null)
  const mountedRef = useRef(true)

  const permissions = depositsOverview?.permissions
  const catalogs = depositsOverview?.catalogs
  const locations = useMemo(() => depositsOverview?.locations || [], [depositsOverview?.locations])
  const statuses = useMemo(() => catalogs?.pallet_statuses || [], [catalogs?.pallet_statuses])
  const deferredLocalQuery = useDeferredValue(localQuery.trim().toLowerCase())

  useEffect(
    () => () => {
      mountedRef.current = false
    },
    [],
  )

  const loadPallets = useCallback(async () => {
    setPalletState((current) => ({
      ...current,
      loading: true,
      error: '',
    }))

    try {
      const response = await fetchPallets()
      if (!mountedRef.current) {
        return
      }

      setPalletState({
        loading: false,
        error: '',
        items: response.items || [],
      })
    } catch (error) {
      if (!mountedRef.current) {
        return
      }

      setPalletState({
        loading: false,
        error: error.message || 'No se pudo cargar el resumen de pallets.',
        items: [],
      })
    }
  }, [])

  useEffect(() => {
    void loadPallets()
  }, [loadPallets])

  const filteredItems = useMemo(
    () =>
      palletState.items
        .filter((item) => (filters.locationId ? String(item.location_id) === filters.locationId : true))
        .filter((item) => (filters.status !== 'all' ? item.status === filters.status : true))
        .filter((item) => palletMatchesQuery(item, deferredGlobalQuery))
        .filter((item) => palletMatchesQuery(item, deferredLocalQuery)),
    [deferredGlobalQuery, deferredLocalQuery, filters.locationId, filters.status, palletState.items],
  )

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize || 1))
  const safeCurrentPage = Math.min(currentPage, pageCount)
  const pageStart = (safeCurrentPage - 1) * pageSize
  const paginatedItems = filteredItems.slice(pageStart, pageStart + pageSize)
  const selectedPallet = filteredItems.find((item) => item.id === selectedPalletId) || null
  const recentEvents = useMemo(
    () =>
      (depositsOverview?.events_recent || [])
        .filter((event) => eventMatchesQuery(event, deferredGlobalQuery))
        .filter((event) => eventMatchesQuery(event, deferredLocalQuery))
        .slice(0, 8),
    [deferredGlobalQuery, deferredLocalQuery, depositsOverview?.events_recent],
  )
  const activePallets = filteredItems.filter((item) => item.status === 'active').length

  useEffect(() => {
    setCurrentPage(1)
  }, [filters.locationId, filters.status, deferredGlobalQuery, deferredLocalQuery, pageSize])

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  useEffect(() => {
    if (!selectedPalletId) {
      return
    }

    const stillVisible = filteredItems.some((item) => item.id === selectedPalletId)
    if (!stillVisible) {
      setSelectedPalletId(null)
    }
  }, [filteredItems, selectedPalletId])

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      await Promise.allSettled([
        loadPallets(),
        refreshDepositsModule ? refreshDepositsModule() : Promise.resolve(),
      ])
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false)
      }
    }
  }

  function handleResetFilters() {
    setLocalQuery('')
    setFilters({
      locationId: '',
      status: 'all',
    })
    setPageSize(DEFAULT_PAGE_SIZE)
    setCurrentPage(1)
    setSelectedPalletId(null)
  }

  if (!permissions?.can_view_registry) {
    return (
      <ModuleEmptyState
        title="Resumen no disponible"
        description="Tu perfil no tiene permiso para consultar pallets y movimientos."
      />
    )
  }

  return (
    <div className="module-page-stack deposits-erp-stack deposits-registry-screen">
      <ModuleSurface className="deposits-toolbar-surface">
        <div className="deposits-registry-toolbar">
          <div className="deposits-registry-toolbar-fields">
            <label className="deposits-toolbar-field deposits-toolbar-field--search">
              <span>Busqueda</span>
              <input
                type="search"
                value={localQuery}
                onChange={(event) => setLocalQuery(event.target.value)}
                placeholder="Pallet, articulo, zona o posicion"
              />
            </label>

            <label className="deposits-toolbar-field">
              <span>Deposito</span>
              <select
                value={filters.locationId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    locationId: event.target.value,
                  }))
                }
              >
                <option value="">Todos</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code}
                  </option>
                ))}
              </select>
            </label>

            <label className="deposits-toolbar-field">
              <span>Estado</span>
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="all">Todos</option>
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="deposits-registry-toolbar-actions">
            <button className="secondary-button" onClick={handleResetFilters} type="button">
              Limpiar
            </button>
            <button
              className="secondary-button"
              disabled={palletState.loading || isRefreshing}
              onClick={() => void handleRefresh()}
              type="button"
            >
              {palletState.loading || isRefreshing ? 'Actualizando' : 'Actualizar'}
            </button>
          </div>
        </div>
      </ModuleSurface>

      <ModuleTableSection
        className="deposits-table-surface deposits-registry-table-panel"
        title="Listado operativo de pallets"
        description="Grilla central para control, lectura y seleccion de pallets."
        actions={
          <div className="deposits-table-kpis">
            <span>
              Total <strong>{filteredItems.length}</strong>
            </span>
            <span>
              Activos <strong>{activePallets}</strong>
            </span>
          </div>
        }
      >
        {palletState.error ? <div className="form-error">{palletState.error}</div> : null}

        {paginatedItems.length ? (
          <>
            <div className="module-table-wrap deposits-table-wrap deposits-registry-table-wrap">
              <table className="module-table deposits-erp-table">
                <thead>
                  <tr>
                    <th>Pallet</th>
                    <th>Articulo</th>
                    <th>Deposito</th>
                    <th>Posicion</th>
                    <th>Cantidad</th>
                    <th>Estado</th>
                    <th>Ultimo scan</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item) => (
                    <tr
                      className={item.id === selectedPalletId ? 'is-selected-row' : ''}
                      key={item.id}
                      onClick={() => setSelectedPalletId(item.id)}
                    >
                      <td>{item.pallet_code}</td>
                      <td>{item.article}</td>
                      <td>{item.location}</td>
                      <td>
                        {item.zone} / {item.position}
                      </td>
                      <td>{formatQuantity(item.quantity)}</td>
                      <td>
                        <span className={`status-pill deposits-row-status ${item.status === 'active' ? 'is-ok' : ''}`}>
                          {item.status_label}
                        </span>
                      </td>
                      <td>{formatDateTime(item.last_scanned_at)}</td>
                      <td>
                        <button className="inline-action deposits-row-action" onClick={() => setSelectedPalletId(item.id)} type="button">
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="deposits-table-footer">
              <p>
                Mostrando {pageStart + 1}-{Math.min(pageStart + pageSize, filteredItems.length)} de {filteredItems.length}
              </p>
              <div className="deposits-table-controls">
                <label>
                  <span>Filas</span>
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <span className="deposits-page-indicator">
                  {safeCurrentPage}/{pageCount}
                </span>
                <button
                  className="secondary-button"
                  disabled={safeCurrentPage >= pageCount}
                  onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                  type="button"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        ) : (
          <ModuleEmptyState
            title={palletState.loading ? 'Cargando pallets' : 'Sin pallets'}
            description="No encontramos pallets con el filtro actual."
          />
        )}
      </ModuleTableSection>

      <section className="deposits-summary-grid">
        <ModuleSurface
          className="deposits-secondary-panel"
          title="Movimientos recientes"
          description="Historial inmediato subordinado a la grilla principal."
        >
          {recentEvents.length ? (
            <div className="module-table-wrap deposits-table-wrap deposits-table-wrap--compact">
              <table className="module-table deposits-erp-table deposits-erp-table--compact">
                <thead>
                  <tr>
                    <th>Pallet</th>
                    <th>Evento</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{event.pallet_code}</td>
                      <td>{event.event_type_label}</td>
                      <td>{formatDateTime(event.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="module-empty-copy">No hay movimientos para mostrar con el filtro actual.</p>
          )}
        </ModuleSurface>

        <ModuleSurface
          className="deposits-secondary-panel"
          title="Contexto de deposito"
          description="Detalle de fila activa y disponibilidad por deposito."
        >
          {selectedPallet ? (
            <dl className="deposits-context-grid">
              <div>
                <dt>Pallet seleccionado</dt>
                <dd>{selectedPallet.pallet_code}</dd>
              </div>
              <div>
                <dt>Articulo</dt>
                <dd>{selectedPallet.article}</dd>
              </div>
              <div>
                <dt>Deposito</dt>
                <dd>{selectedPallet.location}</dd>
              </div>
              <div>
                <dt>Posicion</dt>
                <dd>
                  {selectedPallet.zone} / {selectedPallet.position}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="module-empty-copy">Selecciona una fila para ver contexto rapido.</p>
          )}

          <div className="module-table-wrap deposits-table-wrap deposits-table-wrap--compact">
            <table className="module-table deposits-erp-table deposits-erp-table--compact">
              <thead>
                <tr>
                  <th>Deposito</th>
                  <th>Activos</th>
                  <th>Posiciones</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location) => (
                  <tr key={location.id}>
                    <td>{location.name}</td>
                    <td>{location.active_pallet_count}</td>
                    <td>{location.position_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ModuleSurface>
      </section>
    </div>
  )
}
