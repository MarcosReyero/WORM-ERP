import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchProfile, updateProfile } from '../../lib/api.js'
import {
  ModulePageHeader,
  ModuleSurface,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'

function buildForm(item) {
  return {
    first_name: item?.first_name || '',
    last_name: item?.last_name || '',
    email: item?.email || '',
    phone: item?.phone || '',
    preferred_theme: item?.preferred_theme || 'light',
  }
}

export function ProfileDetailsPage() {
  const { refreshSession, setWorkspaceTheme, theme, user } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState(user)
  const [form, setForm] = useState(buildForm(user))
  const [feedback, setFeedback] = useState({ error: '', success: '' })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || '')
  const [clearAvatar, setClearAvatar] = useState(false)

  useEffect(() => {
    let active = true

    async function loadProfile() {
      try {
        const response = await fetchProfile()
        if (!active) {
          return
        }

        setProfile(response.item)
        setForm(buildForm(response.item))
        setAvatarPreview(response.item.avatar_url || '')
        setLoading(false)
      } catch (error) {
        if (!active) {
          return
        }
        setFeedback({
          error: error.message || 'No se pudo cargar el perfil.',
          success: '',
        })
        setLoading(false)
      }
    }

    loadProfile()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!avatarFile) {
      return undefined
    }

    const nextPreview = URL.createObjectURL(avatarFile)
    setAvatarPreview(nextPreview)

    return () => {
      URL.revokeObjectURL(nextPreview)
    }
  }, [avatarFile])

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setFeedback({ error: '', success: '' })

    try {
      let payload
      if (avatarFile || clearAvatar) {
        payload = new FormData()
        Object.entries(form).forEach(([key, value]) => {
          payload.append(key, value)
        })
        if (avatarFile) {
          payload.append('avatar', avatarFile)
        }
        if (clearAvatar) {
          payload.append('clear_avatar', 'true')
        }
      } else {
        payload = { ...form }
      }

      const response = await updateProfile(payload)
      setProfile(response.item)
      setForm(buildForm(response.item))
      setAvatarFile(null)
      setClearAvatar(false)
      setAvatarPreview(response.item.avatar_url || '')
      await setWorkspaceTheme(response.item.preferred_theme, { persist: false })
      await refreshSession()
      setFeedback({
        error: '',
        success: 'Perfil actualizado.',
      })
    } catch (error) {
      setFeedback({
        error: error.message || 'No se pudo actualizar el perfil.',
        success: '',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="module-empty-state">
        <strong>Cargando perfil</strong>
        <p>Preparando datos personales y preferencias.</p>
      </div>
    )
  }

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        description="Datos personales, avatar y preferencias persistidas para esta cuenta."
        eyebrow="Perfil"
        title="Mi perfil"
      />

      <PanelMessage error={feedback.error} success={feedback.success} />

      <section className="profile-page-grid">
        <ModuleSurface
          className="profile-main-surface"
          description="Actualiza la ficha visible en el sistema interno."
          title="Datos personales"
        >
          <form className="ops-form profile-form" onSubmit={handleSubmit}>
            <div className="field-grid">
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
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setForm(buildForm(profile))
                  setAvatarFile(null)
                  setClearAvatar(false)
                  setAvatarPreview(profile?.avatar_url || '')
                  void setWorkspaceTheme(profile?.preferred_theme || theme, { persist: false })
                }}
                type="button"
              >
                Restablecer
              </button>
            </div>
          </form>
        </ModuleSurface>

        <aside className="profile-side-stack">
          <ModuleSurface
            description="Imagen de perfil usada en la mensajeria y en el navbar."
            title="Avatar"
          >
            <div className="profile-avatar-card">
              <div className="profile-avatar-frame">
                {avatarPreview ? (
                  <img alt={profile?.full_name || 'Perfil'} src={avatarPreview} />
                ) : (
                  <span>{(profile?.full_name || profile?.username || '?').slice(0, 1).toUpperCase()}</span>
                )}
              </div>

              <div className="profile-avatar-actions">
                <label className="secondary-button">
                  Subir imagen
                  <input
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="visually-hidden"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] || null
                      setAvatarFile(nextFile)
                      setClearAvatar(false)
                      if (!nextFile) {
                        setAvatarPreview(profile?.avatar_url || '')
                      }
                    }}
                    type="file"
                  />
                </label>
                <button
                  className="ghost-link"
                  onClick={() => {
                    setAvatarFile(null)
                    setClearAvatar(true)
                    setAvatarPreview('')
                  }}
                  type="button"
                >
                  Quitar imagen
                </button>
              </div>
            </div>
          </ModuleSurface>

          <ModuleSurface
            description="Informacion operativa visible para otros perfiles."
            title="Cuenta"
          >
            <div className="record-meta-grid">
              <div>
                <span>Usuario</span>
                <strong>{profile?.username}</strong>
              </div>
              <div>
                <span>Rol</span>
                <strong>{profile?.role_label}</strong>
              </div>
              <div>
                <span>Sector</span>
                <strong>{profile?.sector_default || '-'}</strong>
              </div>
              <div>
                <span>Estado</span>
                <strong>{profile?.status_label}</strong>
              </div>
            </div>
          </ModuleSurface>

          <ModuleSurface
            description="Actividad basica asociada a esta sesion."
            title="Actividad reciente"
          >
            <div className="record-meta-grid">
              <div>
                <span>Ultimo acceso</span>
                <strong>{profile?.last_access ? new Date(profile.last_access).toLocaleString() : '-'}</strong>
              </div>
              <div>
                <span>No leidos</span>
                <strong>{profile?.unread_messages_count || 0}</strong>
              </div>
              <div>
                <span>Alarmas abiertas</span>
                <strong>{profile?.open_alarm_count || 0}</strong>
              </div>
              <div>
                <span>Tema activo</span>
                <strong>{theme === 'dark' ? 'Oscuro' : 'Claro'}</strong>
              </div>
            </div>
          </ModuleSurface>
        </aside>
      </section>
    </div>
  )
}
