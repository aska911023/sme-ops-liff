import { useState } from 'react'
import { ArrowLeft, Search, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const LEVEL_COLORS = {
  '一般': { bg: 'var(--glass)', color: 'var(--t2)' },
  '銀級': { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
  '金級': { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  '鑽石級': { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
}

export default function MemberLookup() {
  const nav = useNavigate()
  const [query, setQuery] = useState('')
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    const q = query.trim()
    const { data } = await supabase.from('members').select('*')
      .or(`phone.eq.${q},member_number.eq.${q},name.ilike.%${q}%`)
      .limit(1).maybeSingle()
    setMember(data)
    setLoading(false)
  }

  const lv = LEVEL_COLORS[member?.level] || LEVEL_COLORS['一般']

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/crm')}>
        <ArrowLeft size={18} /> <span>會員查詢</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="input" type="text" placeholder="電話/會員編號/姓名"
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          style={{ flex: 1 }} />
        <button className="btn-primary" onClick={handleSearch} disabled={loading}>
          <Search size={16} />
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>搜尋中...</div>}

      {member && (
        <div className="card-item">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: lv.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Star size={22} style={{ color: lv.color }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{member.name}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>{member.phone} · {member.member_number}</div>
            </div>
            <span style={{
              padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: lv.bg, color: lv.color,
            }}>{member.level || '一般'}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="stat-mini">
              <div className="stat-mini-label">可用點數</div>
              <div className="stat-mini-value" style={{ color: 'var(--cyan)' }}>{member.available_points?.toLocaleString() || 0}</div>
            </div>
            <div className="stat-mini">
              <div className="stat-mini-label">累計消費</div>
              <div className="stat-mini-value" style={{ color: 'var(--green)' }}>${member.total_spent?.toLocaleString() || 0}</div>
            </div>
            <div className="stat-mini">
              <div className="stat-mini-label">造訪次數</div>
              <div className="stat-mini-value">{member.visit_count || 0}</div>
            </div>
            <div className="stat-mini">
              <div className="stat-mini-label">最後造訪</div>
              <div className="stat-mini-value" style={{ fontSize: 12 }}>{member.last_visit?.slice(0, 10) || '—'}</div>
            </div>
          </div>
        </div>
      )}

      {!loading && !member && query && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>查無此會員</div>
      )}
    </div>
  )
}
