import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { ColorPrefsProvider } from '@/contexts/ColorPrefsContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Layout from '@/components/layout/Layout'
import LoginPage from '@/pages/LoginPage'
import CalendarPage from '@/pages/CalendarPage'
import ColleaguesPage from '@/pages/ColleaguesPage'
import SearchPage from '@/pages/SearchPage'
import SwapsPage from '@/pages/SwapsPage'
import AdminPage from '@/pages/admin/AdminPage'
import UploadPage from '@/pages/admin/UploadPage'
import UsersPage from '@/pages/admin/UsersPage'
import ProfilePage from '@/pages/ProfilePage'


function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isActive, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Pendiente de activación por el admin
  if (!profile || !isActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Cuenta pendiente</h2>
          <p className="text-sm text-gray-500 mb-6">
            Tu solicitud está siendo revisada. Un administrador la activará en breve.
          </p>
          <button onClick={signOut}
            className="w-full py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  // Cuenta activa pero perfil sin completar: el usuario debe rellenar sus datos
  if (!profile.nombre) {
    return <CompleteProfileScreen />
  }

  return <>{children}</>
}

// ── Pantalla de completar perfil (primera vez tras activación) ──

function CompleteProfileScreen() {
  const { user, refreshProfile, signOut } = useAuth()
  const [nombre,    setNombre]    = useState('')
  const [apellidos, setApellidos] = useState('')
  const [matricula, setMatricula] = useState('')
  const [depot,     setDepot]     = useState('')
  const [telefono,  setTelefono]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || !apellidos.trim() || !matricula.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({
        nombre:    nombre.trim(),
        apellidos: apellidos.trim(),
        matricula: matricula.trim(),
        depot:     depot.trim()    || null,
        telefono:  telefono.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user!.id)
    setSaving(false)
    if (err) { setError('Error al guardar. Inténtalo de nuevo.'); return }
    await refreshProfile()
  }

  const inputCls = `w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-base
    focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400`

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
        <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center mb-5">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Completa tu perfil</h2>
        <p className="text-sm text-gray-500 mb-6">Rellena tus datos para empezar a usar la app.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nombre <span className="text-red-500">*</span></label>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Carlos" className={inputCls} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Apellidos <span className="text-red-500">*</span></label>
              <input value={apellidos} onChange={e => setApellidos(e.target.value)}
                placeholder="Ej: García" className={inputCls} required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Nº de matrícula <span className="text-red-500">*</span></label>
            <input value={matricula} onChange={e => setMatricula(e.target.value)}
              placeholder="Ej: 87654" inputMode="numeric" className={inputCls} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Depósito</label>
            <input value={depot} onChange={e => setDepot(e.target.value)}
              placeholder="Ej: GIJON, LEON, MADRID" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Teléfono</label>
            <input value={telefono} onChange={e => setTelefono(e.target.value)}
              placeholder="Ej: 600 123 456" type="tel" className={inputCls} />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>
          )}

          <button type="submit" disabled={saving || !nombre.trim() || !apellidos.trim() || !matricula.trim()}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold
              py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-600/30">
            {saving
              ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</>
              : 'Entrar a la app'
            }
          </button>
        </form>

        <button onClick={signOut} className="w-full mt-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  // PrivateRoute ya garantiza que loading=false cuando se llega aquí.
  // Solo verificamos isAdmin y envolvemos con ErrorBoundary para capturar
  // cualquier error de renderizado y mostrarlo en lugar de pantalla en blanco.
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/" replace />
  return <ErrorBoundary>{children}</ErrorBoundary>
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        {/* Layout maneja CalendarPage y DayDetailPage internamente (siempre montados) */}
        <Route index element={null} />
        <Route path="dia/:dateStr" element={null} />
        <Route path="buscar" element={<SearchPage />} />
        <Route path="companeros" element={<ColleaguesPage />} />
        <Route path="companeros/:maquinistaId" element={<CalendarPage />} />
        <Route path="cambios" element={<SwapsPage />} />
        <Route path="notificaciones" element={<Navigate to="/cambios" replace />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <AdminPage />
            </AdminRoute>
          }
        />
        <Route
          path="admin/subir"
          element={
            <AdminRoute>
              <UploadPage />
            </AdminRoute>
          }
        />
        <Route
          path="admin/usuarios"
          element={
            <AdminRoute>
              <UsersPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ColorPrefsProvider>
          <AppRoutes />
        </ColorPrefsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
