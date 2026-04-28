import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  fetchTiaMcpLogs,
  saveTiaMcpConfig,
  testTiaMcpConnection,
} from '../../lib/api.js'
import { SearchIcon } from '../Icons.jsx'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleStatsStrip,
  ModuleSurface,
  ModuleTableSection,
  ModuleToolbar,
} from '../modules/ModuleWorkspace.jsx'
import { formatDateTime, healthPillClass, tagMatchesQuery, uniqueCategories } from './utils.js'

function ConnectionPanel({ connection }) {
  if (!connection) {
    return null
  }

  return (
    <ModuleSurface
      className="tia-connection-panel"
      title="Estado general de conexion"
    >
      <div className="tia-connection-grid">
        <div className="tia-connection-state">
          <span className={`status-pill ${healthPillClass(connection.pill)}`}>
            {connection.label}
          </span>
          <strong>{connection.server_name}</strong>
          <p>{connection.enabled ? 'Servidor MCP habilitado' : 'Modo simulado hasta habilitar MCP'}</p>
        </div>
        <dl className="tia-connection-facts">
          <div>
            <dt>PLC</dt>
            <dd>{connection.plc.host}:{connection.plc.tcp_port}</dd>
          </div>
          <div>
            <dt>Rack / Slot</dt>
            <dd>{connection.plc.rack} / {connection.plc.slot}</dd>
          </div>
          <div>
            <dt>Politica</dt>
            <dd>{connection.read_only ? 'Solo lectura' : 'Lectura/escritura'}</dd>
          </div>
          <div>
            <dt>Ultima lectura</dt>
            <dd>{formatDateTime(connection.last_poll_at)}</dd>
          </div>
        </dl>
      </div>
    </ModuleSurface>
  )
}

function BooleanIndicators({ tags }) {
  const boolTags = tags.filter((tag) => tag.type === 'bool')

  return (
    <ModuleSurface
      title="Senales discretas"
    >
      <div className="tia-boolean-grid">
        {boolTags.map((tag) => (
          <article className={`tia-boolean-card is-${tag.health.pill}`} key={tag.name}>
            <span>{tag.label}</span>
            <strong>{tag.formatted_value}</strong>
            <p>{tag.health.label}</p>
          </article>
        ))}
      </div>
    </ModuleSurface>
  )
}

function NumericPanel({ tags }) {
  const numericTags = tags.filter((tag) => tag.type !== 'bool')

  return (
    <ModuleSurface title="Variables numericas">
      <div className="tia-numeric-grid">
        {numericTags.map((tag) => (
          <article className="tia-numeric-card" key={tag.name}>
            <span>{tag.label}</span>
            <strong>{tag.formatted_value}</strong>
            <p>{tag.address} / {tag.type.toUpperCase()}</p>
          </article>
        ))}
      </div>
    </ModuleSurface>
  )
}

function DiagnosticsPanel({ diagnostics }) {
  return (
    <ModuleSurface title="Salud y diagnostico">
      <div className="module-list tia-diagnostics-list">
        {diagnostics.map((item) => (
          <div className="module-list-item" key={`${item.title}-${item.detail}`}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
            <span className={`status-pill ${item.level === 'ok' ? 'ok' : item.level === 'warning' ? 'low' : 'low'}`}>
              {item.level}
            </span>
          </div>
        ))}
      </div>
    </ModuleSurface>
  )
}

function buildConfigForm(connection) {
  return {
    enabled: Boolean(connection?.enabled),
    host: connection?.plc?.host || '127.0.0.1',
    rack: String(connection?.plc?.rack ?? 0),
    slot: String(connection?.plc?.slot ?? 2),
    tcp_port: String(connection?.plc?.tcp_port ?? 102),
    timeout_seconds: String(connection?.timeout_seconds ?? 4),
    command: connection?.command || '"python" server.py',
    server_path: connection?.server_path || '',
    tag_map_path: connection?.tag_map_path || '',
  }
}

function ConnectionConfigPanel({ connection, onRefresh, onLogs }) {
  const [form, setForm] = useState(() => buildConfigForm(connection))
  const [message, setMessage] = useState({ type: '', text: '' })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    setForm(buildConfigForm(connection))
  }, [connection])

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const response = await saveTiaMcpConfig({
        enabled: form.enabled,
        plc: {
          host: form.host,
          rack: Number(form.rack),
          slot: Number(form.slot),
          tcp_port: Number(form.tcp_port),
        },
        timeout_seconds: Number(form.timeout_seconds),
        command: form.command,
        server_path: form.server_path,
        tag_map_path: form.tag_map_path,
      })
      setMessage({ type: 'success', text: 'Configuracion guardada.' })
      if (onLogs) {
        onLogs(response.logs || [])
      }
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'No se pudo guardar la configuracion.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setMessage({ type: '', text: '' })
    try {
      const response = await testTiaMcpConnection()
      const item = response.item
      setMessage({
        type: item.ok ? 'success' : 'error',
        text: item.ok ? 'Conexion MCP correcta.' : 'No se pudo conectar al MCP/PLC.',
      })
      if (onLogs) {
        onLogs(item.logs || [])
      }
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Fallo la prueba de conexion.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <ModuleSurface
      title="Conexion TCP/IP S7-300"
    >
      <form className="tia-mcp-form" onSubmit={handleSave}>
        <label className="tia-mcp-toggle">
          <input
            checked={form.enabled}
            onChange={(event) => updateField('enabled', event.target.checked)}
            type="checkbox"
          />
          <span>Usar MCP real</span>
        </label>

        <label>
          IP del PLC
          <input
            onChange={(event) => updateField('host', event.target.value)}
            placeholder="192.168.0.10"
            value={form.host}
          />
        </label>

        <div className="tia-mcp-inline-fields">
          <label>
            Rack
            <input
              min="0"
              onChange={(event) => updateField('rack', event.target.value)}
              type="number"
              value={form.rack}
            />
          </label>
          <label>
            Slot
            <input
              min="0"
              onChange={(event) => updateField('slot', event.target.value)}
              type="number"
              value={form.slot}
            />
          </label>
          <label>
            Puerto
            <input
              min="1"
              onChange={(event) => updateField('tcp_port', event.target.value)}
              type="number"
              value={form.tcp_port}
            />
          </label>
        </div>

        <label>
          Timeout seg.
          <input
            min="1"
            onChange={(event) => updateField('timeout_seconds', event.target.value)}
            type="number"
            value={form.timeout_seconds}
          />
        </label>

        <label>
          Comando MCP
          <input
            onChange={(event) => updateField('command', event.target.value)}
            value={form.command}
          />
        </label>

        <label>
          Carpeta servidor
          <input
            onChange={(event) => updateField('server_path', event.target.value)}
            value={form.server_path}
          />
        </label>

        <label>
          Tag map
          <input
            onChange={(event) => updateField('tag_map_path', event.target.value)}
            value={form.tag_map_path}
          />
        </label>

        {message.text ? (
          <div className={message.type === 'success' ? 'form-success' : 'form-error'}>
            {message.text}
          </div>
        ) : null}

        <div className="tia-mcp-actions">
          <button className="secondary-button" disabled={saving || testing} type="submit">
            {saving ? 'Guardando' : 'Guardar'}
          </button>
          <button
            className="secondary-button"
            disabled={saving || testing}
            onClick={() => void handleTest()}
            type="button"
          >
            {testing ? 'Probando' : 'Probar conexion'}
          </button>
        </div>
      </form>
    </ModuleSurface>
  )
}

function LogConsole({ logs, onRefresh }) {
  return (
    <ModuleSurface
      title="Consola de logs"
      actions={
        <button className="inline-action" onClick={onRefresh} type="button">
          Recargar
        </button>
      }
    >
      <div className="tia-log-console">
        {logs.length ? (
          logs.map((log, index) => (
            <article className={`tia-log-row is-${log.level}`} key={`${log.timestamp}-${log.event}-${index}`}>
              <time>{formatDateTime(log.timestamp)}</time>
              <strong>{log.event}</strong>
              <p>{log.detail}</p>
              {log.plc?.host ? (
                <span>{log.plc.host}:{log.plc.tcp_port} rack {log.plc.rack} slot {log.plc.slot}</span>
              ) : null}
            </article>
          ))
        ) : (
          <p className="module-empty-copy">Sin eventos registrados todavia.</p>
        )}
      </div>
    </ModuleSurface>
  )
}

export function TiaVariableDashboardPage() {
  const { refreshTiaModule, searchValue, tiaOverview } = useOutletContext()
  const [localQuery, setLocalQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [logs, setLogs] = useState(() => tiaOverview?.logs || [])
  const deferredGlobalQuery = useDeferredValue((searchValue || '').trim().toLowerCase())
  const deferredLocalQuery = useDeferredValue(localQuery.trim().toLowerCase())

  const tags = useMemo(() => tiaOverview?.tags || [], [tiaOverview?.tags])
  const categories = useMemo(() => uniqueCategories(tags), [tags])
  const visibleTags = useMemo(
    () =>
      tags
        .filter((tag) => (category === 'all' ? true : tag.category === category))
        .filter((tag) => tagMatchesQuery(tag, deferredGlobalQuery))
        .filter((tag) => tagMatchesQuery(tag, deferredLocalQuery)),
    [category, deferredGlobalQuery, deferredLocalQuery, tags],
  )

  useEffect(() => {
    setLogs(tiaOverview?.logs || [])
  }, [tiaOverview?.logs])

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      if (refreshTiaModule) {
        await refreshTiaModule()
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  async function refreshLogs() {
    try {
      const response = await fetchTiaMcpLogs()
      setLogs(response.items || [])
    } catch {
      // The overview diagnostics still expose connection issues.
    }
  }

  if (!tiaOverview) {
    return (
      <ModuleEmptyState
        title="TIA no disponible"
        description="No se pudo cargar la base operativa del modulo."
      />
    )
  }

  return (
    <div className="module-page-stack tia-page-stack">
      <ModulePageHeader
        eyebrow="TIA / Centro de Enlace S7-300"
        title="Centro de Enlace S7-300"
        actions={
          <button className="secondary-button" disabled={isRefreshing} onClick={() => void handleRefresh()} type="button">
            {isRefreshing ? 'Actualizando' : 'Actualizar lectura'}
          </button>
        }
      />

      <ModuleStatsStrip stats={tiaOverview.kpis} />

      <section className="module-page-grid module-page-grid--overview">
        <div className="module-main-stack">
          <ConnectionPanel connection={tiaOverview.connection} />
          <BooleanIndicators tags={tags} />
          <NumericPanel tags={tags} />

          <ModuleTableSection
            title="Catalogo de tags"
            toolbar={
              <ModuleToolbar>
                <div className="module-filter-group module-filter-group--stock">
                  <label className="module-search-field">
                    Buscar tag
                    <span className="module-search-input">
                      <SearchIcon />
                      <input
                        onChange={(event) => setLocalQuery(event.target.value)}
                        placeholder="marcha_motor, temperatura, DB1..."
                        type="search"
                        value={localQuery}
                      />
                    </span>
                  </label>
                  <label>
                    Categoria
                    <select value={category} onChange={(event) => setCategory(event.target.value)}>
                      <option value="all">Todas</option>
                      {categories.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="module-toolbar-meta">
                  <span className="module-chip is-muted">{visibleTags.length} visibles</span>
                  <span className="module-chip is-muted">{tiaOverview.connection.source}</span>
                </div>
              </ModuleToolbar>
            }
          >
            <div className="module-table-wrap tia-tag-table-wrap">
              <table className="module-table tia-tag-table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Valor</th>
                    <th>Salud</th>
                    <th>Direccion</th>
                    <th>Tipo</th>
                    <th>Categoria</th>
                    <th>Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTags.length ? (
                    visibleTags.map((tag) => (
                      <tr key={tag.name}>
                        <td>
                          <div className="module-table-item">
                            <strong>{tag.label}</strong>
                            <span>{tag.name}</span>
                          </div>
                        </td>
                        <td className="tia-tag-value">{tag.formatted_value}</td>
                        <td>
                          <span className={`status-pill ${healthPillClass(tag.health.pill)}`}>
                            {tag.health.label}
                          </span>
                        </td>
                        <td>{tag.address}</td>
                        <td>{tag.type.toUpperCase()}</td>
                        <td>{tag.category}</td>
                        <td>{formatDateTime(tag.last_updated_at)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7}>No hay tags para el filtro actual.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ModuleTableSection>
        </div>

        <aside className="module-side-stack">
          <ConnectionConfigPanel
            connection={tiaOverview.connection}
            onLogs={setLogs}
            onRefresh={refreshTiaModule}
          />
          <LogConsole logs={logs} onRefresh={() => void refreshLogs()} />
          <DiagnosticsPanel diagnostics={tiaOverview.diagnostics || []} />
          <ModuleSurface title="Historico">
            <div className="tia-history-placeholder">
              <span />
              <span />
              <span />
              <span />
              <span />
              <p>Sin historico persistido todavia.</p>
            </div>
          </ModuleSurface>
        </aside>
      </section>
    </div>
  )
}
