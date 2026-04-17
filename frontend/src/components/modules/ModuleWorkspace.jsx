import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'

function classNames(...parts) {
  return parts.filter(Boolean).join(' ')
}

function supportsWindow() {
  return typeof window !== 'undefined'
}

export function PanelMessage({ error, success }) {
  if (error) {
    return <div className="form-error">{error}</div>
  }

  if (success) {
    return <div className="form-success">{success}</div>
  }

  return null
}

export function ModuleWorkspaceLayout({
  actions,
  children,
  headerLabel,
  headerSubtitle,
  headerTitle,
  sidebarActions,
  moduleLabel,
  moduleSubtitle,
  moduleTitle,
  navGroups,
  sidebarUtility,
  sidebarFooter,
  sidebarCollapsible = false,
  sidebarStorageKey = '',
  variant = 'default',
  workspaceClassName = '',
}) {
  const resolvedHeaderLabel = headerLabel ?? moduleLabel
  const resolvedHeaderTitle = headerTitle ?? moduleTitle
  const resolvedHeaderSubtitle = headerSubtitle ?? moduleSubtitle
  const hasHeaderCopy = resolvedHeaderLabel || resolvedHeaderTitle || resolvedHeaderSubtitle
  const hasHeader = hasHeaderCopy || actions
  const resolvedSidebarStorageKey = useMemo(() => {
    if (sidebarStorageKey) {
      return sidebarStorageKey
    }

    const baseLabel = (moduleTitle || resolvedHeaderTitle || 'module')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    return `module-sidebar-collapsed:${baseLabel || 'module'}`
  }, [moduleTitle, resolvedHeaderTitle, sidebarStorageKey])

  const [isMobileSidebar, setIsMobileSidebar] = useState(() => {
    if (!supportsWindow()) {
      return false
    }
    return window.matchMedia('(max-width: 720px)').matches
  })
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (!sidebarCollapsible || !supportsWindow()) {
      return false
    }
    return window.localStorage.getItem(resolvedSidebarStorageKey) === '1'
  })
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false)

  useEffect(() => {
    if (!sidebarCollapsible || !supportsWindow()) {
      return undefined
    }

    const mediaQuery = window.matchMedia('(max-width: 720px)')
    const syncMobileState = () => {
      const mobile = mediaQuery.matches
      setIsMobileSidebar(mobile)
      if (mobile) {
        setIsSidebarOpenMobile(false)
      }
    }

    syncMobileState()

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', syncMobileState)
      return () => mediaQuery.removeEventListener('change', syncMobileState)
    }

    mediaQuery.addListener(syncMobileState)
    return () => mediaQuery.removeListener(syncMobileState)
  }, [sidebarCollapsible])

  useEffect(() => {
    if (!sidebarCollapsible || !supportsWindow()) {
      return
    }
    window.localStorage.setItem(resolvedSidebarStorageKey, isSidebarCollapsed ? '1' : '0')
  }, [isSidebarCollapsed, resolvedSidebarStorageKey, sidebarCollapsible])

  function handleSidebarToggle() {
    if (!sidebarCollapsible) {
      return
    }

    if (isMobileSidebar) {
      setIsSidebarOpenMobile((current) => !current)
      return
    }

    setIsSidebarCollapsed((current) => !current)
  }

  function handleMobileSidebarClose() {
    if (isMobileSidebar) {
      setIsSidebarOpenMobile(false)
    }
  }

  const workspaceClasses = classNames(
    'module-workspace',
    variant === 'erp' && 'is-erp',
    workspaceClassName,
    sidebarCollapsible && 'is-sidebar-collapsible',
    sidebarCollapsible && !isMobileSidebar && isSidebarCollapsed && 'is-sidebar-collapsed',
    sidebarCollapsible && isMobileSidebar && 'is-sidebar-mobile',
    sidebarCollapsible && isMobileSidebar && isSidebarOpenMobile && 'is-sidebar-open',
  )
  const isSidebarCondensed = Boolean(sidebarCollapsible && !isMobileSidebar && isSidebarCollapsed)
  const showMobileTrigger = Boolean(sidebarCollapsible && isMobileSidebar && !isSidebarOpenMobile)
  const showSidebarBackdrop = Boolean(sidebarCollapsible && isMobileSidebar && isSidebarOpenMobile)
  const sidebarToggleTitle = isMobileSidebar
    ? isSidebarOpenMobile
      ? 'Cerrar menu'
      : 'Abrir menu'
    : isSidebarCollapsed
      ? 'Expandir menu'
      : 'Colapsar menu'

  return (
    <div className={workspaceClasses}>
      {showSidebarBackdrop ? (
        <button
          aria-label="Cerrar menu lateral"
          className="module-sidebar-backdrop"
          onClick={handleMobileSidebarClose}
          type="button"
        />
      ) : null}

      <aside className="module-sidebar">
        <div className="module-sidebar-main">
          <div className="module-sidebar-brand">
            <div className="module-sidebar-brand-row">
              <div>
                {moduleLabel ? <p className="module-sidebar-eyebrow">{moduleLabel}</p> : null}
                {moduleTitle ? <h1>{moduleTitle}</h1> : null}
              </div>
              <div className="module-sidebar-brand-tools">
                {sidebarActions ? <div className="module-sidebar-actions">{sidebarActions}</div> : null}
                {sidebarCollapsible ? (
                  <button
                    aria-label={sidebarToggleTitle}
                    className="module-sidebar-toggle"
                    onClick={handleSidebarToggle}
                    title={sidebarToggleTitle}
                    type="button"
                  >
                    {isMobileSidebar ? 'Cerrar' : isSidebarCollapsed ? 'Expandir' : 'Colapsar'}
                  </button>
                ) : null}
              </div>
            </div>
            {moduleSubtitle ? <p>{moduleSubtitle}</p> : null}
          </div>

          <ModuleSidebarNav groups={navGroups} isCondensed={isSidebarCondensed} onNavigate={handleMobileSidebarClose} />
        </div>

        {sidebarUtility || sidebarFooter ? (
          <div className="module-sidebar-footer">
            {sidebarUtility ? <div className="module-sidebar-utility">{sidebarUtility}</div> : null}
            {sidebarFooter}
          </div>
        ) : null}
      </aside>

      <div className="module-canvas">
        {showMobileTrigger ? (
          <button
            aria-label="Abrir menu lateral"
            className="module-mobile-nav-toggle"
            onClick={handleSidebarToggle}
            type="button"
          >
            Menu
          </button>
        ) : null}

        {hasHeader ? (
          <header className={classNames('module-header', !hasHeaderCopy && 'is-actions-only')}>
            {hasHeaderCopy ? (
              <div className="module-header-copy">
                {resolvedHeaderLabel ? <p className="module-header-label">{resolvedHeaderLabel}</p> : null}
                {resolvedHeaderTitle ? <strong>{resolvedHeaderTitle}</strong> : null}
                {resolvedHeaderSubtitle ? <span>{resolvedHeaderSubtitle}</span> : null}
              </div>
            ) : null}
            {actions ? <div className="module-header-actions">{actions}</div> : null}
          </header>
        ) : null}

        <div className="module-content">{children}</div>
      </div>
    </div>
  )
}

export function ModuleSidebarNav({ groups = [], isCondensed = false, onNavigate }) {
  return (
    <nav className="module-sidebar-nav" aria-label="Navegacion del modulo">
      {groups.map((group) => (
        <div className="module-nav-group" key={group.title}>
          <p className="module-nav-group-title">{group.title}</p>
          <div className="module-nav-group-items">
            {group.items.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  classNames('module-nav-link', isActive && 'active')
                }
                end={item.end}
                key={item.to}
                onClick={onNavigate}
                title={isCondensed ? item.label : undefined}
                to={item.to}
              >
                <span className="module-nav-mark">{item.shortLabel || item.label.slice(0, 1)}</span>
                <span className="module-nav-copy">
                  <strong>{item.label}</strong>
                  {item.hint ? <small>{item.hint}</small> : null}
                </span>
                {item.badge !== undefined ? (
                  <span className="module-nav-badge">{item.badge}</span>
                ) : null}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function ModulePageHeader({ actions, description, eyebrow, title }) {
  return (
    <div className="module-page-header">
      <div className="module-page-header-copy">
        {eyebrow ? <p className="module-page-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions ? <div className="module-page-actions">{actions}</div> : null}
    </div>
  )
}

export function ModuleStatsStrip({ stats }) {
  return (
    <section className="module-stats-strip">
      {stats.map((stat) => (
        <article className="module-stat-card" key={stat.label}>
          <span className="module-stat-label">{stat.label}</span>
          <strong>{stat.value}</strong>
          <p>{stat.hint}</p>
        </article>
      ))}
    </section>
  )
}

export function ModuleSurface({
  actions,
  children,
  className,
  description,
  title,
}) {
  return (
    <article className={classNames('module-surface', className)}>
      {title || description || actions ? (
        <div className="module-surface-head">
          <div className="module-surface-copy">
            {title ? <strong>{title}</strong> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="module-surface-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="module-surface-body">{children}</div>
    </article>
  )
}

export function ModuleToolbar({ children, className }) {
  return <div className={classNames('module-toolbar', className)}>{children}</div>
}

export function ModuleTableSection({
  actions,
  children,
  className,
  description,
  title,
  toolbar,
}) {
  return (
    <ModuleSurface
      actions={actions}
      className={classNames('module-table-section', className)}
      description={description}
      title={title}
    >
      {toolbar ? toolbar : null}
      {children}
    </ModuleSurface>
  )
}

export function ModuleActionPanel({
  children,
  description,
  isOpen = true,
  onToggle,
  title,
}) {
  return (
    <ModuleSurface className={classNames('module-action-panel', !isOpen && 'is-collapsed')}>
      <div className="module-surface-head">
        <div className="module-surface-copy">
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        {onToggle ? (
          <button className="inline-action" onClick={onToggle} type="button">
            {isOpen ? 'Ocultar' : 'Abrir'}
          </button>
        ) : null}
      </div>
      <div className="module-surface-body">
        {isOpen ? children : <p className="module-empty-copy">Expandi el panel para operar desde esta seccion.</p>}
      </div>
    </ModuleSurface>
  )
}

export function ModuleEmptyState({ description, title }) {
  return (
    <div className="module-empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

