import { useState, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

export default function Commission() {
  const nav = useNavigate()
  const { employee } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!employee) return
    supabase.from('commission_records').select('*')
      .eq('salesperson', employee.name)
      .order('period', { ascending: false })
      .limit(20)
      .then(({ data }) => { setRecords(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [employee])

  const totalPending = records.filter(r => r.status === '待發放').reduce((s, r) => s + (r.commission_amount || 0), 0)
  const totalPaid = records.filter(r => r.status === '已發放').reduce((s, r) => s + (r.commission_amount || 0), 0)

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/sales')}>
        <ArrowLeft size={18} /> <span>佣金查詢</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div className="stat-mini">
          <div className="stat-mini-label">待發放</div>
          <div className="stat-mini-value" style={{ color: 'var(--orange)' }}>${totalPending.toLocaleString()}</div>
        </div>
        <div className="stat-mini">
          <div className="stat-mini-label">已發放</div>
          <div className="stat-mini-value" style={{ color: 'var(--green)' }}>${totalPaid.toLocaleString()}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>載入中...</div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>無佣金紀錄</div>
      ) : (
        records.map(r => (
          <div key={r.id} className="card-item" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>訂單 #{r.order_id}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  {r.period} · 訂單額 ${r.order_amount?.toLocaleString() || 0} · {r.commission_rate}%
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--cyan)' }}>${r.commission_amount?.toLocaleString() || 0}</div>
                <span style={{
                  padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                  background: r.status === '已發放' ? 'var(--green-dim)' : 'var(--orange-dim)',
                  color: r.status === '已發放' ? 'var(--green)' : 'var(--orange)',
                }}>{r.status}</span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
