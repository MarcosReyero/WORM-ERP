import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createAdminProfile,
  fetchAdminProfiles,
  fetchInventoryCatalogs,
  resetAdminProfilePassword,
  updateAdminProfile,
} from '../../lib/api.js'
import {
  ModuleActionPanel,
  ModuleEmptyState,
  ModulePageHeader,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'

function buildEmptyForm() {
  return {
    username: '',
    password: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    telegram_chat_id: '',
    role: 'operator',
    status: 'active',
    sector_default_id: '',
    preferred_theme: 'light',
  }
}

function buildFormFromProfile(profile) {
  return {
    username: profile?.username || '',
    password: '',
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    telegram_chat_id: profile?.telegram_chat_id || '',
    role: profile?.role || 'operator',
    status: profile?.status || 'active',
    sector_default_id: profile?.sector_default_id || '',
    preferred_theme: profile?.preferred_theme || 'light',
  }
}

function matchesProfile(profile, query) {
  if (!query) {
    return true
  }

  const target = [
    profile.username,
    profile.full_name,
    profile.email,
    profile.role_label,
    profile.sector_default,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return target.includes(query)
}

export function ProfileUsersPage({
  eyebrow = 'Perfil / Usuarios',
  title = 'Administracion de perfiles',
}) {
  const { refreshSession, searchValue, user } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profiles, setProfiles] = useState([])
  const [catalogs, setCatalogs] = useState({ roles: [], sectors: [] })
  const [form, setForm] = useState(buildEmptyForm())
  const [selectedProfileId, setSelectedProfileId] = useState(null)
  const [panelMode, setPanelMode] = useState('create')
  const [feedback, setFeedback] = useState({ error: '', success: '' })
  const [passwordResetValue, setPasswordResetValue] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)

  useEffect(() => {
    if (!user?.is_admin) {
      setLoading(false)
      return undefined
    }

    let active = true

    async function loadData() {
      try {
        const [profilesResponse, catalogsResponse] = await Promise.all([
          fetchAdminProfiles(),
          fetchInventoryCatalogs(),
        ])
        if (!active) {
          return
        }

        setProfiles(profilesResponse.items || [])
        setCatalogs({
          roles: catalogsResponse.roles || [],
          sectors: catalogsResponse.sectors || [],
        })
        setLoading(false)
      } catch (error) {
        if (!active) {
          return
        }
        setFeedback({
          error: error.message || 'No se pudo cargar la administracion de usuarios.',
          success: '',
        })
        setLoading(false)
      }
    }

    loadData()

    return () => {
      active = false
    }
  }, [user?.is_admin])

  const filteredProfiles = useMemo(() => {
    const deferredQuery = searchValue.trim().toLowerCase()
    return profiles.filter((profile) => matchesProfile(profile, deferredQuery))
  }, [profiles, searchValue])

  if (!user?.is_admin) {
    return (
      <ModuleEmptyState
        description="Solo el administrador puede gestionar otros perfiles."
        title="Acceso restringido"
      />
    )
  }

  async function reloadProfiles(nextSelectedId = selectedProfileId) {
    const response = await fetchAdminProfiles()
    setProfiles(response.items || [])
    if (nextSelectedId) {
      const matched = (response.items || []).find((item) => item.id === nextSelectedId)
      if (matched) {
        setSelectedProfileId(matched.id)
        setPanelMode('edit')
        setForm(buildFormFromProfile(matched))
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setFeedback({ error: '', success: '' })

    try {
      if (panelMode === 'create') {
        const response = await createAdminProfile(form)
        await reloadProfiles(response.item.id)
        setPanelMode('edit')
        setPasswordResetValue('')
        setFeedback({ error: '', success: 'Perfil creado.' })
      } else {
        const response = await updateAdminProfile(selectedProfileId, form)
        await reloadProfiles(response.item.id)
        setFeedback({ error: '', success: 'Perfil actualizado.' })
      }
      await refreshSession()
    } catch (error) {
      setFeedback({
        error: error.message || 'No se pudo guardar el perfil.',
        success: '',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordReset() {
    if (!selectedProfileId || !passwordResetValue.trim()) {
      return
    }

    setPasswordBusy(true)
    setFeedback({ error: '', success: '' })

    try {
      await resetAdminProfilePassword(selectedProfileId, {
        new_password: passwordResetValue,
      })
      setPasswordResetValue('')
      setFeedback({ error: '', success: 'Contrasena actualizada.' })
    } catch (error) {
      setFeedback({
        error: error.message || 'No se pudo resetear la contrasena.',
        success: '',
      })
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={
          <button
            className="secondary-button"
            onClick={() => {
              setPanelMode('create')
              setSelectedProfileId(null)
              setForm(buildEmptyForm())
              setPasswordResetValue('')
            }}
            type="button"
          >
            Nuevo usuario
          </button>
        }
        eyebrow={eyebrow}
        title={title}
      />

      <PanelMessage error={feedback.error} success={feedback.success} />

      {loading ? (
        <ModuleEmptyState
          title="Preparando administracion"
        />
      ) : (
        <section className="module-page-grid profile-admin-grid">
          <div className="module-main-stack">
            <ModuleTableSection
              title="Perfiles"
            >
              {filteredProfiles.length ? (
                <div className="module-table-wrap">
                  <table className="module-table">
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th>Sector</th>
                        <th>Ultimo acceso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProfiles.map((profile) => (
                        <tr
                          className={profile.id === selectedProfileId ? 'is-selected-row' : ''}
                          key={profile.id}
                          onClick={() => {
                            setSelectedProfileId(profile.id)
                            setPanelMode('edit')
                            setForm(buildFormFromProfile(profile))
                            setPasswordResetValue('')
                          }}
                        >
                          <td>
                            <div className="module-table-item">
                              <strong>{profile.full_name}</strong>
                              <span>{profile.username}</span>
                            </div>
                          </td>
                          <td>{profile.role_label}</td>
                          <td>{profile.status_label}</td>
                          <td>{profile.sector_default || '-'}</td>
                          <td>{profile.last_access ? new Date(profile.last_access).toLocaleString() : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <ModuleEmptyState
                  description="No hay perfiles que coincidan con el filtro actual."
                  title="Sin resultados"
                />
              )}
            </ModuleTableSection>
          </div>

          <aside className="module-side-stack">
            <ModuleActionPanel
              description={
                panelMode === 'create'
                  ? 'Alta rapida de un nuevo perfil.'
                  : 'Edicion de datos, rol y estado.'
              }
              title={panelMode === 'create' ? 'Nuevo perfil' : 'Editar perfil'}
            >
              <form className="ops-form profile-admin-form" onSubmit={handleSubmit}>
                <div className="field-grid">
                  <label>
                    Usuario
                    <input
                      onChange={(event) =>
                        setForm((current) => ({ ...current, username: event.target.value }))
                      }
                      required
                      type="text"
                      value={form.username}
                    />
                  </label>
                  <label>
                    Contrasena {panelMode === 'create' ? '' : '(solo alta)'}
                    <input
                      disabled={panelMode !== 'create'}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, password: event.target.value }))
                      }
                      required={panelMode === 'create'}
                      type="password"
                      value={form.password}
                    />
                  </label>
                  <label>
                    Nombre
                    <input
                      onChange={(event) =>
                        setForm((current) => ({ ...current, first_name: event.target.value }))
                      }
                      type="text"
                      value={form.first_name}
                    />
                  </label>
                  <label>
                    Apellido
                    <input
                      onChange={(event) =>
                        setForm((current) => ({ ...current, last_name: event.target.value }))
                      }
                      type="text"
                      value={form.last_name}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      onChange={(event) =>
                        setForm((current) => ({ ...current, email: event.target.value }))
                      }
                      type="email"
                      value={form.email}
                    />
                  </label>
                  <label>
                    Telefono
                    <input
                      onChange={(event) =>
                        setForm((current) => ({ ...current, phone: event.target.value }))
                      }
                      type="text"
                      value={form.phone}
                    />
                  </label>
                  <label>
                    Telegram Chat ID
                    <input
                      onChange={(event) =>
                        setForm((current) => ({ ...current, telegram_chat_id: event.target.value }))
                      }
                      placeholder="Opcional"
                      type="text"
                      value={form.telegram_chat_id}
                    />
                  </label>
                  <label>
                    Rol
                    <select
                      onChange={(event) =>
                        setForm((current) => ({ ...current, role: event.target.value }))
                      }
                      value={form.role}
                    >
                      {catalogs.roles.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Estado
                    <select
                      onChange={(event) =>
                        setForm((current) => ({ ...current, status: event.target.value }))
                      }
                      value={form.status}
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </label>
                  <label>
                    Sector
                    <select
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          sector_default_id: event.target.value,
                        }))
                      }
                      value={form.sector_default_id}
                    >
                      <option value="">Sin sector</option>
                      {catalogs.sectors.map((sector) => (
                        <option key={sector.id} value={sector.id}>
                          {sector.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tema preferido
                    <select
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          preferred_theme: event.target.value,
                        }))
                      }
                      value={form.preferred_theme}
                    >
                      <option value="light">Claro</option>
                      <option value="dark">Oscuro</option>
                    </select>
                  </label>
                </div>

                <div className="profile-form-actions">
                  <button className="primary-button" disabled={saving} type="submit">
                    {saving
                      ? 'Guardando...'
                      : panelMode === 'create'
                        ? 'Crear perfil'
                        : 'Guardar cambios'}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      if (panelMode === 'edit') {
                        const selectedProfile = profiles.find((item) => item.id === selectedProfileId)
                        setForm(buildFormFromProfile(selectedProfile))
                      } else {
                        setForm(buildEmptyForm())
                      }
                    }}
                    type="button"
                  >
                    Restablecer
                  </button>
                </div>
              </form>
            </ModuleActionPanel>

            {panelMode === 'edit' && selectedProfileId ? (
              <ModuleActionPanel
                title="Reset de contrasena"
              >
                <div className="ops-form">
                  <label>
                    Nueva contrasena
                    <input
                      onChange={(event) => setPasswordResetValue(event.target.value)}
                      type="password"
                      value={passwordResetValue}
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={passwordBusy || !passwordResetValue.trim()}
                    onClick={() => {
                      void handlePasswordReset()
                    }}
                    type="button"
                  >
                    {passwordBusy ? 'Actualizando...' : 'Resetear contrasena'}
                  </button>
                </div>
              </ModuleActionPanel>
            ) : null}
          </aside>
        </section>
      )}
    </div>
  )
}
