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
      // DEV mode: skip LIFF in localhost
      const isDev = window.location.hostname === 'localhost'

      let profile
      if (isDev) {
        profile = { lineUserId: 'dev-user', displayName: 'DEV mode', pictureUrl: '' }
      } else {
        profile = await initLiff()
        if (!profile) return // redirecting to login
      }
      setLineProfile(profile)

      // Find employee linked to this LINE userId
      const { data: emp } = await supabase
        .from('employees')
        .select('*')
        .eq('line_user_id', profile.lineUserId)
        .eq('status', '在職')
        .single()

      if (emp) {
        setEmployee(emp)
      } else if (isDev) {
        // DEV fallback: use first active employee
        const { data } = await supabase
          .from('employees')
          .select('*')
          .eq('status', '在職')
          .limit(1)
          .single()
        setEmployee(data)
      } else {
        setError('找不到您的員工帳號，請聯繫管理員綁定 LINE 帳號。')
      }
    } catch (err) {
      console.error('Init error:', err)
      // Fallback for environments without LIFF
      if (window.location.hostname === 'localhost') {
        const { data } = await supabase
          .from('employees')
          .select('*')
          .eq('status', '在職')
          .limit(1)
          .single()
        setEmployee(data)
        setLineProfile({ lineUserId: 'dev', displayName: data?.name || 'DEV', pictureUrl: '' })
      } else {
        setError('初始化失敗，請稍後再試。')
      }
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
