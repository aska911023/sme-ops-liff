import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [lineProfile, setLineProfile] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const isDev = window.location.hostname === 'localhost'

    // Step 1: LIFF init
    let profile = null
    try {
      if (isDev) {
        profile = { lineUserId: 'dev-user', displayName: 'DEV mode', pictureUrl: '' }
      } else {
        const liff = (await import('@line/liff')).default
        await liff.init({ liffId: import.meta.env.VITE_LIFF_ID || '' })

        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }

        const p = await liff.getProfile()
        profile = { lineUserId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl }
      }
    } catch (e) {
      console.error('LIFF init failed:', e)
      setError(`LIFF 錯誤: ${e.message || e}`)
      setLoading(false)
      return
    }

    setLineProfile(profile)

    // Step 2: Find employee
    try {
      const { data: emp, error: dbErr } = await supabase
        .from('employees')
        .select('*')
        .eq('line_user_id', profile.lineUserId)
        .eq('status', '在職')
        .maybeSingle()

      if (emp) {
        setEmployee(emp)
      }
    } catch (e) {
      console.log('DB lookup error (ok):', e)
    }

    // DEV fallback
    if (isDev && !employee) {
      try {
        const { data } = await supabase
          .from('employees')
          .select('*')
          .eq('status', '在職')
          .limit(1)
          .single()
        if (data) {
          setEmployee(data)
          profile.displayName = data.name
          setLineProfile({ ...profile })
        }
      } catch (e) { /* ignore */ }
    }

    setLoading(false)
  }

  return (
    <AuthContext.Provider value={{ lineProfile, employee, loading, error }}>
      {children}
    </AuthContext.Provider>
  )
}
