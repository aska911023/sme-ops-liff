import { useState, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Quotations() {
  const nav = useNavigate()
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('quotations').select('*')
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { setQuotes(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const STATUS_STYLE = {
    '草稿': { bg: 'var(--glass)', color: 'var(--t3)' },
    '已送出': { bg: 'var(--blue-dim)', color: 'var(--blue)' },
    '已成交': { bg: 'var(--green-dim)', color: 'var(--green)' },
    '已失效': { bg: 'var(--red-dim)', color: 'var(--red)' },
  }

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/sales')}>
        <ArrowLeft size={18} /> <span>報價單</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>載入中...</div>
      ) : quotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>無報價單</div>
      ) : (
        quotes.map(q => {
          const s = STATUS_STYLE[q.status] || STATUS_STYLE['草稿']
          return (
            <div key={q.id} className="card-item" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>#{q.quote_number}</div>
                  <div style={{ fontSize: 12, color: 'var(--t2)' }}>{q.customer}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                    有效至 {q.valid_until || '—'} · v{q.version || 1}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: 'var(--cyan)' }}>${q.total?.toLocaleString() || 0}</div>
                  <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color }}>{q.status}</span>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
