import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { mergePrefs, DEFAULT_COLOR_PREFS } from '@/lib/colorPrefs'
import type { ColorPrefs } from '@/lib/colorPrefs'

interface ColorPrefsContextValue {
  prefs:     ColorPrefs
  savePrefs: (next: ColorPrefs) => Promise<void>
  resetPrefs: () => Promise<void>
}

const ColorPrefsContext = createContext<ColorPrefsContextValue>({
  prefs:      DEFAULT_COLOR_PREFS,
  savePrefs:  async () => {},
  resetPrefs: async () => {},
})

export function ColorPrefsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  const [prefs, setPrefs] = useState<ColorPrefs>(DEFAULT_COLOR_PREFS)

  // Cargar preferencias del perfil cuando el usuario esté disponible
  useEffect(() => {
    if (!profile) { setPrefs(DEFAULT_COLOR_PREFS); return }

    supabase
      .from('profiles')
      .select('color_prefs')
      .eq('id', profile.id)
      .single()
      .then(({ data }) => {
        setPrefs(mergePrefs(data?.color_prefs as Partial<ColorPrefs> | null))
      })
  }, [profile?.id])

  const savePrefs = useCallback(async (next: ColorPrefs) => {
    if (!profile) return
    setPrefs(next)   // optimistic update
    await supabase
      .from('profiles')
      .update({ color_prefs: next })
      .eq('id', profile.id)
  }, [profile?.id])

  const resetPrefs = useCallback(async () => {
    await savePrefs(DEFAULT_COLOR_PREFS)
  }, [savePrefs])

  return (
    <ColorPrefsContext.Provider value={{ prefs, savePrefs, resetPrefs }}>
      {children}
    </ColorPrefsContext.Provider>
  )
}

export function useColorPrefs() {
  return useContext(ColorPrefsContext)
}
