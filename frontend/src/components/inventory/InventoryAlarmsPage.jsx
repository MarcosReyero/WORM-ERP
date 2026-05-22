import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createInventoryAlarmRequest,
  saveInventoryFullStockReport,
  saveInventoryMinimumStockDigest,
  saveInventorySafetyAlert,
  sendInventoryMinimumStockDigestNow,
  sendInventoryFullStockReportNow,
} from '../../lib/api.js'
import { SearchSelect } from '../SearchSelect.jsx'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import { formatDateTime, formatQuantity } from './utils.js'

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Lunes' },
  { value: 1, label: 'Martes' },
  { value: 2, label: 'Miércoles' },
  { value: 3, label: 'Jueves' },
  { value: 4, label: 'Viernes' },
  { value: 5, label: 'Sábado' },
  { value: 6, label: 'Domingo' },
]

function defaultSafetyForm(articleId = '') {
  return { article_id: articleId ? String(articleId) : '', is_enabled: true, recipient_user_ids: [], additional_emails: '', notes: '' }
}

function buildSafetyFormFromRule(rule) {
  return {
    article_id: String(rule.article_id),
    is_enabled: rule.is_enabled,
    recipient_user_ids: rule.recipients.map((r) => String(r.id)),
    additional_emails: rule.additional_emails || '',
    notes: rule.notes || '',
  }
}

function defaultPeriodicForm(config = {}) {
  return {
    is_enabled: config.is_enabled ?? true,
    frequency: config.frequency || 'daily',
    run_at: config.run_at || '08:00',
    run_weekday: String(config.run_weekday ?? 0),
    recipient_user_ids: config.recipients?.map((r) => String(r.id)) || [],
    additional_emails: config.additional_emails || '',
    notes: config.notes || '',
  }
}

function safetyAlertMatchesQuery(rule, query) {
  if (!query) return true
  const target = [
    rule.article_name, rule.article_code, rule.article_type_label, rule.status_label, rule.notes,
    ...rule.recipients.map((r) => r.full_name),
    ...(rule.additional_email_list || []),
  ].filter(Boolean).join(' ').toLowerCase()
  return target.includes(query)
}

function manualAlarmMatchesQuery(alarm, query) {
  if (!query) return true
  const target = [alarm.title, alarm.body, alarm.target_user_name, alarm.created_by_name, alarm.article_name, alarm.status_label]
    .filter(Boolean).join(' ').toLowerCase()
  return target.includes(query)
}

function getSafetyAlertTone(rule) {
  if (!rule.is_enabled) return 'out'
  if (rule.status === 'triggered') return 'low'
  return 'ok'
}

function getSafetyAlertLabel(rule) {
  if (!rule.is_enabled) return 'Inactiva'
  if (rule.status === 'triggered') return 'Activada'
  return 'Monitoreando'
}

function getAutomationTone(taskState) {
  if (!taskState) return 'out'
  if (taskState.is_stale) return 'out'
  if (taskState.runtime_state === 'running') return 'ok'
  if (taskState.last_run_status === 'error') return 'out'
  if (taskState.last_run_status === 'warning') return 'low'
  return 'ok'
}

function getAutomationLabel(taskState) {
  if (!taskState) return 'Sin estado'
  if (taskState.is_stale) return 'Lease vencido'
  if (taskState.runtime_state === 'running') return 'Activo'
  if (taskState.last_run_status === 'warning') return 'Con aviso'
  if (taskState.last_run_status === 'error') return 'Con error'
  return taskState.last_run_status_label || 'En espera'
}

function RecipientList({ recipients, selectedIds, onToggle }) {
  if (!recipients.length) return <p className="module-empty-copy">No hay perfiles activos disponibles.</p>
  return (
    <div className="alarm-recipients-grid">
      {recipients.map((r) => (
        <label className="alarm-recipient-option" key={r.id}>
          <input checked={selectedIds.includes(String(r.id))} onChange={() => onToggle(String(r.id))} type="checkbox" />
          <span>
            <strong>{r.full_name}</strong>
            <small>{r.email || 'Sin email'}{r.telegram_chat_id ? ' · Telegram ✓' : ''}</small>
          </span>
        </label>
      ))}
    </div>
  )
}

function ScheduleFields({ form, setForm }) {
  return (
    <div className="alarm-schedule-grid">
      <label className="field">
        <span>Frecuencia</span>
        <select onChange={(e) => setForm((c) => ({ ...c, frequency: e.target.value }))} value={form.frequency}>
          <option value="daily">Diaria</option>
          <option value="weekly">Semanal</option>
        </select>
      </label>
      <label className="field">
        <span>Hora de envío</span>
        <input onChange={(e) => setForm((c) => ({ ...c, run_at: e.target.value }))} required type="time" value={form.run_at} />
      </label>
      {form.frequency === 'weekly' && (
        <label className="field">
          <span>Día</span>
          <select onChange={(e) => setForm((c) => ({ ...c, run_weekday: e.target.value }))} value={form.run_weekday}>
            {WEEKDAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}

function InlineFormPanel({ title, onClose, children }) {
  return (
    <div className="alarm-form-panel">
      <div className="alarm-form-panel-header">
        <strong className="alarm-form-panel-title">{title}</strong>
        <button className="alarm-form-close" onClick={onClose} type="button">✕</button>
      </div>
      <div className="alarm-form-body">{children}</div>
    </div>
  )
}

export function InventoryAlarmsPage() {
  const { inventoryOverview, refreshInventoryModule, searchValue } = useOutletContext()
  const deferredQuery = useDeferredValue(searchValue.trim().toLowerCase())

  const [activePanel, setActivePanel] = useState(null) // null | 'individual' | 'periodic' | 'fullstock' | 'manual' | 'automation'
  const [savingSafetyRule, setSavingSafetyRule] = useState(false)
  const [savingPeriodicRule, setSavingPeriodicRule] = useState(false)
  const [savingFullStockReport, setSavingFullStockReport] = useState(false)
  const [sendingManualAlarm, setSendingManualAlarm] = useState(false)
  const [sendingDigestNow, setSendingDigestNow] = useState(false)
  const [sendingFullReportNow, setSendingFullReportNow] = useState(false)
  const [digestNowFeedback, setDigestNowFeedback] = useState({ error: '', success: '' })
  const [fullReportNowFeedback, setFullReportNowFeedback] = useState({ error: '', success: '' })
  const [safetyFeedback, setSafetyFeedback] = useState({ error: '', success: '' })
  const [periodicFeedback, setPeriodicFeedback] = useState({ error: '', success: '' })
  const [fullStockFeedback, setFullStockFeedback] = useState({ error: '', success: '' })
  const [manualFeedback, setManualFeedback] = useState({ error: '', success: '' })
  const [safetyForm, setSafetyForm] = useState(defaultSafetyForm())
  const [periodicForm, setPeriodicForm] = useState(defaultPeriodicForm())
  const [fullStockForm, setFullStockForm] = useState(defaultPeriodicForm())
  const [manualForm, setManualForm] = useState({ target_user_id: '', priority: 'high', title: '', body: '', article_id: '' })

  const safetyEligibleArticles = useMemo(
    () => (inventoryOverview?.articles || []).filter((a) => a.minimum_stock !== null),
    [inventoryOverview?.articles],
  )

  const safetyAlerts = useMemo(
    () => (inventoryOverview?.safety_alerts || []).filter((r) => safetyAlertMatchesQuery(r, deferredQuery)),
    [deferredQuery, inventoryOverview?.safety_alerts],
  )

  const manualAlarms = useMemo(
    () => (inventoryOverview?.alarms || []).filter((a) => manualAlarmMatchesQuery(a, deferredQuery)),
    [deferredQuery, inventoryOverview?.alarms],
  )

  const selectedArticle = safetyEligibleArticles.find((a) => String(a.id) === String(safetyForm.article_id))
  const minimumStockDigest = inventoryOverview?.minimum_stock_digest || null
  const fullStockReport = inventoryOverview?.full_stock_report || null
  const automationStatus = inventoryOverview?.automation_status || null
  const recipients = inventoryOverview?.catalogs?.alarm_recipients || []
  const allUsers = inventoryOverview?.catalogs?.users || []

  const selectedRule = (inventoryOverview?.safety_alerts || []).find(
    (r) => String(r.article_id) === String(safetyForm.article_id),
  ) || null

  useEffect(() => {
    if (!inventoryOverview || !safetyEligibleArticles.length) { setSafetyForm(defaultSafetyForm()); return }
    setSafetyForm((current) => {
      if (current.article_id) return current
      const firstRule = inventoryOverview.safety_alerts?.[0]
      if (firstRule) return buildSafetyFormFromRule(firstRule)
      return defaultSafetyForm(safetyEligibleArticles[0].id)
    })
  }, [inventoryOverview, inventoryOverview?.safety_alerts, safetyEligibleArticles])

  useEffect(() => { setPeriodicForm(defaultPeriodicForm(minimumStockDigest || {})) }, [minimumStockDigest])
  useEffect(() => { setFullStockForm(defaultPeriodicForm(fullStockReport || {})) }, [fullStockReport])

  if (!inventoryOverview) return null
  if (!inventoryOverview.permissions?.can_manage_alarms) {
    return <ModuleEmptyState description="Tu perfil no tiene permisos para gestionar alarmas." title="Acceso restringido" />
  }

  function togglePanel(panel) {
    setActivePanel((c) => (c === panel ? null : panel))
  }

  function handleSelectSafetyArticle(articleId) {
    const nextRule = (inventoryOverview.safety_alerts || []).find((r) => String(r.article_id) === String(articleId))
    setSafetyFeedback({ error: '', success: '' })
    setSafetyForm(nextRule ? buildSafetyFormFromRule(nextRule) : defaultSafetyForm(articleId))
  }

  function toggleRecipient(setter) {
    return (userId) => setter((c) => {
      const ids = c.recipient_user_ids.includes(userId)
        ? c.recipient_user_ids.filter((x) => x !== userId)
        : [...c.recipient_user_ids, userId]
      return { ...c, recipient_user_ids: ids }
    })
  }

  async function handleSafetySubmit(event) {
    event.preventDefault()
    setSavingSafetyRule(true)
    setSafetyFeedback({ error: '', success: '' })
    try {
      const response = await saveInventorySafetyAlert(safetyForm)
      await refreshInventoryModule()
      setSafetyForm(buildSafetyFormFromRule(response.item))
      setSafetyFeedback({ error: '', success: 'Regla guardada correctamente.' })
    } catch (error) {
      setSafetyFeedback({ error: error.message || 'No se pudo guardar la alarma.', success: '' })
    } finally {
      setSavingSafetyRule(false)
    }
  }

  async function handlePeriodicSubmit(event) {
    event.preventDefault()
    setSavingPeriodicRule(true)
    setPeriodicFeedback({ error: '', success: '' })
    try {
      const response = await saveInventoryMinimumStockDigest(periodicForm)
      await refreshInventoryModule()
      setPeriodicForm(defaultPeriodicForm(response.item))
      setPeriodicFeedback({ error: '', success: response.item.save_warning ? `Guardado. ${response.item.save_warning}` : 'Resumen periódico guardado.' })
    } catch (error) {
      setPeriodicFeedback({ error: error.message || 'No se pudo guardar.', success: '' })
    } finally {
      setSavingPeriodicRule(false)
    }
  }

  async function handleFullStockReportSubmit(event) {
    event.preventDefault()
    setSavingFullStockReport(true)
    setFullStockFeedback({ error: '', success: '' })
    try {
      const response = await saveInventoryFullStockReport(fullStockForm)
      await refreshInventoryModule()
      setFullStockForm(defaultPeriodicForm(response.item))
      setFullStockFeedback({ error: '', success: response.item.save_warning ? `Guardado. ${response.item.save_warning}` : 'Reporte guardado.' })
    } catch (error) {
      setFullStockFeedback({ error: error.message || 'No se pudo guardar.', success: '' })
    } finally {
      setSavingFullStockReport(false)
    }
  }

  async function handleSendDigestNow() {
    setSendingDigestNow(true)
    setDigestNowFeedback({ error: '', success: '' })
    try {
      await sendInventoryMinimumStockDigestNow()
      await refreshInventoryModule()
      setDigestNowFeedback({ error: '', success: 'Resumen enviado.' })
    } catch (error) {
      setDigestNowFeedback({ error: error.message || 'No se pudo enviar el resumen.', success: '' })
    } finally {
      setSendingDigestNow(false)
    }
  }

  async function handleSendFullReportNow() {
    setSendingFullReportNow(true)
    setFullReportNowFeedback({ error: '', success: '' })
    try {
      await sendInventoryFullStockReportNow()
      await refreshInventoryModule()
      setFullReportNowFeedback({ error: '', success: 'Reporte enviado.' })
    } catch (error) {
      setFullReportNowFeedback({ error: error.message || 'No se pudo enviar el reporte.', success: '' })
    } finally {
      setSendingFullReportNow(false)
    }
  }

  async function handleManualSubmit(event) {
    event.preventDefault()
    setSendingManualAlarm(true)
    setManualFeedback({ error: '', success: '' })
    try {
      await createInventoryAlarmRequest(manualForm)
      await refreshInventoryModule()
      setManualForm({ target_user_id: '', priority: 'high', title: '', body: '', article_id: '' })
      setManualFeedback({ error: '', success: 'Alarma interna enviada.' })
    } catch (error) {
      setManualFeedback({ error: error.message || 'No se pudo crear la alarma.', success: '' })
    } finally {
      setSendingManualAlarm(false)
    }
  }

  const triggeredCount = (inventoryOverview.safety_alerts || []).filter((r) => r.is_enabled && r.status === 'triggered').length

  return (
    <div className="module-page-stack">
      <ModulePageHeader eyebrow="Inventario / Alarmas" title="Alarmas operativas" />

      {triggeredCount > 0 && (
        <div className="alarm-alert-banner">
          <span className="alarm-alert-icon">⚠</span>
          <strong>{triggeredCount} alarma{triggeredCount !== 1 ? 's' : ''} activada{triggeredCount !== 1 ? 's' : ''}</strong>
          <span>— artículos por debajo del stock mínimo.</span>
        </div>
      )}

      <div className="module-main-stack">

        {/* ── Stock mínimo / alertas individuales ── */}
        <ModuleTableSection
          title="Stock mínimo"
          actions={
            <div className="module-header-actions">
              <span className="module-chip">{triggeredCount} activas</span>
              <button
                className={`inline-action${activePanel === 'individual' ? ' is-active' : ''}`}
                onClick={() => { togglePanel('individual'); setSafetyFeedback({ error: '', success: '' }) }}
                type="button"
              >
                Configurar alerta
              </button>
            </div>
          }
        >
          {safetyAlerts.length ? (
            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Stock actual</th>
                    <th>Mínimo</th>
                    <th>Estado</th>
                    <th>Destinatarios</th>
                    <th>Último envío</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {safetyAlerts.map((rule) => (
                    <tr key={rule.id}>
                      <td>
                        <strong>{rule.article_name}</strong>
                        <div className="muted">{rule.article_code}</div>
                      </td>
                      <td>{formatQuantity(rule.current_stock)}</td>
                      <td className="muted">{formatQuantity(rule.minimum_stock)}</td>
                      <td>
                        <span className={`status-pill ${getSafetyAlertTone(rule)}`}>{getSafetyAlertLabel(rule)}</span>
                        {rule.triggered_at && (
                          <div className="muted">{formatDateTime(rule.triggered_at)}</div>
                        )}
                      </td>
                      <td className="muted">
                        {[...rule.recipients.map((r) => r.full_name), ...(rule.additional_email_list || [])].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="muted">
                        {formatDateTime(rule.last_notified_at) || '—'}
                        {rule.last_email_error && <div className="alarm-stock-triggered">{rule.last_email_error}</div>}
                      </td>
                      <td>
                        <button
                          className="inline-action"
                          onClick={() => { handleSelectSafetyArticle(rule.article_id); setActivePanel('individual') }}
                          type="button"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ModuleEmptyState
              description={
                safetyEligibleArticles.length
                  ? 'No hay reglas configuradas. Usá "Configurar alerta" para agregar una.'
                  : 'Primero definí stock mínimo en los artículos desde su ficha.'
              }
              title="Sin alertas individuales"
            />
          )}
        </ModuleTableSection>

        {activePanel === 'individual' && (
          <InlineFormPanel title="Alerta individual por artículo" onClose={() => setActivePanel(null)}>
            <PanelMessage error={safetyFeedback.error} success={safetyFeedback.success} />
            {safetyEligibleArticles.length ? (
              <form onSubmit={handleSafetySubmit}>
                <div className="alarm-form-section">
                  <label className="field">
                    <span>Artículo con stock mínimo</span>
                    <SearchSelect
                      options={safetyEligibleArticles.map((a) => ({ id: a.id, label: `${a.name} — ${a.internal_code}` }))}
                      value={safetyForm.article_id}
                      onChange={handleSelectSafetyArticle}
                      placeholder="Buscar artículo..."
                    />
                  </label>

                  {selectedArticle && (
                    <div className="alarm-rule-context">
                      <div className="alarm-rule-context-head">
                        <span className="module-chip">{selectedArticle.internal_code}</span>
                        <span className={`status-pill ${getSafetyAlertTone(selectedRule || { is_enabled: false })}`}>
                          {selectedRule ? getSafetyAlertLabel(selectedRule) : 'Sin regla'}
                        </span>
                      </div>
                      <p>Stock actual <strong>{formatQuantity(selectedArticle.current_stock)}</strong> · Mínimo <strong>{formatQuantity(selectedArticle.minimum_stock)}</strong></p>
                    </div>
                  )}

                  <label className="checkbox-field">
                    <input checked={safetyForm.is_enabled} onChange={(e) => setSafetyForm((c) => ({ ...c, is_enabled: e.target.checked }))} type="checkbox" />
                    <span>Alarma habilitada</span>
                  </label>

                  <div className="module-card-section">
                    <div className="module-card-section-title">Destinatarios</div>
                    <RecipientList recipients={recipients} selectedIds={safetyForm.recipient_user_ids} onToggle={toggleRecipient(setSafetyForm)} />
                  </div>

                  <div className="alarm-form-row">
                    <label className="field">
                      <span>Emails adicionales (opcional)</span>
                      <textarea className="text-area" onChange={(e) => setSafetyForm((c) => ({ ...c, additional_emails: e.target.value }))} placeholder="uno@empresa.com, dos@empresa.com" rows={2} value={safetyForm.additional_emails} />
                    </label>
                    <label className="field">
                      <span>Nota para el aviso (opcional)</span>
                      <textarea className="text-area" onChange={(e) => setSafetyForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Detalle operativo que se incluirá en el mail." rows={2} value={safetyForm.notes} />
                    </label>
                  </div>
                </div>

                <div className="alarm-form-actions">
                  <button className="primary-button" disabled={savingSafetyRule || !safetyForm.article_id} type="submit">
                    {savingSafetyRule ? 'Guardando...' : 'Guardar regla'}
                  </button>
                  <button className="secondary-button" onClick={() => setActivePanel(null)} type="button">Cancelar</button>
                </div>
              </form>
            ) : (
              <ModuleEmptyState description="Definí stock mínimo en artículos para poder crear alertas." title="Sin artículos elegibles" />
            )}
          </InlineFormPanel>
        )}

        {/* ── Resumen periódico ── */}
        <ModuleTableSection
          title="Resumen periódico"
          actions={
            <div className="module-header-actions">
              <span className="module-chip">{minimumStockDigest?.low_stock_count || 0} artículos hoy</span>
              {digestNowFeedback.success && <span className="inline-feedback-ok">{digestNowFeedback.success}</span>}
              {digestNowFeedback.error && <span className="inline-feedback-err">{digestNowFeedback.error}</span>}
              {minimumStockDigest?.id && (
                <button
                  className="inline-action"
                  disabled={sendingDigestNow}
                  onClick={handleSendDigestNow}
                  type="button"
                >
                  {sendingDigestNow ? 'Enviando...' : 'Enviar ahora'}
                </button>
              )}
              <button
                className={`inline-action${activePanel === 'periodic' ? ' is-active' : ''}`}
                onClick={() => { togglePanel('periodic'); setPeriodicFeedback({ error: '', success: '' }) }}
                type="button"
              >
                Configurar resumen
              </button>
            </div>
          }
        >
          {minimumStockDigest?.id ? (
            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr><th>Estado</th><th>Frecuencia</th><th>Programación</th><th>Próximo envío</th><th>Artículos hoy</th><th>Último envío</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className={`status-pill ${minimumStockDigest.is_enabled ? 'ok' : 'out'}`}>{minimumStockDigest.is_enabled ? 'Activo' : 'Deshabilitado'}</span></td>
                    <td>
                      <strong>{minimumStockDigest.frequency_label}</strong>
                      {minimumStockDigest.frequency === 'weekly' && <div className="muted">{minimumStockDigest.run_weekday_label}</div>}
                    </td>
                    <td>{minimumStockDigest.run_at}hs</td>
                    <td className="muted">{formatDateTime(minimumStockDigest.next_run_at)}</td>
                    <td>
                      <strong>{minimumStockDigest.low_stock_count}</strong>
                      {(minimumStockDigest.preview_articles || []).length > 0 && (
                        <div className="muted">{minimumStockDigest.preview_articles.map((a) => a.name).join(', ')}</div>
                      )}
                    </td>
                    <td className="muted">
                      {minimumStockDigest.last_delivery_status_label}
                      <div>{minimumStockDigest.last_email_error || formatDateTime(minimumStockDigest.last_notified_at)}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <ModuleEmptyState description="No hay resumen periódico configurado aún." title="Sin resumen periódico" />
          )}
        </ModuleTableSection>

        {activePanel === 'periodic' && (
          <InlineFormPanel title="Configurar resumen periódico de stock mínimo" onClose={() => setActivePanel(null)}>
            <PanelMessage error={periodicFeedback.error} success={periodicFeedback.success} />
            <form onSubmit={handlePeriodicSubmit}>
              <div className="alarm-form-section">
                <label className="checkbox-field">
                  <input checked={periodicForm.is_enabled} onChange={(e) => setPeriodicForm((c) => ({ ...c, is_enabled: e.target.checked }))} type="checkbox" />
                  <span>Resumen habilitado</span>
                </label>
                <ScheduleFields form={periodicForm} setForm={setPeriodicForm} />
                <div className="module-card-section">
                  <div className="module-card-section-title">Destinatarios</div>
                  <RecipientList recipients={recipients} selectedIds={periodicForm.recipient_user_ids} onToggle={toggleRecipient(setPeriodicForm)} />
                </div>
                <div className="alarm-form-row">
                  <label className="field">
                    <span>Emails adicionales (opcional)</span>
                    <textarea className="text-area" onChange={(e) => setPeriodicForm((c) => ({ ...c, additional_emails: e.target.value }))} placeholder="uno@empresa.com, dos@empresa.com" rows={2} value={periodicForm.additional_emails} />
                  </label>
                  <label className="field">
                    <span>Nota para el resumen (opcional)</span>
                    <textarea className="text-area" onChange={(e) => setPeriodicForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Contexto operativo que se incluirá en el mail." rows={2} value={periodicForm.notes} />
                  </label>
                </div>
              </div>
              <div className="alarm-form-actions">
                <button className="primary-button" disabled={savingPeriodicRule} type="submit">{savingPeriodicRule ? 'Guardando...' : 'Guardar resumen'}</button>
                <button className="secondary-button" onClick={() => setActivePanel(null)} type="button">Cancelar</button>
              </div>
            </form>
          </InlineFormPanel>
        )}

        {/* ── Reporte de stock completo ── */}
        <ModuleTableSection
          title="Reporte de stock completo"
          actions={
            <div className="module-header-actions">
              <span className="module-chip">{fullStockReport?.article_count || 0} artículos</span>
              {fullReportNowFeedback.success && <span className="inline-feedback-ok">{fullReportNowFeedback.success}</span>}
              {fullReportNowFeedback.error && <span className="inline-feedback-err">{fullReportNowFeedback.error}</span>}
              {fullStockReport?.id && (
                <button
                  className="inline-action"
                  disabled={sendingFullReportNow}
                  onClick={handleSendFullReportNow}
                  type="button"
                >
                  {sendingFullReportNow ? 'Enviando...' : 'Enviar ahora'}
                </button>
              )}
              <button
                className={`inline-action${activePanel === 'fullstock' ? ' is-active' : ''}`}
                onClick={() => { togglePanel('fullstock'); setFullStockFeedback({ error: '', success: '' }) }}
                type="button"
              >
                Configurar reporte
              </button>
            </div>
          }
        >
          {fullStockReport?.id ? (
            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr><th>Estado</th><th>Frecuencia</th><th>Programación</th><th>Próximo envío</th><th>Artículos</th><th>Último envío</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className={`status-pill ${fullStockReport.is_enabled ? 'ok' : 'out'}`}>{fullStockReport.is_enabled ? 'Activo' : 'Deshabilitado'}</span></td>
                    <td>
                      <strong>{fullStockReport.frequency_label}</strong>
                      {fullStockReport.frequency === 'weekly' && <div className="muted">{fullStockReport.run_weekday_label}</div>}
                    </td>
                    <td>{fullStockReport.run_at}hs</td>
                    <td className="muted">{formatDateTime(fullStockReport.next_run_at)}</td>
                    <td><strong>{fullStockReport.article_count}</strong></td>
                    <td className="muted">
                      {fullStockReport.last_delivery_status_label}
                      <div>{fullStockReport.last_email_error || formatDateTime(fullStockReport.last_notified_at)}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <ModuleEmptyState description="No hay reporte de stock completo configurado aún." title="Sin reporte" />
          )}
        </ModuleTableSection>

        {activePanel === 'fullstock' && (
          <InlineFormPanel title="Configurar reporte periódico de stock completo" onClose={() => setActivePanel(null)}>
            <PanelMessage error={fullStockFeedback.error} success={fullStockFeedback.success} />
            <form onSubmit={handleFullStockReportSubmit}>
              <div className="alarm-form-section">
                <label className="checkbox-field">
                  <input checked={fullStockForm.is_enabled} onChange={(e) => setFullStockForm((c) => ({ ...c, is_enabled: e.target.checked }))} type="checkbox" />
                  <span>Reporte habilitado</span>
                </label>
                <ScheduleFields form={fullStockForm} setForm={setFullStockForm} />
                <div className="module-card-section">
                  <div className="module-card-section-title">Destinatarios</div>
                  <RecipientList recipients={recipients} selectedIds={fullStockForm.recipient_user_ids} onToggle={toggleRecipient(setFullStockForm)} />
                </div>
                <div className="alarm-form-row">
                  <label className="field">
                    <span>Emails adicionales (opcional)</span>
                    <textarea className="text-area" onChange={(e) => setFullStockForm((c) => ({ ...c, additional_emails: e.target.value }))} placeholder="uno@empresa.com, dos@empresa.com" rows={2} value={fullStockForm.additional_emails} />
                  </label>
                  <label className="field">
                    <span>Nota para el reporte (opcional)</span>
                    <textarea className="text-area" onChange={(e) => setFullStockForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Contexto operativo que se incluirá en el reporte." rows={2} value={fullStockForm.notes} />
                  </label>
                </div>
              </div>
              <div className="alarm-form-actions">
                <button className="primary-button" disabled={savingFullStockReport} type="submit">{savingFullStockReport ? 'Guardando...' : 'Guardar reporte'}</button>
                <button className="secondary-button" onClick={() => setActivePanel(null)} type="button">Cancelar</button>
              </div>
            </form>
          </InlineFormPanel>
        )}

        {/* ── Alarmas internas manuales ── */}
        <ModuleTableSection
          title="Alarmas internas manuales"
          actions={
            <div className="module-header-actions">
              <span className="module-chip">{manualAlarms.length} visibles</span>
              <button
                className={`inline-action${activePanel === 'manual' ? ' is-active' : ''}`}
                onClick={() => { togglePanel('manual'); setManualFeedback({ error: '', success: '' }) }}
                type="button"
              >
                + Nueva alarma
              </button>
            </div>
          }
        >
          {manualAlarms.length ? (
            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr><th>Título</th><th>Destino</th><th>Prioridad</th><th>Artículo</th><th>Estado</th><th>Fecha</th></tr>
                </thead>
                <tbody>
                  {manualAlarms.map((alarm) => (
                    <tr key={alarm.id}>
                      <td>
                        <strong>{alarm.title}</strong>
                        <div className="muted">{alarm.body}</div>
                      </td>
                      <td>{alarm.target_user_name}</td>
                      <td>{alarm.priority_label}</td>
                      <td className="muted">{alarm.article_name || '—'}</td>
                      <td>{alarm.status_label}</td>
                      <td className="muted">{formatDateTime(alarm.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ModuleEmptyState description="No hay alarmas internas para el filtro actual." title="Sin alarmas internas" />
          )}
        </ModuleTableSection>

        {activePanel === 'manual' && (
          <InlineFormPanel title="Nueva alarma interna" onClose={() => setActivePanel(null)}>
            <PanelMessage error={manualFeedback.error} success={manualFeedback.success} />
            <form onSubmit={handleManualSubmit}>
              <div className="alarm-form-section">
                <div className="alarm-form-row">
                  <label className="field">
                    <span>Destinatario</span>
                    <select onChange={(e) => setManualForm((c) => ({ ...c, target_user_id: e.target.value }))} required value={manualForm.target_user_id}>
                      <option value="">Seleccionar perfil</option>
                      {allUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name} — {u.role_label}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Prioridad</span>
                    <select onChange={(e) => setManualForm((c) => ({ ...c, priority: e.target.value }))} value={manualForm.priority}>
                      <option value="normal">Normal</option>
                      <option value="high">Alta</option>
                      <option value="critical">Crítica</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Artículo (opcional)</span>
                    <select onChange={(e) => setManualForm((c) => ({ ...c, article_id: e.target.value }))} value={manualForm.article_id}>
                      <option value="">Sin artículo asociado</option>
                      {inventoryOverview.articles.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.internal_code}</option>)}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Título</span>
                  <input onChange={(e) => setManualForm((c) => ({ ...c, title: e.target.value }))} required type="text" value={manualForm.title} />
                </label>
                <label className="field">
                  <span>Mensaje</span>
                  <textarea className="text-area" onChange={(e) => setManualForm((c) => ({ ...c, body: e.target.value }))} required rows={4} value={manualForm.body} />
                </label>
              </div>
              <div className="alarm-form-actions">
                <button className="primary-button" disabled={sendingManualAlarm || !manualForm.target_user_id || !manualForm.title.trim() || !manualForm.body.trim()} type="submit">
                  {sendingManualAlarm ? 'Enviando...' : 'Enviar alarma interna'}
                </button>
                <button className="secondary-button" onClick={() => setActivePanel(null)} type="button">Cancelar</button>
              </div>
            </form>
          </InlineFormPanel>
        )}

        {/* ── Estado de la automatización ── */}
        <ModuleTableSection
          title="Estado de la automatización"
          actions={
            <button
              className={`inline-action${activePanel === 'automation' ? ' is-active' : ''}`}
              onClick={() => togglePanel('automation')}
              type="button"
            >
              {activePanel === 'automation' ? 'Ocultar' : 'Ver detalle'}
            </button>
          }
        >
          <div className="alarm-automation-summary">
            {[
              { key: 'scheduler', label: 'Runner', desc: 'Proceso central. Verifica cada 60s si hay tareas pendientes.' },
              { key: 'minimum_stock_reconcile', label: 'Reconciliación', desc: 'Evalúa artículos y actualiza alertas. Corre cada 10 min.' },
              { key: 'minimum_stock_digest', label: 'Resumen mínimo', desc: 'Envía resumen periódico de artículos en stock mínimo.' },
              { key: 'full_stock_report', label: 'Reporte completo', desc: 'Envía reporte de stock completo en Excel.' },
            ].map((item) => {
              const state = automationStatus?.[item.key]
              return (
                <div className="alarm-automation-card" key={item.key}>
                  <div className="alarm-automation-card-head">
                    <span className="alarm-automation-card-label">{item.label}</span>
                    <span className={`status-pill ${getAutomationTone(state)}`}>{getAutomationLabel(state)}</span>
                  </div>
                  {activePanel === 'automation' && (
                    <div className="alarm-automation-card-detail">
                      <p className="muted">{item.desc}</p>
                      <p className="muted">Heartbeat: {formatDateTime(state?.heartbeat_at) || '—'}</p>
                      {state?.last_error_message && <p className="alarm-stock-triggered">{state.last_error_message}</p>}
                      {!state?.last_error_message && state?.last_warning_message && <p className="muted">{state.last_warning_message}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ModuleTableSection>

      </div>
    </div>
  )
}
