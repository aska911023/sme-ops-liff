import { useState, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_STYLE = {
  '待出庫': { bg: 'var(--orange-dim)', color: 'var(--orange)' },
  '運送中': { bg: 'var(--blue-dim)', color: 'var(--blue)' },
  '已入庫': { bg: 'var(--green-dim)', color: 'var(--green)' },
  '已取消': { bg: 'var(--glass)', color: 'var(--t3)' },
}

export default function Transfers() {
  const nav = useNavigate()
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('warehouse_transfers').select('*')
      .order('requested_date', { ascending: false }).limit(20)
      .then(({ data }) => { setTransfers(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const updateStatus = async (id, status) => {
    const update = { status }
    if (status === '運送中') update.shipped_date = new Date().toISOString().slice(0, 10)
    if (status === '已入庫') update.received_date = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('warehouse_transfers').update(update).eq('id', id).select().single()
    if (data) setTransfers(prev => prev.map(t => t.id === id ? data : t))
  }

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/wms')}>
        <ArrowLeft size={18} /> <span>調撥作業</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>載入中...</div>
      ) : transfers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>無調撥紀錄</div>
      ) : (
        transfers.map(t => {
          const s = STATUS_STYLE[t.status] || STATUS_STYLE['待出庫']
          const items = t.items || []
          const nextAction = t.status === '待出庫' ? { label: '確認出庫', next: '運送中' }
            : t.status === '運送中' ? { label: '確認入庫', next: '已入庫' } : null

          return (
            <div key={t.id} className="card-item" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>#{t.transfer_number}</div>
                  <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                    {t.from_warehouse_id} → {t.to_warehouse_id}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>申請: {t.requested_by} · {t.requested_date}</div>
                </div>
                <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color }}>{t.status}</span>
              </div>

              {items.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>
                  {items.map((i, idx) => `${i.name || i.sku_code} ×${i.qty}`).join('、')}
                </div>
              )}

              {nextAction && (
                <button onClick={() => updateStatus(t.id, nextAction.next)} style={{
                  width: '100%', padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'var(--cyan-dim)', color: 'var(--cyan)', fontSize: 13, fontWeight: 700,
                }}>{nextAction.label}</button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
