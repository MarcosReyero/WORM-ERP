import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchDepositsLayout } from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  ModuleToolbar,
} from '../modules/ModuleWorkspace.jsx'
import { getPositionTone } from './utils.js'

function buildPositionStyle(position) {
  const columnStart = Math.max(1, Math.round(Number(position.x)) + 1)
  const rowStart = Math.max(1, Math.round(Number(position.y)) + 1)
  const columnSpan = Math.max(2, Math.round(Number(position.width) * 2))
  const rowSpan = Math.max(1, Math.round(Number(position.height) * 2))

  return {
    gridColumn: `${columnStart} / span ${columnSpan}`,
    gridRow: `${rowStart} / span ${rowSpan}`,
  }
}

function getZoneOccupancyPercent(zone) {
  const total = zone.positions.length
  if (!total) {
    return 0
  }
  const occupied = zone.positions.filter((position) => position.occupancy_count).length
  return Math.round((occupied / total) * 100)
}

export function DepositsPlanPage() {
  const { depositsOverview, searchValue } = useOutletContext()
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [layoutState, setLayoutState] = useState({
    loading: true,
    error: '',
    data: null,
  })

  const locations = depositsOverview?.locations || []
  const resolvedSelectedLocationId = selectedLocationId || String(locations[0]?.id || '')
  const filteredQuery = searchValue.trim().toLowerCase()

  useEffect(() => {
    if (!resolvedSelectedLocationId) {
      return
    }

    let active = true

    async function loadLayout() {
      setLayoutState({
        loading: true,
        error: '',
        data: null,
      })

      try {
        const response = await fetchDepositsLayout(resolvedSelectedLocationId)
        if (!active) {
          return
        }
        setLayoutState({
          loading: false,
          error: '',
          data: response,
        })
      } catch (error) {
        if (!active) {
          return
        }
        setLayoutState({
          loading: false,
          error: error.message || 'No se pudo cargar el plano seleccionado.',
          data: null,
        })
      }
    }

    loadLayout()

    return () => {
      active = false
    }
  }, [resolvedSelectedLocationId])

  const visibleZones = useMemo(() => {
    const zones = layoutState.data?.zones || []
    if (!filteredQuery) {
      return zones
    }

    return zones
      .map((zone) => ({
        ...zone,
        positions: zone.positions.filter((position) => {
          const target = [
            zone.name,
            zone.code,
            position.code,
            position.current_pallet?.pallet_code,
            position.current_pallet?.article,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

          return filteredQuery
            .split(/\s+/)
            .filter(Boolean)
            .every((term) => target.includes(term))
        }),
      }))
      .filter((zone) => zone.positions.length)
  }, [filteredQuery, layoutState.data?.zones])

  if (!depositsOverview?.permissions?.can_view_layout) {
    return (
      <ModuleEmptyState
        title="Plano no disponible"
        description="Tu perfil no tiene permiso para consultar layout de depositos."
      />
    )
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        eyebrow="Depositos / Plano"
        title="Plano consultivo"
        description="Mapa responsive por zonas, ocupacion por posicion y pallet vigente."
      />

      <ModuleSurface
        title="Deposito"
        description="Selecciona ubicacion para inspeccionar zonas y ocupacion."
      >
        <ModuleToolbar className="deposits-toolbar">
          <label>
            <span>Ubicacion</span>
            <select
              value={resolvedSelectedLocationId}
              onChange={(event) => setSelectedLocationId(event.target.value)}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} · {location.name}
                </option>
              ))}
            </select>
          </label>
        </ModuleToolbar>

        <div className="deposits-legend">
          <span className="deposits-legend-item is-available">Libre</span>
          <span className="deposits-legend-item is-occupied">Ocupada</span>
          <span className="deposits-legend-item is-blocked">Bloqueada</span>
        </div>
      </ModuleSurface>

      {layoutState.error ? <div className="form-error">{layoutState.error}</div> : null}

      {layoutState.loading ? (
        <ModuleEmptyState
          title="Cargando plano"
          description="Preparando zonas, posiciones y ocupacion actual."
        />
      ) : (
        <section className="deposits-plan-stack">
          {visibleZones.length ? (
            visibleZones.map((zone) => {
              const occupancyPercent = getZoneOccupancyPercent(zone)
              return (
                <ModuleSurface
                  key={zone.id}
                  title={`${zone.code} · ${zone.name}`}
                  description="Vista 2D resumida con posiciones fisicas y pallet actual."
                >
                  <div className="deposits-zone-meter" role="img" aria-label={`Ocupacion ${occupancyPercent}%`}>
                    <div className="deposits-zone-meter-bar" style={{ width: `${occupancyPercent}%` }} />
                    <span>{occupancyPercent}% ocupada</span>
                  </div>

                  <div className="deposits-zone-canvas">
                    <div className="deposits-zone-grid">
                      {zone.positions.map((position) => (
                        <article
                          className={`deposits-position-tile ${getPositionTone(position)}`}
                          key={position.id}
                          style={buildPositionStyle(position)}
                        >
                          <strong>{position.code}</strong>
                          <span>{position.occupancy_count ? 'Ocupada' : 'Libre'}</span>
                          {position.current_pallet ? (
                            <small>{position.current_pallet.pallet_code}</small>
                          ) : (
                            <small>Sin pallet</small>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="deposits-plan-list">
                    {zone.positions.map((position) => (
                      <article className="deposits-plan-card" key={`detail-${position.id}`}>
                        <div>
                          <strong>{position.code}</strong>
                          <p>{position.status_label}</p>
                        </div>
                        <div>
                          <strong>{position.occupancy_count}/{position.capacity_pallets}</strong>
                          <p>{position.current_pallet?.article || 'Disponible'}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </ModuleSurface>
              )
            })
          ) : (
            <ModuleEmptyState
              title="Sin coincidencias"
              description="No hay zonas o posiciones que coincidan con busqueda actual."
            />
          )}
        </section>
      )}
    </div>
  )
}

