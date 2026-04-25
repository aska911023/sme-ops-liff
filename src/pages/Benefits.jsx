import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 把 leave code 翻成人話
const LEAVE_LABEL = {
  annual: '特休',
  sick: '病假',
  personal: '事假',
  marriage: '婚假',
  bereavement: '喪假',
  maternity: '產假',
  paternity: '陪產假',
  menstrual: '生理假',
  family: '家庭照顧假',
  official: '公假',
  injury: '公傷假',
}

const BONUS_LABEL = {
  attendance_bonus: '全勤獎金',
  sales_commission: '業績獎金',
  performance: '績效獎金',
  longevity: '年資獎金',
  referral: '推薦獎金',
  holiday: '節慶獎金',
  birthday: '生日獎金',
}

const SCOPE_COLOR = {
  '個人': { bg: 'rgba(167,139,250,0.15)', color: 'var(--purple)' },
  '門市': { bg: 'var(--cyan-dim)', color: 'var(--cyan)' },
  '全公司': { bg: 'var(--green-dim)', color: 'var(--green)' },
}

function describeLeave(cfg) {
  if (!cfg) return '—'
  const parts = []
  if (cfg.extra_days) parts.push(`額外 ${cfg.extra_days} 天`)
  if (cfg.extra_hours) parts.push(`額外 ${cfg.extra_hours} 小時`)
  if (cfg.description) parts.push(cfg.description)
  return parts.length ? parts.join(' · ') : '依預設規則'
}

function describeBonus(cfg) {
  if (!cfg) return '—'
  if (cfg.type === 'fixed') {
    return `固定 NT$ ${cfg.amount?.toLocaleString() || 0}${cfg.period === 'monthly' ? ' / 月' : cfg.period === 'yearly' ? ' / 年' : ''}`
  }
  if (cfg.type === 'percent') {
    return `${cfg.base || '業績'}的 ${(cfg.rate * 100).toFixed(1)}%${cfg.cap ? `（上限 NT$ ${cfg.cap.toLocaleString()}）` : ''}`
  }
  if (cfg.type === 'milestone' && Array.isArray(cfg.tiers)) {
    return cfg.tiers.map(t => `達 ${t.target?.toLocaleString()} → NT$ ${t.reward?.toLocaleString()}`).join('；')
  }
  return cfg.description || JSON.stringify(cfg)
}

export default function Benefits() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [leave, setLeave] = useState([])
  const [bonus, setBonus] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_get_my_benefits', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data, error: err }) => {
        if (err || !data?.ok) { setError(data?.error || err?.message || '載入失敗'); return }
        setLeave(Array.isArray(data.leave) ? data.leave : [])
        setBonus(Array.isArray(data.bonus) ? data.bonus : [])
      })
      .finally(() => setLoading(false))
  }, [lineProfile])

  if (loading) {
    return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>
  }
  if (error) {
    return (
      <div className="page">
        <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
        <div className="empty"><div style={{ color: 'var(--red)', fontSize: 14 }}>😵 {error}</div></div>
      </div>
    )
  }

  const renderItem = (item, isLeave) => {
    const label = (isLeave ? LEAVE_LABEL : BONUS_LABEL)[item.code] || item.code
    const desc = isLeave ? describeLeave(item.config) : describeBonus(item.config)
    const sc = SCOPE_COLOR[item.scope] || SCOPE_COLOR['全公司']
    return (
      <div key={`${item.code}-${item.scope}`} style={{
        padding: '14px 16px', marginBottom: 8, borderRadius: 14,
        background: 'var(--card)', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{label}</div>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 999,
            background: sc.bg, color: sc.color, fontWeight: 700,
          }}>
            {item.scope}加碼
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>
          {desc}
        </div>
        {item.notes && (
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6, fontStyle: 'italic' }}>
            📌 {item.notes}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🎁 我的福利</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
          目前對你生效的福利政策
        </div>
      </div>

      {/* 假別福利 */}
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--cyan)', margin: '8px 4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>🏖️</span> 假別福利
        <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 500, marginLeft: 'auto' }}>{leave.length} 項加碼</span>
      </div>
      {leave.length === 0 ? (
        <div style={{
          padding: 16, marginBottom: 16, borderRadius: 12,
          background: 'var(--card)', border: '1px dashed var(--border2)',
          fontSize: 12, color: 'var(--t3)', textAlign: 'center',
        }}>
          目前沒有額外的假別福利，依公司預設規則辦理
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {leave.map(item => renderItem(item, true))}
        </div>
      )}

      {/* 獎金福利 */}
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--orange)', margin: '8px 4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>💰</span> 獎金 / 津貼
        <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 500, marginLeft: 'auto' }}>{bonus.length} 項</span>
      </div>
      {bonus.length === 0 ? (
        <div style={{
          padding: 16, marginBottom: 16, borderRadius: 12,
          background: 'var(--card)', border: '1px dashed var(--border2)',
          fontSize: 12, color: 'var(--t3)', textAlign: 'center',
        }}>
          目前沒有額外的獎金 / 津貼項目
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {bonus.map(item => renderItem(item, false))}
        </div>
      )}

      <div style={{
        marginTop: 16, padding: '12px 14px', borderRadius: 10,
        background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)',
        fontSize: 11, color: 'var(--t3)', lineHeight: 1.6,
      }}>
        💡 <b style={{ color: 'var(--cyan)' }}>個人加碼</b> {'>'} <b style={{ color: 'var(--cyan)' }}>門市加碼</b> {'>'} <b style={{ color: 'var(--cyan)' }}>全公司預設</b>。
        若同一項目在多層級都有設定，以最具體的為準。
      </div>
    </div>
  )
}
