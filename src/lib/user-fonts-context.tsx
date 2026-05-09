'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type UserFont = {
  id: string
  family_name: string
  url: string
}

type UserFontsCtx = {
  fonts: UserFont[]
  loading: boolean
  reload: () => Promise<void>
  removeFont: (id: string) => Promise<void>
}

const UserFontsContext = createContext<UserFontsCtx>({
  fonts: [],
  loading: false,
  reload: async () => {},
  removeFont: async () => {},
})

export function injectFontFace(familyName: string, url: string) {
  if (typeof document === 'undefined') return
  const id = `uf-${familyName.replace(/[^a-z0-9]/gi, '-')}`
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `@font-face { font-family: "${familyName}"; src: url("${url}"); font-display: swap; }`
  document.head.appendChild(style)
}

export function UserFontsProvider({ children }: { children: React.ReactNode }) {
  const [fonts, setFonts] = useState<UserFont[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('user_fonts')
      .select('id, family_name, url')
      .order('created_at', { ascending: false })
    const list = (data ?? []) as UserFont[]
    list.forEach((f) => injectFontFace(f.family_name, f.url))
    setFonts(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const removeFont = useCallback(async (id: string) => {
    const supabase = createClient()
    await supabase.from('user_fonts').delete().eq('id', id)
    setFonts((prev) => prev.filter((f) => f.id !== id))
  }, [])

  return (
    <UserFontsContext.Provider value={{ fonts, loading, reload, removeFont }}>
      {children}
    </UserFontsContext.Provider>
  )
}

export function useUserFonts() {
  return useContext(UserFontsContext)
}
