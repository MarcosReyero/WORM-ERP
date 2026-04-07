import { useDeferredValue, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createMovement } from '../../lib/api.js'
import { SearchIcon } from '../Icons.jsx'
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

function createEmptyMovementForm(movementType = MOVEMENT_MODE_CONFIG.egress.defaultType) {
  return {
    movement_type: movementType,
    article_id: '',
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
  const deferredQuery = useDeferredValue(searchValue.trim().toLowerCase())
  const [articleSearch, setArticleSearch] = useState('')
  const deferredArticleQuery = useDeferredValue(articleSearch.trim().toLowerCase())
  const [activeView, setActiveView] = useState('form')
  const [movementTypeFilter, setMovementTypeFilter] = useState('all')
  const [busyAction, setBusyAction] = useState('')
  const [movementFeedback, setMovementFeedback] = useState({ error: '', success: '' })
  const [movementForm, setMovementForm] = useState(createEmptyMovementForm())

  if (!inventoryOverview) {
    return null
  }

  const { articles, catalogs, movements, permissions } = inventoryOverview
  const movementMode = getMovementMode(movementForm.movement_type)
  const movementModeConfig = MOVEMENT_MODE_CONFIG[movementMode]
  const selectedMovementArticle =
    articles.find((article) => String(article.id) === String(movementForm.article_id)) || null
  const unsupportedMovementMessage = getUnsupportedMovementMessage(
    selectedMovementArticle,
    movementForm.movement_type,
  )
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
  const canSubmitMovement =
    permissions.can_record_movement &&
    busyAction !== 'movement' &&
    Boolean(movementForm.article_id) &&
    Boolean(movementForm.quantity) &&
    !unsupportedMovementMessage

  async function handleMovementSubmit(event) {
    event.preventDefault()
    setBusyAction('movement')
    setMovementFeedback({ error: '', success: '' })

    try {
      await createMovement(sanitizeMovementPayload(movementForm, selectedMovementArticle))
      await refreshInventoryModule()
      setMovementForm(createEmptyMovementForm(movementForm.movement_type))
      setArticleSearch('')
      setMovementFeedback({ error: '', success: 'Movimiento registrado.' })
    } catch (error) {
      setMovementFeedback({ error: error.message, success: '' })
    } finally {
      setBusyAction('')
    }
  }

  function applyMovementMode(mode) {
    setMovementForm((current) => ({
      ...current,
      movement_type: MOVEMENT_MODE_CONFIG[mode].defaultType,
    }))
  }

  function selectMovementArticle(article) {
    setMovementForm((current) => ({
      ...current,
      article_id: String(article.id),
    }))
    setArticleSearch(`${article.internal_code} ${article.name}`)
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={<span className="module-chip">{visibleMovements.length} movimientos visibles</span>}
        description="Historial y registro operativo, limitado por ahora a ingresos y egresos."
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
            description="Se muestran origen, destino, actor y detalle cuando aplica."
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
                      <p>Busca por nombre o codigo y selecciona lo que vas a mover.</p>
                    </div>
                    <label className="movement-search-field" htmlFor="movement-article-search">
                      Buscar articulo
                    </label>
                    <div className="movement-search-input">
                      <SearchIcon />
                      <input
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
                                String(article.id) === String(movementForm.article_id)
                                  ? 'is-selected'
                                  : ''
                              }`}
                              key={article.id}
                              onClick={() => selectMovementArticle(article)}
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
                      <span>Articulo</span>
                      <strong>
                        {selectedMovementArticle ? selectedMovementArticle.name : 'Sin seleccionar'}
                      </strong>
                      <p>
                        {selectedMovementArticle
                          ? `${selectedMovementArticle.internal_code} · ${movementModeConfig.label}`
                          : 'Elige un articulo y completa la cantidad para habilitar el registro.'}
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
                    <strong>Completar movimiento</strong>
                    <p>Carga el contexto y los datos operativos desde un solo bloque.</p>
                  </div>

                  {selectedMovementArticle ? (
                    <div className="movement-selected-article">
                      <div className="movement-selected-head">
                        <div>
                          <strong>{selectedMovementArticle.name}</strong>
                          <p>
                            {selectedMovementArticle.internal_code} / {selectedMovementArticle.article_type_label}
                          </p>
                        </div>
                        <span className={`status-pill ${getArticleStockTone(selectedMovementArticle)}`}>
                          {getArticleStockLabel(selectedMovementArticle)}
                        </span>
                      </div>
                      <div className="movement-selected-grid">
                        <article>
                          <span>Stock actual</span>
                          <strong>{formatQuantity(selectedMovementArticle.current_stock)}</strong>
                        </article>
                        <article>
                          <span>Disponible</span>
                          <strong>{formatQuantity(selectedMovementArticle.available_stock)}</strong>
                        </article>
                        <article>
                          <span>Ubicacion base</span>
                          <strong>{selectedMovementArticle.primary_location || '-'}</strong>
                        </article>
                      </div>
                    </div>
                  ) : (
                    <p className="module-empty-copy">Busca y selecciona un articulo para continuar.</p>
                  )}

                  <div className="movement-form-fields">
                    <label className="movement-form-field">
                        Cantidad
                        <input
                          onChange={(event) =>
                            setMovementForm((current) => ({ ...current, quantity: event.target.value }))
                          }
                          placeholder="0"
                          step="0.001"
                          type="number"
                          value={movementForm.quantity}
                        />
                      </label>

                      {movementUsesSource(movementForm.movement_type) ? (
                        <label className="movement-form-field">
                          Origen fisico
                          <select
                            onChange={(event) =>
                              setMovementForm((current) => ({
                                ...current,
                                source_location_id: event.target.value,
                              }))
                            }
                            value={movementForm.source_location_id}
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

                      {movementUsesTarget(movementForm.movement_type) ? (
                        <label className="movement-form-field">
                          Destino fisico
                          <select
                            onChange={(event) =>
                              setMovementForm((current) => ({
                                ...current,
                                target_location_id: event.target.value,
                              }))
                            }
                            value={movementForm.target_location_id}
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

                      {movementUsesReceiver(movementForm.movement_type) ? (
                        <>
                          <label className="movement-form-field">
                            Sector destino
                            <select
                              onChange={(event) =>
                                setMovementForm((current) => ({ ...current, sector_id: event.target.value }))
                              }
                              value={movementForm.sector_id}
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
                              onChange={(event) =>
                                setMovementForm((current) => ({ ...current, person_id: event.target.value }))
                              }
                              value={movementForm.person_id}
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

                      {selectedMovementArticle?.requires_lot ? (
                        <>
                          <label className="movement-form-field">
                            Lote
                            <input
                              onChange={(event) =>
                                setMovementForm((current) => ({ ...current, lot_code: event.target.value }))
                              }
                              value={movementForm.lot_code}
                            />
                          </label>
                          {selectedMovementArticle.requires_expiry ? (
                            <label className="movement-form-field">
                              Vencimiento
                              <input
                                onChange={(event) =>
                                  setMovementForm((current) => ({
                                    ...current,
                                    expiry_date: event.target.value,
                                  }))
                                }
                                type="date"
                                value={movementForm.expiry_date}
                              />
                            </label>
                          ) : null}
                        </>
                      ) : null}

                      <label className="movement-form-field movement-form-field--wide">
                        Motivo
                        <input
                          onChange={(event) =>
                            setMovementForm((current) => ({
                              ...current,
                              reason_text: event.target.value,
                            }))
                          }
                          placeholder={
                            movementNeedsReason(movementForm.movement_type)
                              ? 'Obligatorio en este movimiento'
                              : 'Opcional'
                          }
                          value={movementForm.reason_text}
                        />
                      </label>

                      <label className="movement-form-field movement-form-field--wide">
                        Observaciones
                        <input
                          onChange={(event) =>
                            setMovementForm((current) => ({ ...current, notes: event.target.value }))
                          }
                          placeholder="Dato corto para contexto operativo"
                          value={movementForm.notes}
                        />
                      </label>
                  </div>

                  <div className="movement-mobile-action">
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
