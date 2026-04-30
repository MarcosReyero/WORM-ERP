import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ModuleIcon } from './Icons.jsx'
import { PaintbrushIcon } from 'lucide-react'

const ACTIVE_MODULE_ROUTES = {
  inventario: '/inventario',
  depositos: '/depositos',
  personal: '/personal',
  tia: '/tia',
  administracion: '/administracion',
  compras: '/compras',
}
const DASHBOARD_BACKGROUND_STORAGE_KEY = 'inventary.dashboard.customBackground.v1'
const DASHBOARD_CONTROLS_TOP_KEY = '--dashboard-controls-top'

function dashboardModulesForPanel(modules = []) {
  return modules.filter((module) => module.slug !== 'mensajes')
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
  const backgroundInputRef = useRef(null)
  const backgroundMenuRef = useRef(null)
  const backgroundButtonRef = useRef(null)
  const [isBackgroundMenuOpen, setIsBackgroundMenuOpen] = useState(false)
  const [customBackground, setCustomBackground] = useState(() => {
    try {
      return window.localStorage.getItem(DASHBOARD_BACKGROUND_STORAGE_KEY) || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isBackgroundMenuOpen) {
      return
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsBackgroundMenuOpen(false)
      }
    }

    function handlePointerDown(event) {
      const target = event.target
      const menu = backgroundMenuRef.current
      const button = backgroundButtonRef.current

      if (!target || !(target instanceof Node)) {
        return
      }

      if (menu?.contains(target) || button?.contains(target)) {
        return
      }

      setIsBackgroundMenuOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isBackgroundMenuOpen])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return undefined
    }

    const topbar =
      document.querySelector('.topbar--shell') ||
      document.querySelector('.topbar')

    if (!topbar) {
      return undefined
    }

    function syncDashboardControlsTop() {
      const rect = topbar.getBoundingClientRect()
      const styles = window.getComputedStyle(topbar)
      const marginBottom = Number.parseFloat(styles.marginBottom || '0') || 0
      const offset = Math.round(rect.bottom + marginBottom + 12)
      stage.style.setProperty(DASHBOARD_CONTROLS_TOP_KEY, `${offset}px`)
    }

    syncDashboardControlsTop()

    let resizeObserver = null
    if (typeof window.ResizeObserver === 'function') {
      resizeObserver = new window.ResizeObserver(() => {
        syncDashboardControlsTop()
      })
      resizeObserver.observe(topbar)
    }

    window.addEventListener('resize', syncDashboardControlsTop)

    return () => {
      window.removeEventListener('resize', syncDashboardControlsTop)
      resizeObserver?.disconnect()
      stage.style.removeProperty(DASHBOARD_CONTROLS_TOP_KEY)
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

  function handleBackgroundPick(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''

      if (!result) {
        return
      }

      try {
        window.localStorage.setItem(DASHBOARD_BACKGROUND_STORAGE_KEY, result)
      } catch {
        window.alert('No se pudo guardar el fondo (imagen muy pesada o sin espacio). Probá con una imagen mas liviana.')
      }

      setCustomBackground(result)
      setIsBackgroundMenuOpen(false)
    }

    reader.readAsDataURL(file)
    event.target.value = ''
  }

  function clearCustomBackground() {
    try {
      window.localStorage.removeItem(DASHBOARD_BACKGROUND_STORAGE_KEY)
    } catch {
      // ignore
    }

    setCustomBackground('')
    setIsBackgroundMenuOpen(false)
  }

  return (
    <div
      className="dashboard-scene"
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      ref={stageRef}
      style={
        customBackground
          ? { '--dashboard-custom-bg': `url("${customBackground}")` }
          : undefined
      }
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
        <div className="dashboard-background-control">
          <button
            aria-expanded={isBackgroundMenuOpen}
            aria-label="Cambiar fondo del panel"
            className="dashboard-background-button"
            onClick={() => setIsBackgroundMenuOpen((open) => !open)}
            ref={backgroundButtonRef}
            type="button"
          >
            <PaintbrushIcon aria-hidden="true" />
          </button>

          {isBackgroundMenuOpen ? (
            <div className="dashboard-background-menu" ref={backgroundMenuRef} role="menu">
              <p className="dashboard-background-menu-title">Fondo personalizado</p>
              <button
                className="dashboard-background-menu-action"
                onClick={() => backgroundInputRef.current?.click()}
                role="menuitem"
                type="button"
              >
                Cargar de archivo
              </button>
              <button
                className="dashboard-background-menu-action danger"
                disabled={!customBackground}
                onClick={clearCustomBackground}
                role="menuitem"
                type="button"
              >
                Quitar fondo
              </button>
            </div>
          ) : null}

          <input
            accept="image/*"
            aria-hidden="true"
            className="dashboard-background-input"
            onChange={handleBackgroundPick}
            ref={backgroundInputRef}
            tabIndex={-1}
            type="file"
          />
        </div>

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
