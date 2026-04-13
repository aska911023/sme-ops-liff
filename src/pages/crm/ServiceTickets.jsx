import { useState, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const STATUS_STYLE = {
  '待處理': { bg: 'var(--orange-dim)', color: 'var(--orange)' },
  '處理中': { bg: 'var(--cyan-dim)', color: 'var(--cyan)' },
  '待客戶回覆': { bg: 'var(--purple-dim)', color: 'var(--purple)' },
  '已解決': { bg: 'var(--green-dim)', color: 'var(--green)' },
  '已關閉': { bg: 'var(--glass)', color: 'var(--t3)' },
}

export default function ServiceTickets() {
  const nav = useNavigate()
  const { employee } = useAuth()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('service_tickets').select('*')
      .or(`assigned_to.eq.${employee?.name},assigned_to.is.null`)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => { setTickets(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [employee])

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/crm')}>
        <ArrowLeft size={18} /> <span>客服工單</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>載入中...</div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>目前無工單</div>
      ) : (
        tickets.map(t => {
          const s = STATUS_STYLE[t.status] || STATUS_STYLE['待處理']
          return (
            <div key={t.id} className="card-item" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.customer_name || '未知客戶'}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>#{t.ticket_number} · {t.type}</div>
                </div>
                <span style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                  background: s.bg, color: s.color,
                }}>{t.status}</span>
              </div>
              {t.description && (
                <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5, marginBottom: 6 }}>
                  {t.description?.slice(0, 80)}{t.description?.length > 80 ? '...' : ''}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--t3)' }}>
                <span>{t.channel}</span>
                <span>{t.priority}</span>
                <span>{t.created_at?.slice(0, 10)}</span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
