import { createContext, useContext, useState, useEffect } from 'react'
import { initLiff } from '../lib/liff'
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
    try {
      const isDev = window.location.hostname === 'localhost'

      let profile
      if (isDev) {
        profile = { lineUserId: 'dev-user', displayName: 'DEV mode', pictureUrl: '' }
      } else {
        profile = await initLiff()
        if (!profile) return // redirecting to login
      }
      setLineProfile(profile)

      // Try to find employee linked to this LINE userId
      try {
        const { data: emp } = await supabase
          .from('employees')
          .select('*')
          .eq('line_user_id', profile.lineUserId)
          .eq('status', '在職')
          .single()

        if (emp) {
          setEmployee(emp)
        }
      } catch (dbErr) {
        // Column might not exist yet or no match — that's OK
        console.log('Employee lookup:', dbErr?.message || dbErr)
      }

      // DEV fallback
      if (!employee && isDev) {
        const { data } = await supabase
          .from('employees')
          .select('*')
          .eq('status', '在職')
          .limit(1)
          .single()
        if (data) {
          setEmployee(data)
          setLineProfile(prev => ({ ...prev, displayName: data.name }))
        }
      }
    } catch (err) {
      console.error('Init error:', err)
      if (window.location.hostname === 'localhost') {
        try {
          const { data } = await supabase
            .from('employees')
            .select('*')
            .eq('status', '在職')
            .limit(1)
            .single()
          setEmployee(data)
          setLineProfile({ lineUserId: 'dev', displayName: data?.name || 'DEV', pictureUrl: '' })
        } catch (e) { /* ignore */ }
      }
      // Don't set error — let App.jsx show the binding screen with LINE userId
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ lineProfile, employee, loading, error }}>
      {children}
    </AuthContext.Provider>
  )
}
