import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { fetchPallets } from '../../lib/api.js'
import { ModuleEmptyState } from '../modules/ModuleWorkspace.jsx'
import { eventMatchesQuery, formatDateTime, formatQuantity, palletMatchesQuery } from './utils.js'

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const DEFAULT_PAGE_SIZE = 20

function SummaryMetric({ label, value }) {
  return (
    <div className="deposits-summary-v2-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EmptyTableRow({ colSpan, text }) {
  return (
    <tr className="deposits-summary-v2-empty-row">
      <td colSpan={colSpan}>{text}</td>
    </tr>
  )
}

export function DepositsRegistryPage() {
  const { depositsOverview, refreshDepositsModule, searchValue } = useOutletContext()
  const deferredGlobalQuery = useDeferredValue((searchValue || '').trim().toLowerCase())
  const [activeSection, setActiveSection] = useState('pallets')
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
  const locations = useMemo(() => depositsOverview?.locations || [], [depositsOverview?.locations])
  const statuses = useMemo(() => depositsOverview?.catalogs?.pallet_statuses || [], [depositsOverview?.catalogs?.pallet_statuses])
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
  const selectedLocation = useMemo(
    () => locations.find((location) => String(location.id) === filters.locationId) || null,
    [filters.locationId, locations],
  )
  const activePallets = filteredItems.filter((item) => item.status === 'active').length

  const visibleLocationSummary = useMemo(() => {
    if (selectedLocation) {
      return {
        active_pallet_count: selectedLocation.active_pallet_count,
        occupied_position_count: selectedLocation.occupied_position_count,
        position_count: selectedLocation.position_count,
      }
    }

    return locations.reduce(
      (accumulator, location) => ({
        active_pallet_count: accumulator.active_pallet_count + (location.active_pallet_count || 0),
        occupied_position_count:
          accumulator.occupied_position_count + (location.occupied_position_count || 0),
        position_count: accumulator.position_count + (location.position_count || 0),
      }),
      {
        active_pallet_count: 0,
        occupied_position_count: 0,
        position_count: 0,
      },
    )
  }, [locations, selectedLocation])

  const recentEvents = useMemo(
    () =>
      (depositsOverview?.events_recent || [])
        .filter((event) =>
          selectedLocation
            ? [event.source_location, event.target_location]
                .filter(Boolean)
                .some((value) => value === selectedLocation.name)
            : true,
        )
        .filter((event) => eventMatchesQuery(event, deferredGlobalQuery))
        .filter((event) => eventMatchesQuery(event, deferredLocalQuery))
        .slice(0, 8),
    [deferredGlobalQuery, deferredLocalQuery, depositsOverview?.events_recent, selectedLocation],
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [filters.locationId, filters.status, deferredGlobalQuery, deferredLocalQuery, pageSize])

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  useEffect(() => {
    if (!paginatedItems.length) {
      if (selectedPalletId !== null) {
        setSelectedPalletId(null)
      }
      return
    }

    const stillVisible = paginatedItems.some((item) => item.id === selectedPalletId)
    if (!stillVisible) {
      setSelectedPalletId(paginatedItems[0].id)
    }
  }, [paginatedItems, selectedPalletId])

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
    <div className="deposits-summary-v2">
      <header className="deposits-summary-v2-header">
        <div className="deposits-summary-v2-header-copy">
          <p className="deposits-summary-v2-breadcrumb">Depositos / Resumen</p>
          <h2>Resumen operativo de pallets</h2>
          <p>Consulta stock palletizado, movimiento reciente y contexto del deposito activo.</p>
        </div>
        <div className="deposits-summary-v2-metrics">
          <SummaryMetric label="Pallets visibles" value={filteredItems.length} />
          <SummaryMetric label="Activos" value={activePallets} />
          <SummaryMetric label="Posiciones ocupadas" value={visibleLocationSummary.occupied_position_count} />
          <SummaryMetric label="Vista" value={selectedLocation ? selectedLocation.code : 'Global'} />
        </div>
      </header>

      <section className="deposits-summary-v2-toolbar" aria-label="Filtros y acciones">
        <div className="deposits-summary-v2-toolbar-filters">
          <label className="deposits-summary-v2-field deposits-summary-v2-field--search">
            <span>Busqueda</span>
            <input
              type="search"
              value={localQuery}
              onChange={(event) => setLocalQuery(event.target.value)}
              placeholder="Buscar por pallet, articulo, lote, zona o posicion"
            />
          </label>

          <label className="deposits-summary-v2-field">
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
                  {location.code} - {location.name}
                </option>
              ))}
            </select>
          </label>

          <label className="deposits-summary-v2-field">
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

        <div className="deposits-summary-v2-toolbar-actions">
          <div
            aria-label="Apartados del resumen"
            className="deposits-summary-v2-view-switch"
            role="tablist"
          >
            <button
              aria-selected={activeSection === 'pallets'}
              className={activeSection === 'pallets' ? 'is-active' : ''}
              onClick={() => setActiveSection('pallets')}
              role="tab"
              type="button"
            >
              Resumen
            </button>
            <button
              aria-selected={activeSection === 'events'}
              className={activeSection === 'events' ? 'is-active' : ''}
              onClick={() => setActiveSection('events')}
              role="tab"
              type="button"
            >
              Movimientos recientes
              <span>{recentEvents.length}</span>
            </button>
          </div>

          {(permissions?.can_scan || permissions?.can_manage_registry) ? (
            <Link className="secondary-button" to="/depositos/registro">
              Abrir registro
            </Link>
          ) : null}
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
      </section>

      {palletState.error ? <div className="form-error">{palletState.error}</div> : null}

      <section
        className="deposits-summary-v2-main"
        aria-label={activeSection === 'pallets' ? 'Listado operativo de pallets' : 'Movimientos recientes'}
      >
        <div className="deposits-summary-v2-block-head">
          <div>
            {activeSection === 'pallets' ? (
              <>
                <strong>Listado de pallets</strong>
                <span>
                  {selectedLocation ? `${selectedLocation.code} - ${selectedLocation.name}` : 'Todos los depositos'}
                </span>
              </>
            ) : (
              <>
                <strong>Movimientos recientes</strong>
                <span>Registro, consulta y reubicacion reciente</span>
              </>
            )}
          </div>
          <div className="deposits-summary-v2-main-meta">
            {activeSection === 'pallets' ? (
              <>
                <span>{filteredItems.length} registros</span>
                <span>{visibleLocationSummary.position_count} posiciones</span>
                <span>{pageCount} paginas</span>
              </>
            ) : (
              <>
                <span>{recentEvents.length} registros</span>
                <span>{selectedLocation ? selectedLocation.code : 'Vista global'}</span>
              </>
            )}
          </div>
        </div>

        <div className="deposits-summary-v2-table-wrap">
          {activeSection === 'pallets' ? (
            <table className="deposits-summary-v2-table">
              <thead>
                <tr>
                  <th>Pallet</th>
                  <th>Articulo</th>
                  <th>Lote</th>
                  <th>Deposito</th>
                  <th>Zona</th>
                  <th>Posicion</th>
                  <th>Cantidad</th>
                  <th>Estado</th>
                  <th>Ultimo scan</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length ? (
                  paginatedItems.map((item) => (
                    <tr
                      className={item.id === selectedPalletId ? 'is-selected' : ''}
                      key={item.id}
                      onClick={() => setSelectedPalletId(item.id)}
                    >
                      <td className="is-code">{item.pallet_code}</td>
                      <td>{item.article}</td>
                      <td>{item.batch || '-'}</td>
                      <td>{item.location}</td>
                      <td>{item.zone}</td>
                      <td>{item.position}</td>
                      <td>{formatQuantity(item.quantity)}</td>
                      <td>
                        <span className={`status-pill ${item.status === 'active' ? 'ok' : ''}`}>
                          {item.status_label}
                        </span>
                      </td>
                      <td>{formatDateTime(item.last_scanned_at)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow
                    colSpan={9}
                    text={palletState.loading ? 'Cargando pallets...' : 'No hay pallets para el filtro actual.'}
                  />
                )}
              </tbody>
            </table>
          ) : (
            <table className="deposits-summary-v2-table">
              <thead>
                <tr>
                  <th>Pallet</th>
                  <th>Evento</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Usuario</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.length ? (
                  recentEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="is-code">{event.pallet_code}</td>
                      <td>{event.event_type_label}</td>
                      <td>
                        {event.source_location || '-'}
                        {event.source_position ? ` / ${event.source_position}` : ''}
                      </td>
                      <td>
                        {event.target_location || '-'}
                        {event.target_position ? ` / ${event.target_position}` : ''}
                      </td>
                      <td>{event.recorded_by}</td>
                      <td>{formatDateTime(event.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={6} text="No hay movimientos para mostrar." />
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="deposits-summary-v2-footer">
          {activeSection === 'pallets' ? (
            <>
              <p>
                Mostrando {paginatedItems.length ? pageStart + 1 : 0}-{Math.min(pageStart + pageSize, filteredItems.length)} de {filteredItems.length}
              </p>
              <div className="deposits-summary-v2-pagination">
                <label>
                  <span>Filas</span>
                  <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
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
                <span className="deposits-summary-v2-page-indicator">
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
            </>
          ) : (
            <p>Mostrando {recentEvents.length} movimientos recientes segun la vista actual.</p>
          )}
        </div>
      </section>
    </div>
  )
}
