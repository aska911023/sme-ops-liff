import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)

// localStorage 快取：重開 LIFF 時先用快取秀畫面，背景再驗證更新
// 避免每次都要等 liff.init() (1-3s) + getProfile + RPC 才能渲染
const CACHE_KEY = 'liff:auth:v1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000  // 24 小時

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj?.profile?.lineUserId || !obj?.employee?.id) return null
    if (obj.expiresAt && obj.expiresAt < Date.now()) return null
    return obj
  } catch { return null }
}
function writeCache(profile, employee) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      profile, employee, expiresAt: Date.now() + CACHE_TTL_MS,
    }))
  } catch { /* quota exceeded etc., 忽略 */ }
}
function clearCache() {
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}

export function AuthProvider({ children }) {
  const [lineProfile, setLineProfile] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // ── Step 0: 嘗試用快取「立即」渲染（前次成功登入過就有）──
    const cached = readCache()
    if (cached) {
      setLineProfile(cached.profile)
      setEmployee(cached.employee)
      setLoading(false)  // 👈 app 馬上渲染，不等網路
    }

    // ── 不管有沒有快取，都背景跑真實 init 確保資料正確 ──
    init(cached)
  }, [])

  async function init(cached) {
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
          clearCache()
          liff.login()
          return
        }

        const p = await liff.getProfile()
        profile = { lineUserId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl }
      }
    } catch (e) {
      console.error('LIFF init failed:', e)
      // 沒有快取才顯示錯誤；有快取的話讓 user 繼續用快取畫面
      if (!cached) {
        setError(`LIFF 錯誤: ${e.message || e}`)
        setLoading(false)
      }
      return
    }

    // 同一個 LINE user，快取還是新鮮的 → 沿用快取，不重打 employee RPC
    // （快取裡的 employee 還可能稍微舊但通常不會影響體驗）
    if (cached?.profile?.lineUserId === profile.lineUserId) {
      setLineProfile(profile)  // 更新 displayName 等可能變的欄位
      return
    }

    // 換人或無快取 → 重抓 employee
    if (cached) clearCache()  // 清舊的
    setLineProfile(profile)

    try {
      const { data: emp, error: rpcErr } = await supabase
        .rpc('liff_get_employee_by_line_user', { p_line_user_id: profile.lineUserId })

      if (rpcErr) console.error('RPC error:', rpcErr)
      if (emp) {
        setEmployee(emp)
        writeCache(profile, emp)
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
          writeCache(profile, data)
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
