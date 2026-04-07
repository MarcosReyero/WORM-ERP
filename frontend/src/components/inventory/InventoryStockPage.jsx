import { useDeferredValue, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { createArticle, importArticlesFromExcel } from '../../lib/api.js'
import { CloseIcon, SearchIcon } from '../Icons.jsx'
import {
  ModuleActionPanel,
  ModuleEmptyState,
  ModulePageHeader,
  ModuleTableSection,
  ModuleToolbar,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import {
  articleMatchesQuery,
  formatQuantity,
  getArticleStockLabel,
  getArticleStockTone,
  pickDefaultTracking,
  shouldRequireMinimumStock,
  sortArticlesForOverview,
} from './utils.js'

function matchesAlert(article, alertFilter) {
  if (alertFilter === 'all') {
    return true
  }

  if (alertFilter === 'low') {
    return article.low_stock
  }

  if (alertFilter === 'healthy') {
    return !article.low_stock && article.current_stock > 0
  }

  if (alertFilter === 'out') {
    return article.current_stock <= 0
  }

  return true
}

function getImportDecisionMeta(decision) {
  if (decision === 'ready') {
    return { label: 'Listo', tone: 'ok' }
  }

  if (decision === 'skip') {
    return { label: 'Omitido', tone: 'low' }
  }

  return { label: 'Error', tone: 'out' }
}

export function InventoryStockPage() {
  const { inventoryOverview, refreshInventoryModule, searchValue } = useOutletContext()
  const navigate = useNavigate()
  const [stockSearch, setStockSearch] = useState('')
  const deferredGlobalQuery = useDeferredValue(searchValue.trim())
  const deferredStockQuery = useDeferredValue(stockSearch.trim())
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [alertFilter, setAlertFilter] = useState('all')
  const [showCreateForm, setShowCreateForm] = useState(true)
  const [showImportForm, setShowImportForm] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [importFile, setImportFile] = useState(null)
  const [articleFeedback, setArticleFeedback] = useState({ error: '', success: '' })
  const [importFeedback, setImportFeedback] = useState({
    error: '',
    success: '',
    summary: null,
  })
  const [articleForm, setArticleForm] = useState({
    name: '',
    article_type: 'consumable',
    tracking_mode: 'quantity',
    unit_of_measure_id: '',
    sector_responsible_id: '',
    primary_location_id: '',
    category_id: '',
    minimum_stock: '',
    initial_quantity: '',
    requires_lot: false,
    requires_expiry: false,
    requires_size: false,
    requires_assignee: false,
    is_critical: false,
    loanable: false,
  })

  if (!inventoryOverview) {
    return null
  }

  const { articles, catalogs, permissions } = inventoryOverview
  const filteredArticles = articles
    .filter((article) => articleMatchesQuery(article, deferredGlobalQuery))
    .filter((article) => articleMatchesQuery(article, deferredStockQuery))
    .filter((article) => (typeFilter === 'all' ? true : article.article_type === typeFilter))
    .filter((article) => (statusFilter === 'all' ? true : article.status === statusFilter))
    .filter((article) => matchesAlert(article, alertFilter))
    .sort(sortArticlesForOverview)
  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || alertFilter !== 'all'
  const hasActiveSearch = Boolean(deferredStockQuery || deferredGlobalQuery)
  const isFilteredView = hasActiveSearch || hasActiveFilters
  const importSummary = importFeedback.summary
  const previewReadyItems = importSummary?.items?.filter((item) => item.decision === 'ready') ?? []
  const previewSkippedItems = importSummary?.items?.filter((item) => item.decision === 'skip') ?? []
  const previewErrorItems =
    importSummary?.errors?.length
      ? importSummary.errors
      : importSummary?.items?.filter((item) => item.decision === 'error') ?? []

  function resetStockView() {
    setStockSearch('')
    setTypeFilter('all')
    setStatusFilter('all')
    setAlertFilter('all')
  }

  async function handleArticleSubmit(event) {
    event.preventDefault()
    setBusyAction('article')
    setArticleFeedback({ error: '', success: '' })

    try {
      const payload = { ...articleForm }
      if (!shouldRequireMinimumStock(articleForm.article_type, articleForm.is_critical)) {
        payload.minimum_stock = ''
      }

      const response = await createArticle(payload)
      await refreshInventoryModule()
      setArticleForm((current) => ({
        name: '',
        article_type: 'consumable',
        tracking_mode: 'quantity',
        unit_of_measure_id: current.unit_of_measure_id,
        sector_responsible_id: current.sector_responsible_id,
        primary_location_id: current.primary_location_id,
        category_id: '',
        minimum_stock: '',
        initial_quantity: '',
        requires_lot: false,
        requires_expiry: false,
        requires_size: false,
        requires_assignee: false,
        is_critical: false,
        loanable: false,
      }))
      setArticleFeedback({
        error: '',
        success: `Articulo creado: ${response.item.internal_code}.`,
      })
    } catch (error) {
      setArticleFeedback({ error: error.message, success: '' })
    } finally {
      setBusyAction('')
    }
  }

  async function handleImportSubmit(event) {
    event.preventDefault()
    setImportFeedback({ error: '', success: '', summary: null })

    if (!importFile) {
      setImportFeedback({
        error: 'Selecciona un archivo Excel para importar.',
        success: '',
        summary: null,
      })
      return
    }

    setBusyAction('import')

    try {
      const response = await importArticlesFromExcel(importFile, { mode: 'preview' })
      setImportFeedback({
        error: '',
        success:
          response.item.ready_count > 0
            ? `Se detectaron ${response.item.ready_count} productos listos para agregar.`
            : 'No hay productos nuevos listos para agregar en este Excel.',
        summary: response.item,
      })
    } catch (error) {
      setImportFeedback({
        error: error.message,
        success: '',
        summary: null,
      })
    } finally {
      setBusyAction('')
    }
  }

  async function handleImportConfirm() {
    setImportFeedback((current) => ({ ...current, error: '', success: '' }))

    if (!importFile) {
      setImportFeedback((current) => ({
        ...current,
        error: 'Selecciona nuevamente el archivo Excel antes de confirmar.',
      }))
      return
    }

    setBusyAction('import-confirm')

    try {
      const response = await importArticlesFromExcel(importFile, { mode: 'confirm' })
      await refreshInventoryModule()
      setImportFeedback({
        error: '',
        success: `Importacion confirmada. ${response.item.created_count} productos agregados.`,
        summary: response.item,
      })
    } catch (error) {
      setImportFeedback((current) => ({
        ...current,
        error: error.message,
      }))
    } finally {
      setBusyAction('')
    }
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={
          <span className="module-chip">
            {isFilteredView
              ? `${filteredArticles.length} de ${articles.length} articulos`
              : `${articles.length} articulos visibles`}
          </span>
        }
        description="Maestro y existencias en una vista de trabajo compacta, filtrable y pensada para consulta rapida."
        eyebrow="Inventario / Stock"
        title="Stock"
      />

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleTableSection
            description="Busca por nombre, codigo interno o categoria y combina la busqueda con filtros operativos sin perder contexto."
            title="Existencias"
            toolbar={
              <ModuleToolbar>
                <div className="module-filter-group module-filter-group--stock">
                  <label className="module-search-field">
                    Buscar articulo
                    <div className="module-search-input">
                      <SearchIcon />
                      <input
                        onChange={(event) => setStockSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape' && stockSearch) {
                            setStockSearch('')
                          }
                        }}
                        placeholder="Buscar por nombre, código o categoría"
                        type="search"
                        value={stockSearch}
                      />
                      {stockSearch ? (
                        <button
                          aria-label="Limpiar búsqueda"
                          className="module-search-clear"
                          onClick={() => setStockSearch('')}
                          type="button"
                        >
                          <CloseIcon />
                        </button>
                      ) : null}
                    </div>
                  </label>
                  <label>
                    Tipo
                    <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                      <option value="all">Todos</option>
                      {catalogs.article_types.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Estado
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">Todos</option>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                      <option value="discontinued">Descontinuado</option>
                    </select>
                  </label>
                  <label>
                    Alerta
                    <select value={alertFilter} onChange={(event) => setAlertFilter(event.target.value)}>
                      <option value="all">Todas</option>
                      <option value="low">Bajo minimo</option>
                      <option value="out">Sin stock</option>
                      <option value="healthy">En nivel</option>
                    </select>
                  </label>
                </div>
                <div className="module-toolbar-meta">
                  {hasActiveSearch && deferredGlobalQuery ? (
                    <span className="module-chip is-muted">Busqueda global activa</span>
                  ) : null}
                  {isFilteredView ? (
                    <button className="inline-action" onClick={resetStockView} type="button">
                      Limpiar vista
                    </button>
                  ) : null}
                </div>
              </ModuleToolbar>
            }
          >
            {filteredArticles.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Articulo</th>
                      <th>Tipo</th>
                      <th>Stock</th>
                      <th>Disponible</th>
                      <th>Minimo</th>
                      <th>Ubicacion</th>
                      <th>Estado</th>
                      <th>Ficha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArticles.map((article) => {
                      const articleDetailPath = `/inventario/stock/${article.id}`

                      return (
                        <tr
                          className="module-table-row-link"
                          key={article.id}
                          onClick={() => navigate(articleDetailPath)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              navigate(articleDetailPath)
                            }
                          }}
                          role="link"
                          tabIndex={0}
                          title={`Abrir ficha de ${article.name}`}
                        >
                          <td>
                            <div className="module-table-item">
                              <Link className="module-table-link" to={articleDetailPath}>
                                {article.name}
                              </Link>
                              <span>{article.internal_code}</span>
                            </div>
                          </td>
                          <td>{article.article_type_label}</td>
                          <td>{formatQuantity(article.current_stock)}</td>
                          <td>{formatQuantity(article.available_stock)}</td>
                          <td>{formatQuantity(article.minimum_stock)}</td>
                          <td>{article.primary_location || '-'}</td>
                          <td>
                            <span className={`status-pill ${getArticleStockTone(article)}`}>
                              {getArticleStockLabel(article)}
                            </span>
                          </td>
                          <td>
                            <Link className="inline-action" to={articleDetailPath}>
                              Abrir
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description={
                  hasActiveSearch
                    ? 'No encontramos articulos para esa busqueda. Prueba con nombre, codigo o categoria, o limpia la busqueda.'
                    : hasActiveFilters
                      ? 'No hay articulos para los filtros actuales. Ajusta Tipo, Estado o Alerta para volver a ver stock.'
                      : 'Todavia no hay articulos cargados en stock.'
                }
                title="Sin stock visible"
              />
            )}
          </ModuleTableSection>
        </div>

        <div className="module-side-stack">
          <ModuleActionPanel
            description="Alta corta y operativa. El codigo se genera solo y se valida contra duplicados."
            isOpen={showCreateForm}
            onToggle={() => setShowCreateForm((current) => !current)}
            title="Alta rapida"
          >
            <form className="ops-form" onSubmit={handleArticleSubmit}>
              <div className="field-grid">
                <label className="field-span-2">
                  Nombre
                  <input
                    onChange={(event) =>
                      setArticleForm((current) => ({ ...current, name: event.target.value }))
                    }
                    value={articleForm.name}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    onChange={(event) =>
                      setArticleForm((current) => {
                        const nextTracking = pickDefaultTracking(event.target.value)
                        return {
                          ...current,
                          article_type: event.target.value,
                          tracking_mode: nextTracking,
                          loanable:
                            event.target.value === 'tool'
                              ? true
                              : nextTracking === 'unit'
                                ? current.loanable
                                : false,
                        }
                      })
                    }
                    value={articleForm.article_type}
                  >
                    {catalogs.article_types.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Unidad
                  <select
                    onChange={(event) =>
                      setArticleForm((current) => ({
                        ...current,
                        unit_of_measure_id: event.target.value,
                      }))
                    }
                    value={articleForm.unit_of_measure_id}
                  >
                    <option value="">Seleccionar</option>
                    {catalogs.units.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sector responsable
                  <select
                    onChange={(event) =>
                      setArticleForm((current) => ({
                        ...current,
                        sector_responsible_id: event.target.value,
                      }))
                    }
                    value={articleForm.sector_responsible_id}
                  >
                    <option value="">Seleccionar</option>
                    {catalogs.sectors.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ubicacion base
                  <select
                    onChange={(event) =>
                      setArticleForm((current) => ({
                        ...current,
                        primary_location_id: event.target.value,
                      }))
                    }
                    value={articleForm.primary_location_id}
                  >
                    <option value="">Sin definir</option>
                    {catalogs.locations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Categoria
                  <select
                    onChange={(event) =>
                      setArticleForm((current) => ({ ...current, category_id: event.target.value }))
                    }
                    value={articleForm.category_id}
                  >
                    <option value="">Sin categoria</option>
                    {catalogs.categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tracking
                  <select
                    onChange={(event) =>
                      setArticleForm((current) => ({
                        ...current,
                        tracking_mode: event.target.value,
                        loanable: event.target.value === 'unit' ? current.loanable : false,
                      }))
                    }
                    value={articleForm.tracking_mode}
                  >
                    {catalogs.tracking_modes.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Stock inicial
                  <input
                    onChange={(event) =>
                      setArticleForm((current) => ({
                        ...current,
                        initial_quantity: event.target.value,
                      }))
                    }
                    step="0.001"
                    type="number"
                    value={articleForm.initial_quantity}
                  />
                </label>
                <label>
                  Stock minimo
                  <input
                    onChange={(event) =>
                      setArticleForm((current) => ({
                        ...current,
                        minimum_stock: event.target.value,
                      }))
                    }
                    placeholder={
                      shouldRequireMinimumStock(articleForm.article_type, articleForm.is_critical)
                        ? 'Obligatorio'
                        : 'Opcional'
                    }
                    step="0.001"
                    type="number"
                    value={articleForm.minimum_stock}
                  />
                </label>
              </div>

              <div className="checkbox-row">
                <label>
                  <input
                    checked={articleForm.is_critical}
                    onChange={(event) =>
                      setArticleForm((current) => ({ ...current, is_critical: event.target.checked }))
                    }
                    type="checkbox"
                  />
                  Critico
                </label>
                <label>
                  <input
                    checked={articleForm.loanable}
                    onChange={(event) =>
                      setArticleForm((current) => ({ ...current, loanable: event.target.checked }))
                    }
                    type="checkbox"
                  />
                  Prestable
                </label>
                <label>
                  <input
                    checked={articleForm.requires_lot}
                    onChange={(event) =>
                      setArticleForm((current) => ({
                        ...current,
                        requires_lot: event.target.checked,
                        requires_expiry: event.target.checked ? current.requires_expiry : false,
                      }))
                    }
                    type="checkbox"
                  />
                  Lote
                </label>
                <label>
                  <input
                    checked={articleForm.requires_expiry}
                    onChange={(event) =>
                      setArticleForm((current) => ({
                        ...current,
                        requires_expiry: event.target.checked,
                        requires_lot: event.target.checked ? true : current.requires_lot,
                      }))
                    }
                    type="checkbox"
                  />
                  Vencimiento
                </label>
                <label>
                  <input
                    checked={articleForm.requires_assignee}
                    onChange={(event) =>
                      setArticleForm((current) => ({
                        ...current,
                        requires_assignee: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  Asignacion
                </label>
              </div>

              <PanelMessage error={articleFeedback.error} success={articleFeedback.success} />
              <button
                className="primary-button"
                disabled={!permissions.can_manage_master || busyAction === 'article'}
                type="submit"
              >
                {busyAction === 'article' ? 'Guardando...' : 'Crear articulo'}
              </button>
            </form>
          </ModuleActionPanel>

          <ModuleActionPanel
            description="Analiza primero el archivo y confirma despues. Soporta tablas estructuradas y listas simples de pañol."
            isOpen={showImportForm}
            onToggle={() => setShowImportForm((current) => !current)}
            title="Importar desde Excel"
          >
            <form className="ops-form" onSubmit={handleImportSubmit}>
              <label>
                Archivo Excel
                <input
                  accept=".xlsx,.xlsm"
                  onChange={(event) => {
                    setImportFile(event.target.files?.[0] || null)
                    setImportFeedback({ error: '', success: '', summary: null })
                  }}
                  type="file"
                />
              </label>

              <p className="module-empty-copy">
                Si el Excel viene armado como tabla, usa <strong>nombre</strong>, <strong>tipo</strong>,{' '}
                <strong>unidad</strong> y <strong>sector</strong>. Tambien puede leer listas simples como la
                de pañol, con la primera columna <strong>nombre</strong> y categorias por bloque.
              </p>

              <PanelMessage error={importFeedback.error} success={importFeedback.success} />

              {importSummary ? (
                <div className="import-summary">
                  <div className="record-meta-grid">
                    <article className="record-meta-card">
                      <span>
                        {importSummary.mode === 'confirm' ? 'Productos agregados' : 'Listos para agregar'}
                      </span>
                      <strong>
                        {importSummary.mode === 'confirm'
                          ? importSummary.created_count
                          : importSummary.ready_count}
                      </strong>
                    </article>
                    <article className="record-meta-card">
                      <span>Omitidos</span>
                      <strong>{importSummary.skip_count}</strong>
                    </article>
                    <article className="record-meta-card">
                      <span>Con error</span>
                      <strong>{importSummary.error_count}</strong>
                    </article>
                  </div>

                  {previewReadyItems.length ? (
                    <div className="import-preview-block">
                      <div className="import-preview-heading">
                        <strong>
                          {importSummary.mode === 'confirm'
                            ? 'Productos detectados en la importacion'
                            : 'Productos listos para agregar'}
                        </strong>
                        <span>{previewReadyItems.length} filas</span>
                      </div>
                      <div className="module-list import-preview-list">
                        {previewReadyItems.slice(0, 12).map((item) => {
                          const meta = getImportDecisionMeta(item.decision)

                          return (
                            <div className="module-list-item import-preview-item" key={`${item.sheet_name}-${item.row}`}>
                              <div>
                                <strong>{item.name}</strong>
                                <p>
                                  {item.article_type_label} · {item.unit_name} · {item.sector_name}
                                  {item.category_name ? ` · ${item.category_name}` : ''}
                                </p>
                              </div>
                              <span className={`status-pill ${meta.tone}`}>{meta.label}</span>
                            </div>
                          )
                        })}
                      </div>
                      {previewReadyItems.length > 12 ? (
                        <p className="module-empty-copy">
                          Y {previewReadyItems.length - 12} productos mas listos para agregar.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {previewSkippedItems.length ? (
                    <div className="import-preview-block">
                      <div className="import-preview-heading">
                        <strong>Productos omitidos</strong>
                        <span>{previewSkippedItems.length} filas</span>
                      </div>
                      <div className="module-list import-preview-list">
                        {previewSkippedItems.slice(0, 6).map((item) => (
                          <div className="module-list-item import-preview-item" key={`${item.sheet_name}-${item.row}`}>
                            <div>
                              <strong>{item.name || `Fila ${item.row}`}</strong>
                              <p>{item.detail}</p>
                            </div>
                            <span className="status-pill low">Omitido</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {previewErrorItems.length ? (
                    <div className="import-preview-block">
                      <div className="import-preview-heading">
                        <strong>Filas con problema</strong>
                        <span>{previewErrorItems.length} filas</span>
                      </div>
                      <div className="module-list import-preview-list">
                        {previewErrorItems.slice(0, 6).map((item) => (
                          <div
                            className="module-list-item import-preview-item"
                            key={`${item.sheet_name}-${item.row}-${item.detail}`}
                          >
                            <div>
                              <strong>{item.name || `Fila ${item.row}`}</strong>
                              <p>{item.detail}</p>
                            </div>
                            <span className="status-pill out">Error</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {importSummary.sheet_summaries?.length ? (
                    <div className="import-preview-block">
                      <div className="import-preview-heading">
                        <strong>Hojas detectadas</strong>
                      </div>
                      <div className="module-list import-preview-list">
                        {importSummary.sheet_summaries.map((sheet) => (
                          <div className="module-list-item import-preview-item" key={sheet.sheet_name}>
                            <div>
                              <strong>{sheet.sheet_name}</strong>
                              <p>
                                {sheet.mode === 'simple_list' ? 'Lista simple' : 'Tabla estructurada'} ·{' '}
                                {sheet.candidate_count} filas utiles
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="import-actions">
                <button
                  className="primary-button"
                  disabled={!permissions.can_manage_master || busyAction === 'import' || busyAction === 'import-confirm'}
                  type="submit"
                >
                  {busyAction === 'import' ? 'Analizando...' : 'Analizar Excel'}
                </button>

                {importSummary?.mode === 'preview' && importSummary.ready_count > 0 ? (
                  <button
                    className="secondary-button"
                    disabled={!permissions.can_manage_master || busyAction === 'import-confirm'}
                    onClick={handleImportConfirm}
                    type="button"
                  >
                    {busyAction === 'import-confirm' ? 'Confirmando...' : 'Confirmar alta'}
                  </button>
                ) : null}
              </div>
            </form>
          </ModuleActionPanel>
        </div>
      </section>
    </div>
  )
}
