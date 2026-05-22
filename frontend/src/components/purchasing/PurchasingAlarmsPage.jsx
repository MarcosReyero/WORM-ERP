import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchPurchasingAlarms, savePurchasingAlarm } from '../../lib/api.js'
import { SearchSelect } from '../SearchSelect.jsx'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import { formatQuantity } from '../inventory/utils.js'

function buildEmptyRuleForm(articleId = '') {
  return {
    scope: 'rule',
    article_id: articleId ? String(articleId) : '',
    is_enabled: true,
    notify_email: true,
    notify_telegram: false,
    recipient_user_ids: [],
    additional_emails: '',
    notes: '',
  }
}

function buildFormFromRule(rule) {
  return {
    scope: 'rule',
    article_id: String(rule.article_id),
    is_enabled: rule.is_enabled,
    notify_email: rule.notify_email ?? true,
    notify_telegram: rule.notify_telegram ?? false,
    recipient_user_ids: rule.recipients.map((r) => String(r.id)),
    additional_emails: rule.additional_emails || '',
    notes: rule.notes || '',
  }
}

function buildEmptyGlobalForm(config = null) {
  return {
    scope: 'global',
    is_enabled: config?.is_enabled ?? true,
    notify_email: config?.notify_email ?? true,
    notify_telegram: config?.notify_telegram ?? false,
    recipient_user_ids: config?.recipients?.map((r) => String(r.id)) || [],
    additional_emails: config?.additional_emails || '',
    notes: config?.notes || '',
  }
}

function ruleMatchesQuery(rule, query) {
  if (!query) return true
  const target = [
    rule.article_name,
    rule.article_code,
    rule.article_type_label,
    rule.status_label,
    rule.notes,
    ...rule.recipients.map((r) => r.full_name),
    ...(rule.additional_email_list || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return target.includes(query)
}

function getRuleTone(rule) {
  if (!rule.is_enabled) return 'out'
  if (rule.status === 'triggered') return 'low'
  return 'ok'
}

function getRuleLabel(rule) {
  if (!rule.is_enabled) return 'Inactiva'
  if (rule.status === 'triggered') return 'Activada'
  return 'Monitoreando'
}

function channelLabel(notifyEmail, notifyTelegram) {
  return (
    [notifyEmail ? 'Email' : null, notifyTelegram ? 'Telegram' : null].filter(Boolean).join(' + ') ||
    'Sin canal'
  )
}

export function PurchasingAlarmsPage() {
  const { searchValue, user } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState(null)
  const [selectedRuleId, setSelectedRuleId] = useState(null)
  const [selectedScope, setSelectedScope] = useState(null) // null = nothing selected
  const [form, setForm] = useState(null)
  const [feedback, setFeedback] = useState({ error: '', success: '' })

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const response = await fetchPurchasingAlarms()
        if (!active) return
        setData(response)
        setLoading(false)
      } catch (error) {
        if (!active) return
        setFeedback({ error: error.message || 'No se pudieron cargar las alarmas.', success: '' })
        setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  const filteredRules = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    return (data?.rules || []).filter((rule) => ruleMatchesQuery(rule, query))
  }, [data?.rules, searchValue])

  const triggeredCount = useMemo(
    () => (data?.rules || []).filter((r) => r.is_enabled && r.status === 'triggered').length,
    [data?.rules],
  )

  const articleOptions = useMemo(
    () => (data?.articles || []).map((a) => ({ id: String(a.id), label: a.label })),
    [data?.articles],
  )

  const recipients = data?.catalogs?.alarm_recipients || []

  function openGlobal() {
    if (selectedScope === 'global') {
      setSelectedScope(null)
      setForm(null)
      return
    }
    setSelectedScope('global')
    setSelectedRuleId(null)
    setForm(buildEmptyGlobalForm(data?.global))
    setFeedback({ error: '', success: '' })
  }

  function openRule(rule) {
    if (selectedScope === 'rule' && rule.id === selectedRuleId) {
      setSelectedScope(null)
      setSelectedRuleId(null)
      setForm(null)
      return
    }
    setSelectedScope('rule')
    setSelectedRuleId(rule.id)
    setForm(buildFormFromRule(rule))
    setFeedback({ error: '', success: '' })
  }

  function openNewRule() {
    setSelectedScope('rule')
    setSelectedRuleId(null)
    setForm(buildEmptyRuleForm())
    setFeedback({ error: '', success: '' })
  }

  function closeForm() {
    setSelectedScope(null)
    setSelectedRuleId(null)
    setForm(null)
    setFeedback({ error: '', success: '' })
  }

  function toggleRecipient(recipientId) {
    setForm((current) => {
      const nextIds = new Set(current.recipient_user_ids)
      if (nextIds.has(recipientId)) nextIds.delete(recipientId)
      else nextIds.add(recipientId)
      return { ...current, recipient_user_ids: Array.from(nextIds) }
    })
  }

  async function reload(selectedId = selectedRuleId, scope = selectedScope) {
    const response = await fetchPurchasingAlarms()
    setData(response)
    if (scope === 'global') {
      setForm(buildEmptyGlobalForm(response.global))
      return
    }
    if (selectedId) {
      const matched = (response.rules || []).find((r) => r.id === selectedId)
      if (matched) setForm(buildFormFromRule(matched))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setFeedback({ error: '', success: '' })
    try {
      const response = await savePurchasingAlarm(form)
      if (form.scope === 'global') {
        await reload(null, 'global')
      } else {
        const ruleId = response.item?.id || selectedRuleId
        setSelectedRuleId(ruleId)
        await reload(ruleId, 'rule')
      }
      setFeedback({ error: '', success: 'Alarma guardada.' })
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudo guardar.', success: '' })
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null
  if (loading) return <ModuleEmptyState title="Preparando alarmas" />
  if (!data) return <ModuleEmptyState title="Sin datos" />

  const formTitle =
    selectedScope === 'global'
      ? 'Regla global — todos los artículos'
      : selectedRuleId
        ? 'Editar alarma individual'
        : 'Nueva alarma individual'

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        eyebrow="Compras / Alarmas"
        title="Alarmas por stock mínimo"
      />

      <PanelMessage error={feedback.error} success={feedback.success} />

      {triggeredCount > 0 && (
        <div className="alarm-alert-banner">
          <span className="alarm-alert-icon">⚠</span>
          <strong>
            {triggeredCount} alarma{triggeredCount !== 1 ? 's' : ''} activada
            {triggeredCount !== 1 ? 's' : ''}
          </strong>
          <span>— artículos por debajo del stock mínimo.</span>
        </div>
      )}

      <div className="module-main-stack">
        <ModuleTableSection
          title="Reglas configuradas"
          actions={
            <div className="module-header-actions">
              <button
                className={`inline-action${selectedScope === 'global' ? ' is-active' : ''}`}
                onClick={openGlobal}
                type="button"
              >
                Regla global
              </button>
              <button className="inline-action" onClick={openNewRule} type="button">
                + Nueva alarma
              </button>
            </div>
          }
        >
          <div className="module-table-wrap">
            <table className="module-table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Stock actual</th>
                  <th>Stock mínimo</th>
                  <th>Estado</th>
                  <th>Canales</th>
                  <th>Destinatarios</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.length ? (
                  filteredRules.map((rule) => {
                    const isSelected = selectedScope === 'rule' && rule.id === selectedRuleId
                    return (
                      <tr
                        key={rule.id}
                        className={isSelected ? 'is-selected' : ''}
                        onClick={() => openRule(rule)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <strong>{rule.article_name}</strong>
                          <div className="muted">{rule.article_code}</div>
                        </td>
                        <td>
                          {rule.current_stock !== null ? (
                            <span className={rule.status === 'triggered' && rule.is_enabled ? 'alarm-stock-triggered' : ''}>
                              {formatQuantity(rule.current_stock)}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {rule.minimum_stock !== null ? (
                            <span className="muted">{formatQuantity(rule.minimum_stock)}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-pill ${getRuleTone(rule)}`}>
                            {getRuleLabel(rule)}
                          </span>
                        </td>
                        <td className="muted">
                          {channelLabel(rule.notify_email, rule.notify_telegram)}
                        </td>
                        <td className="muted">
                          {rule.recipients.length
                            ? rule.recipients.map((r) => r.full_name).join(', ')
                            : '—'}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td className="muted" colSpan={6}>
                      Sin alarmas individuales. Usá el botón "+ Nueva alarma" para agregar una.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ModuleTableSection>

        {/* ── Inline form panel ── */}
        {selectedScope && form && (
          <div className="alarm-form-panel">
            <div className="alarm-form-panel-header">
              <strong className="alarm-form-panel-title">{formTitle}</strong>
              <button className="alarm-form-close" onClick={closeForm} type="button">
                ✕
              </button>
            </div>

            <form className="alarm-form-body" onSubmit={handleSubmit}>
              <div className="alarm-form-section">
                {selectedScope === 'rule' && (
                  <label className="field">
                    <span>Artículo</span>
                    <SearchSelect
                      options={articleOptions}
                      value={form.article_id}
                      onChange={(value) => setForm((c) => ({ ...c, article_id: String(value) }))}
                      placeholder="Buscar artículo con stock mínimo..."
                    />
                  </label>
                )}

                <div className="alarm-form-row">
                  <div className="module-card-section" style={{ flex: '1 1 160px' }}>
                    <div className="module-card-section-title">Estado</div>
                    <label className="checkbox-field">
                      <input checked={Boolean(form.is_enabled)} onChange={(e) => setForm((c) => ({ ...c, is_enabled: e.target.checked }))} type="checkbox" />
                      <span>Regla habilitada</span>
                    </label>
                  </div>
                  <div className="module-card-section" style={{ flex: '1 1 200px' }}>
                    <div className="module-card-section-title">Canales de notificación</div>
                    <label className="checkbox-field">
                      <input checked={Boolean(form.notify_email)} onChange={(e) => setForm((c) => ({ ...c, notify_email: e.target.checked }))} type="checkbox" />
                      <span>Email</span>
                    </label>
                    <label className="checkbox-field">
                      <input checked={Boolean(form.notify_telegram)} onChange={(e) => setForm((c) => ({ ...c, notify_telegram: e.target.checked }))} type="checkbox" />
                      <span>Telegram</span>
                    </label>
                    <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                      El Chat ID de Telegram se configura en Administración → Usuarios.
                    </div>
                  </div>
                </div>

                <div className="module-card-section">
                  <div className="module-card-section-title">Destinatarios</div>
                  {recipients.length ? (
                    <div className="alarm-recipients-grid">
                      {recipients.map((recipient) => (
                        <label className="alarm-recipient-option" key={recipient.id}>
                          <input
                            checked={form.recipient_user_ids.includes(String(recipient.id))}
                            onChange={() => toggleRecipient(String(recipient.id))}
                            type="checkbox"
                          />
                          <span>
                            <strong>{recipient.full_name}</strong>
                            <small>{recipient.email || 'Sin email'}{recipient.telegram_chat_id ? ' · Telegram ✓' : ''}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="muted">No hay perfiles activos.</div>
                  )}
                </div>

                <div className="alarm-form-row">
                  {form.notify_email && (
                    <label className="field">
                      <span>Emails adicionales (opcional)</span>
                      <textarea className="text-area" onChange={(e) => setForm((c) => ({ ...c, additional_emails: e.target.value }))} placeholder="Uno por línea o separados por coma" rows={2} value={form.additional_emails} />
                    </label>
                  )}
                  <label className="field">
                    <span>Notas (opcional)</span>
                    <textarea className="text-area" onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} rows={2} value={form.notes} />
                  </label>
                </div>
              </div>

              <div className="alarm-form-actions">
                <button className="primary-button" disabled={saving || (selectedScope === 'rule' && !form.article_id)} type="submit">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button className="secondary-button" onClick={closeForm} type="button">Cancelar</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
