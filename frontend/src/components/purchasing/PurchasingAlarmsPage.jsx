import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchPurchasingAlarms, savePurchasingAlarm } from '../../lib/api.js'
import { SearchSelect } from '../SearchSelect.jsx'
import {
  ModuleActionPanel,
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
  return [notifyEmail ? 'Email' : null, notifyTelegram ? 'Telegram' : null].filter(Boolean).join(' + ') || 'Sin canal'
}

export function PurchasingAlarmsPage() {
  const { searchValue, user } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState(null)
  const [selectedRuleId, setSelectedRuleId] = useState(null)
  const [selectedScope, setSelectedScope] = useState('global')
  const [form, setForm] = useState(buildEmptyGlobalForm())
  const [feedback, setFeedback] = useState({ error: '', success: '' })

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const response = await fetchPurchasingAlarms()
        if (!active) return
        setData(response)
        setLoading(false)
        if (response?.global) {
          setSelectedScope('global')
          setSelectedRuleId(null)
          setForm(buildEmptyGlobalForm(response.global))
        } else {
          const first = response?.rules?.[0]
          if (first) {
            setSelectedScope('rule')
            setSelectedRuleId(first.id)
            setForm(buildFormFromRule(first))
          } else {
            setSelectedScope('rule')
            setSelectedRuleId(null)
            setForm(buildEmptyRuleForm())
          }
        }
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
    () => (data?.articles || []).map((article) => ({ id: String(article.id), label: article.label })),
    [data?.articles],
  )

  const recipients = data?.catalogs?.alarm_recipients || []

  function selectGlobal() {
    setSelectedScope('global')
    setSelectedRuleId(null)
    setForm(buildEmptyGlobalForm(data?.global))
    setFeedback({ error: '', success: '' })
  }

  function selectRule(rule) {
    setSelectedScope('rule')
    setSelectedRuleId(rule.id)
    setForm(buildFormFromRule(rule))
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
      setSelectedScope('global')
      setSelectedRuleId(null)
      setForm(buildEmptyGlobalForm(response.global))
      return
    }
    if (selectedId) {
      const matched = (response.rules || []).find((r) => r.id === selectedId)
      if (matched) {
        setSelectedScope('rule')
        setSelectedRuleId(matched.id)
        setForm(buildFormFromRule(matched))
      }
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
        await reload(ruleId, 'rule')
      }
      setFeedback({ error: '', success: 'Alarma guardada.' })
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudo guardar la alarma.', success: '' })
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  if (loading) return <ModuleEmptyState title="Preparando alarmas" />
  if (!data) return <ModuleEmptyState title="Sin datos" />

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={
          <div className="module-header-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setSelectedScope('rule')
                setSelectedRuleId(null)
                setForm(buildEmptyRuleForm())
                setFeedback({ error: '', success: '' })
              }}
              type="button"
            >
              + Nueva alarma
            </button>
          </div>
        }
        eyebrow="Compras / Alarmas"
        title="Alarmas por stock mínimo"
      />

      <PanelMessage error={feedback.error} success={feedback.success} />

      {triggeredCount > 0 && (
        <div className="alarm-alert-banner">
          <span className="alarm-alert-icon">⚠</span>
          <strong>{triggeredCount} alarma{triggeredCount !== 1 ? 's' : ''} activada{triggeredCount !== 1 ? 's' : ''}</strong>
          <span>— artículos por debajo del stock mínimo.</span>
        </div>
      )}

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleTableSection title="Reglas configuradas">
            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Stock actual / mínimo</th>
                    <th>Estado</th>
                    <th>Canales</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Global row */}
                  <tr
                    className={`alarm-global-row${selectedScope === 'global' ? ' is-selected' : ''}`}
                    onClick={selectGlobal}
                  >
                    <td>
                      <strong>Todos los artículos</strong>
                      <div className="muted">Regla global</div>
                    </td>
                    <td className="muted">—</td>
                    <td>
                      <span className={`status-pill ${data?.global?.is_enabled ? 'ok' : 'out'}`}>
                        {data?.global?.is_enabled ? 'Habilitada' : 'Deshabilitada'}
                      </span>
                    </td>
                    <td className="muted">
                      {channelLabel(data?.global?.notify_email, data?.global?.notify_telegram)}
                    </td>
                  </tr>

                  {filteredRules.length ? (
                    filteredRules.map((rule) => (
                      <tr
                        key={rule.id}
                        className={selectedScope === 'rule' && rule.id === selectedRuleId ? 'is-selected' : ''}
                        onClick={() => selectRule(rule)}
                      >
                        <td>
                          <strong>{rule.article_name}</strong>
                          <div className="muted">{rule.article_code}</div>
                        </td>
                        <td>
                          {rule.current_stock !== null && rule.minimum_stock !== null ? (
                            <span className={rule.status === 'triggered' ? 'alarm-stock-triggered' : ''}>
                              {formatQuantity(rule.current_stock)}
                              <span className="muted"> / mín {formatQuantity(rule.minimum_stock)}</span>
                            </span>
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
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="muted">
                        Sin alarmas individuales. Usá el botón "Nueva alarma" para agregar una.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ModuleTableSection>
        </div>

        <ModuleActionPanel
          title={
            selectedScope === 'global'
              ? 'Regla global'
              : selectedRuleId
                ? 'Editar alarma'
                : 'Nueva alarma'
          }
          subtitle={
            selectedScope === 'global'
              ? 'Se activa cuando cualquier artículo con stock mínimo configurado cae por debajo del umbral.'
              : 'Alarma individual para un artículo específico.'
          }
        >
          <form className="module-form" onSubmit={handleSubmit}>
            {selectedScope === 'rule' ? (
              <label className="field">
                <span>Artículo</span>
                <SearchSelect
                  options={articleOptions}
                  value={form.article_id}
                  onChange={(value) => setForm((c) => ({ ...c, article_id: String(value) }))}
                  placeholder="Buscar artículo con stock mínimo..."
                />
              </label>
            ) : null}

            <label className="checkbox-field">
              <input
                checked={Boolean(form.is_enabled)}
                onChange={(e) => setForm((c) => ({ ...c, is_enabled: e.target.checked }))}
                type="checkbox"
              />
              <span>Regla habilitada</span>
            </label>

            <div className="module-card-section">
              <div className="module-card-section-title">Canales de notificación</div>
              <label className="checkbox-field">
                <input
                  checked={Boolean(form.notify_email)}
                  onChange={(e) => setForm((c) => ({ ...c, notify_email: e.target.checked }))}
                  type="checkbox"
                />
                <span>Email</span>
              </label>
              <label className="checkbox-field">
                <input
                  checked={Boolean(form.notify_telegram)}
                  onChange={(e) => setForm((c) => ({ ...c, notify_telegram: e.target.checked }))}
                  type="checkbox"
                />
                <span>Telegram</span>
              </label>
              <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                El Chat ID de Telegram se configura en Administración → Usuarios.
              </div>
            </div>

            <div className="module-card-section">
              <div className="module-card-section-title">Destinatarios</div>
              {recipients.length ? (
                <div className="alarm-recipient-options">
                  {recipients.map((recipient) => (
                    <label className="alarm-recipient-option" key={recipient.id}>
                      <input
                        checked={form.recipient_user_ids.includes(String(recipient.id))}
                        onChange={() => toggleRecipient(String(recipient.id))}
                        type="checkbox"
                      />
                      <span>
                        <strong>{recipient.full_name}</strong>
                        <small>
                          {recipient.email || 'Sin email'}
                          {recipient.telegram_chat_id ? ' · Telegram ✓' : ''}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="muted">No hay perfiles activos disponibles.</div>
              )}
            </div>

            {form.notify_email ? (
              <label className="field">
                <span>Emails adicionales (opcional)</span>
                <textarea
                  className="text-area"
                  onChange={(e) => setForm((c) => ({ ...c, additional_emails: e.target.value }))}
                  placeholder="Uno por línea o separados por coma"
                  rows={3}
                  value={form.additional_emails}
                />
              </label>
            ) : null}

            <label className="field">
              <span>Notas (opcional)</span>
              <textarea
                className="text-area"
                onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
                rows={2}
                value={form.notes}
              />
            </label>

            <div className="module-form-actions">
              <button
                className="primary-button"
                disabled={saving || (selectedScope === 'rule' && !form.article_id)}
                type="submit"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </ModuleActionPanel>
      </section>
    </div>
  )
}
