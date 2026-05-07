import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import { createMovement } from '../../lib/api.js'
import { CloseIcon, SearchIcon } from '../Icons.jsx'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleTableSection,
  ModuleToolbar,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import {
  articleMatchesQuery,
  formatDateTime,
  formatQuantity,
  getArticleStockLabel,
  getArticleStockTone,
  movementMatchesQuery,
  sortArticlesForOverview,
} from './utils.js'

const MOVEMENT_MODE_CONFIG = {
  egress: {
    label: 'Egreso',
    title: 'Egreso rapido',
    description: 'Salida diaria con busqueda rapida y los datos justos para registrar.',
    submitLabel: 'Registrar egreso',
    searchPlaceholder: 'Buscar articulo para egresar',
    types: ['consumption_out', 'production_out', 'loan_out'],
    defaultType: 'consumption_out',
  },
  ingress: {
    label: 'Ingreso',
    title: 'Ingreso rapido',
    description: 'Ingreso simple para compras o devoluciones sin salir del mismo panel.',
    submitLabel: 'Registrar ingreso',
    searchPlaceholder: 'Buscar articulo para ingresar',
    types: ['purchase_in', 'return_in'],
    defaultType: 'purchase_in',
  },
}

function createEmptyMovementLine(articleId = '') {
  return {
    article_id: articleId,
    quantity: '',
    source_location_id: '',
    target_location_id: '',
    sector_id: '',
    person_id: '',
    reason_text: '',
    notes: '',
    lot_code: '',
    expiry_date: '',
  }
}

const EMPTY_ARRAY = []

function movementNeedsReason(movementType) {
  return [
    'adjustment_in',
    'damage_out',
    'expired_out',
    'count_adjust',
    'disposal_out',
  ].includes(movementType)
}

function movementUsesSource(movementType) {
  return ['consumption_out', 'production_out', 'loan_out'].includes(movementType)
}

function movementUsesTarget(movementType) {
  return ['purchase_in', 'return_in'].includes(movementType)
}

function movementUsesReceiver(movementType) {
  return ['consumption_out', 'production_out', 'loan_out'].includes(movementType)
}

function getMovementMode(movementType) {
  if (MOVEMENT_MODE_CONFIG.ingress.types.includes(movementType)) {
    return 'ingress'
  }

  return 'egress'
}

function supportsMovementTypeForArticle(article, movementType) {
  if (!article || article.tracking_mode === 'quantity') {
    return true
  }

  return ['purchase_in', 'return_in'].includes(movementType)
}

function getUnsupportedMovementMessage(article, movementType) {
  if (!article || supportsMovementTypeForArticle(article, movementType)) {
    return ''
  }

  return 'Los articulos por unidad no se egresan desde este flujo. Usa Prestamos o una baja puntual.'
}

function sanitizeMovementPayload(form, article) {
  const payload = {
    ...form,
    reason_text: form.reason_text.trim(),
    notes: form.notes.trim(),
  }

  if (!movementUsesSource(form.movement_type)) {
    payload.source_location_id = ''
  }

  if (!movementUsesTarget(form.movement_type)) {
    payload.target_location_id = ''
  }

  if (!movementUsesReceiver(form.movement_type)) {
    payload.sector_id = ''
    payload.person_id = ''
  }

  if (!article?.requires_lot) {
    payload.lot_code = ''
    payload.expiry_date = ''
  } else if (!article.requires_expiry) {
    payload.expiry_date = ''
  }

  return payload
}

export function InventoryMovementsPage() {
  const { inventoryOverview, refreshInventoryModule, searchValue } = useOutletContext()
  const location = useLocation()
  const deferredQuery = useDeferredValue(searchValue.trim().toLowerCase())
  const [articleSearch, setArticleSearch] = useState('')
  const deferredArticleQuery = useDeferredValue(articleSearch.trim().toLowerCase())
  const [activeView, setActiveView] = useState('form')
  const [movementTypeFilter, setMovementTypeFilter] = useState('all')
  const [busyAction, setBusyAction] = useState('')
  const [movementFeedback, setMovementFeedback] = useState({ error: '', success: '' })
  const [registerMovementType, setRegisterMovementType] = useState(
    MOVEMENT_MODE_CONFIG.egress.defaultType,
  )
  const [movementLines, setMovementLines] = useState([])
  const [presetKey, setPresetKey] = useState('')

  const articles = inventoryOverview?.articles || EMPTY_ARRAY
  const catalogs = inventoryOverview?.catalogs ?? {
    movement_types: [],
    locations: [],
    sectors: [],
    people: [],
  }
  const movements = inventoryOverview?.movements ?? []
  const permissions = inventoryOverview?.permissions ?? { can_record_movement: false }
  const movementMode = getMovementMode(registerMovementType)
  const movementModeConfig = MOVEMENT_MODE_CONFIG[movementMode]
  const articlesById = useMemo(
    () => new Map(articles.map((article) => [String(article.id), article])),
    [articles],
  )
  const selectedArticleIds = new Set(movementLines.map((line) => String(line.article_id)))
  const unsupportedLine = movementLines.find((line) => {
    const article = articlesById.get(String(line.article_id))
    return article && !supportsMovementTypeForArticle(article, registerMovementType)
  })
  const unsupportedMovementMessage = unsupportedLine
    ? getUnsupportedMovementMessage(
        articlesById.get(String(unsupportedLine.article_id)),
        registerMovementType,
      )
    : ''
  const suggestedArticles = deferredArticleQuery
    ? articles
        .filter((article) => articleMatchesQuery(article, deferredArticleQuery))
        .sort(sortArticlesForOverview)
        .slice(0, 5)
    : []
  const visibleMovements = movements
    .filter((movement) => movementMatchesQuery(movement, deferredQuery))
    .filter((movement) =>
      movementTypeFilter === 'all' ? true : movement.movement_type === movementTypeFilter,
    )
  const pendingLinesWithoutQuantity = movementLines.filter((line) => !line.quantity).length
  const canSubmitMovement =
    permissions.can_record_movement &&
    busyAction !== 'movement' &&
    movementLines.length > 0 &&
    pendingLinesWithoutQuantity === 0 &&
    !unsupportedMovementMessage

  useEffect(() => {
    const preset = location.state?.preset
    if (!preset || presetKey === location.key) {
      return
    }

    const nextMode = preset.mode === 'ingress' ? 'ingress' : 'egress'
    const nextArticleId = preset.articleId ? String(preset.articleId) : ''
    if (!nextArticleId || !articlesById.has(nextArticleId)) {
      setPresetKey(location.key)
      return
    }

    setPresetKey(location.key)
    setActiveView('form')
    applyMovementMode(nextMode)
    setMovementLines([createEmptyMovementLine(nextArticleId)])
  }, [articlesById, location.key, location.state, presetKey])

  async function handleMovementSubmit(event) {
    event.preventDefault()
    if (!movementLines.length || pendingLinesWithoutQuantity) {
      return
    }

    setBusyAction('movement')
    setMovementFeedback({ error: '', success: '' })
    const snapshotLines = movementLines
    let successCount = 0

    try {
      for (const line of snapshotLines) {
        const selectedArticle = articlesById.get(String(line.article_id))
        await createMovement(
          sanitizeMovementPayload(
            { ...line, movement_type: registerMovementType },
            selectedArticle,
          ),
        )
        successCount += 1
      }
      await refreshInventoryModule()
      setMovementLines([])
      setArticleSearch('')
      setMovementFeedback({
        error: '',
        success:
          snapshotLines.length === 1
            ? 'Movimiento registrado.'
            : `Movimientos registrados: ${snapshotLines.length}.`,
      })
    } catch (error) {
      if (successCount) {
        await refreshInventoryModule()
      }
      setMovementLines(snapshotLines.slice(successCount))
      setMovementFeedback({
        error: error.message,
        success: successCount
          ? `${successCount} movimiento(s) registrado(s) antes del error.`
          : '',
      })
    } finally {
      setBusyAction('')
    }
  }

  function applyMovementMode(mode) {
    const nextMovementType = MOVEMENT_MODE_CONFIG[mode].defaultType
    setRegisterMovementType(nextMovementType)
    setMovementLines([])
    setArticleSearch('')
    setMovementFeedback({ error: '', success: '' })
  }

  function addMovementLine(article) {
    const unsupportedMessage = getUnsupportedMovementMessage(article, registerMovementType)

    if (unsupportedMessage) {
      setMovementFeedback({ error: unsupportedMessage, success: '' })
      return
    }

    const nextArticleId = String(article.id)

    setMovementFeedback({ error: '', success: '' })
    setMovementLines((current) => {
      if (current.some((line) => String(line.article_id) === nextArticleId)) {
        return current
      }
      return [...current, createEmptyMovementLine(nextArticleId)]
    })
    setArticleSearch('')
  }

  function updateMovementLine(articleId, patch) {
    setMovementLines((current) =>
      current.map((line) =>
        String(line.article_id) === String(articleId) ? { ...line, ...patch } : line,
      ),
    )
  }

  function removeMovementLine(articleId) {
    setMovementLines((current) =>
      current.filter((line) => String(line.article_id) !== String(articleId)),
    )
  }

  if (!inventoryOverview) {
    return null
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={<span className="module-chip">{visibleMovements.length} movimientos visibles</span>}
        eyebrow="Inventario / Movimientos"
        title="Movimientos"
      />

      <div className="movement-view-tabs" role="tablist" aria-label="Vista de movimientos">
        <button
          aria-selected={activeView === 'form'}
          className={`movement-view-tab ${activeView === 'form' ? 'is-active' : ''}`}
          onClick={() => setActiveView('form')}
          type="button"
        >
          <strong>Registrar</strong>
          <span>Ingreso o egreso rapido</span>
        </button>
        <button
          aria-selected={activeView === 'history'}
          className={`movement-view-tab ${activeView === 'history' ? 'is-active' : ''}`}
          onClick={() => setActiveView('history')}
          type="button"
        >
          <strong>Historial</strong>
          <span>{visibleMovements.length} registros visibles</span>
        </button>
      </div>

      {activeView === 'history' ? (
        <section className="module-page-stack">
          <ModuleTableSection
            title="Historial operativo"
            toolbar={
              <ModuleToolbar>
                <div className="module-filter-group">
                  <label>
                    Tipo
                    <select
                      onChange={(event) => setMovementTypeFilter(event.target.value)}
                      value={movementTypeFilter}
                    >
                      <option value="all">Todos</option>
                      {catalogs.movement_types.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </ModuleToolbar>
            }
          >
            {visibleMovements.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Articulo</th>
                      <th>Cantidad</th>
                      <th>Origen</th>
                      <th>Destino</th>
                      <th>Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMovements.map((movement) => (
                      <tr key={movement.id}>
                        <td>{formatDateTime(movement.timestamp)}</td>
                        <td>{movement.movement_type_label}</td>
                        <td>
                          <div className="module-table-item">
                            <strong>{movement.article}</strong>
                            <span>{movement.tracked_unit || movement.reason_text || 'Sin detalle extra'}</span>
                          </div>
                        </td>
                        <td>{formatQuantity(movement.quantity)}</td>
                        <td>{movement.source_location || '-'}</td>
                        <td>{movement.target_location || movement.person || movement.sector || '-'}</td>
                        <td>{movement.recorded_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description="No hay movimientos que coincidan con el filtro actual."
                title="Sin movimientos"
              />
            )}
          </ModuleTableSection>
        </section>
      ) : (
        <section className="module-page-stack">
          <ModuleTableSection className="movement-register-table">
            <form className="ops-form movement-form" onSubmit={handleMovementSubmit}>
              <div className="movement-workbench">
                <section className="movement-command-bar">
                  <article className="movement-panel movement-panel--mode">
                    <div className="movement-panel-head">
                      <strong>Operacion</strong>
                      <p>{movementModeConfig.description}</p>
                    </div>
                    <div className="movement-mode-switch" role="tablist" aria-label="Tipo de operacion">
                      {Object.entries(MOVEMENT_MODE_CONFIG).map(([mode, config]) => (
                        <button
                          aria-selected={movementMode === mode}
                          className={`movement-mode-button ${movementMode === mode ? 'is-active' : ''}`}
                          disabled={busyAction === 'movement'}
                          key={mode}
                          onClick={() => applyMovementMode(mode)}
                          type="button"
                        >
                          <strong>{config.label}</strong>
                          <span>{config.title}</span>
                        </button>
                      ))}
                    </div>
                  </article>

                  <article className="movement-panel movement-panel--search">
                    <div className="movement-panel-head">
                      <strong>Articulo</strong>
                    </div>
                    <label className="movement-search-field" htmlFor="movement-article-search">
                      Buscar articulo
                    </label>
                    <div className="movement-search-input">
                      <SearchIcon />
                      <input
                        disabled={busyAction === 'movement'}
                        id="movement-article-search"
                        onChange={(event) => setArticleSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                          }
                        }}
                        placeholder={movementModeConfig.searchPlaceholder}
                        type="search"
                        value={articleSearch}
                      />
                    </div>

                    {deferredArticleQuery ? (
                      suggestedArticles.length ? (
                        <div className="movement-picker-results" role="listbox">
                          {suggestedArticles.map((article) => (
                            <button
                              className={`movement-picker-item ${
                                selectedArticleIds.has(String(article.id)) ? 'is-selected' : ''
                              }`}
                              disabled={busyAction === 'movement'}
                              key={article.id}
                              onClick={() => addMovementLine(article)}
                              type="button"
                            >
                              <div className="movement-picker-copy">
                                <strong>{article.name}</strong>
                                <p>{article.internal_code}</p>
                              </div>
                              <div className="movement-picker-meta">
                                <span className={`status-pill ${getArticleStockTone(article)}`}>
                                  {getArticleStockLabel(article)}
                                </span>
                                <small>{formatQuantity(article.available_stock)} disp.</small>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="module-empty-copy">
                          No se encontraron articulos con esa busqueda.
                        </p>
                      )
                    ) : (
                      <p className="module-empty-copy movement-search-helper">
                        Escribe para ver sugerencias al instante.
                      </p>
                    )}
                  </article>

                  <article className="movement-panel movement-panel--action">
                    <div className="movement-panel-head">
                      <strong>Registrar</strong>
                      <p>La accion principal siempre queda visible en esta zona.</p>
                    </div>
                    <div className="movement-action-summary">
                      <span>Items</span>
                      <strong>
                        {movementLines.length
                          ? `${movementLines.length} articulo${movementLines.length === 1 ? '' : 's'}`
                          : 'Sin seleccionar'}
                      </strong>
                      <p>
                        {movementLines.length
                          ? pendingLinesWithoutQuantity
                            ? 'Completa la cantidad en cada item para habilitar el registro.'
                            : `Operacion: ${movementModeConfig.label}`
                          : 'Elige uno o mas articulos y completa la cantidad en cada uno para registrar.'}
                      </p>
                    </div>

                    {unsupportedMovementMessage ? (
                      <div className="form-error">{unsupportedMovementMessage}</div>
                    ) : null}

                    <PanelMessage error={movementFeedback.error} success={movementFeedback.success} />

                    <button
                      className="primary-button"
                      disabled={!canSubmitMovement}
                      type="submit"
                    >
                      {busyAction === 'movement' ? 'Registrando...' : movementModeConfig.submitLabel}
                    </button>
                  </article>
                </section>

                <section className="movement-panel movement-panel--form">
                  <div className="movement-panel-head">
                    <strong>Completar movimientos</strong>
                    <p>Selecciona articulos y completa los datos operativos por item.</p>
                  </div>

                  {movementLines.length ? (
                    <div className="movement-selected-list">
                      {movementLines.map((line) => {
                        const selectedArticle = articlesById.get(String(line.article_id))

                        if (!selectedArticle) {
                          return null
                        }

                        return (
                          <div className="movement-selected-article" key={line.article_id}>
                            <div className="movement-selected-head">
                              <div>
                                <strong>{selectedArticle.name}</strong>
                                <p>
                                  {selectedArticle.internal_code} / {selectedArticle.article_type_label}
                                </p>
                              </div>
                              <div className="movement-line-head-actions">
                                <span className={`status-pill ${getArticleStockTone(selectedArticle)}`}>
                                  {getArticleStockLabel(selectedArticle)}
                                </span>
                                <button
                                  aria-label={`Quitar ${selectedArticle.name}`}
                                  className="module-icon-button"
                                  disabled={busyAction === 'movement'}
                                  onClick={() => removeMovementLine(line.article_id)}
                                  type="button"
                                >
                                  <CloseIcon />
                                </button>
                              </div>
                            </div>

                            <div className="movement-selected-grid">
                              <article>
                                <span>Stock actual</span>
                                <strong>{formatQuantity(selectedArticle.current_stock)}</strong>
                              </article>
                              <article>
                                <span>Disponible</span>
                                <strong>{formatQuantity(selectedArticle.available_stock)}</strong>
                              </article>
                              <article>
                                <span>Ubicacion base</span>
                                <strong>{selectedArticle.primary_location || '-'}</strong>
                              </article>
                            </div>

                            <div className="movement-form-fields movement-form-fields--line">
                              <label className="movement-form-field">
                                Cantidad
                                <input
                                  disabled={busyAction === 'movement'}
                                  onChange={(event) =>
                                    updateMovementLine(line.article_id, { quantity: event.target.value })
                                  }
                                  placeholder="0"
                                  step="0.001"
                                  type="number"
                                  value={line.quantity}
                                />
                              </label>

                              {movementUsesSource(registerMovementType) ? (
                                <label className="movement-form-field">
                                  Origen fisico
                                  <select
                                    disabled={busyAction === 'movement'}
                                    onChange={(event) =>
                                      updateMovementLine(line.article_id, {
                                        source_location_id: event.target.value,
                                      })
                                    }
                                    value={line.source_location_id}
                                  >
                                    <option value="">Automatico / sin origen</option>
                                    {catalogs.locations.map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {item.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}

                              {movementUsesTarget(registerMovementType) ? (
                                <label className="movement-form-field">
                                  Destino fisico
                                  <select
                                    disabled={busyAction === 'movement'}
                                    onChange={(event) =>
                                      updateMovementLine(line.article_id, {
                                        target_location_id: event.target.value,
                                      })
                                    }
                                    value={line.target_location_id}
                                  >
                                    <option value="">Automatico / sin destino</option>
                                    {catalogs.locations.map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {item.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}

                              {movementUsesReceiver(registerMovementType) ? (
                                <>
                                  <label className="movement-form-field">
                                    Sector destino
                                    <select
                                      disabled={busyAction === 'movement'}
                                      onChange={(event) =>
                                        updateMovementLine(line.article_id, { sector_id: event.target.value })
                                      }
                                      value={line.sector_id}
                                    >
                                      <option value="">Sin sector</option>
                                      {catalogs.sectors.map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {item.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="movement-form-field">
                                    Persona
                                    <select
                                      disabled={busyAction === 'movement'}
                                      onChange={(event) =>
                                        updateMovementLine(line.article_id, { person_id: event.target.value })
                                      }
                                      value={line.person_id}
                                    >
                                      <option value="">Sin persona</option>
                                      {catalogs.people.map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {item.full_name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </>
                              ) : null}

                              {selectedArticle.requires_lot ? (
                                <>
                                  <label className="movement-form-field">
                                    Lote
                                    <input
                                      disabled={busyAction === 'movement'}
                                      onChange={(event) =>
                                        updateMovementLine(line.article_id, {
                                          lot_code: event.target.value,
                                        })
                                      }
                                      value={line.lot_code}
                                    />
                                  </label>
                                  {selectedArticle.requires_expiry ? (
                                    <label className="movement-form-field">
                                      Vencimiento
                                      <input
                                        disabled={busyAction === 'movement'}
                                        onChange={(event) =>
                                          updateMovementLine(line.article_id, {
                                            expiry_date: event.target.value,
                                          })
                                        }
                                        type="date"
                                        value={line.expiry_date}
                                      />
                                    </label>
                                  ) : null}
                                </>
                              ) : null}

                              <label className="movement-form-field movement-form-field--wide">
                                Motivo
                                <input
                                  disabled={busyAction === 'movement'}
                                  onChange={(event) =>
                                    updateMovementLine(line.article_id, {
                                      reason_text: event.target.value,
                                    })
                                  }
                                  placeholder={
                                    movementNeedsReason(registerMovementType)
                                      ? 'Obligatorio en este movimiento'
                                      : 'Opcional'
                                  }
                                  value={line.reason_text}
                                />
                              </label>

                              <label className="movement-form-field movement-form-field--wide">
                                Observaciones
                                <input
                                  disabled={busyAction === 'movement'}
                                  onChange={(event) =>
                                    updateMovementLine(line.article_id, { notes: event.target.value })
                                  }
                                  placeholder="Dato corto para contexto operativo"
                                  value={line.notes}
                                />
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="module-empty-copy">Busca y selecciona articulos para continuar.</p>
                  )}

                  <div className="movement-mobile-action">
                    <div className="movement-mobile-action-summary">
                      <span>Items</span>
                      <strong>
                        {movementLines.length
                          ? `${movementLines.length} articulo${movementLines.length === 1 ? '' : 's'}`
                          : 'Sin seleccionar'}
                      </strong>
                      <p>
                        {movementLines.length
                          ? pendingLinesWithoutQuantity
                            ? 'Completa la cantidad en cada item para habilitar el registro.'
                            : `Operacion: ${movementModeConfig.label}`
                          : 'Elige uno o mas articulos y completa la cantidad en cada uno para registrar.'}
                      </p>
                    </div>

                    {unsupportedMovementMessage ? (
                      <div className="form-error">{unsupportedMovementMessage}</div>
                    ) : null}

                    <PanelMessage error={movementFeedback.error} success={movementFeedback.success} />

                    <button
                      className="primary-button"
                      disabled={!canSubmitMovement}
                      type="submit"
                    >
                      {busyAction === 'movement' ? 'Registrando...' : movementModeConfig.submitLabel}
                    </button>
                  </div>
                </section>
              </div>
            </form>
          </ModuleTableSection>
        </section>
      )}
    </div>
  )
}
