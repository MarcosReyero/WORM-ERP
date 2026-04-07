import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createInventoryAlarmRequest,
  saveInventorySafetyAlert,
} from '../../lib/api.js'
import {
  ModuleActionPanel,
  ModuleEmptyState,
  ModulePageHeader,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import { formatDateTime, formatQuantity } from './utils.js'

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

export function InventoryAlarmsPage() {
  const { inventoryOverview, refreshInventoryModule, searchValue } = useOutletContext()
  const deferredQuery = useDeferredValue(searchValue.trim().toLowerCase())
  const [savingSafetyRule, setSavingSafetyRule] = useState(false)
  const [sendingManualAlarm, setSendingManualAlarm] = useState(false)
  const [safetyFeedback, setSafetyFeedback] = useState({ error: '', success: '' })
  const [manualFeedback, setManualFeedback] = useState({ error: '', success: '' })
  const [safetyForm, setSafetyForm] = useState(defaultSafetyForm())
  const [manualForm, setManualForm] = useState({
    target_user_id: '',
    priority: 'high',
    title: '',
    body: '',
    article_id: '',
  })

  const safetyEligibleArticles = useMemo(
    () =>
      (inventoryOverview?.articles || []).filter((article) => article.safety_stock !== null),
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
        description="Configura destinatarios y envia correos automaticos cuando un articulo caiga en stock de seguridad. Tambien puedes seguir disparando alarmas internas manuales."
        eyebrow="Inventario / Alarmas"
        title="Alarmas operativas"
      />

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleTableSection
            actions={<span className="module-chip">{triggeredCount} activas</span>}
            description="Reglas automaticas por articulo. El mail se envia cuando el stock cruza el umbral de seguridad y no se repite hasta que el articulo salga y vuelva a entrar en estado critico."
            title="Stock de seguridad"
          >
            {safetyAlerts.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Articulo</th>
                      <th>Stock actual</th>
                      <th>Seguridad</th>
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
                        <td>{formatQuantity(rule.safety_stock)}</td>
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
                    ? 'Todavia no hay reglas configuradas para los articulos con stock de seguridad.'
                    : 'Primero define stock de seguridad en los articulos para poder activar estas alarmas.'
                }
                title="Sin reglas automaticas"
              />
            )}
          </ModuleTableSection>

          <ModuleTableSection
            actions={<span className="module-chip">{manualAlarms.length} visibles</span>}
            description="Historial de avisos internos enviados a la casilla de mensajes."
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
            description="Selecciona el articulo, define destinatarios y deja activa la regla para que el sistema envie el mail apenas entre en stock de seguridad."
            title="Configurar alarma automatica"
          >
            <PanelMessage error={safetyFeedback.error} success={safetyFeedback.success} />

            {safetyEligibleArticles.length ? (
              <form className="ops-form" onSubmit={handleSafetySubmit}>
                <label>
                  Articulo con stock de seguridad
                  <select
                    onChange={(event) => handleSelectSafetyArticle(event.target.value)}
                    required
                    value={safetyForm.article_id}
                  >
                    <option value="">Seleccionar articulo</option>
                    {safetyEligibleArticles.map((article) => (
                      <option key={article.id} value={article.id}>
                        {article.name} - {article.internal_code}
                      </option>
                    ))}
                  </select>
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
                      Seguridad <strong>{formatQuantity(selectedArticle.safety_stock)}</strong>
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
                description="Carga stock de seguridad en algun articulo desde su ficha para poder activar correos automaticos."
                title="Sin articulos elegibles"
              />
            )}
          </ModuleActionPanel>

          <ModuleActionPanel
            description="Si necesitas avisar algo puntual, puedes seguir enviando una alarma manual a la casilla interna."
            title="Nueva alarma interna"
          >
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
