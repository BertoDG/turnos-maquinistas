import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isActive: boolean
  signIn: (emailOrMatricula: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    try {
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 5000)
      )

      const result = await Promise.race([profilePromise, timeoutPromise])
      if (result && 'data' in result && result.data) {
        setProfile(result.data as Profile)
      }
    } catch (err) {
      console.warn('[Auth] loadProfile falló:', err)
    }
  }

  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      console.warn('[Auth] Timeout de seguridad activado')
      setLoading(false)
    }, 6000)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      clearTimeout(safetyTimeout)

      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setSession(null); setUser(null); setProfile(null)
        setLoading(false)
        return
      }

      if (event === 'TOKEN_REFRESH_FAILED') {
        console.warn('[Auth] Token refresh fallido, cerrando sesión')
        await supabase.auth.signOut()
        setSession(null); setUser(null); setProfile(null)
        setLoading(false)
        return
      }

      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        await loadProfile(session.user.id)
      } else {
        setProfile(null)
      }

      setLoading(false)
    })

    return () => { clearTimeout(safetyTimeout); subscription.unsubscribe() }
  }, [])

  /**
   * Inicia sesión con email real o con número de matrícula.
   * Si el valor contiene '@' se usa como email; si no, se construye
   * el email interno: matricula@turnosmaq.internal
   */
  async function signIn(emailOrMatricula: string, password: string): Promise<{ error: string | null }> {
    try {
      const email = emailOrMatricula.includes('@')
        ? emailOrMatricula.trim()
        : `${emailOrMatricula.trim().toLowerCase()}@turnosmaq.internal`

      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Email o contraseña incorrectos' }
        }
        if (error.message.includes('Email not confirmed')) {
          return { error: 'Confirma tu email antes de acceder.' }
        }
        return { error: error.message }
      }

      return { error: null }
    } catch {
      return { error: 'Error de conexión. Comprueba tu red e inténtalo de nuevo.' }
    }
  }

  /**
   * Registra un nuevo usuario con email y contraseña.
   * El perfil se crea con activo=false hasta que el admin lo active.
   */
  async function signUp(email: string, password: string): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password })

      if (error) {
        if (error.message.includes('already registered')) {
          return { error: 'Este email ya está registrado. Prueba a iniciar sesión.' }
        }
        if (error.message.includes('Password should be')) {
          return { error: 'La contraseña debe tener al menos 6 caracteres.' }
        }
        return { error: error.message }
      }

      // Cerramos la sesión que Supabase crea automáticamente al registrarse
      // (cuando "Confirm email" está deshabilitado en Supabase).
      // El usuario debe esperar la activación del admin antes de acceder.
      await supabase.auth.signOut()

      return { error: null }
    } catch {
      return { error: 'Error de conexión. Comprueba tu red e inténtalo de nuevo.' }
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id)
  }

  const isAdmin  = profile?.role === 'admin' || profile?.role === 'superadmin'
  const isActive = profile?.activo ?? false

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, isAdmin, isActive, signIn, signUp, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
