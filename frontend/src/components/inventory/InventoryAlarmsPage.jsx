import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createInventoryAlarmRequest,
  saveInventoryFullStockReport,
  saveInventoryMinimumStockDigest,
  saveInventorySafetyAlert,
} from '../../lib/api.js'
import { SearchSelect } from '../SearchSelect.jsx'
import {
  ModuleActionPanel,
  ModuleEmptyState,
  ModulePageHeader,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import { formatDateTime, formatQuantity } from './utils.js'

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Lunes' },
  { value: 1, label: 'Martes' },
  { value: 2, label: 'Miercoles' },
  { value: 3, label: 'Jueves' },
  { value: 4, label: 'Viernes' },
  { value: 5, label: 'Sabado' },
  { value: 6, label: 'Domingo' },
]

function defaultSafetyForm(articleId = '') {
  return {
    article_id: articleId ? String(articleId) : '',
    is_enabled: true,
    recipient_user_ids: [],
    additional_emails: '',
    notes: '',
  }
}

function buildSafetyFormFromRule(rule) {
  return {
    article_id: String(rule.article_id),
    is_enabled: rule.is_enabled,
    recipient_user_ids: rule.recipients.map((recipient) => String(recipient.id)),
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
    recipient_user_ids: config.recipients?.map((recipient) => String(recipient.id)) || [],
    additional_emails: config.additional_emails || '',
    notes: config.notes || '',
  }
}

function safetyAlertMatchesQuery(rule, query) {
  if (!query) {
    return true
  }

  const target = [
    rule.article_name,
    rule.article_code,
    rule.article_type_label,
    rule.status_label,
    rule.notes,
    ...rule.recipients.map((recipient) => recipient.full_name),
    ...(rule.additional_email_list || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return target.includes(query)
}

function manualAlarmMatchesQuery(alarm, query) {
  if (!query) {
    return true
  }

  const target = [
    alarm.title,
    alarm.body,
    alarm.target_user_name,
    alarm.created_by_name,
    alarm.article_name,
    alarm.status_label,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return target.includes(query)
}

function getSafetyAlertTone(rule) {
  if (!rule.is_enabled) {
    return 'out'
  }
  if (rule.status === 'triggered') {
    return 'low'
  }
  return 'ok'
}

function getSafetyAlertLabel(rule) {
  if (!rule.is_enabled) {
    return 'Deshabilitada'
  }
  if (rule.status === 'triggered') {
    return 'Activada'
  }
  return 'Monitoreando'
}

function getAutomationTone(taskState) {
  if (!taskState) {
    return 'out'
  }
  if (taskState.is_stale) {
    return 'out'
  }
  if (taskState.runtime_state === 'running') {
    return 'ok'
  }
  if (taskState.last_run_status === 'error') {
    return 'out'
  }
  if (taskState.last_run_status === 'warning') {
    return 'low'
  }
  return 'ok'
}

function getAutomationLabel(taskState) {
  if (!taskState) {
    return 'Sin estado'
  }
  if (taskState.is_stale) {
    return 'Lease vencido'
  }
  if (taskState.runtime_state === 'running') {
    return 'Activo'
  }
  if (taskState.last_run_status === 'warning') {
    return 'Con aviso'
  }
  if (taskState.last_run_status === 'error') {
    return 'Con error'
  }
  return taskState.last_run_status_label || 'En espera'
}

export function InventoryAlarmsPage() {
  const { inventoryOverview, refreshInventoryModule, searchValue } = useOutletContext()
  const deferredQuery = useDeferredValue(searchValue.trim().toLowerCase())
  const [automaticMode, setAutomaticMode] = useState('individual')
  const [savingSafetyRule, setSavingSafetyRule] = useState(false)
  const [savingPeriodicRule, setSavingPeriodicRule] = useState(false)
  const [savingFullStockReport, setSavingFullStockReport] = useState(false)
  const [sendingManualAlarm, setSendingManualAlarm] = useState(false)
  const [safetyFeedback, setSafetyFeedback] = useState({ error: '', success: '' })
  const [periodicFeedback, setPeriodicFeedback] = useState({ error: '', success: '' })
  const [fullStockFeedback, setFullStockFeedback] = useState({ error: '', success: '' })
  const [manualFeedback, setManualFeedback] = useState({ error: '', success: '' })
  const [safetyForm, setSafetyForm] = useState(defaultSafetyForm())
  const [periodicForm, setPeriodicForm] = useState(defaultPeriodicForm())
  const [fullStockForm, setFullStockForm] = useState(defaultPeriodicForm())
  const [expandedTooltip, setExpandedTooltip] = useState(null)
  const [manualForm, setManualForm] = useState({
    target_user_id: '',
    priority: 'high',
    title: '',
    body: '',
    article_id: '',
  })

  const safetyEligibleArticles = useMemo(
    () =>
      (inventoryOverview?.articles || []).filter((article) => article.minimum_stock !== null),
    [inventoryOverview?.articles],
  )

  const safetyAlerts = useMemo(
    () =>
      (inventoryOverview?.safety_alerts || []).filter((rule) =>
        safetyAlertMatchesQuery(rule, deferredQuery),
      ),
    [deferredQuery, inventoryOverview?.safety_alerts],
  )

  const manualAlarms = useMemo(
    () =>
      (inventoryOverview?.alarms || []).filter((alarm) =>
        manualAlarmMatchesQuery(alarm, deferredQuery),
      ),
    [deferredQuery, inventoryOverview?.alarms],
  )

  const selectedArticle = safetyEligibleArticles.find(
    (article) => String(article.id) === String(safetyForm.article_id),
  )
  const minimumStockDigest = inventoryOverview.minimum_stock_digest || null
  const fullStockReport = inventoryOverview.full_stock_report || null
  const automationStatus = inventoryOverview.automation_status || null

  const selectedRule =
    (inventoryOverview?.safety_alerts || []).find(
      (rule) => String(rule.article_id) === String(safetyForm.article_id),
    ) || null

  useEffect(() => {
    if (!inventoryOverview) {
      return
    }

    if (!safetyEligibleArticles.length) {
      setSafetyForm(defaultSafetyForm())
      return
    }

    setSafetyForm((current) => {
      if (current.article_id) {
        return current
      }
      const firstRule = inventoryOverview.safety_alerts?.[0]
      if (firstRule) {
        return buildSafetyFormFromRule(firstRule)
      }
      return defaultSafetyForm(safetyEligibleArticles[0].id)
    })
  }, [inventoryOverview, inventoryOverview?.safety_alerts, safetyEligibleArticles])

  useEffect(() => {
    setPeriodicForm(defaultPeriodicForm(minimumStockDigest || {}))
  }, [minimumStockDigest])

  useEffect(() => {
    setFullStockForm(defaultPeriodicForm(fullStockReport || {}))
  }, [fullStockReport])

  if (!inventoryOverview) {
    return null
  }

  if (!inventoryOverview.permissions?.can_manage_alarms) {
    return (
      <ModuleEmptyState
        description="Tu perfil no tiene permisos para gestionar alarmas desde inventario."
        title="Acceso restringido"
      />
    )
  }

  function handleSelectSafetyArticle(articleId) {
    const nextRule = (inventoryOverview.safety_alerts || []).find(
      (rule) => String(rule.article_id) === String(articleId),
    )
    setSafetyFeedback({ error: '', success: '' })
    setAutomaticMode('individual')
    setSafetyForm(nextRule ? buildSafetyFormFromRule(nextRule) : defaultSafetyForm(articleId))
  }

  function handleToggleRecipient(userId) {
    setSafetyForm((current) => {
      const nextIds = current.recipient_user_ids.includes(userId)
        ? current.recipient_user_ids.filter((item) => item !== userId)
        : [...current.recipient_user_ids, userId]
      return {
        ...current,
        recipient_user_ids: nextIds,
      }
    })
  }

  function handleTogglePeriodicRecipient(userId) {
    setPeriodicForm((current) => {
      const nextIds = current.recipient_user_ids.includes(userId)
        ? current.recipient_user_ids.filter((item) => item !== userId)
        : [...current.recipient_user_ids, userId]
      return {
        ...current,
        recipient_user_ids: nextIds,
      }
    })
  }

  function handleToggleFullStockRecipient(userId) {
    setFullStockForm((current) => {
      const nextIds = current.recipient_user_ids.includes(userId)
        ? current.recipient_user_ids.filter((item) => item !== userId)
        : [...current.recipient_user_ids, userId]
      return {
        ...current,
        recipient_user_ids: nextIds,
      }
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
      setSafetyFeedback({
        error: '',
        success: response.item.triggered
          ? 'Regla guardada. La alarma quedo activada y se envio el mail.'
          : 'Regla guardada correctamente.',
      })
    } catch (error) {
      setSafetyFeedback({
        error: error.message || 'No se pudo guardar la alarma automatica.',
        success: '',
      })
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
      setPeriodicFeedback({
        error: '',
        success: response.item.save_warning
          ? `Resumen periodico guardado. ${response.item.save_warning}`
          : 'Resumen periodico guardado correctamente.',
      })
    } catch (error) {
      setPeriodicFeedback({
        error: error.message || 'No se pudo guardar el resumen periodico.',
        success: '',
      })
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
      setFullStockFeedback({
        error: '',
        success: response.item.save_warning
          ? `Reporte guardado. ${response.item.save_warning}`
          : 'Reporte guardado correctamente.',
      })
    } catch (error) {
      setFullStockFeedback({
        error: error.message || 'No se pudo guardar el reporte diario.',
        success: '',
      })
    } finally {
      setSavingFullStockReport(false)
    }
  }

  async function handleManualSubmit(event) {
    event.preventDefault()
    setSendingManualAlarm(true)
    setManualFeedback({ error: '', success: '' })

    try {
      await createInventoryAlarmRequest(manualForm)
      await refreshInventoryModule()
      setManualForm({
        target_user_id: '',
        priority: 'high',
        title: '',
        body: '',
        article_id: '',
      })
      setManualFeedback({ error: '', success: 'Alarma interna enviada a la casilla de mensajes.' })
    } catch (error) {
      setManualFeedback({
        error: error.message || 'No se pudo crear la alarma interna.',
        success: '',
      })
    } finally {
      setSendingManualAlarm(false)
    }
  }

  const triggeredCount = (inventoryOverview.safety_alerts || []).filter(
    (rule) => rule.is_enabled && rule.status === 'triggered',
  ).length

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        eyebrow="Inventario / Alarmas"
        title="Alarmas operativas"
      />

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleTableSection
            actions={<span className="module-chip">{triggeredCount} activas</span>}
            title="Stock minimo"
          >
            {safetyAlerts.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Articulo</th>
                      <th>Stock actual</th>
                      <th>Minimo</th>
                      <th>Estado</th>
                      <th>Destinatarios</th>
                      <th>Ultimo mail</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safetyAlerts.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <div className="module-table-item">
                            <strong>{rule.article_name}</strong>
                            <span>
                              {rule.article_code} - {rule.article_type_label}
                            </span>
                          </div>
                        </td>
                        <td>{formatQuantity(rule.current_stock)}</td>
                        <td>{formatQuantity(rule.minimum_stock)}</td>
                        <td>
                          <div className="module-table-item">
                            <span className={`status-pill ${getSafetyAlertTone(rule)}`}>
                              {getSafetyAlertLabel(rule)}
                            </span>
                            <span>
                              {rule.triggered_at
                                ? `Activada ${formatDateTime(rule.triggered_at)}`
                                : 'Sin disparos'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="module-table-item">
                            <strong>
                              {rule.recipients.length + (rule.additional_email_list?.length || 0)}{' '}
                              destinatarios
                            </strong>
                            <span>
                              {[
                                ...rule.recipients.map((recipient) => recipient.full_name),
                                ...(rule.additional_email_list || []),
                              ]
                                .filter(Boolean)
                                .join(', ') || 'Sin destinatarios'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="module-table-item">
                            <strong>{formatDateTime(rule.last_notified_at)}</strong>
                            <span>{rule.last_email_error || 'Sin errores de envio'}</span>
                          </div>
                        </td>
                        <td>
                          <button
                            className="inline-action"
                            onClick={() => handleSelectSafetyArticle(rule.article_id)}
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
                    ? 'Todavia no hay reglas configuradas para los articulos con stock minimo.'
                    : 'Primero define stock minimo en los articulos para poder activar estas alarmas.'
                }
                title="Sin reglas automaticas"
              />
            )}
          </ModuleTableSection>

          <ModuleTableSection
            actions={
              <span className="module-chip">
                {minimumStockDigest?.low_stock_count || 0} articulos hoy
              </span>
            }
            title="Resumen periodico"
          >
            {minimumStockDigest?.id ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Modo</th>
                      <th>Frecuencia</th>
                      <th>Programacion</th>
                      <th>Destinatarios</th>
                      <th>Cobertura actual</th>
                      <th>Estado</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Periodico</td>
                      <td>
                        <div className="module-table-item">
                          <strong>{minimumStockDigest.frequency_label}</strong>
                          <span>
                            {minimumStockDigest.frequency === 'weekly'
                              ? minimumStockDigest.run_weekday_label
                              : 'Todos los dias'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="module-table-item">
                          <strong>{minimumStockDigest.run_at}</strong>
                          <span>
                            Proximo envio {formatDateTime(minimumStockDigest.next_run_at)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="module-table-item">
                          <strong>
                            {minimumStockDigest.recipients.length +
                              (minimumStockDigest.additional_email_list?.length || 0)}{' '}
                            destinatarios
                          </strong>
                          <span>
                            {[
                              ...minimumStockDigest.recipients.map((recipient) => recipient.full_name),
                              ...(minimumStockDigest.additional_email_list || []),
                            ]
                              .filter(Boolean)
                              .join(', ') || 'Sin destinatarios'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="module-table-item">
                          <strong>{minimumStockDigest.low_stock_count} articulos</strong>
                          <span>
                            {(minimumStockDigest.preview_articles || [])
                              .map((article) => article.name)
                              .join(', ') || 'Sin articulos en minimo'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="module-table-item">
                          <strong>{minimumStockDigest.last_delivery_status_label}</strong>
                          <span>
                            {minimumStockDigest.last_email_error ||
                              minimumStockDigest.last_recipient_warning ||
                              `Ultimo envio ${formatDateTime(minimumStockDigest.last_notified_at)}`}
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          className="inline-action"
                          onClick={() => {
                            setAutomaticMode('periodic')
                            setPeriodicFeedback({ error: '', success: '' })
                          }}
                          type="button"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description="Todavia no hay un resumen periodico configurado para los articulos en stock minimo."
                title="Sin resumen periodico"
              />
            )}
          </ModuleTableSection>

          <ModuleTableSection
            actions={<span className="module-chip">{fullStockReport?.article_count || 0} articulos</span>}
            title="Reporte de stock completo"
          >
            {fullStockReport?.id ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Modo</th>
                      <th>Frecuencia</th>
                      <th>Programacion</th>
                      <th>Destinatarios</th>
                      <th>Cobertura actual</th>
                      <th>Estado</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Reporte</td>
                      <td>
                        <div className="module-table-item">
                          <strong>{fullStockReport.frequency_label}</strong>
                          <span>
                            {fullStockReport.frequency === 'weekly'
                              ? fullStockReport.run_weekday_label
                              : 'Todos los dias'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="module-table-item">
                          <strong>{fullStockReport.run_at}</strong>
                          <span>Proximo envio {formatDateTime(fullStockReport.next_run_at)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="module-table-item">
                          <strong>
                            {fullStockReport.recipients.length +
                              (fullStockReport.additional_email_list?.length || 0)}{' '}
                            destinatarios
                          </strong>
                          <span>
                            {[
                              ...fullStockReport.recipients.map((recipient) => recipient.full_name),
                              ...(fullStockReport.additional_email_list || []),
                            ]
                              .filter(Boolean)
                              .join(', ') || 'Sin destinatarios'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="module-table-item">
                          <strong>{fullStockReport.article_count} articulos</strong>
                          <span>
                            {(fullStockReport.preview_articles || [])
                              .map((article) => article.name)
                              .join(', ') || 'Sin articulos'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="module-table-item">
                          <strong>{fullStockReport.last_delivery_status_label}</strong>
                          <span>
                            {fullStockReport.last_email_error ||
                              fullStockReport.last_recipient_warning ||
                              `Ultimo envio ${formatDateTime(fullStockReport.last_notified_at)}`}
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          className="inline-action"
                          onClick={() => setFullStockFeedback({ error: '', success: '' })}
                          type="button"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description="Todavia no hay un reporte de stock completo configurado."
                title="Sin reporte"
              />
            )}
          </ModuleTableSection>

          <ModuleTableSection
            actions={<span className="module-chip">{manualAlarms.length} visibles</span>}
            title="Alarmas internas manuales"
          >
            {manualAlarms.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Titulo</th>
                      <th>Destino</th>
                      <th>Prioridad</th>
                      <th>Articulo</th>
                      <th>Estado</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualAlarms.map((alarm) => (
                      <tr key={alarm.id}>
                        <td>
                          <div className="module-table-item">
                            <strong>{alarm.title}</strong>
                            <span>{alarm.body}</span>
                          </div>
                        </td>
                        <td>{alarm.target_user_name}</td>
                        <td>{alarm.priority_label}</td>
                        <td>{alarm.article_name || '-'}</td>
                        <td>{alarm.status_label}</td>
                        <td>{formatDateTime(alarm.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description="Todavia no hay alarmas internas para el filtro actual."
                title="Sin alarmas internas"
              />
            )}
          </ModuleTableSection>
        </div>

        <aside className="module-side-stack">
          <ModuleActionPanel
            title="Configurar alerta automatica"
          >
            <div className="alarm-mode-tabs">
              <button
                className={`alarm-mode-tab ${automaticMode === 'individual' ? 'is-active' : ''}`}
                onClick={() => setAutomaticMode('individual')}
                type="button"
              >
                <strong>Individual</strong>
                <span>Por articulo</span>
              </button>
              <button
                className={`alarm-mode-tab ${automaticMode === 'periodic' ? 'is-active' : ''}`}
                onClick={() => setAutomaticMode('periodic')}
                type="button"
              >
                <strong>Periodico</strong>
                <span>Resumen general</span>
              </button>
            </div>

            {automaticMode === 'individual' ? (
              <>
                <PanelMessage error={safetyFeedback.error} success={safetyFeedback.success} />
                {safetyEligibleArticles.length ? (
              <form className="ops-form" onSubmit={handleSafetySubmit}>
                <label className="field-span-2">
                  Articulo con stock minimo
                  <SearchSelect
                    options={safetyEligibleArticles.map((article) => ({
                      id: article.id,
                      label: `${article.name} - ${article.internal_code}`,
                    }))}
                    value={safetyForm.article_id}
                    onChange={(id) => handleSelectSafetyArticle(id)}
                    placeholder="Buscar artÃ­culo..."
                  />
                </label>

                {selectedArticle ? (
                  <div className="alarm-rule-context">
                    <div className="alarm-rule-context-head">
                      <span className="module-chip">{selectedArticle.internal_code}</span>
                      <span className={`status-pill ${getSafetyAlertTone(selectedRule || { is_enabled: false })}`}>
                        {selectedRule ? getSafetyAlertLabel(selectedRule) : 'Sin regla'}
                      </span>
                    </div>
                    <p>
                      Stock actual <strong>{formatQuantity(selectedArticle.current_stock)}</strong> -
                      Minimo <strong>{formatQuantity(selectedArticle.minimum_stock)}</strong>
                    </p>
                  </div>
                ) : null}

                <div className="checkbox-row">
                  <label>
                    <input
                      checked={safetyForm.is_enabled}
                      onChange={(event) =>
                        setSafetyForm((current) => ({
                          ...current,
                          is_enabled: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    Alarma habilitada
                  </label>
                </div>

                <div className="alarm-recipient-list">
                  <span className="alarm-recipient-label">Perfiles destinatarios</span>
                  {(inventoryOverview.catalogs?.alarm_recipients || []).length ? (
                    <div className="alarm-recipient-options">
                      {inventoryOverview.catalogs.alarm_recipients.map((recipient) => (
                        <label className="alarm-recipient-option" key={recipient.id}>
                          <input
                            checked={safetyForm.recipient_user_ids.includes(String(recipient.id))}
                            onChange={() => handleToggleRecipient(String(recipient.id))}
                            type="checkbox"
                          />
                          <span>
                            <strong>{recipient.full_name}</strong>
                            <small>{recipient.email || 'Sin email cargado'}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="module-empty-copy">No hay perfiles activos disponibles.</p>
                  )}
                </div>

                <label>
                  Emails adicionales
                  <textarea
                    onChange={(event) =>
                      setSafetyForm((current) => ({
                        ...current,
                        additional_emails: event.target.value,
                      }))
                    }
                    placeholder="uno@empresa.com&#10;dos@empresa.com"
                    rows="4"
                    value={safetyForm.additional_emails}
                  />
                </label>

                <label>
                  Nota para el aviso
                  <textarea
                    onChange={(event) =>
                      setSafetyForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Detalle operativo opcional que se agregara al mail."
                    rows="4"
                    value={safetyForm.notes}
                  />
                </label>

                <button
                  className="primary-button"
                  disabled={savingSafetyRule || !safetyForm.article_id}
                  type="submit"
                >
                  {savingSafetyRule ? 'Guardando...' : 'Guardar regla'}
                </button>
              </form>
            ) : (
              <ModuleEmptyState
                description="Carga stock minimo en algun articulo desde su ficha para poder activar correos automaticos."
                title="Sin articulos elegibles"
              />
                )}
              </>
            ) : (
              <>
                <PanelMessage error={periodicFeedback.error} success={periodicFeedback.success} />
                <form className="ops-form" onSubmit={handlePeriodicSubmit}>
                  <div className="alarm-rule-context">
                    <div className="alarm-rule-context-head">
                      <span className="module-chip">
                        {minimumStockDigest?.low_stock_count || 0} articulos hoy
                      </span>
                      <span className={`status-pill ${periodicForm.is_enabled ? 'ok' : 'out'}`}>
                        {periodicForm.is_enabled ? 'Activa' : 'Deshabilitada'}
                      </span>
                    </div>
                    <p>
                      El resumen incluira todos los articulos que esten en o por debajo del stock
                      minimo al momento del envio.
                    </p>
                    <div className="alarm-digest-meta">
                      <span>
                        Proximo envio <strong>{formatDateTime(minimumStockDigest?.next_run_at)}</strong>
                      </span>
                      <span>
                        Ultimo resultado{' '}
                        <strong>{minimumStockDigest?.last_delivery_status_label || 'Sin ejecuciones'}</strong>
                      </span>
                    </div>
                    {(minimumStockDigest?.preview_articles || []).length ? (
                      <div className="alarm-digest-preview">
                        {(minimumStockDigest.preview_articles || []).map((article) => (
                          <span className="module-chip is-muted" key={article.id}>
                            {article.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="checkbox-row">
                    <label>
                      <input
                        checked={periodicForm.is_enabled}
                        onChange={(event) =>
                          setPeriodicForm((current) => ({
                            ...current,
                            is_enabled: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      Resumen habilitado
                    </label>
                  </div>

                  <div className="alarm-schedule-grid">
                    <label>
                      Frecuencia
                      <select
                        onChange={(event) =>
                          setPeriodicForm((current) => ({
                            ...current,
                            frequency: event.target.value,
                          }))
                        }
                        value={periodicForm.frequency}
                      >
                        <option value="daily">Diario</option>
                        <option value="weekly">Semanal</option>
                      </select>
                    </label>

                    <label>
                      Hora de envio
                      <input
                        onChange={(event) =>
                          setPeriodicForm((current) => ({
                            ...current,
                            run_at: event.target.value,
                          }))
                        }
                        required
                        type="time"
                        value={periodicForm.run_at}
                      />
                    </label>

                    {periodicForm.frequency === 'weekly' ? (
                      <label>
                        Dia de envio
                        <select
                          onChange={(event) =>
                            setPeriodicForm((current) => ({
                              ...current,
                              run_weekday: event.target.value,
                            }))
                          }
                          value={periodicForm.run_weekday}
                        >
                          {WEEKDAY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>

                  <div className="alarm-recipient-list">
                    <span className="alarm-recipient-label">Perfiles destinatarios</span>
                    {(inventoryOverview.catalogs?.alarm_recipients || []).length ? (
                      <div className="alarm-recipient-options">
                        {inventoryOverview.catalogs.alarm_recipients.map((recipient) => (
                          <label className="alarm-recipient-option" key={recipient.id}>
                            <input
                              checked={periodicForm.recipient_user_ids.includes(String(recipient.id))}
                              onChange={() => handleTogglePeriodicRecipient(String(recipient.id))}
                              type="checkbox"
                            />
                            <span>
                              <strong>{recipient.full_name}</strong>
                              <small>{recipient.email || 'Sin email cargado'}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="module-empty-copy">No hay perfiles activos disponibles.</p>
                    )}
                  </div>

                  <label>
                    Emails adicionales
                    <textarea
                      onChange={(event) =>
                        setPeriodicForm((current) => ({
                          ...current,
                          additional_emails: event.target.value,
                        }))
                      }
                      placeholder="uno@empresa.com&#10;dos@empresa.com"
                      rows="4"
                      value={periodicForm.additional_emails}
                    />
                  </label>

                  <label>
                    Nota para el resumen
                    <textarea
                      onChange={(event) =>
                        setPeriodicForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Contexto operativo que quieras agregar al resumen."
                      rows="4"
                      value={periodicForm.notes}
                    />
                  </label>

                  <div className="alarm-automation-status">
                    <strong>Salud de la automatizacion</strong>
                    <div className="alarm-automation-status-list">
                      {[
                        {
                          key: 'scheduler',
                          label: 'Runner',
                          state: automationStatus?.scheduler,
                          description: 'Proceso ejecutor central de la automatizaciÃ³n. Verifica cada 60s si hay tareas pendientes (reconciliaciÃ³n, envÃ­o de digests).'
                        },
                        {
                          key: 'minimum_stock_reconcile',
                          label: 'Reconciliacion',
                          state: automationStatus?.minimum_stock_reconcile,
                          description: 'EvalÃºa todos los artÃ­culos y actualiza su estado de alerta segÃºn el stock actual. Se ejecuta cada 10 minutos.'
                        },
                        {
                          key: 'minimum_stock_digest',
                          label: 'Digest',
                          state: automationStatus?.minimum_stock_digest,
                          description: 'EnvÃ­a resumen periÃ³dico de artÃ­culos en stock mÃ­nimo. Se ejecuta segÃºn la configuraciÃ³n (diario/semanal a la hora especificada).'
                        },
                        {
                          key: 'full_stock_report',
                          label: 'Reporte stock',
                          state: automationStatus?.full_stock_report,
                          description: 'EnvÃ­a el reporte periÃ³dico del stock completo en Excel. Se ejecuta segÃºn la configuraciÃ³n (diario/semanal a la hora especificada).'
                        },
                      ].map((item) => (
                        <div className="alarm-automation-item" key={item.key}>
                          <div className="alarm-automation-item-head">
                            <div className="alarm-automation-item-label-container">
                              <span>{item.label}</span>
                              <button
                                type="button"
                                className="info-button"
                                onClick={() => setExpandedTooltip(expandedTooltip === item.key ? null : item.key)}
                                title="Ver explicaciÃ³n"
                              >
                                ?
                              </button>
                            </div>
                            <span className={`status-pill ${getAutomationTone(item.state)}`}>
                              {getAutomationLabel(item.state)}
                            </span>
                          </div>
                          {expandedTooltip === item.key && (
                            <div className="alarm-automation-tooltip">
                              {item.description}
                            </div>
                          )}
                          <p>
                            Heartbeat {formatDateTime(item.state?.heartbeat_at)} - Ultimo estado{' '}
                            {item.state?.last_run_status_label || 'Sin ejecuciones'}
                          </p>
                          {item.state?.last_error_message ? (
                            <p>{item.state.last_error_message}</p>
                          ) : null}
                          {!item.state?.last_error_message && item.state?.last_warning_message ? (
                            <p>{item.state.last_warning_message}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    className="primary-button"
                    disabled={savingPeriodicRule}
                    type="submit"
                  >
                    {savingPeriodicRule ? 'Guardando...' : 'Guardar resumen periodico'}
                  </button>
                </form>
              </>
            )}
          </ModuleActionPanel>
          <ModuleActionPanel title="Reporte de stock completo">
            <PanelMessage error={fullStockFeedback.error} success={fullStockFeedback.success} />

            <form className="ops-form" onSubmit={handleFullStockReportSubmit}>
              <div className="alarm-rule-context">
                <div className="alarm-rule-context-head">
                  <span className="module-chip">{fullStockReport?.article_count || 0} articulos</span>
                  <span className={`status-pill ${fullStockForm.is_enabled ? 'ok' : 'out'}`}>
                    {fullStockForm.is_enabled ? 'Activo' : 'Deshabilitado'}
                  </span>
                </div>
                <div className="alarm-digest-meta">
                  <span>
                    Proximo envio <strong>{formatDateTime(fullStockReport?.next_run_at)}</strong>
                  </span>
                  <span>
                    Ultimo resultado{' '}
                    <strong>{fullStockReport?.last_delivery_status_label || 'Sin ejecuciones'}</strong>
                  </span>
                </div>
                {(fullStockReport?.preview_articles || []).length ? (
                  <div className="alarm-digest-preview">
                    {(fullStockReport.preview_articles || []).map((article) => (
                      <span className="module-chip is-muted" key={article.id}>
                        {article.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="checkbox-row">
                <label>
                  <input
                    checked={fullStockForm.is_enabled}
                    onChange={(event) =>
                      setFullStockForm((current) => ({
                        ...current,
                        is_enabled: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  Reporte habilitado
                </label>
              </div>

              <div className="alarm-schedule-grid">
                <label>
                  Frecuencia
                  <select
                    onChange={(event) =>
                      setFullStockForm((current) => ({
                        ...current,
                        frequency: event.target.value,
                      }))
                    }
                    value={fullStockForm.frequency}
                  >
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                  </select>
                </label>

                <label>
                  Hora de envio
                  <input
                    onChange={(event) =>
                      setFullStockForm((current) => ({
                        ...current,
                        run_at: event.target.value,
                      }))
                    }
                    required
                    type="time"
                    value={fullStockForm.run_at}
                  />
                </label>

                {fullStockForm.frequency === 'weekly' ? (
                  <label>
                    Dia de envio
                    <select
                      onChange={(event) =>
                        setFullStockForm((current) => ({
                          ...current,
                          run_weekday: event.target.value,
                        }))
                      }
                      value={fullStockForm.run_weekday}
                    >
                      {WEEKDAY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="alarm-recipient-list">
                <span className="alarm-recipient-label">Perfiles destinatarios</span>
                {(inventoryOverview.catalogs?.alarm_recipients || []).length ? (
                  <div className="alarm-recipient-options">
                    {inventoryOverview.catalogs.alarm_recipients.map((recipient) => (
                      <label className="alarm-recipient-option" key={recipient.id}>
                        <input
                          checked={fullStockForm.recipient_user_ids.includes(String(recipient.id))}
                          onChange={() => handleToggleFullStockRecipient(String(recipient.id))}
                          type="checkbox"
                        />
                        <span>
                          <strong>{recipient.full_name}</strong>
                          <small>{recipient.email || 'Sin email cargado'}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="module-empty-copy">No hay perfiles activos disponibles.</p>
                )}
              </div>

              <label>
                Emails adicionales
                <textarea
                  onChange={(event) =>
                    setFullStockForm((current) => ({
                      ...current,
                      additional_emails: event.target.value,
                    }))
                  }
                  placeholder="uno@empresa.com&#10;dos@empresa.com"
                  rows="4"
                  value={fullStockForm.additional_emails}
                />
              </label>

              <label>
                Nota para el reporte
                <textarea
                  onChange={(event) =>
                    setFullStockForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Contexto operativo que quieras agregar al reporte."
                  rows="4"
                  value={fullStockForm.notes}
                />
              </label>

              <button className="primary-button" disabled={savingFullStockReport} type="submit">
                {savingFullStockReport ? 'Guardando...' : 'Guardar reporte'}
              </button>
            </form>
          </ModuleActionPanel>

          <ModuleActionPanel title="Nueva alarma interna">
            <PanelMessage error={manualFeedback.error} success={manualFeedback.success} />

            <form className="ops-form" onSubmit={handleManualSubmit}>
              <label>
                Destinatario
                <select
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      target_user_id: event.target.value,
                    }))
                  }
                  required
                  value={manualForm.target_user_id}
                >
                  <option value="">Seleccionar perfil</option>
                  {(inventoryOverview.catalogs?.users || []).map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.full_name} - {contact.role_label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prioridad
                <select
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                  value={manualForm.priority}
                >
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="critical">Critica</option>
                </select>
              </label>
              <label>
                Articulo
                <select
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      article_id: event.target.value,
                    }))
                  }
                  value={manualForm.article_id}
                >
                  <option value="">Sin articulo asociado</option>
                  {inventoryOverview.articles.map((article) => (
                    <option key={article.id} value={article.id}>
                      {article.name} - {article.internal_code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Titulo
                <input
                  onChange={(event) =>
                    setManualForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                  type="text"
                  value={manualForm.title}
                />
              </label>
              <label>
                Mensaje
                <textarea
                  onChange={(event) =>
                    setManualForm((current) => ({ ...current, body: event.target.value }))
                  }
                  required
                  rows="5"
                  value={manualForm.body}
                />
              </label>
              <button
                className="primary-button"
                disabled={
                  sendingManualAlarm ||
                  !manualForm.target_user_id ||
                  !manualForm.title.trim() ||
                  !manualForm.body.trim()
                }
                type="submit"
              >
                {sendingManualAlarm ? 'Enviando...' : 'Enviar alarma interna'}
              </button>
            </form>
          </ModuleActionPanel>
        </aside>
      </section>
    </div>
  )
}

