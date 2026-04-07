import { useDeferredValue, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { addCountLine, createCountSession } from '../../lib/api.js'
import {
  ModuleActionPanel,
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import { countMatchesQuery, formatDateTime, getCountTone } from './utils.js'

export function InventoryCountsPage() {
  const { inventoryOverview, refreshInventoryModule, searchValue } = useOutletContext()
  const deferredQuery = useDeferredValue(searchValue.trim().toLowerCase())
  const [showCountForm, setShowCountForm] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [countFeedback, setCountFeedback] = useState({ error: '', success: '' })
  const [countForm, setCountForm] = useState({
    count_type: 'partial',
    scope: '',
    article_id: '',
    location_id: '',
    counter_person_id: '',
    counted_qty: '',
    notes: '',
  })

  if (!inventoryOverview) {
    return null
  }

  const { articles, catalogs, count_sessions: countSessions, permissions } = inventoryOverview
  const visibleSessions = countSessions.filter((session) => countMatchesQuery(session, deferredQuery))
  const reviewSessions = countSessions.filter((session) => session.status === 'review').length

  async function handleCountSubmit(event) {
    event.preventDefault()
    setBusyAction('count')
    setCountFeedback({ error: '', success: '' })

    try {
      const session = await createCountSession({
        count_type: countForm.count_type,
        scope: countForm.scope || 'Conteo rapido',
        notes: countForm.notes,
      })

      await addCountLine(session.item.id, {
        article_id: countForm.article_id,
        location_id: countForm.location_id,
        counter_person_id: countForm.counter_person_id,
        counted_qty: countForm.counted_qty,
        notes: countForm.notes,
      })

      await refreshInventoryModule()
      setCountForm({
        count_type: 'partial',
        scope: '',
        article_id: '',
        location_id: '',
        counter_person_id: '',
        counted_qty: '',
        notes: '',
      })
      setCountFeedback({ error: '', success: 'Conteo registrado.' })
    } catch (error) {
      setCountFeedback({ error: error.message, success: '' })
    } finally {
      setBusyAction('')
    }
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={
          <>
            <span className="module-chip">{reviewSessions} en revision</span>
            <Link className="ghost-link" to="/inventario/diferencias">
              Ver diferencias
            </Link>
          </>
        }
        description="Primero se cuenta. Si aparece diferencia, la revision queda pendiente y se resuelve despues."
        eyebrow="Inventario / Conteos"
        title="Conteos"
      />

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleTableSection
            actions={<span className="module-chip">{visibleSessions.length} sesiones visibles</span>}
            description="Cuando una linea no coincide, la sesion pasa a revision."
            title="Sesiones de conteo"
          >
            {visibleSessions.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Alcance</th>
                      <th>Estado</th>
                      <th>Lineas</th>
                      <th>Registrado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSessions.map((session) => (
                      <tr key={session.id}>
                        <td>{formatDateTime(session.scheduled_for)}</td>
                        <td>{session.count_type_label}</td>
                        <td>{session.scope}</td>
                        <td>
                          <span className={`status-pill ${getCountTone(session)}`}>
                            {session.status_label}
                          </span>
                        </td>
                        <td>{session.line_count}</td>
                        <td>{session.created_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description="No hay conteos para mostrar con el filtro actual."
                title="Sin conteos"
              />
            )}
          </ModuleTableSection>
        </div>

        <div className="module-side-stack">
          <ModuleActionPanel
            description="Alta corta de sesion con una primera linea para capturar el conteo real."
            isOpen={showCountForm}
            onToggle={() => setShowCountForm((current) => !current)}
            title="Conteo rapido"
          >
            <form className="ops-form" onSubmit={handleCountSubmit}>
              <div className="field-grid">
                <label>
                  Tipo de conteo
                  <select
                    onChange={(event) =>
                      setCountForm((current) => ({
                        ...current,
                        count_type: event.target.value,
                      }))
                    }
                    value={countForm.count_type}
                  >
                    <option value="general">General</option>
                    <option value="partial">Parcial</option>
                    <option value="sector">Por sector</option>
                    <option value="family">Por familia</option>
                    <option value="cyclic">Ciclico</option>
                  </select>
                </label>
                <label>
                  Alcance
                  <input
                    onChange={(event) =>
                      setCountForm((current) => ({ ...current, scope: event.target.value }))
                    }
                    placeholder="Ej. Deposito principal"
                    value={countForm.scope}
                  />
                </label>
                <label>
                  Articulo
                  <select
                    onChange={(event) =>
                      setCountForm((current) => ({ ...current, article_id: event.target.value }))
                    }
                    value={countForm.article_id}
                  >
                    <option value="">Seleccionar</option>
                    {articles.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.internal_code} - {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ubicacion
                  <select
                    onChange={(event) =>
                      setCountForm((current) => ({ ...current, location_id: event.target.value }))
                    }
                    value={countForm.location_id}
                  >
                    <option value="">Seleccionar</option>
                    {catalogs.locations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Responsable
                  <select
                    onChange={(event) =>
                      setCountForm((current) => ({
                        ...current,
                        counter_person_id: event.target.value,
                      }))
                    }
                    value={countForm.counter_person_id}
                  >
                    <option value="">Seleccionar</option>
                    {catalogs.people.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cantidad contada
                  <input
                    onChange={(event) =>
                      setCountForm((current) => ({
                        ...current,
                        counted_qty: event.target.value,
                      }))
                    }
                    step="0.001"
                    type="number"
                    value={countForm.counted_qty}
                  />
                </label>
                <label className="field-span-2">
                  Observaciones
                  <input
                    onChange={(event) =>
                      setCountForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="La causa puede cargarse despues si aparece diferencia"
                    value={countForm.notes}
                />
              </label>
            </div>

            <PanelMessage error={countFeedback.error} success={countFeedback.success} />
              <button
                className="primary-button"
                disabled={!permissions.can_count || busyAction === 'count'}
                type="submit"
              >
              {busyAction === 'count' ? 'Guardando...' : 'Registrar conteo'}
            </button>
          </form>
          </ModuleActionPanel>

          <ModuleSurface
            description="Contar no obliga a justificar en el momento."
            title="Regla operativa"
          >
            <div className="module-list">
              <div className="module-list-item">
                <div>
                  <strong>Conteo primero</strong>
                  <p>Si hay diferencia, la sesion queda en revision automaticamente.</p>
                </div>
              </div>
              <div className="module-list-item">
                <div>
                  <strong>Resolucion despues</strong>
                  <p>El cierre de ajuste se hace desde la seccion de Diferencias.</p>
                </div>
              </div>
            </div>
          </ModuleSurface>
        </div>
      </section>
    </div>
  )
}
