import { useState, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Returns() {
  const nav = useNavigate()
  const [returns, setReturns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('returns').select('*')
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => { setReturns(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/sales')}>
        <ArrowLeft size={18} /> <span>退貨處理</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>載入中...</div>
      ) : returns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>無退貨紀錄</div>
      ) : (
        returns.map(r => (
          <div key={r.id} className="card-item" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>#{r.return_number}</div>
                <div style={{ fontSize: 12, color: 'var(--t2)' }}>{r.customer} · 原單 {r.original_order}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>{r.reason} · {r.refund_method}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: 'var(--red)' }}>-${r.total_refund?.toLocaleString() || 0}</div>
                <span style={{
                  padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: r.status === '已完成' ? 'var(--green-dim)' : 'var(--orange-dim)',
                  color: r.status === '已完成' ? 'var(--green)' : 'var(--orange)',
                }}>{r.status}</span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
