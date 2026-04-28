import { useDeferredValue, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { resolveDiscrepancy } from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  ModuleTableSection,
  ModuleToolbar,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import { discrepancyMatchesQuery, formatDateTime, formatQuantity } from './utils.js'

export function InventoryDiscrepanciesPage() {
  const { inventoryOverview, refreshInventoryModule, searchValue, user } = useOutletContext()
  const deferredQuery = useDeferredValue(searchValue.trim().toLowerCase())
  const [statusFilter, setStatusFilter] = useState('open')
  const [busyAction, setBusyAction] = useState('')
  const [feedback, setFeedback] = useState({ error: '', success: '' })

  if (!inventoryOverview) {
    return null
  }

  const { discrepancies, permissions } = inventoryOverview
  const visibleDiscrepancies = discrepancies
    .filter((discrepancy) =>
      statusFilter === 'all' ? true : discrepancy.status === statusFilter,
    )
    .filter((discrepancy) => discrepancyMatchesQuery(discrepancy, deferredQuery))

  async function handleResolveDiscrepancy(discrepancyId) {
    setBusyAction(`resolve-${discrepancyId}`)
    setFeedback({ error: '', success: '' })

    try {
      await resolveDiscrepancy(discrepancyId, {
        reason_text: 'Ajuste aplicado desde el panel modular',
        notes: `Resuelto por ${user.full_name}`,
        action_taken: 'Ajuste aplicado',
      })
      await refreshInventoryModule()
      setFeedback({ error: '', success: 'Diferencia resuelta.' })
    } catch (error) {
      setFeedback({ error: error.message, success: '' })
    } finally {
      setBusyAction('')
    }
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={<span className="module-chip">{visibleDiscrepancies.length} visibles</span>}
        eyebrow="Inventario / Diferencias"
        title="Diferencias"
      />

      <PanelMessage error={feedback.error} success={feedback.success} />

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleTableSection
            description="El ajuste se cierra solo con rol aprobador."
            title="Cola de diferencias"
            toolbar={
              <ModuleToolbar>
                <div className="module-filter-group">
                  <label>
                    Estado
                    <select
                      onChange={(event) => setStatusFilter(event.target.value)}
                      value={statusFilter}
                    >
                      <option value="open">Abiertas</option>
                      <option value="resolved">Resueltas</option>
                      <option value="all">Todas</option>
                    </select>
                  </label>
                </div>
              </ModuleToolbar>
            }
          >
            {visibleDiscrepancies.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Articulo</th>
                      <th>Tipo</th>
                      <th>Cantidad</th>
                      <th>Ubicacion</th>
                      <th>Detectada</th>
                      <th>Usuario</th>
                      <th>Estado</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDiscrepancies.map((discrepancy) => (
                      <tr key={discrepancy.id}>
                        <td>{discrepancy.article}</td>
                        <td>{discrepancy.difference_type_label}</td>
                        <td>{formatQuantity(discrepancy.difference_qty)}</td>
                        <td>{discrepancy.location || 'Sin ubicacion'}</td>
                        <td>{formatDateTime(discrepancy.detected_at)}</td>
                        <td>{discrepancy.detected_by}</td>
                        <td>{discrepancy.status_label}</td>
                        <td>
                          {discrepancy.status === 'open' ? (
                            <button
                              className="inline-action"
                              disabled={
                                !permissions.can_approve ||
                                busyAction === `resolve-${discrepancy.id}`
                              }
                              onClick={() => {
                                void handleResolveDiscrepancy(discrepancy.id)
                              }}
                              type="button"
                            >
                              {busyAction === `resolve-${discrepancy.id}`
                                ? 'Ajustando...'
                                : 'Resolver'}
                            </button>
                          ) : (
                            <span className="table-note">{discrepancy.action_taken || 'Cerrada'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description="No hay diferencias para mostrar con el filtro actual."
                title="Sin diferencias"
              />
            )}
          </ModuleTableSection>
        </div>

        <aside className="module-side-stack">
          <ModuleSurface
            title="Cierre controlado"
          >
            <div className="module-list">
              <div className="module-list-item">
                <div>
                  <strong>Registro flexible</strong>
                  <p>No hace falta inventar una causa para guardar la diferencia.</p>
                </div>
              </div>
              <div className="module-list-item">
                <div>
                  <strong>Aprobacion</strong>
                  <p>Solo supervisor o administrador pueden aplicar el ajuste final.</p>
                </div>
              </div>
            </div>
          </ModuleSurface>
        </aside>
      </section>
    </div>
  )
}
