import { useDeferredValue, useEffect, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ModuleIcon } from './Icons.jsx'

const ACTIVE_MODULE_ROUTES = {
  inventario: '/inventario',
  depositos: '/depositos',
  personal: '/personal',
  tia: '/tia',
  administracion: '/administracion',
}

const TIA_MODULE = {
  slug: 'tia',
  name: 'TIA',
  description: 'Integracion Siemens S7-300 y monitoreo industrial',
  color: '#14b8a6',
  badge: '0',
  status: 'restricted',
}

function dashboardModulesForPanel(modules = []) {
  const visibleModules = modules.filter((module) => module.slug !== 'mensajes')

  if (visibleModules.some((module) => module.slug === TIA_MODULE.slug)) {
    return visibleModules
  }

  return [...visibleModules, TIA_MODULE]
}

function matchesQuery(module, query) {
  if (!query) {
    return true
  }

  const target = `${module.name} ${module.description}`.toLowerCase()
  return target.includes(query)
}

export function ModuleHub() {
  const { dashboardData, searchValue } = useOutletContext()
  const deferredQuery = useDeferredValue(searchValue.trim().toLowerCase())
  const stageRef = useRef(null)
  const frameRef = useRef(0)

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  if (!dashboardData) {
    return (
      <div className="inventory-empty">
        <strong>Cargando modulos</strong>
        <p>Preparando el panel principal del ERP.</p>
      </div>
    )
  }

  const filteredModules = dashboardModulesForPanel(dashboardData.modules).filter((module) =>
    matchesQuery(module, deferredQuery),
  )

  function updatePointer(clientX, clientY) {
    if (!stageRef.current) {
      return
    }

    const bounds = stageRef.current.getBoundingClientRect()
    const relativeX = ((clientX - bounds.left) / bounds.width) * 100
    const relativeY = ((clientY - bounds.top) / bounds.height) * 100

    stageRef.current.style.setProperty('--dashboard-pointer-x', `${relativeX.toFixed(2)}%`)
    stageRef.current.style.setProperty('--dashboard-pointer-y', `${relativeY.toFixed(2)}%`)
  }

  function handlePointerMove(event) {
    if (event.pointerType === 'touch') {
      return
    }

    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current)
    }

    const { clientX, clientY } = event
    frameRef.current = window.requestAnimationFrame(() => {
      updatePointer(clientX, clientY)
      frameRef.current = 0
    })
  }

  function handlePointerLeave() {
    if (!stageRef.current) {
      return
    }

    stageRef.current.style.setProperty('--dashboard-pointer-x', '50%')
    stageRef.current.style.setProperty('--dashboard-pointer-y', '18%')
  }

  return (
    <div
      className="dashboard-scene"
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      ref={stageRef}
    >
      <div aria-hidden="true" className="dashboard-backdrop">
        <span className="dashboard-particle dashboard-particle--1" />
        <span className="dashboard-particle dashboard-particle--2" />
        <span className="dashboard-particle dashboard-particle--3" />
        <span className="dashboard-particle dashboard-particle--4" />
        <span className="dashboard-particle dashboard-particle--5" />
        <span className="dashboard-particle dashboard-particle--6" />
      </div>

      <div className="dashboard-content">
        <section className="dashboard-header">
          <div className="dashboard-title-block">
            <p className="eyebrow">Panel principal</p>
            <h1>Modulos del sistema</h1>
          </div>
        </section>

        <section className="module-grid dashboard-module-grid">
          {filteredModules.map((module) => {
            const isDisabled = module.status !== 'active'
            const isRestricted = module.status === 'restricted'
            const disabledLabel = isRestricted ? 'Sin permisos' : 'Modulo deshabilitado'
            const card = (
              <>
                <span
                  className="module-icon-shell"
                  style={{ '--module-color': module.color }}
                >
                  {isDisabled ? <span aria-hidden="true" className="module-disabled-mark" /> : null}
                  <ModuleIcon slug={module.slug} />
                </span>
                <div className="module-meta">
                  <strong>{module.name}</strong>
                </div>
              </>
            )

            if (!isDisabled && ACTIVE_MODULE_ROUTES[module.slug]) {
              const destination = ACTIVE_MODULE_ROUTES[module.slug]

              return (
                <Link
                  className="module-card"
                  key={module.slug}
                  to={destination}
                >
                  {card}
                </Link>
              )
            }

            return (
              <div
                className="module-card is-disabled"
                data-disabled-label={disabledLabel}
                key={module.slug}
                title={disabledLabel}
              >
                {card}
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}
