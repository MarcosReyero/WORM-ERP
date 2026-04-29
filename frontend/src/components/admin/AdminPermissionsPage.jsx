import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  fetchAdminPermissionsMeta,
  fetchAdminRolePermissions,
  fetchAdminUserPermissions,
  fetchAdminProfiles,
  saveAdminRolePermissions,
  saveAdminUserPermissions,
} from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'

const HUB_PERMISSION_GROUPS = [
  {
    key: 'inventario',
    title: 'Inventario',
    moduleCodes: [
      'inventory_overview',
      'stock_management',
      'movements',
      'checkouts',
      'counts',
      'discrepancies',
      'alarms',
    ],
  },
  {
    key: 'compras',
    title: 'Compras',
    moduleCodes: ['purchasing'],
  },
  {
    key: 'depositos',
    title: 'Depositos',
    moduleCodes: [
      'deposits_overview',
      'pallet_registry',
      'deposit_layout',
      'pallet_scans',
    ],
  },
  {
    key: 'personal',
    title: 'Personal',
    moduleCodes: ['personal', 'reports'],
  },
  {
    key: 'tia',
    title: 'TIA',
    moduleCodes: ['tia'],
  },
  {
    key: 'administracion',
    title: 'Administracion',
    moduleCodes: ['admin_users', 'settings'],
  },
]

function normalizeSet(values = []) {
  return new Set((values || []).map(String))
}

function buildRoleMatrix(modules = [], actions = [], rolePermissions = []) {
  const byModule = new Map(rolePermissions.map((entry) => [entry.module, normalizeSet(entry.actions)]))
  return modules.map((module) => ({
    module,
    allowed: byModule.get(module.code) || new Set(),
    actions,
  }))
}

function buildUserMatrix(modules = [], actions = [], userPermissions = []) {
  const byModule = new Map(userPermissions.map((entry) => [entry.module, { ...entry, actions: normalizeSet(entry.actions) }]))
  return modules.map((module) => ({
    module,
    override: byModule.get(module.code) || null,
    actions,
  }))
}

export function AdminPermissionsPage() {
  const { refreshSession, refreshWorkspace, user } = useOutletContext()
  const [metaState, setMetaState] = useState({ loading: true, error: '', data: null })
  const [profilesState, setProfilesState] = useState({ loading: true, error: '', items: [] })
  const [roleState, setRoleState] = useState({ loading: false, error: '', items: [] })
  const [userState, setUserState] = useState({ loading: false, error: '', item: null })
  const [feedback, setFeedback] = useState({ error: '', success: '' })
  const [busy, setBusy] = useState('')

  const [selectedRole, setSelectedRole] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [inheritRole, setInheritRole] = useState(true)
  const [roleDraft, setRoleDraft] = useState({})
  const [userDraft, setUserDraft] = useState({})
  const [sectorDraft, setSectorDraft] = useState({})

  useEffect(() => {
    let active = true

    async function loadMeta() {
      try {
        const [meta, profiles] = await Promise.all([fetchAdminPermissionsMeta(), fetchAdminProfiles()])
        if (!active) {
          return
        }
        setMetaState({ loading: false, error: '', data: meta })
        setProfilesState({ loading: false, error: '', items: profiles.items || [] })
        const firstRole = meta.roles?.[0]?.value || ''
        const firstUserId = String((profiles.items || [])[0]?.id || '')
        setSelectedRole(firstRole)
        setSelectedUserId(firstUserId)
      } catch (error) {
        if (!active) {
          return
        }
        setMetaState({ loading: false, error: error.message || 'No se pudo cargar permisos.', data: null })
        setProfilesState({ loading: false, error: error.message || 'No se pudieron cargar usuarios.', items: [] })
      }
    }

    loadMeta()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!metaState.data || !selectedRole) {
      return undefined
    }
    let active = true
    setRoleState({ loading: true, error: '', items: [] })
    setFeedback({ error: '', success: '' })

    fetchAdminRolePermissions(selectedRole)
      .then((response) => {
        if (!active) return
        setRoleState({ loading: false, error: '', items: response.items || [] })
      })
      .catch((error) => {
        if (!active) return
        setRoleState({ loading: false, error: error.message || 'No se pudo cargar el rol.', items: [] })
      })

    return () => {
      active = false
    }
  }, [metaState.data, selectedRole])

  useEffect(() => {
    if (!metaState.data || !selectedUserId) {
      return undefined
    }
    let active = true
    setUserState({ loading: true, error: '', item: null })
    setFeedback({ error: '', success: '' })

    fetchAdminUserPermissions(selectedUserId)
      .then((response) => {
        if (!active) return
        setUserState({ loading: false, error: '', item: response.item })
      })
      .catch((error) => {
        if (!active) return
        setUserState({ loading: false, error: error.message || 'No se pudo cargar el usuario.', item: null })
      })

    return () => {
      active = false
    }
  }, [metaState.data, selectedUserId])

  const modules = useMemo(() => metaState.data?.modules || [], [metaState.data])
  const actions = useMemo(() => metaState.data?.actions || [], [metaState.data])
  const modulesByCode = useMemo(() => new Map(modules.map((item) => [item.code, item])), [modules])

  const roleMatrix = useMemo(
    () => buildRoleMatrix(modules, actions, roleState.items),
    [actions, modules, roleState.items],
  )

  const userMatrix = useMemo(
    () => buildUserMatrix(modules, actions, userState.item?.module_permissions || []),
    [actions, modules, userState.item?.module_permissions],
  )

  useEffect(() => {
    if (!roleMatrix.length) return
    const next = {}
    roleMatrix.forEach((row) => {
      next[row.module.code] = new Set(row.allowed)
    })
    setRoleDraft(next)
  }, [selectedRole, roleMatrix])

  useEffect(() => {
    if (!userState.item) return
    setInheritRole(Boolean(userState.item.inherit_role_permissions))

    const nextUserDraft = {}
    userMatrix.forEach((row) => {
      if (!row.override) return
      nextUserDraft[row.module.code] = {
        allow: Boolean(row.override.allow),
        actions: new Set(row.override.actions),
      }
    })
    setUserDraft(nextUserDraft)

    const nextSectorDraft = {}
    ;(userState.item.sector_permissions || []).forEach((entry) => {
      nextSectorDraft[String(entry.sector_id)] = {
        can_view: Boolean(entry.can_view),
        can_edit: Boolean(entry.can_edit),
        can_delete: Boolean(entry.can_delete),
      }
    })
    setSectorDraft(nextSectorDraft)
  }, [userMatrix, userState.item])

  function toggleRoleAction(moduleCode, actionCode) {
    setRoleDraft((current) => {
      const next = { ...current }
      const set = new Set(next[moduleCode] || [])
      if (set.has(actionCode)) {
        set.delete(actionCode)
      } else {
        set.add(actionCode)
      }
      next[moduleCode] = set
      return next
    })
  }

  function allowedCountForGroup(group) {
    return group.moduleCodes.reduce((acc, moduleCode) => acc + (roleDraft[moduleCode]?.size || 0), 0)
  }

  function ensureUserOverride(moduleCode) {
    setUserDraft((current) => {
      if (current[moduleCode]) return current
      return {
        ...current,
        [moduleCode]: { allow: true, actions: new Set() },
      }
    })
  }

  function toggleUserAction(moduleCode, actionCode) {
    ensureUserOverride(moduleCode)
    setUserDraft((current) => {
      const next = { ...current }
      const entry = next[moduleCode] || { allow: true, actions: new Set() }
      const actionsSet = new Set(entry.actions || [])
      if (actionsSet.has(actionCode)) {
        actionsSet.delete(actionCode)
      } else {
        actionsSet.add(actionCode)
      }
      next[moduleCode] = { ...entry, actions: actionsSet }
      return next
    })
  }

  function toggleUserAllow(moduleCode) {
    ensureUserOverride(moduleCode)
    setUserDraft((current) => {
      const next = { ...current }
      const entry = next[moduleCode] || { allow: true, actions: new Set() }
      next[moduleCode] = { ...entry, allow: !entry.allow }
      return next
    })
  }

  function updateSectorField(sectorId, field) {
    setSectorDraft((current) => {
      const key = String(sectorId)
      const existing = current[key] || { can_view: false, can_edit: false, can_delete: false }
      return {
        ...current,
        [key]: { ...existing, [field]: !existing[field] },
      }
    })
  }

  async function handleSaveRole() {
    if (!selectedRole) return
    setBusy('save-role')
    setFeedback({ error: '', success: '' })

    try {
      const items = modules.map((module) => ({
        module: module.code,
        actions: Array.from(roleDraft[module.code] || []),
      }))
      await saveAdminRolePermissions(selectedRole, { items })
      const refreshed = await fetchAdminRolePermissions(selectedRole)
      setRoleState({ loading: false, error: '', items: refreshed.items || [] })
      setFeedback({ error: '', success: 'Permisos de rol guardados.' })
      if (refreshSession) {
        refreshSession().catch(() => null)
      }
      if (refreshWorkspace) {
        refreshWorkspace().catch(() => null)
      }
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudieron guardar.', success: '' })
    } finally {
      setBusy('')
    }
  }

  async function handleSaveUser() {
    if (!selectedUserId) return
    setBusy('save-user')
    setFeedback({ error: '', success: '' })

    try {
      const modulePermissions = Object.entries(userDraft).map(([module, entry]) => ({
        module,
        allow: Boolean(entry.allow),
        actions: Array.from(entry.actions || []),
      }))
      const sectorPermissions = Object.entries(sectorDraft).map(([sector_id, entry]) => ({
        sector_id,
        can_view: Boolean(entry.can_view),
        can_edit: Boolean(entry.can_edit),
        can_delete: Boolean(entry.can_delete),
      }))

      await saveAdminUserPermissions(selectedUserId, {
        inherit_role_permissions: inheritRole,
        module_permissions: modulePermissions,
        sector_permissions: sectorPermissions,
      })
      const refreshed = await fetchAdminUserPermissions(selectedUserId)
      setUserState({ loading: false, error: '', item: refreshed.item })
      setFeedback({ error: '', success: 'Permisos de usuario guardados.' })
      if (refreshSession) {
        refreshSession().catch(() => null)
      }
      if (refreshWorkspace) {
        refreshWorkspace().catch(() => null)
      }
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudieron guardar.', success: '' })
    } finally {
      setBusy('')
    }
  }

  if (!user?.is_admin) {
    return <ModuleEmptyState title="Acceso restringido" description="Solo el administrador puede gestionar permisos." />
  }

  if (metaState.loading) {
    return <ModuleEmptyState title="Cargando permisos" />
  }

  if (metaState.error || !metaState.data) {
    return <div className="form-error">{metaState.error || 'No se pudo cargar permisos.'}</div>
  }

  const roles = metaState.data.roles || []
  const sectors = metaState.data.sectors || []

  return (
    <div className="module-page-stack">
      <ModulePageHeader eyebrow="Administracion / Permisos" title="Permisos" />
      <PanelMessage error={feedback.error} success={feedback.success} />

      <section className="module-page-grid">
        <div className="module-main-stack">
          <ModuleTableSection
            actions={
              <>
                <Link className="ghost-link" to="/administracion/guia-roles">
                  Guia de roles
                </Link>
                <button
                  className="secondary-button"
                  disabled={busy === 'save-role' || roleState.loading}
                  onClick={() => void handleSaveRole()}
                  type="button"
                >
                  {busy === 'save-role' ? 'Guardando...' : 'Guardar rol'}
                </button>
              </>
            }
            title="Permisos por rol"
            toolbar={
              <div className="module-toolbar">
                <label>
                  Rol
                  <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>
                    {roles.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            }
          >
            {roleState.loading ? (
              <p className="module-empty-copy">Cargando rol...</p>
            ) : (
              <div className="permissions-accordion-stack">
                {HUB_PERMISSION_GROUPS.map((group) => (
                  <details className="permissions-accordion" key={group.key} open>
                    <summary className="permissions-accordion-summary">
                      <span className="permissions-accordion-title">{group.title}</span>
                      <span className="module-chip is-muted">{allowedCountForGroup(group)} permisos</span>
                    </summary>

                    <div className="permissions-accordion-body">
                      {group.moduleCodes.map((moduleCode) => {
                        const module = modulesByCode.get(moduleCode)
                        if (!module) {
                          return (
                            <div className="permissions-module-row is-missing" key={moduleCode}>
                              <div className="permissions-module-head">
                                <strong>{moduleCode}</strong>
                                <span className="module-empty-copy">No existe en catálogo</span>
                              </div>
                            </div>
                          )
                        }

                        const allowedSet = roleDraft[module.code] || new Set()

                        return (
                          <div className="permissions-module-row" key={module.code}>
                            <div className="permissions-module-head">
                              <strong>{module.name}</strong>
                              <span className="permissions-module-code">{module.code}</span>
                            </div>
                            <div className="permissions-actions">
                              {actions.map((action) => (
                                <label className="permissions-action" key={`${module.code}-${action.code}`}>
                                  <input
                                    checked={allowedSet.has(action.code)}
                                    onChange={() => toggleRoleAction(module.code, action.code)}
                                    type="checkbox"
                                  />
                                  <span>{action.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </ModuleTableSection>
        </div>

        <aside className="module-side-stack">
          <ModuleSurface
            title="Permisos por usuario"
            actions={
              <button
                className="secondary-button"
                disabled={busy === 'save-user' || userState.loading}
                onClick={() => void handleSaveUser()}
                type="button"
              >
                {busy === 'save-user' ? 'Guardando...' : 'Guardar usuario'}
              </button>
            }
          >
            {profilesState.error ? <div className="form-error">{profilesState.error}</div> : null}

            <div className="ops-form">
              <label>
                Usuario
                <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                  {(profilesState.items || []).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.username} · {profile.role_label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="checkbox-row">
                <input checked={inheritRole} onChange={(event) => setInheritRole(event.target.checked)} type="checkbox" />
                Hereda permisos del rol
              </label>

              <p className="module-empty-copy">
                Los permisos de sectores no habilitan módulos; solo limitan qué sectores puede operar el usuario dentro del inventario.
              </p>
            </div>

            {userState.loading ? (
              <p className="module-empty-copy">Cargando usuario...</p>
            ) : userState.error ? (
              <div className="form-error">{userState.error}</div>
            ) : (
              <>
                <ModuleSurface title="Modulos">
                  <div className="module-table-wrap">
                    <table className="module-table">
                      <thead>
                        <tr>
                          <th>Modulo</th>
                          <th>Modo</th>
                          {actions.map((action) => (
                            <th key={action.code}>{action.code}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {modules.map((module) => {
                          const entry = userDraft[module.code]
                          const actionSet = entry?.actions || new Set()
                          return (
                            <tr key={module.code}>
                              <td>{module.name}</td>
                              <td>
                                <button className="inline-action" onClick={() => toggleUserAllow(module.code)} type="button">
                                  {entry ? (entry.allow ? 'Permite' : 'Deniega') : 'Sin override'}
                                </button>
                              </td>
                              {actions.map((action) => (
                                <td key={`${module.code}-${action.code}`}>
                                  <input
                                    checked={actionSet.has(action.code)}
                                    onChange={() => toggleUserAction(module.code, action.code)}
                                    type="checkbox"
                                  />
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </ModuleSurface>

                <ModuleSurface title="Sectores">
                  {sectors.length ? (
                    <div className="module-table-wrap">
                      <table className="module-table">
                        <thead>
                          <tr>
                            <th>Sector</th>
                            <th>Ver</th>
                            <th>Editar</th>
                            <th>Eliminar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectors.map((sector) => {
                            const key = String(sector.id)
                            const entry = sectorDraft[key] || { can_view: false, can_edit: false, can_delete: false }
                            return (
                              <tr key={sector.id}>
                                <td>{sector.name}</td>
                                <td>
                                  <input checked={entry.can_view} onChange={() => updateSectorField(sector.id, 'can_view')} type="checkbox" />
                                </td>
                                <td>
                                  <input checked={entry.can_edit} onChange={() => updateSectorField(sector.id, 'can_edit')} type="checkbox" />
                                </td>
                                <td>
                                  <input checked={entry.can_delete} onChange={() => updateSectorField(sector.id, 'can_delete')} type="checkbox" />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="module-empty-copy">Sin sectores cargados.</p>
                  )}
                </ModuleSurface>
              </>
            )}
          </ModuleSurface>
        </aside>
      </section>
    </div>
  )
}
