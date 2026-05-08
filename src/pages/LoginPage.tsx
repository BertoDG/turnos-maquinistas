import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { RegisterData } from '@/contexts/AuthContext'
import { Train, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'

type Mode = 'login' | 'register' | 'pending'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('login')

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="w-20 h-20 bg-red-600 rounded-2xl flex items-center justify-center shadow-2xl mb-4">
          <Train className="w-10 h-10 text-white" strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">TurnosMaq</h1>
        <p className="text-gray-400 mt-1 text-sm">Gestión de turnos · RENFE</p>
      </div>

      {mode === 'login'    && <LoginForm    onRegister={() => setMode('register')} signIn={signIn} />}
      {mode === 'register' && <RegisterForm onBack={() => setMode('login')} signUp={signUp} onSuccess={() => setMode('pending')} />}
      {mode === 'pending'  && <PendingCard  onBack={() => setMode('login')} />}

      <p className="text-gray-600 text-xs mt-8">TurnosMaq v0.1 · No oficial · Uso interno</p>
    </div>
  )
}

// ── LoginForm ────────────────────────────────────────────────

function LoginForm({ onRegister, signIn }: {
  onRegister: () => void
  signIn: (v: string, p: string) => Promise<{ error: string | null }>
}) {
  const [value,    setValue]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim() || !password) return
    setLoading(true)
    setError(null)
    const { error: err } = await signIn(value.trim(), password)
    if (err) { setError(err); setLoading(false) }
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Bienvenido</h2>
      <p className="text-gray-500 text-sm mb-6">Accede con tu email o número de matrícula</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="value" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email o matrícula
          </label>
          <input
            id="value"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="tu@email.com o 123456"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-base
              focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
              placeholder:text-gray-400 transition-all"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-base
                focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                placeholder:text-gray-400 transition-all"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !value.trim() || !password}
          className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed
            text-white font-semibold py-3.5 px-6 rounded-xl transition-colors
            flex items-center justify-center gap-2 text-base shadow-lg shadow-red-600/30 mt-2"
        >
          {loading
            ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Entrando...</>
            : 'Entrar'
          }
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-gray-100 text-center">
        <p className="text-sm text-gray-500">¿Aún no tienes cuenta?</p>
        <button
          onClick={onRegister}
          className="mt-1.5 text-sm font-semibold text-red-600 hover:text-red-700 transition-colors"
        >
          Solicitar acceso
        </button>
      </div>
    </div>
  )
}

// ── RegisterForm ─────────────────────────────────────────────

const INPUT_CLASS = `w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-base
  focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
  placeholder:text-gray-400 transition-all disabled:opacity-50`

function RegisterForm({ onBack, signUp, onSuccess }: {
  onBack:    () => void
  signUp:    (data: RegisterData) => Promise<{ error: string | null }>
  onSuccess: () => void
}) {
  const [matricula,     setMatricula]     = useState('')
  const [email,         setEmail]         = useState('')
  const [nombre,        setNombre]        = useState('')
  const [apellidos,     setApellidos]     = useState('')
  const [telefono,      setTelefono]      = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [password,      setPassword]      = useState('')
  const [confirm,       setConfirm]       = useState('')
  const [showPass,      setShowPass]      = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)

  const canSubmit = matricula.trim() && email.trim() && nombre.trim() && apellidos.trim() && password && confirm

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!canSubmit) return
    if (!email.includes('@') || !email.includes('.')) {
      setError('Introduce un email válido.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const { error: err } = await signUp({
      matricula,
      email,
      nombre,
      apellidos,
      password,
      telefono:      telefono.trim() || undefined,
      observaciones: observaciones.trim() || undefined,
    })
    setLoading(false)

    if (err) { setError(err); return }
    onSuccess()
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 -ml-1 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver
      </button>

      <h2 className="text-xl font-semibold text-gray-900 mb-1">Solicitar acceso</h2>
      <p className="text-gray-500 text-sm mb-6">
        Rellena tus datos. Un administrador activará tu cuenta.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Matrícula */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Matrícula <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            placeholder="Ej: 123456"
            className={INPUT_CLASS}
            disabled={loading}
          />
          <p className="text-xs text-gray-400 mt-1">Será tu nombre de usuario para iniciar sesión</p>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className={INPUT_CLASS}
            disabled={loading}
          />
          <p className="text-xs text-gray-400 mt-1">Para recuperar tu contraseña si la olvidas</p>
        </div>

        {/* Nombre y Apellidos */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoComplete="given-name"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Juan"
              className={INPUT_CLASS}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Apellidos <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoComplete="family-name"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              placeholder="García López"
              className={INPUT_CLASS}
              disabled={loading}
            />
          </div>
        </div>

        {/* Teléfono (opcional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Teléfono <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="tel"
            autoComplete="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="612 345 678"
            className={INPUT_CLASS}
            disabled={loading}
          />
        </div>

        {/* Contraseña */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Contraseña <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className={INPUT_CLASS + ' pr-12'}
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Repite la contraseña <span className="text-red-500">*</span>
          </label>
          <input
            type={showPass ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className={INPUT_CLASS}
            disabled={loading}
          />
        </div>

        {/* Observaciones (opcional, solo admin las verá) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Observaciones <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            rows={2}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Cualquier aclaración para el administrador…"
            className={INPUT_CLASS + ' resize-none'}
            disabled={loading}
          />
          <p className="text-xs text-gray-400 mt-1">Solo visible para el administrador</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed
            text-white font-semibold py-3.5 px-6 rounded-xl transition-colors
            flex items-center justify-center gap-2 text-base shadow-lg shadow-red-600/30 mt-2"
        >
          {loading
            ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Enviando...</>
            : 'Solicitar acceso'
          }
        </button>
      </form>
    </div>
  )
}

// ── PendingCard ───────────────────────────────────────────────

function PendingCard({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-2">Solicitud enviada</h2>
      <p className="text-sm text-gray-500 mb-6">
        Tu cuenta está pendiente de activación. Un administrador la revisará y te dará acceso en breve.
      </p>
      <button
        onClick={onBack}
        className="w-full py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600
          hover:bg-gray-50 transition-colors"
      >
        Volver al inicio
      </button>
    </div>
  )
}
