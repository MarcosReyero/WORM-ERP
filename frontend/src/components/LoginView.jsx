import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function LoginView({ onLogin }) {
  const navigate = useNavigate()
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await onLogin(credentials)
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function updateField(event) {
    const { name, value } = event.target
    setCredentials((current) => ({
      ...current,
      [name]: value,
    }))
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <section className="login-copy">
          <h1>WORM</h1>
        </section>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form-header">
            <div>
              <span className="workspace-caption">Acceso al sistema</span>
              <h2>Iniciar sesion</h2>
            </div>
            <span className="brand-mark">W</span>
          </div>

          <label htmlFor="username">
            Usuario
            <input
              id="username"
              name="username"
              onChange={updateField}
              placeholder="admin"
              value={credentials.username}
            />
          </label>

          <label htmlFor="password">
            Contrasena
            <input
              id="password"
              name="password"
              onChange={updateField}
              placeholder="admin1234"
              type="password"
              value={credentials.password}
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? 'Ingresando...' : 'Entrar al panel'}
          </button>

          <p className="login-demo">Demo inicial: usuario `admin` y clave `admin1234`.</p>
        </form>
      </div>
    </div>
  )
}
