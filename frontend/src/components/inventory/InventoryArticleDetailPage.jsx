import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { fetchArticleDetail, updateArticle } from '../../lib/api.js'
import {
  ModuleActionPanel,
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import {
  formatDateTime,
  formatQuantity,
  getArticleStockLabel,
  getArticleStockTone,
  pickDefaultTracking,
  shouldRequireMinimumStock,
} from './utils.js'

const ARTICLE_STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'discontinued', label: 'Descontinuado' },
]

function buildArticleForm(article) {
  return {
    name: article.name || '',
    description: article.description || '',
    article_type: article.article_type || 'consumable',
    tracking_mode: article.tracking_mode || 'quantity',
    status: article.status || 'active',
    unit_of_measure_id: article.unit_of_measure?.id ? String(article.unit_of_measure.id) : '',
    sector_responsible_id: article.sector_responsible_id ? String(article.sector_responsible_id) : '',
    primary_location_id: article.primary_location_id ? String(article.primary_location_id) : '',
    category_id: article.category_id ? String(article.category_id) : '',
    subcategory_id: article.subcategory_id ? String(article.subcategory_id) : '',
    supplier_id: article.supplier_id ? String(article.supplier_id) : '',
    minimum_stock: article.minimum_stock ?? '',
    reference_price: article.reference_price ?? '',
    observations: article.observations || '',
    requires_lot: Boolean(article.requires_lot),
    requires_expiry: Boolean(article.requires_expiry),
    requires_serial: Boolean(article.requires_serial),
    requires_size: Boolean(article.requires_size),
    requires_quality: Boolean(article.requires_quality),
    requires_assignee: Boolean(article.requires_assignee),
    is_critical: Boolean(article.is_critical),
    loanable: Boolean(article.loanable),
  }
}

function buildFormData(form, imageFile, clearImage) {
  const payload = new FormData()

  Object.entries(form).forEach(([key, value]) => {
    if (typeof value === 'boolean') {
      payload.append(key, value ? 'true' : 'false')
      return
    }

    payload.append(key, value === null || value === undefined ? '' : String(value))
  })

  if (imageFile) {
    payload.append('image', imageFile)
  }

  if (clearImage) {
    payload.append('clear_image', 'true')
  }

  return payload
}

export function InventoryArticleDetailPage() {
  const { articleId } = useParams()
  const { inventoryOverview, refreshInventoryModule, user } = useOutletContext()
  const [detailState, setDetailState] = useState({
    loading: true,
    error: '',
    data: null,
  })
  const [showEditPanel, setShowEditPanel] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [form, setForm] = useState(null)
  const [feedback, setFeedback] = useState({ error: '', success: '' })
  const [imageFile, setImageFile] = useState(null)
  const [clearImage, setClearImage] = useState(false)

  const catalogs = inventoryOverview?.catalogs || {
    article_types: [],
    tracking_modes: [],
    units: [],
    sectors: [],
    locations: [],
    categories: [],
    suppliers: [],
  }

  useEffect(() => {
    let active = true

    async function loadDetail() {
      setDetailState((current) => ({
        ...current,
        loading: true,
        error: '',
      }))

      try {
        const data = await fetchArticleDetail(articleId)
        if (!active) {
          return
        }

        setDetailState({
          loading: false,
          error: '',
          data,
        })
        setForm(buildArticleForm(data.article))
        setImageFile(null)
        setClearImage(false)
      } catch (error) {
        if (!active) {
          return
        }

        setDetailState({
          loading: false,
          error: error.message || 'No se pudo cargar la ficha del articulo.',
          data: null,
        })
      }
    }

    void loadDetail()

    return () => {
      active = false
    }
  }, [articleId])

  const rootCategories = useMemo(
    () => catalogs.categories.filter((item) => !item.parent_id),
    [catalogs.categories],
  )
  const subcategoryOptions = useMemo(() => {
    if (!form?.category_id) {
      return catalogs.categories.filter((item) => item.parent_id)
    }

    return catalogs.categories.filter(
      (item) => String(item.parent_id) === String(form.category_id),
    )
  }, [catalogs.categories, form?.category_id])
  const imagePreviewUrl = useMemo(() => {
    if (imageFile) {
      return URL.createObjectURL(imageFile)
    }

    if (clearImage) {
      return ''
    }

    return detailState.data?.article?.image_url || ''
  }, [clearImage, detailState.data?.article?.image_url, imageFile])

  useEffect(() => {
    if (!imagePreviewUrl.startsWith('blob:')) {
      return undefined
    }

    return () => {
      URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form) {
      return
    }

    setBusyAction('save')
    setFeedback({ error: '', success: '' })

    try {
      const payload = { ...form }
      if (!shouldRequireMinimumStock(payload.article_type, payload.is_critical)) {
        payload.minimum_stock = ''
      }

      const response = await updateArticle(articleId, buildFormData(payload, imageFile, clearImage))
      const nextDetail = response.item || (await fetchArticleDetail(articleId))

      setDetailState({
        loading: false,
        error: '',
        data: nextDetail,
      })
      setForm(buildArticleForm(nextDetail.article))
      setImageFile(null)
      setClearImage(false)
      setFeedback({ error: '', success: 'Ficha actualizada correctamente.' })
      await refreshInventoryModule()
    } catch (error) {
      setFeedback({ error: error.message, success: '' })
    } finally {
      setBusyAction('')
    }
  }

  if (detailState.loading && !detailState.data) {
    return (
      <div className="module-page-stack stock-titled-page">
        <ModuleEmptyState
          title="Cargando ficha"
        />
      </div>
    )
  }

  if (detailState.error || !detailState.data || !form) {
    return (
      <div className="module-page-stack stock-titled-page">
        <PanelMessage error={detailState.error || 'No se encontro el articulo.'} success="" />
        <Link className="ghost-link" to="/inventario/stock">
          Volver a stock
        </Link>
      </div>
    )
  }

  const { article, balances, movements, tracked_units: trackedUnits } = detailState.data

  return (
    <div className="module-page-stack stock-titled-page">
      <ModulePageHeader
        actions={
          <>
            <span className="module-chip">{article.internal_code}</span>
            <span className={`status-pill ${getArticleStockTone(article)}`}>
              {getArticleStockLabel(article)}
            </span>
            <Link className="ghost-link" to="/inventario/stock">
              Volver a stock
            </Link>
          </>
        }
        eyebrow="Inventario / Stock"
        title={article.name}
      />

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleSurface
            title="Ficha del producto"
          >
            <div className="record-summary">
              <div className="record-media">
                {imagePreviewUrl ? (
                  <img alt={article.name} src={imagePreviewUrl} />
                ) : (
                  <div className="record-media-placeholder">Sin imagen</div>
                )}
              </div>

              <div className="record-summary-copy">
                <div className="record-summary-head">
                  <div>
                    <strong>{article.name}</strong>
                    <p>{article.description || 'Sin descripcion operativa cargada.'}</p>
                  </div>
                  <span className="module-chip is-muted">{article.article_type_label}</span>
                </div>

                <div className="record-meta-grid">
                  <article className="record-meta-card">
                    <span>Stock actual</span>
                    <strong>{formatQuantity(article.current_stock)}</strong>
                  </article>
                  <article className="record-meta-card">
                    <span>Disponible</span>
                    <strong>{formatQuantity(article.available_stock)}</strong>
                  </article>
                  <article className="record-meta-card">
                    <span>Minimo</span>
                    <strong>{formatQuantity(article.minimum_stock)}</strong>
                  </article>
                  <article className="record-meta-card">
                    <span>Ubicacion base</span>
                    <strong>{article.primary_location || '-'}</strong>
                  </article>
                </div>

                <div className="record-detail-grid">
                  <div className="record-detail-item">
                    <span>Sector responsable</span>
                    <strong>{article.sector_responsible}</strong>
                  </div>
                  <div className="record-detail-item">
                    <span>Unidad</span>
                    <strong>{article.unit_of_measure.name}</strong>
                  </div>
                  <div className="record-detail-item">
                    <span>Categoria</span>
                    <strong>{article.category || '-'}</strong>
                  </div>
                  <div className="record-detail-item">
                    <span>Subcategoria</span>
                    <strong>{article.subcategory || '-'}</strong>
                  </div>
                  <div className="record-detail-item">
                    <span>Proveedor habitual</span>
                    <strong>{article.supplier || '-'}</strong>
                    <small>
                      {article.availability_days !== null && article.availability_days !== undefined
                        ? `Disponibilidad estimada: ${article.availability_days} días`
                        : 'Disponibilidad estimada: sin dato'}
                    </small>
                  </div>
                  <div className="record-detail-item">
                    <span>Tracking</span>
                    <strong>{article.tracking_mode_label}</strong>
                  </div>
                </div>

                <div className="checkbox-row">
                  <label>
                    <input checked={article.is_critical} readOnly type="checkbox" />
                    Critico
                  </label>
                  <label>
                    <input checked={article.loanable} readOnly type="checkbox" />
                    Prestable
                  </label>
                  <label>
                    <input checked={article.requires_lot} readOnly type="checkbox" />
                    Lote
                  </label>
                  <label>
                    <input checked={article.requires_expiry} readOnly type="checkbox" />
                    Vencimiento
                  </label>
                  <label>
                    <input checked={article.requires_assignee} readOnly type="checkbox" />
                    Asignacion
                  </label>
                </div>
              </div>
            </div>
          </ModuleSurface>

          <ModuleTableSection
            title="Stock por ubicacion"
          >
            {balances.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Ubicacion</th>
                      <th>Lote</th>
                      <th>Fisico</th>
                      <th>Reservado</th>
                      <th>Disponible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((balance) => (
                      <tr key={balance.id}>
                        <td>{balance.location}</td>
                        <td>{balance.batch || '-'}</td>
                        <td>{formatQuantity(balance.on_hand)}</td>
                        <td>{formatQuantity(balance.reserved)}</td>
                        <td>{formatQuantity(balance.available)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description="Este articulo no tiene balances por cantidad registrados."
                title="Sin saldos por ubicacion"
              />
            )}
          </ModuleTableSection>

          <ModuleTableSection
            title="Movimientos recientes"
          >
            {movements.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Cantidad</th>
                      <th>Origen</th>
                      <th>Destino</th>
                      <th>Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((movement) => (
                      <tr key={movement.id}>
                        <td>{formatDateTime(movement.timestamp)}</td>
                        <td>{movement.movement_type_label}</td>
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
                description="Todavia no hay movimientos para este articulo."
                title="Sin movimientos"
              />
            )}
          </ModuleTableSection>

          {trackedUnits.length ? (
            <ModuleTableSection
              title="Unidades individuales"
            >
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Estado</th>
                      <th>Ubicacion actual</th>
                      <th>Serie</th>
                      <th>Marca / modelo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackedUnits.map((unit) => (
                      <tr key={unit.id}>
                        <td>{unit.internal_tag}</td>
                        <td>{unit.status_label}</td>
                        <td>
                          {unit.current_holder_person || unit.current_location || unit.current_sector || '-'}
                        </td>
                        <td>{unit.serial_number || '-'}</td>
                        <td>{[unit.brand, unit.model].filter(Boolean).join(' / ') || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ModuleTableSection>
          ) : null}
        </div>

        <ModuleActionPanel isOpen={showEditPanel} onToggle={() => setShowEditPanel((current) => !current)} title="Editar producto">
          <form className="ops-form article-detail-form" onSubmit={handleSubmit}>
            <div className="field-grid">
              <label className="field-span-2">
                Codigo interno
                <input disabled value={article.internal_code} />
              </label>
              <label className="field-span-2">
                Nombre
                <input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  value={form.name}
                />
              </label>
              <label className="field-span-2">
                Descripcion
                <textarea
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  rows="2"
                  value={form.description}
                />
              </label>
              <div className="field-span-2 article-photo-field">
                <span>Imagen del producto</span>
                <div className="article-photo-input">
                  <div className="article-photo-preview">
                    {imagePreviewUrl ? (
                      <img alt={article.name} src={imagePreviewUrl} />
                    ) : (
                      <div className="record-media-placeholder">Sin imagen</div>
                    )}
                  </div>
                  <div className="article-photo-controls">
                    <input
                      accept=".jpg,.jpeg,.png,.webp,.gif"
                      className="article-photo-file-input"
                      onChange={(event) => {
                        setImageFile(event.target.files?.[0] || null)
                        if (event.target.files?.[0]) {
                          setClearImage(false)
                        }
                      }}
                      type="file"
                    />
                    <p className="module-empty-copy">
                      JPG, PNG, WEBP o GIF. La imagen se recorta automaticamente al cuadro.
                    </p>
                    <label className="article-photo-clear">
                      <input
                        checked={clearImage}
                        onChange={(event) => setClearImage(event.target.checked)}
                        type="checkbox"
                      />
                      Quitar imagen actual
                    </label>
                  </div>
                </div>
              </div>
              <label>
                Tipo
                <select
                  onChange={(event) =>
                    setForm((current) => {
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
                  value={form.article_type}
                >
                  {catalogs.article_types.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tracking
                <select
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      tracking_mode: event.target.value,
                      loanable: event.target.value === 'unit' ? current.loanable : false,
                    }))
                  }
                  value={form.tracking_mode}
                >
                  {catalogs.tracking_modes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Estado
                <select
                  onChange={(event) =>
                    setForm((current) => ({ ...current, status: event.target.value }))
                  }
                  value={form.status}
                >
                  {ARTICLE_STATUS_OPTIONS.map((item) => (
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
                    setForm((current) => ({ ...current, unit_of_measure_id: event.target.value }))
                  }
                  value={form.unit_of_measure_id}
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
                    setForm((current) => ({
                      ...current,
                      sector_responsible_id: event.target.value,
                    }))
                  }
                  value={form.sector_responsible_id}
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
                    setForm((current) => ({
                      ...current,
                      primary_location_id: event.target.value,
                    }))
                  }
                  value={form.primary_location_id}
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
                    setForm((current) => ({
                      ...current,
                      category_id: event.target.value,
                      subcategory_id:
                        String(current.category_id) === String(event.target.value)
                          ? current.subcategory_id
                          : '',
                    }))
                  }
                  value={form.category_id}
                >
                  <option value="">Sin categoria</option>
                  {rootCategories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subcategoria
                <select
                  onChange={(event) =>
                    setForm((current) => ({ ...current, subcategory_id: event.target.value }))
                  }
                  value={form.subcategory_id}
                >
                  <option value="">Sin subcategoria</option>
                  {subcategoryOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Proveedor
                <select
                  onChange={(event) =>
                    setForm((current) => ({ ...current, supplier_id: event.target.value }))
                  }
                  value={form.supplier_id}
                >
                  <option value="">Sin proveedor</option>
                  {catalogs.suppliers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Stock minimo
                <input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, minimum_stock: event.target.value }))
                  }
                  placeholder={
                    shouldRequireMinimumStock(form.article_type, form.is_critical)
                      ? 'Obligatorio'
                      : 'Opcional'
                  }
                  step="0.001"
                  type="number"
                  value={form.minimum_stock}
                />
              </label>
              <label>
                Precio referencia
                <input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reference_price: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={form.reference_price}
                />
              </label>
              <label className="field-span-2">
                Observaciones
                <textarea
                  onChange={(event) =>
                    setForm((current) => ({ ...current, observations: event.target.value }))
                  }
                  rows="2"
                  value={form.observations}
                />
              </label>
            </div>

            <div className="checkbox-row">
              <label>
                <input
                  checked={form.is_critical}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, is_critical: event.target.checked }))
                  }
                  type="checkbox"
                />
                Critico
              </label>
              <label>
                <input
                  checked={form.loanable}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, loanable: event.target.checked }))
                  }
                  type="checkbox"
                />
                Prestable
              </label>
              <label>
                <input
                  checked={form.requires_lot}
                  onChange={(event) =>
                    setForm((current) => ({
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
                  checked={form.requires_expiry}
                  onChange={(event) =>
                    setForm((current) => ({
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
                  checked={form.requires_serial}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, requires_serial: event.target.checked }))
                  }
                  type="checkbox"
                />
                Serie
              </label>
              <label>
                <input
                  checked={form.requires_size}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, requires_size: event.target.checked }))
                  }
                  type="checkbox"
                />
                Talle
              </label>
              <label>
                <input
                  checked={form.requires_quality}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, requires_quality: event.target.checked }))
                  }
                  type="checkbox"
                />
                Calidad
              </label>
              <label>
                <input
                  checked={form.requires_assignee}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      requires_assignee: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Asignacion
              </label>
            </div>

            <PanelMessage error={feedback.error} success={feedback.success} />

            <button
              className="primary-button"
              disabled={busyAction === 'save' || !inventoryOverview.permissions.can_manage_master}
              type="submit"
            >
              {busyAction === 'save' ? 'Guardando...' : 'Guardar cambios'}
            </button>

            <p className="module-empty-copy">Ultima actualizacion por {user.full_name} desde el modulo.</p>
          </form>
        </ModuleActionPanel>
      </section>
    </div>
  )
}
