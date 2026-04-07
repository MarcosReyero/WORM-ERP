import { useDeferredValue, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createCheckout, returnCheckout } from '../../lib/api.js'
import {
  ModuleActionPanel,
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import {
  checkoutMatchesQuery,
  formatDateTime,
  getCheckoutTone,
  unitMatchesQuery,
} from './utils.js'

export function InventoryCheckoutsPage() {
  const { inventoryOverview, refreshInventoryModule, searchValue } = useOutletContext()
  const deferredQuery = useDeferredValue(searchValue.trim().toLowerCase())
  const [showCheckoutForm, setShowCheckoutForm] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [checkoutFeedback, setCheckoutFeedback] = useState({ error: '', success: '' })
  const [checkoutForm, setCheckoutForm] = useState({
    tracked_unit_id: '',
    receiver_person_id: '',
    receiver_sector_id: '',
    expected_return_at: '',
    notes: '',
  })

  if (!inventoryOverview) {
    return null
  }

  const { catalogs, checkouts, permissions, tracked_units: trackedUnits } = inventoryOverview
  const openCheckouts = checkouts
    .filter((checkout) => checkout.status === 'open')
    .filter((checkout) => checkoutMatchesQuery(checkout, deferredQuery))

  const visibleUnits = trackedUnits.filter((unit) => unitMatchesQuery(unit, deferredQuery))
  const availableUnits = trackedUnits.filter((unit) => unit.status === 'available')

  async function handleCheckoutSubmit(event) {
    event.preventDefault()
    setBusyAction('checkout')
    setCheckoutFeedback({ error: '', success: '' })

    try {
      await createCheckout(checkoutForm)
      await refreshInventoryModule()
      setCheckoutForm({
        tracked_unit_id: '',
        receiver_person_id: '',
        receiver_sector_id: '',
        expected_return_at: '',
        notes: '',
      })
      setCheckoutFeedback({ error: '', success: 'Prestamo registrado.' })
    } catch (error) {
      setCheckoutFeedback({ error: error.message, success: '' })
    } finally {
      setBusyAction('')
    }
  }

  async function handleCheckoutReturn(checkoutId) {
    setBusyAction(`return-${checkoutId}`)
    setCheckoutFeedback({ error: '', success: '' })

    try {
      await returnCheckout(checkoutId, {})
      await refreshInventoryModule()
      setCheckoutFeedback({ error: '', success: 'Unidad devuelta correctamente.' })
    } catch (error) {
      setCheckoutFeedback({ error: error.message, success: '' })
    } finally {
      setBusyAction('')
    }
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={<span className="module-chip">{openCheckouts.length} prestamos abiertos</span>}
        description="Control de herramientas y unidades asignables con devolucion directa."
        eyebrow="Inventario / Prestamos"
        title="Prestamos"
      />

      <PanelMessage error={checkoutFeedback.error} success={checkoutFeedback.success} />

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleTableSection
            description="Si la unidad vuelve, el retorno la deja otra vez disponible."
            title="Prestamos abiertos"
          >
            {openCheckouts.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Unidad</th>
                      <th>Articulo</th>
                      <th>Receptor</th>
                      <th>Salida</th>
                      <th>Devolucion estimada</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openCheckouts.map((checkout) => (
                      <tr key={checkout.id}>
                        <td>{checkout.tracked_unit}</td>
                        <td>{checkout.article}</td>
                        <td>{checkout.receiver_person || checkout.receiver_sector || 'Sin receptor'}</td>
                        <td>{formatDateTime(checkout.checked_out_at)}</td>
                        <td>
                          <span className={`status-pill ${getCheckoutTone(checkout)}`}>
                            {checkout.expected_return_at
                              ? formatDateTime(checkout.expected_return_at)
                              : 'Sin fecha'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="inline-action"
                            disabled={busyAction === `return-${checkout.id}`}
                            onClick={() => {
                              void handleCheckoutReturn(checkout.id)
                            }}
                            type="button"
                          >
                            {busyAction === `return-${checkout.id}` ? 'Devolviendo...' : 'Devolver'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description="No hay prestamos abiertos para el filtro actual."
                title="Sin prestamos abiertos"
              />
            )}
          </ModuleTableSection>

          <ModuleSurface
            actions={<span className="module-chip">{visibleUnits.length} unidades visibles</span>}
            description="Herramientas y activos individuales dentro del modulo."
            title="Unidades trazadas"
          >
            {visibleUnits.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Articulo</th>
                      <th>Estado</th>
                      <th>Ubicacion actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUnits.map((unit) => (
                      <tr key={unit.id}>
                        <td>{unit.internal_tag}</td>
                        <td>{unit.article}</td>
                        <td>{unit.status_label}</td>
                        <td>
                          {unit.current_holder_person ||
                            unit.current_location ||
                            unit.current_sector ||
                            '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description="No hay unidades trazadas para mostrar."
                title="Sin unidades"
              />
            )}
          </ModuleSurface>
        </div>

        <ModuleActionPanel
          description="Selecciona una unidad disponible y el receptor. Nada mas para un prestamo normal."
          isOpen={showCheckoutForm}
          onToggle={() => setShowCheckoutForm((current) => !current)}
          title="Prestamo rapido"
        >
          <form className="ops-form" onSubmit={handleCheckoutSubmit}>
            <div className="field-grid">
              <label>
                Unidad
                <select
                  onChange={(event) =>
                    setCheckoutForm((current) => ({
                      ...current,
                      tracked_unit_id: event.target.value,
                    }))
                  }
                  value={checkoutForm.tracked_unit_id}
                >
                  <option value="">Seleccionar</option>
                  {availableUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.internal_tag} - {unit.article}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Persona
                <select
                  onChange={(event) =>
                    setCheckoutForm((current) => ({
                      ...current,
                      receiver_person_id: event.target.value,
                    }))
                  }
                  value={checkoutForm.receiver_person_id}
                >
                  <option value="">Sin persona</option>
                  {catalogs.people.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sector
                <select
                  onChange={(event) =>
                    setCheckoutForm((current) => ({
                      ...current,
                      receiver_sector_id: event.target.value,
                    }))
                  }
                  value={checkoutForm.receiver_sector_id}
                >
                  <option value="">Sin sector</option>
                  {catalogs.sectors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Devolucion estimada
                <input
                  onChange={(event) =>
                    setCheckoutForm((current) => ({
                      ...current,
                      expected_return_at: event.target.value,
                    }))
                  }
                  type="datetime-local"
                  value={checkoutForm.expected_return_at}
                />
              </label>
              <label className="field-span-2">
                Observaciones
                <input
                  onChange={(event) =>
                    setCheckoutForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="Opcional"
                  value={checkoutForm.notes}
                />
              </label>
            </div>

            <button
              className="primary-button"
              disabled={!permissions.can_checkout || busyAction === 'checkout'}
              type="submit"
            >
              {busyAction === 'checkout' ? 'Registrando...' : 'Prestar unidad'}
            </button>
          </form>
        </ModuleActionPanel>
      </section>
    </div>
  )
}
