import { isValidElement, useEffect, useMemo } from 'react'
import { usePlatformShell } from '../shell/PlatformShellContext.jsx'

function classNames(...parts) {
  return parts.filter(Boolean).join(' ')
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
  variant = 'default',
  workspaceClassName = '',
}) {
  const { clearSidebarConfig, setSidebarConfig } = usePlatformShell()
  const resolvedHeaderLabel = headerLabel ?? moduleLabel
  const resolvedHeaderTitle = headerTitle ?? moduleTitle
  const resolvedHeaderSubtitle = headerSubtitle ?? moduleSubtitle
  const hasHeaderCopy = resolvedHeaderLabel || resolvedHeaderTitle || resolvedHeaderSubtitle
  const hasHeader = hasHeaderCopy || actions
  const navGroupsKey = JSON.stringify(
    (navGroups || []).map((group) => ({
      title: group.title,
      items: (group.items || []).map((item) => ({
        badge: item.badge,
        end: item.end,
        hint: item.hint,
        label: item.label,
        shortLabel: item.shortLabel,
        to: item.to,
      })),
    })),
  )
  const sidebarActionsKey = isValidElement(sidebarActions)
    ? JSON.stringify({
        disabled: Boolean(sidebarActions.props?.disabled),
        title: sidebarActions.props?.title || '',
      })
    : String(Boolean(sidebarActions))
  const sidebarFooterKey = isValidElement(sidebarFooter)
    ? sidebarFooter.type?.name || sidebarFooter.type?.displayName || 'footer-node'
    : String(Boolean(sidebarFooter))
  const sidebarUtilityKey = isValidElement(sidebarUtility)
    ? sidebarUtility.type?.name || sidebarUtility.type?.displayName || 'utility-node'
    : String(Boolean(sidebarUtility))

  const shellConfig = useMemo(
    () => ({
      signature: [
        variant,
        workspaceClassName,
        moduleLabel,
        moduleTitle,
        moduleSubtitle,
        navGroupsKey,
        sidebarActionsKey,
        sidebarFooterKey,
        sidebarUtilityKey,
      ].join('|'),
      moduleLabel,
      moduleSubtitle,
      moduleTitle,
      navGroups,
      sidebarActions,
      sidebarFooter,
      sidebarUtility,
      variant,
      workspaceClassName,
    }),
    [
      moduleLabel,
      moduleSubtitle,
      moduleTitle,
      navGroups,
      navGroupsKey,
      sidebarActions,
      sidebarActionsKey,
      sidebarFooter,
      sidebarFooterKey,
      sidebarUtility,
      sidebarUtilityKey,
      variant,
      workspaceClassName,
    ],
  )

  useEffect(() => {
    setSidebarConfig(shellConfig)
  }, [setSidebarConfig, shellConfig])

  useEffect(() => clearSidebarConfig, [clearSidebarConfig])

  return (
    <div className={classNames('module-shell', variant === 'erp' && 'is-erp', workspaceClassName)}>
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
  )
}

export function ModulePageHeader({ actions, description, eyebrow, title }) {
  return (
    <div className="module-page-header">
      <div className="module-page-header-copy">
        {eyebrow ? <p className="module-page-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
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
          {description ? <p>{description}</p> : null}
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
      {description ? <p>{description}</p> : null}
    </div>
  )
}
