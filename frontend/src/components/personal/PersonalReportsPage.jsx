import { useEffect, useMemo, useRef, useState } from 'react'
import {
  bulkDeletePersonalDailyReports,
  createPersonalDailyReport,
  deleteAllPersonalDailyReports,
  deletePersonalDailyReport,
  fetchPersonalDailyReports,
  importPersonalDailyReportsFromExcel,
  updatePersonalDailyReport,
} from '../../lib/api.js'
import {
  ModuleActionPanel,
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  ModuleToolbar,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'

const WEEKDAY_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'Lunes', label: 'Lunes' },
  { value: 'Martes', label: 'Martes' },
  { value: 'Miércoles', label: 'Miércoles' },
  { value: 'Jueves', label: 'Jueves' },
  { value: 'Viernes', label: 'Viernes' },
  { value: 'Sábado', label: 'Sábado' },
  { value: 'Domingo', label: 'Domingo' },
]

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getImportDecisionMeta(decision) {
  if (decision === 'created') {
    return { label: 'Creado', tone: 'ok' }
  }

  if (decision === 'updated') {
    return { label: 'Actualizado', tone: 'low' }
  }

  if (decision === 'error') {
    return { label: 'Error', tone: 'out' }
  }

  return { label: 'Listo', tone: 'ok' }
}

function buildEmptyForm() {
  return {
    report_date: '',
    day_label: '',
    activities: '',
  }
}

export function PersonalReportsPage() {
  const fileInputRef = useRef(null)
  const [busyAction, setBusyAction] = useState('')
  const [feedback, setFeedback] = useState({ error: '', success: '' })
  const [importSummary, setImportSummary] = useState(null)
  const [panelMode, setPanelMode] = useState('create')
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [filterDate, setFilterDate] = useState('')
  const [filterWeekday, setFilterWeekday] = useState('all')
  const [form, setForm] = useState(buildEmptyForm())
  const [reportsState, setReportsState] = useState({
    loading: true,
    error: '',
    items: [],
  })

  const visibleReports = useMemo(() => {
    const normalizedWeekday = normalizeText(filterWeekday)

    return (reportsState.items || []).filter((report) => {
      if (filterDate && report.report_date !== filterDate) {
        return false
      }

      if (filterWeekday !== 'all' && normalizeText(report.day_label) !== normalizedWeekday) {
        return false
      }

      return true
    })
  }, [filterDate, filterWeekday, reportsState.items])

  const isAllVisibleSelected =
    visibleReports.length > 0 && visibleReports.every((report) => selectedIds.has(report.id))

  async function reloadReports() {
    setReportsState((current) => ({ ...current, loading: true, error: '' }))

    try {
      const response = await fetchPersonalDailyReports()
      const items = response.items || []
      const validIds = new Set(items.map((item) => item.id))

      setReportsState({
        loading: false,
        error: '',
        items,
      })

      setSelectedIds((current) => {
        const next = new Set()
        for (const id of current) {
          if (validIds.has(id)) {
            next.add(id)
          }
        }
        return next
      })

      setExpandedIds((current) => {
        const next = new Set()
        for (const id of current) {
          if (validIds.has(id)) {
            next.add(id)
          }
        }
        return next
      })

      return items
    } catch (error) {
      setReportsState((current) => ({
        ...current,
        loading: false,
        error: error.message || 'No se pudieron cargar los informes.',
      }))
      return []
    }
  }

  useEffect(() => {
    reloadReports().catch(() => null)
  }, [])

  useEffect(() => {
    if (!filterDate) {
      return
    }

    const match = (reportsState.items || []).find((report) => report.report_date === filterDate)
    if (match) {
      setExpandedIds(new Set([match.id]))
    }
  }, [filterDate, reportsState.items])

  function resetForm() {
    setPanelMode('create')
    setSelectedReportId(null)
    setForm(buildEmptyForm())
  }

  function clearFilters() {
    setFilterDate('')
    setFilterWeekday('all')
  }

  function toggleExpanded(reportId) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(reportId)) {
        next.delete(reportId)
      } else {
        next.add(reportId)
      }
      return next
    })
  }

  function toggleSelected(reportId) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(reportId)) {
        next.delete(reportId)
      } else {
        next.add(reportId)
      }
      return next
    })
  }

  function toggleSelectAllVisible() {
    if (!visibleReports.length) {
      return
    }

    setSelectedIds((current) => {
      const next = new Set(current)
      const shouldSelectAll = !visibleReports.every((report) => next.has(report.id))
      for (const report of visibleReports) {
        if (shouldSelectAll) {
          next.add(report.id)
        } else {
          next.delete(report.id)
        }
      }
      return next
    })
  }

  function handlePickImportFile() {
    setFeedback({ error: '', success: '' })
    fileInputRef.current?.click()
  }

  function handleEditReport(report) {
    setPanelMode('edit')
    setSelectedReportId(report.id)
    setExpandedIds((current) => new Set([...current, report.id]))
    setForm({
      report_date: report.report_date || '',
      day_label: report.day_label || '',
      activities: report.activities || '',
    })
    setFeedback({ error: '', success: '' })
  }

  async function handleDeleteReport(report) {
    const confirmed = window.confirm(`¿Borrar el informe del ${report.report_date}?`)
    if (!confirmed) {
      return
    }

    setBusyAction(`delete-${report.id}`)
    setFeedback({ error: '', success: '' })

    try {
      await deletePersonalDailyReport(report.id)
      if (selectedReportId === report.id) {
        resetForm()
      }
      await reloadReports()
      setFeedback({ error: '', success: 'Informe borrado.' })
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudo borrar el informe.', success: '' })
    } finally {
      setBusyAction('')
    }
  }

  async function handleDeleteSelected() {
    if (!selectedIds.size) {
      return
    }

    const ids = Array.from(selectedIds)
    const confirmed = window.confirm(`¿Borrar ${ids.length} informes seleccionados?`)
    if (!confirmed) {
      return
    }

    setBusyAction('bulk-delete')
    setFeedback({ error: '', success: '' })

    try {
      await bulkDeletePersonalDailyReports(ids)
      setSelectedIds(new Set())
      setExpandedIds(new Set())
      resetForm()
      await reloadReports()
      setFeedback({ error: '', success: 'Informes borrados.' })
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudieron borrar los informes.', success: '' })
    } finally {
      setBusyAction('')
    }
  }

  async function handleDeleteAll() {
    if (!reportsState.items.length) {
      return
    }

    const confirmed = window.confirm('¿Borrar TODOS los informes personales? Esta acción no se puede deshacer.')
    if (!confirmed) {
      return
    }

    setBusyAction('delete-all')
    setFeedback({ error: '', success: '' })

    try {
      await deleteAllPersonalDailyReports()
      setSelectedIds(new Set())
      setExpandedIds(new Set())
      resetForm()
      clearFilters()
      await reloadReports()
      setFeedback({ error: '', success: 'Todos los informes fueron borrados.' })
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudieron borrar los informes.', success: '' })
    } finally {
      setBusyAction('')
    }
  }

  async function handleSubmitReport(event) {
    event.preventDefault()

    setBusyAction('save')
    setFeedback({ error: '', success: '' })

    try {
      if (panelMode === 'edit' && selectedReportId) {
        await updatePersonalDailyReport(selectedReportId, form)
        setFeedback({ error: '', success: 'Informe actualizado.' })
      } else {
        await createPersonalDailyReport(form)
        setFeedback({ error: '', success: 'Informe creado.' })
      }

      await reloadReports()
      resetForm()
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudo guardar el informe.', success: '' })
    } finally {
      setBusyAction('')
    }
  }

  async function handleImportFileSelected(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setBusyAction('import')
    setFeedback({ error: '', success: '' })

    try {
      const response = await importPersonalDailyReportsFromExcel(file)
      const summary = response.item
      setImportSummary(summary)

      setFeedback({
        error: '',
        success: `Importado: ${summary.created_count} nuevos · ${summary.updated_count} actualizados · ${summary.error_count} errores.`,
      })

      await reloadReports()
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudo importar el Excel.', success: '' })
    } finally {
      setBusyAction('')
    }

    event.target.value = ''
  }

  function handleExportExcel() {
    setFeedback({
      error: '',
      success: 'Exportacion a Excel pendiente de integracion con el backend.',
    })
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={
          <>
            <input
              accept=".xlsx,.xls"
              onChange={handleImportFileSelected}
              ref={fileInputRef}
              style={{ display: 'none' }}
              type="file"
            />
            <button
              className="secondary-button"
              disabled={busyAction === 'import'}
              onClick={handlePickImportFile}
              type="button"
            >
              {busyAction === 'import' ? 'Importando...' : 'Importar informe Excel'}
            </button>
            <button className="primary-button" onClick={handleExportExcel} type="button">
              Exportar informe a Excel
            </button>
          </>
        }
        description="Selecciona informes por fecha o dia, desplega cada card y borra en grupo o todos."
        eyebrow="Personal / Informes"
        title="Informes"
      />

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleSurface
            description="Filtra por fecha/dia, desplega para ver actividades. Usa los cuadraditos para borrar en grupo."
            title="Bandeja de informes"
          >
            <ModuleToolbar>
              <div className="module-filter-group">
                <label>
                  Fecha
                  <input
                    onChange={(event) => setFilterDate(event.target.value)}
                    type="date"
                    value={filterDate}
                  />
                </label>
                <label>
                  Dia
                  <select
                    onChange={(event) => setFilterWeekday(event.target.value)}
                    value={filterWeekday}
                  >
                    {WEEKDAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="module-toolbar-meta">
                <span className="module-chip is-muted">{visibleReports.length} visibles</span>
                {selectedIds.size ? (
                  <span className="module-chip is-muted">{selectedIds.size} seleccionados</span>
                ) : null}
                <label className="personal-report-select-all">
                  <input
                    checked={isAllVisibleSelected}
                    disabled={!visibleReports.length}
                    onChange={toggleSelectAllVisible}
                    type="checkbox"
                  />
                  <span>Todos</span>
                </label>
                <button
                  className="inline-action"
                  disabled={!selectedIds.size || busyAction === 'bulk-delete' || busyAction === 'delete-all'}
                  onClick={() => {
                    void handleDeleteSelected()
                  }}
                  type="button"
                >
                  {busyAction === 'bulk-delete' ? 'Borrando...' : 'Borrar seleccionados'}
                </button>
                <button
                  className="inline-action"
                  disabled={!reportsState.items.length || busyAction === 'bulk-delete' || busyAction === 'delete-all'}
                  onClick={() => {
                    void handleDeleteAll()
                  }}
                  type="button"
                >
                  {busyAction === 'delete-all' ? 'Borrando...' : 'Borrar todos'}
                </button>
                {filterDate || filterWeekday !== 'all' ? (
                  <button className="inline-action" onClick={clearFilters} type="button">
                    Limpiar
                  </button>
                ) : null}
              </div>
            </ModuleToolbar>

            <PanelMessage error={feedback.error || reportsState.error} success={feedback.success} />

            {reportsState.loading ? (
              <p className="module-empty-copy">Cargando informes...</p>
            ) : visibleReports.length ? (
              <div className="module-list">
                {visibleReports.map((report) => {
                  const isExpanded = expandedIds.has(report.id)
                  const isDeleting = busyAction === `delete-${report.id}`

                  return (
                    <div
                      className={`module-list-item personal-report-card ${isExpanded ? 'is-open' : ''}`}
                      key={report.id}
                    >
                      <div className="personal-report-summary">
                        <input
                          aria-label={`Seleccionar informe ${report.report_date}`}
                          checked={selectedIds.has(report.id)}
                          disabled={busyAction === 'bulk-delete' || busyAction === 'delete-all'}
                          onChange={() => toggleSelected(report.id)}
                          type="checkbox"
                        />
                        <button
                          aria-expanded={isExpanded}
                          className="personal-report-toggle"
                          onClick={() => toggleExpanded(report.id)}
                          type="button"
                        >
                          <strong>{report.report_date}</strong>
                          <span>{report.day_label || 'Sin dia'}</span>
                        </button>
                        <div className="personal-report-actions">
                          <button
                            className="inline-action"
                            onClick={() => toggleExpanded(report.id)}
                            type="button"
                          >
                            {isExpanded ? 'Ocultar' : 'Ver'}
                          </button>
                          <button
                            className="inline-action"
                            disabled={isDeleting || busyAction === 'save'}
                            onClick={() => handleEditReport(report)}
                            type="button"
                          >
                            Editar
                          </button>
                          <button
                            className="inline-action"
                            disabled={isDeleting || busyAction === 'save'}
                            onClick={() => {
                              void handleDeleteReport(report)
                            }}
                            type="button"
                          >
                            {isDeleting ? 'Borrando...' : 'Borrar'}
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="personal-report-body">
                          <p style={{ whiteSpace: 'pre-line' }}>{report.activities}</p>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <ModuleEmptyState
                description={
                  filterDate || filterWeekday !== 'all'
                    ? 'No hay informes que coincidan con ese filtro.'
                    : 'Todavia no hay informes cargados. Usa Importar o crea uno manualmente.'
                }
                title="Sin informes"
              />
            )}
          </ModuleSurface>

          {importSummary?.items?.length ? (
            <ModuleSurface
              description="Resumen de la ultima importacion realizada."
              title="Ultima importacion"
            >
              <div className="module-list import-preview-list">
                {importSummary.items.slice(0, 8).map((item) => {
                  const meta = getImportDecisionMeta(item.decision)
                  return (
                    <div
                      className="module-list-item import-preview-item"
                      key={`${item.sheet_name}-${item.row}-${item.report_date || item.detail}`}
                    >
                      <div>
                        <strong>
                          {item.report_date ? `${item.report_date} · ${item.day_label}` : `Fila ${item.row}`}
                        </strong>
                        <p style={{ whiteSpace: 'pre-line' }}>
                          {item.decision === 'error' ? item.detail : item.activities}
                        </p>
                      </div>
                      <span className={`status-pill ${meta.tone}`}>{meta.label}</span>
                    </div>
                  )
                })}
              </div>
              {importSummary.items.length > 8 ? (
                <p className="module-empty-copy">Y {importSummary.items.length - 8} filas mas.</p>
              ) : null}
            </ModuleSurface>
          ) : null}
        </div>

        <aside className="module-side-stack">
          <ModuleActionPanel
            description="Agrega un informe nuevo o ajusta lo importado desde Excel."
            title={panelMode === 'edit' ? 'Editar informe' : 'Nuevo informe'}
          >
            <form className="ops-form" onSubmit={handleSubmitReport}>
              <label>
                Fecha
                <input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, report_date: event.target.value }))
                  }
                  required
                  type="date"
                  value={form.report_date}
                />
              </label>
              <label>
                Dia (opcional)
                <input
                  maxLength={16}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, day_label: event.target.value }))
                  }
                  placeholder="Se completa automaticamente"
                  type="text"
                  value={form.day_label}
                />
              </label>
              <label>
                Actividades del dia
                <textarea
                  onChange={(event) =>
                    setForm((current) => ({ ...current, activities: event.target.value }))
                  }
                  placeholder="Una o mas lineas..."
                  required
                  rows={8}
                  value={form.activities}
                />
              </label>

              <div className="profile-form-actions">
                <button className="primary-button" disabled={busyAction === 'save'} type="submit">
                  {busyAction === 'save'
                    ? 'Guardando...'
                    : panelMode === 'edit'
                      ? 'Guardar cambios'
                      : 'Crear informe'}
                </button>
                <button className="secondary-button" onClick={resetForm} type="button">
                  Cancelar
                </button>
              </div>
            </form>
          </ModuleActionPanel>
        </aside>
      </section>
    </div>
  )
}

