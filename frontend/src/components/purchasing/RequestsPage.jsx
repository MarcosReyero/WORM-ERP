import { startTransition, useEffect, useMemo, useState } from 'react'
import {
  createPurchaseRequest,
  fetchArticles,
  fetchInventoryCatalogs,
  fetchPurchaseRequests,
} from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleToolbar,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import { CloseIcon, SearchIcon } from '../Icons.jsx'

function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function RequestsPage() {
  const [requestsState, setRequestsState] = useState({ loading: true, error: '', items: [] })
  const [catalogState, setCatalogState] = useState({ loading: true, error: '', data: null })
  const [articlesState, setArticlesState] = useState({ loading: true, error: '', items: [] })
  const [feedback, setFeedback] = useState({ error: '', success: '' })
  const [busy, setBusy] = useState('')
  const [utilityMode, setUtilityMode] = useState('table')

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [draft, setDraft] = useState({
    requesterId: '',
    sectorId: '',
    articleId: '',
    quantity: '',
    notes: '',
    lineNotes: '',
  })

  function toggleUtility(nextMode) {
    setUtilityMode(nextMode)
    setFeedback({ error: '', success: '' })
  }

  async function loadRequests(nextFilters = {}) {
    setRequestsState((current) => ({ ...current, loading: true, error: '' }))
    try {
      const response = await fetchPurchaseRequests(nextFilters)
      startTransition(() => {
        setRequestsState({ loading: false, error: '', items: response.items || [] })
      })
    } catch (error) {
      startTransition(() => {
        setRequestsState({ loading: false, error: error.message || 'No se pudieron cargar solicitudes.', items: [] })
      })
    }
  }

  useEffect(() => {
    let active = true

    async function bootstrap() {
      try {
        const [requests, catalogs, articles] = await Promise.all([
          fetchPurchaseRequests(),
          fetchInventoryCatalogs(),
          fetchArticles(),
        ])
        if (!active) return
        setRequestsState({ loading: false, error: '', items: requests.items || [] })
        setCatalogState({ loading: false, error: '', data: catalogs })
        setArticlesState({ loading: false, error: '', items: articles.items || [] })
      } catch (error) {
        if (!active) return
        setRequestsState({ loading: false, error: error.message || 'No se pudieron cargar solicitudes.', items: [] })
        setCatalogState({ loading: false, error: error.message || 'No se pudieron cargar catálogos.', data: null })
        setArticlesState({ loading: false, error: error.message || 'No se pudieron cargar artículos.', items: [] })
      }
    }

    bootstrap()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    void loadRequests({ query, status: statusFilter })
  }, [query, statusFilter])

  const people = useMemo(() => catalogState.data?.people || [], [catalogState.data])
  const sectors = useMemo(() => catalogState.data?.sectors || [], [catalogState.data])
  const articleOptions = useMemo(
    () =>
      (articlesState.items || []).map((article) => ({
        id: String(article.id),
        label: `${article.internal_code || ''} ${article.name || ''}`.trim(),
      })),
    [articlesState.items],
  )

  useEffect(() => {
    if (!draft.requesterId && people.length) {
      setDraft((current) => ({ ...current, requesterId: String(people[0].id) }))
    }
  }, [draft.requesterId, people])

  useEffect(() => {
    if (!draft.sectorId && sectors.length) {
      setDraft((current) => ({ ...current, sectorId: String(sectors[0].id) }))
    }
  }, [draft.sectorId, sectors])

  async function handleCreate() {
    setBusy('create')
    setFeedback({ error: '', success: '' })

    try {
      const requesterId = parseNumber(draft.requesterId)
      const sectorId = parseNumber(draft.sectorId)
      const articleId = parseNumber(draft.articleId)
      const quantity = draft.quantity

      if (!requesterId || !sectorId || !articleId || quantity === '') {
        throw new Error('Completá solicitante, sector, artículo y cantidad.')
      }

      await createPurchaseRequest({
        requester_id: requesterId,
        requesting_sector_id: sectorId,
        notes: draft.notes,
        lines: [
          {
            article_id: articleId,
            quantity_requested: quantity,
            notes: draft.lineNotes,
          },
        ],
      })

      setFeedback({ error: '', success: 'Solicitud creada.' })
      setDraft((current) => ({ ...current, articleId: '', quantity: '', notes: '', lineNotes: '' }))
      await loadRequests({ query, status: statusFilter })
      toggleUtility('table')
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudo crear la solicitud.', success: '' })
    } finally {
      setBusy('')
    }
  }

  if (requestsState.loading && !requestsState.items.length) {
    return <ModuleEmptyState title="Cargando compras" description="Preparando solicitudes de compra." />
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader eyebrow="Compras / Solicitudes" title="Solicitud de compras" />
      <PanelMessage error={feedback.error} success={feedback.success} />

      <ModuleTableSection
        actions={
          <button
            className="secondary-button"
            disabled={requestsState.loading}
            onClick={() => void loadRequests()}
            type="button"
          >
            {requestsState.loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        }
        title={
          <span className="module-title-row">
            <span className="module-title-tools" role="toolbar" aria-label="Utilidades">
              <button
                className={`module-utility-button ${utilityMode === 'table' ? 'is-active' : ''}`}
                onClick={() => toggleUtility('table')}
                type="button"
              >
                Solicitudes
              </button>
              <button
                className={`module-utility-button ${utilityMode === 'create' ? 'is-active' : ''}`}
                onClick={() => toggleUtility('create')}
                type="button"
              >
                Nueva solicitud
              </button>
            </span>
          </span>
        }
        toolbar={
          utilityMode === 'table' ? (
            <ModuleToolbar className="module-toolbar--stock-table">
              <div className="module-filter-group module-filter-group--stock">
                <label className="module-search-field">
                  Buscar
                  <div className="module-search-input">
                    <SearchIcon />
                    <input
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape' && query) {
                          setQuery('')
                        }
                      }}
                      placeholder="Buscar por número, sector o solicitante"
                      type="search"
                      value={query}
                    />
                    {query ? (
                      <button
                        aria-label="Limpiar búsqueda"
                        className="module-search-clear"
                        onClick={() => setQuery('')}
                        type="button"
                      >
                        <CloseIcon />
                      </button>
                    ) : null}
                  </div>
                </label>

                <label>
                  Estado
                  <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                    <option value="all">Todos</option>
                    <option value="draft">Borrador</option>
                    <option value="pending">Pendiente</option>
                    <option value="approved">Aprobada</option>
                    <option value="partial">Entrega parcial</option>
                    <option value="closed">Cerrada</option>
                    <option value="rejected">Rechazada</option>
                  </select>
                </label>
              </div>
            </ModuleToolbar>
          ) : null
        }
      >
        {utilityMode === 'create' ? (
          <>
            {catalogState.error ? <div className="form-error">{catalogState.error}</div> : null}
            {articlesState.error ? <div className="form-error">{articlesState.error}</div> : null}

            <div className="ops-form">
              <label>
                Solicitante
                <select
                  onChange={(event) => setDraft((current) => ({ ...current, requesterId: event.target.value }))}
                  value={draft.requesterId}
                >
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Sector solicitante
                <select
                  onChange={(event) => setDraft((current) => ({ ...current, sectorId: event.target.value }))}
                  value={draft.sectorId}
                >
                  {sectors.map((sector) => (
                    <option key={sector.id} value={sector.id}>
                      {sector.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Artículo
                <select
                  onChange={(event) => setDraft((current) => ({ ...current, articleId: event.target.value }))}
                  value={draft.articleId}
                >
                  <option value="">Seleccionar</option>
                  {articleOptions.slice(0, 600).map((article) => (
                    <option key={article.id} value={article.id}>
                      {article.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cantidad
                <input
                  inputMode="decimal"
                  onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))}
                  placeholder="Ej: 2"
                  value={draft.quantity}
                />
              </label>

              <label>
                Nota (opcional)
                <input
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Contexto o urgencia"
                  value={draft.notes}
                />
              </label>

              <button
                className="primary-button"
                disabled={busy === 'create'}
                onClick={() => void handleCreate()}
                type="button"
              >
                {busy === 'create' ? 'Creando...' : 'Crear solicitud'}
              </button>
            </div>
          </>
        ) : (
          <>
            {requestsState.error ? <div className="form-error">{requestsState.error}</div> : null}

            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr>
                    <th>Numero</th>
                    <th>Estado</th>
                    <th>Solicitante</th>
                    <th>Sector</th>
                    <th>Fecha</th>
                    <th>Lineas</th>
                    <th>Solicitado</th>
                  </tr>
                </thead>
                <tbody>
                  {(requestsState.items || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.request_number}</td>
                      <td>{item.status_label}</td>
                      <td>{item.requester}</td>
                      <td>{item.requesting_sector}</td>
                      <td>{item.requested_at ? new Date(item.requested_at).toLocaleString() : ''}</td>
                      <td>{item.line_count}</td>
                      <td>{item.quantity_requested_total ?? ''}</td>
                    </tr>
                  ))}
                  {!requestsState.items?.length ? (
                    <tr>
                      <td colSpan={7}>
                        <span className="module-empty-copy">Todavia no hay solicitudes de compra.</span>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </ModuleTableSection>
    </div>
  )
}
