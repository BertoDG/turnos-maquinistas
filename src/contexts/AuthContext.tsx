import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export interface RegisterData {
  matricula:     string
  email:         string
  nombre:        string
  apellidos:     string
  password:      string
  telefono?:     string
  observaciones?: string
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isActive: boolean
  signIn: (emailOrMatricula: string, password: string) => Promise<{ error: string | null }>
  signUp: (data: RegisterData) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const initializedRef = useRef(false)

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
    let cancelled = false

    // ── Inicialización: getSession() maneja el refresh del token antes de resolver ──
    // Esto evita el flash de la pantalla de login cuando el token está caducado
    // pero es renovable (Supabase lo renueva internamente en getSession).
    async function init() {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession()
        if (cancelled) return

        setSession(initialSession)
        setUser(initialSession?.user ?? null)

        if (initialSession?.user) {
          await loadProfile(initialSession.user.id)
        }
      } catch (err) {
        console.warn('[Auth] init falló:', err)
      } finally {
        if (!cancelled) {
          setLoading(false)
          initializedRef.current = true
        }
      }
    }

    init()

    // ── Cambios posteriores (sign in, sign out, token refresh…) ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // Ignorar el INITIAL_SESSION: ya lo gestionamos con getSession() arriba
      if (event === 'INITIAL_SESSION') return
      if (cancelled) return

      if (event === 'SIGNED_OUT' || (event as string) === 'USER_DELETED') {
        setSession(null); setUser(null); setProfile(null)
        return
      }

      if ((event as string) === 'TOKEN_REFRESH_FAILED') {
        console.warn('[Auth] Token refresh fallido, cerrando sesión')
        await supabase.auth.signOut()
        setSession(null); setUser(null); setProfile(null)
        return
      }

      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED…
      setSession(newSession)
      setUser(newSession?.user ?? null)

      if (newSession?.user) {
        await loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  /**
   * Inicia sesión con email real o con número de matrícula.
   */
  async function signIn(emailOrMatricula: string, password: string): Promise<{ error: string | null }> {
    try {
      let email: string
      if (emailOrMatricula.includes('@')) {
        email = emailOrMatricula.trim().toLowerCase()
      } else {
        const matricula = emailOrMatricula.trim().toLowerCase()
        const { data } = await supabase.rpc('get_email_by_matricula', { p_matricula: matricula })
        email = data ?? `${matricula}@turnosmaq.app`
      }

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
   * Registra un nuevo usuario con matrícula como identificador.
   * El perfil se crea con activo=false hasta que el admin lo active.
   */
  async function signUp(data: RegisterData): Promise<{ error: string | null }> {
    try {
      const email = data.email.trim().toLowerCase()

      const { error } = await supabase.auth.signUp({
        email,
        password: data.password,
        options: {
          data: {
            matricula:     data.matricula.trim(),
            nombre:        data.nombre.trim(),
            apellidos:     data.apellidos.trim(),
            telefono:      data.telefono?.trim() || null,
            observaciones: data.observaciones?.trim() || null,
          },
        },
      })

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('already been registered')) {
          return { error: 'Esta matrícula ya está registrada. Contacta con el administrador.' }
        }
        if (error.message.includes('Password should be')) {
          return { error: 'La contraseña debe tener al menos 6 caracteres.' }
        }
        return { error: error.message }
      }

      // Cerrar la sesión automática que crea Supabase al registrarse.
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
