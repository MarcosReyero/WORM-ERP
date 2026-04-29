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
    recipient_user_ids: rule.recipients.map((recipient) => String(recipient.id)),
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
    recipient_user_ids: config?.recipients?.map((recipient) => String(recipient.id)) || [],
    additional_emails: config?.additional_emails || '',
    notes: config?.notes || '',
  }
}

function ruleMatchesQuery(rule, query) {
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
        setFeedback({
          error: error.message || 'No se pudieron cargar las alarmas de Compras.',
          success: '',
        })
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  const filteredRules = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    return (data?.rules || []).filter((rule) => ruleMatchesQuery(rule, query))
  }, [data?.rules, searchValue])

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
      if (nextIds.has(recipientId)) {
        nextIds.delete(recipientId)
      } else {
        nextIds.add(recipientId)
      }
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
      const matched = (response.rules || []).find((rule) => rule.id === selectedId)
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
      setFeedback({
        error: error.message || 'No se pudo guardar la alarma.',
        success: '',
      })
    } finally {
      setSaving(false)
    }
  }

  if (!user) {
    return null
  }

  if (loading) {
    return <ModuleEmptyState title="Preparando alarmas" />
  }

  if (!data) {
    return <ModuleEmptyState title="Sin datos" />
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={
          <div className="module-header-actions">
            <button
              className="secondary-button"
              onClick={() => {
                selectGlobal()
              }}
              type="button"
            >
              Todos los articulos
            </button>
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
              Nueva alarma
            </button>
          </div>
        }
        eyebrow="Compras / Alarmas"
        title="Alarmas por stock minimo"
      />

      <PanelMessage error={feedback.error} success={feedback.success} />

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleTableSection title="Reglas">
            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr>
                    <th>Articulo</th>
                    <th>Estado</th>
                    <th>Canales</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    className={selectedScope === 'global' ? 'is-selected' : ''}
                    onClick={() => {
                      selectGlobal()
                    }}
                  >
                    <td>
                      <strong>Todos los articulos</strong>
                      <div className="muted">Regla global</div>
                    </td>
                    <td>{data?.global?.is_enabled ? 'Habilitada' : 'Deshabilitada'}</td>
                    <td>
                      <span className="muted">
                        {[
                          data?.global?.notify_email ? 'Email' : null,
                          data?.global?.notify_telegram ? 'Telegram' : null,
                        ]
                          .filter(Boolean)
                          .join(' / ') || 'Sin canal'}
                      </span>
                    </td>
                  </tr>
                  {filteredRules.length ? (
                    filteredRules.map((rule) => (
                      <tr
                        key={rule.id}
                        className={
                          selectedScope === 'rule' && rule.id === selectedRuleId ? 'is-selected' : ''
                        }
                        onClick={() => {
                          selectRule(rule)
                        }}
                      >
                        <td>
                          <strong>{rule.article_name}</strong>
                          <div className="muted">{rule.article_code}</div>
                        </td>
                        <td>{rule.status_label}</td>
                        <td>
                          <span className="muted">
                            {[
                              rule.notify_email ? 'Email' : null,
                              rule.notify_telegram ? 'Telegram' : null,
                            ]
                              .filter(Boolean)
                              .join(' / ') || 'Sin canal'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="muted">
                        Sin reglas individuales.
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
              ? 'Alarma global (todos los articulos)'
              : selectedRuleId
                ? 'Editar alarma'
                : 'Nueva alarma'
          }
          subtitle="Define destinatarios y canales (email/Telegram)."
        >
          <form className="module-form" onSubmit={handleSubmit}>
            {selectedScope === 'rule' ? (
              <label className="field">
                <span>Articulo</span>
                <SearchSelect
                  options={articleOptions}
                  value={form.article_id}
                  onChange={(value) => {
                    setForm((current) => ({ ...current, article_id: String(value) }))
                  }}
                  placeholder="Buscar articulo..."
                />
              </label>
            ) : null}

            <label className="checkbox-field">
              <input
                checked={Boolean(form.is_enabled)}
                onChange={(event) => {
                  setForm((current) => ({ ...current, is_enabled: event.target.checked }))
                }}
                type="checkbox"
              />
              <span>Regla habilitada</span>
            </label>

            <div className="module-card-section">
              <div className="module-card-section-title">Canales</div>
              <label className="checkbox-field">
                <input
                  checked={Boolean(form.notify_email)}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, notify_email: event.target.checked }))
                  }}
                  type="checkbox"
                />
                <span>Email</span>
              </label>
              <label className="checkbox-field">
                <input
                  checked={Boolean(form.notify_telegram)}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, notify_telegram: event.target.checked }))
                  }}
                  type="checkbox"
                />
                <span>Telegram</span>
              </label>
              <div className="muted">
                Telegram usa el Chat ID configurado en cada usuario (Administracion &gt; Usuarios).
              </div>
            </div>

            <div className="module-card-section">
              <div className="module-card-section-title">Destinatarios</div>
              <div className="alarm-recipient-list">
                <span className="alarm-recipient-label">Perfiles destinatarios</span>
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
                            {recipient.telegram_chat_id ? ' / Telegram OK' : ''}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="muted">No hay perfiles activos disponibles.</div>
                )}
              </div>
            </div>

            {form.notify_email ? (
              <label className="field">
                <span>Emails adicionales (opcional)</span>
                <textarea
                  className="text-area"
                  onChange={(event) => {
                    setForm((current) => ({ ...current, additional_emails: event.target.value }))
                  }}
                  placeholder="Separados por coma, punto y coma o salto de linea"
                  rows={3}
                  value={form.additional_emails}
                />
              </label>
            ) : null}

            <label className="field">
              <span>Notas (opcional)</span>
              <textarea
                className="text-area"
                onChange={(event) => {
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }}
                rows={3}
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
