import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { login, loginErrorMessage, TOKEN_KEY } from '../services/auth'
import type { User } from '../services/auth'
import '../styles/login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [message, setMessage] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const submitting = useRef(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const normalizedEmail = email.trim()
    const nextErrors: typeof errors = {}
    if (!normalizedEmail) nextErrors.email = 'Escribe tu correo electrónico.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) nextErrors.email = 'Escribe un correo electrónico válido.'
    if (!password) nextErrors.password = 'Escribe tu contraseña.'
    setErrors(nextErrors)
    setMessage('')
    if (nextErrors.email || nextErrors.password) {
      if (nextErrors.email) emailInput.current?.focus()
      else passwordInput.current?.focus()
      return
    }
    submitting.current = true
    setLoading(true)
    try {
      sessionStorage.removeItem(TOKEN_KEY)
      const result = await login(normalizedEmail, password)
      try {
        sessionStorage.setItem(TOKEN_KEY, result.token)
      } catch {
        setMessage('Permite el almacenamiento de sesión en tu navegador para iniciar sesión.')
        return
      }
      setUser(result.user)
      setPassword('')
      setShowPassword(false)
    } catch (error) {
      setMessage(loginErrorMessage(error))
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <span className="login-mark" aria-hidden="true">↗</span>
        <p className="login-eyebrow">BIENVENIDO</p>
        <h1 id="login-title">Inicia sesión</h1>
        <p className="login-description">Accede con tu correo y contraseña.</p>
        {user ? (
          <div className="login-success" role="status">
            <strong>Autenticación exitosa</strong>
            <p>Bienvenido, {user.name}.</p>
            <p>{user.email}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate aria-busy={loading}>
            <div className="login-field">
              <label htmlFor="email">Correo electrónico</label>
              <input id="email" ref={emailInput} name="email" type="email"
                autoComplete="username" required value={email} disabled={loading}
                placeholder="nombre@ejemplo.com" onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} />
              {errors.email && <p className="field-error" id="email-error">{errors.email}</p>}
            </div>
            <div className="login-field">
              <label htmlFor="password">Contraseña</label>
              <div className="password-field">
                <input id="password" ref={passwordInput} name="password"
                  type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  required value={password} disabled={loading}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} />
                <button type="button" className="password-toggle" disabled={loading}
                  aria-controls="password" aria-pressed={showPassword}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword((visible) => !visible)}>
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {errors.password && <p className="field-error" id="password-error">{errors.password}</p>}
            </div>
            {message && <p className="login-error" role="alert">{message}</p>}
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>
            <p className="login-status" role="status">{loading ? 'Verificando tus credenciales…' : ''}</p>
          </form>
        )}
      </section>
    </main>
  )
}
