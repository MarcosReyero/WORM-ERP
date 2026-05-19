import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { fetchArticleDetail, updateArticle } from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  ModuleTableSection,
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
  if (imageFile) payload.append('image', imageFile)
  if (clearImage) payload.append('clear_image', 'true')
  return payload
}

export function InventoryArticleDetailPage() {
  const { articleId } = useParams()
  const { inventoryOverview, refreshInventoryModule } = useOutletContext()
  const [detailState, setDetailState] = useState({ loading: true, error: '', data: null })
  const [form, setForm] = useState(null)
  const [saveStatus, setSaveStatus] = useState('') // '' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [clearImage, setClearImage] = useState(false)
  const [showBalances, setShowBalances] = useState(false)
  const [showMovements, setShowMovements] = useState(false)
  const fileInputRef = useRef(null)
  const saveTimerRef = useRef(null)
  const formRef = useRef(form)

  useEffect(() => {
    formRef.current = form
  }, [form])

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
      setDetailState((current) => ({ ...current, loading: true, error: '' }))
      try {
        const data = await fetchArticleDetail(articleId)
        if (!active) return
        setDetailState({ loading: false, error: '', data })
        setForm(buildArticleForm(data.article))
        setImageFile(null)
        setClearImage(false)
      } catch (error) {
        if (!active) return
        setDetailState({ loading: false, error: error.message || 'No se pudo cargar la ficha del articulo.', data: null })
      }
    }
    void loadDetail()
    return () => { active = false }
  }, [articleId])

  const rootCategories = useMemo(
    () => catalogs.categories.filter((item) => !item.parent_id),
    [catalogs.categories],
  )
  const subcategoryOptions = useMemo(() => {
    if (!form?.category_id) return catalogs.categories.filter((item) => item.parent_id)
    return catalogs.categories.filter((item) => String(item.parent_id) === String(form.category_id))
  }, [catalogs.categories, form?.category_id])

  const imagePreviewUrl = useMemo(() => {
    if (imageFile) return URL.createObjectURL(imageFile)
    if (clearImage) return ''
    return detailState.data?.article?.image_url || ''
  }, [clearImage, detailState.data?.article?.image_url, imageFile])

  useEffect(() => {
    if (!imagePreviewUrl.startsWith('blob:')) return undefined
    return () => URL.revokeObjectURL(imagePreviewUrl)
  }, [imagePreviewUrl])

  const canEdit = Boolean(inventoryOverview?.permissions?.can_manage_master)

  async function saveForm(updatedForm, { file = null, clear = false } = {}) {
    if (!canEdit) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    setSaveError('')
    try {
      const payload = { ...updatedForm }
      if (!shouldRequireMinimumStock(payload.article_type, payload.is_critical)) {
        payload.minimum_stock = ''
      }
      const response = await updateArticle(articleId, buildFormData(payload, file, clear))
      const nextDetail = response.item || (await fetchArticleDetail(articleId))
      setDetailState({ loading: false, error: '', data: nextDetail })
      const nextForm = buildArticleForm(nextDetail.article)
      setForm(nextForm)
      setImageFile(null)
      setClearImage(false)
      setSaveStatus('saved')
      refreshInventoryModule()
      saveTimerRef.current = setTimeout(() => setSaveStatus(''), 2500)
    } catch (error) {
      setSaveStatus('error')
      setSaveError(error.message || 'No se pudo guardar.')
    }
  }

  function handleBlur(currentForm) {
    saveForm(currentForm ?? formRef.current)
  }

  function handleSelectChange(field, value) {
    const next = { ...formRef.current, [field]: value }
    setForm(next)
    saveForm(next)
  }

  function handleArticleTypeChange(value) {
    const nextTracking = pickDefaultTracking(value)
    const next = {
      ...formRef.current,
      article_type: value,
      tracking_mode: nextTracking,
      loanable: value === 'tool' ? true : nextTracking === 'unit' ? formRef.current.loanable : false,
    }
    setForm(next)
    saveForm(next)
  }

  function handleTrackingChange(value) {
    const next = { ...formRef.current, tracking_mode: value, loanable: value === 'unit' ? formRef.current.loanable : false }
    setForm(next)
    saveForm(next)
  }

  function handleCheckboxChange(field, checked, extra = {}) {
    const next = { ...formRef.current, [field]: checked, ...extra }
    setForm(next)
    saveForm(next)
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setClearImage(false)
    saveForm(formRef.current, { file, clear: false })
    event.target.value = ''
  }

  function handleClearImage(event) {
    event.stopPropagation()
    setImageFile(null)
    setClearImage(true)
    saveForm(formRef.current, { file: null, clear: true })
  }

  if (detailState.loading && !detailState.data) {
    return (
      <div className="module-page-stack stock-titled-page">
        <ModuleEmptyState title="Cargando ficha" />
      </div>
    )
  }

  if (detailState.error || !detailState.data || !form) {
    return (
      <div className="module-page-stack stock-titled-page">
        <p className="module-empty-copy">{detailState.error || 'No se encontro el articulo.'}</p>
        <Link className="ghost-link" to="/inventario/stock">Volver a stock</Link>
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
            {saveStatus === 'saving' && <span className="save-indicator">Guardando...</span>}
            {saveStatus === 'saved' && <span className="save-indicator is-saved">Guardado</span>}
            {saveStatus === 'error' && <span className="save-indicator is-error">Error al guardar</span>}
            <Link className="ghost-link" to="/inventario/stock">Volver a stock</Link>
          </>
        }
        eyebrow="Inventario / Stock"
        title={article.name}
      />

      <div className="module-main-stack">
        <ModuleSurface>
          {saveStatus === 'error' && saveError && (
            <div className="inline-save-error">{saveError}</div>
          )}

          <div className="record-summary">
            {/* Imagen con overlay */}
            <div className="record-media record-media--editable">
              {imagePreviewUrl ? (
                <img alt={article.name} src={imagePreviewUrl} />
              ) : (
                <div className="record-media-placeholder">Sin imagen</div>
              )}
              {canEdit && (
                <div className="record-media-overlay">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    Cambiar imagen
                  </button>
                  <button onClick={handleClearImage} type="button">
                    Eliminar imagen
                  </button>
                </div>
              )}
              <input
                accept=".jpg,.jpeg,.png,.webp,.gif"
                onChange={handleImageChange}
                ref={fileInputRef}
                style={{ display: 'none' }}
                type="file"
              />
            </div>

            <div className="record-summary-copy">
              {/* Nombre + tipo */}
              <div className="record-inline-header">
                <input
                  className="ghost-field ghost-field--name"
                  disabled={!canEdit}
                  onBlur={(e) => handleBlur({ ...formRef.current, name: e.target.value })}
                  onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                  value={form.name}
                />
                <select
                  className="ghost-chip-select"
                  disabled={!canEdit}
                  onChange={(e) => handleArticleTypeChange(e.target.value)}
                  value={form.article_type}
                >
                  {catalogs.article_types.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>

              {/* Descripcion */}
              <textarea
                className="ghost-field ghost-field--description"
                disabled={!canEdit}
                onBlur={(e) => handleBlur({ ...formRef.current, description: e.target.value })}
                onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
                placeholder="Sin descripcion operativa cargada."
                rows={2}
                value={form.description}
              />

              {/* Tarjetas de stock */}
              <div className="record-meta-grid">
                <article className="record-meta-card">
                  <span>Stock actual</span>
                  <strong>{formatQuantity(article.current_stock)}</strong>
                </article>
                <article className="record-meta-card">
                  <span>Disponible</span>
                  <strong>{formatQuantity(article.available_stock)}</strong>
                </article>
                <article className="record-meta-card record-meta-card--editable">
                  <span>Minimo</span>
                  <input
                    className="ghost-field ghost-field--meta-number"
                    disabled={!canEdit}
                    onBlur={(e) => handleBlur({ ...formRef.current, minimum_stock: e.target.value })}
                    onChange={(e) => setForm((c) => ({ ...c, minimum_stock: e.target.value }))}
                    placeholder="—"
                    step="0.001"
                    type="number"
                    value={form.minimum_stock}
                  />
                </article>
                <article className="record-meta-card record-meta-card--editable">
                  <span>Ubicacion base</span>
                  <select
                    className="ghost-field ghost-field--meta-select"
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange('primary_location_id', e.target.value)}
                    value={form.primary_location_id}
                  >
                    <option value="">Sin definir</option>
                    {catalogs.locations.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </article>
              </div>

              {/* Grilla de atributos */}
              <div className="record-detail-grid">
                <div className="record-detail-item">
                  <span>Sector responsable</span>
                  <select
                    className="ghost-field ghost-field--detail"
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange('sector_responsible_id', e.target.value)}
                    value={form.sector_responsible_id}
                  >
                    <option value="">Sin asignar</option>
                    {catalogs.sectors.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="record-detail-item">
                  <span>Unidad de medida</span>
                  <select
                    className="ghost-field ghost-field--detail"
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange('unit_of_measure_id', e.target.value)}
                    value={form.unit_of_measure_id}
                  >
                    <option value="">Sin asignar</option>
                    {catalogs.units.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="record-detail-item">
                  <span>Categoria</span>
                  <select
                    className="ghost-field ghost-field--detail"
                    disabled={!canEdit}
                    onChange={(e) =>
                      handleSelectChange('category_id', e.target.value) ||
                      setForm((c) => ({ ...c, subcategory_id: String(c.category_id) === String(e.target.value) ? c.subcategory_id : '' }))
                    }
                    value={form.category_id}
                  >
                    <option value="">Sin categoria</option>
                    {rootCategories.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="record-detail-item">
                  <span>Subcategoria</span>
                  <select
                    className="ghost-field ghost-field--detail"
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange('subcategory_id', e.target.value)}
                    value={form.subcategory_id}
                  >
                    <option value="">Sin subcategoria</option>
                    {subcategoryOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="record-detail-item">
                  <span>Proveedor habitual</span>
                  <select
                    className="ghost-field ghost-field--detail"
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange('supplier_id', e.target.value)}
                    value={form.supplier_id}
                  >
                    <option value="">Sin proveedor</option>
                    {catalogs.suppliers.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="record-detail-item">
                  <span>Tracking</span>
                  <select
                    className="ghost-field ghost-field--detail"
                    disabled={!canEdit}
                    onChange={(e) => handleTrackingChange(e.target.value)}
                    value={form.tracking_mode}
                  >
                    {catalogs.tracking_modes.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <div className="record-detail-item">
                  <span>Estado</span>
                  <select
                    className="ghost-field ghost-field--detail"
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange('status', e.target.value)}
                    value={form.status}
                  >
                    {ARTICLE_STATUS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <div className="record-detail-item">
                  <span>Precio referencia</span>
                  <input
                    className="ghost-field ghost-field--detail"
                    disabled={!canEdit}
                    onBlur={(e) => handleBlur({ ...formRef.current, reference_price: e.target.value })}
                    onChange={(e) => setForm((c) => ({ ...c, reference_price: e.target.value }))}
                    placeholder="—"
                    step="0.01"
                    type="number"
                    value={form.reference_price}
                  />
                </div>
                <div className="record-detail-item record-detail-item--full">
                  <span>Observaciones</span>
                  <textarea
                    className="ghost-field ghost-field--detail"
                    disabled={!canEdit}
                    onBlur={(e) => handleBlur({ ...formRef.current, observations: e.target.value })}
                    onChange={(e) => setForm((c) => ({ ...c, observations: e.target.value }))}
                    placeholder="—"
                    rows={2}
                    value={form.observations}
                  />
                </div>
              </div>

              {/* Flags */}
              <div className="record-flags">
                {[
                  {
                    field: 'is_critical',
                    label: 'Critico',
                    onChange: (v) => handleCheckboxChange('is_critical', v),
                  },
                  {
                    field: 'loanable',
                    label: 'Prestable',
                    onChange: (v) => handleCheckboxChange('loanable', v),
                  },
                  {
                    field: 'requires_lot',
                    label: 'Lote',
                    onChange: (v) =>
                      handleCheckboxChange('requires_lot', v, {
                        requires_expiry: v ? form.requires_expiry : false,
                      }),
                  },
                  {
                    field: 'requires_expiry',
                    label: 'Vencimiento',
                    onChange: (v) =>
                      handleCheckboxChange('requires_expiry', v, {
                        requires_lot: v ? true : form.requires_lot,
                      }),
                  },
                  {
                    field: 'requires_serial',
                    label: 'Serie',
                    onChange: (v) => handleCheckboxChange('requires_serial', v),
                  },
                  {
                    field: 'requires_size',
                    label: 'Talle',
                    onChange: (v) => handleCheckboxChange('requires_size', v),
                  },
                  {
                    field: 'requires_quality',
                    label: 'Calidad',
                    onChange: (v) => handleCheckboxChange('requires_quality', v),
                  },
                  {
                    field: 'requires_assignee',
                    label: 'Asignacion',
                    onChange: (v) => handleCheckboxChange('requires_assignee', v),
                  },
                ].map(({ field, label, onChange }) => (
                  <button
                    className={`record-flag-chip ${form[field] ? 'is-active' : ''}`}
                    disabled={!canEdit}
                    key={field}
                    onClick={() => onChange(!form[field])}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ModuleSurface>

        <ModuleTableSection
          actions={
            <button
              className="inline-action"
              onClick={() => setShowBalances((c) => !c)}
              type="button"
            >
              {showBalances ? 'Ocultar' : 'Ver'}
            </button>
          }
          title="Stock por ubicacion"
        >
          {showBalances ? (
            balances.length ? (
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
            )
          ) : (
            <p className="module-empty-copy record-section-summary">
              {balances.length
                ? `${balances.length} ubicacion${balances.length !== 1 ? 'es' : ''} con stock registrado.`
                : 'Sin saldos por ubicacion registrados.'}
            </p>
          )}
        </ModuleTableSection>

        <ModuleTableSection
          actions={
            <button
              className="inline-action"
              onClick={() => setShowMovements((c) => !c)}
              type="button"
            >
              {showMovements ? 'Ocultar' : 'Ver'}
            </button>
          }
          title="Movimientos recientes"
        >
          {showMovements ? (
            movements.length ? (
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
            )
          ) : (
            <p className="module-empty-copy record-section-summary">
              {movements.length
                ? `${movements.length} movimiento${movements.length !== 1 ? 's' : ''} reciente${movements.length !== 1 ? 's' : ''}.`
                : 'Sin movimientos registrados aun.'}
            </p>
          )}
        </ModuleTableSection>

        {trackedUnits.length ? (
          <ModuleTableSection title="Unidades individuales">
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
                      <td>{unit.current_holder_person || unit.current_location || unit.current_sector || '-'}</td>
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
    </div>
  )
}
