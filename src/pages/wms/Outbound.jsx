import { useState, useEffect } from 'react'
import { ArrowLeft, Truck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_STYLE = {
  '待揀貨': { bg: 'var(--orange-dim)', color: 'var(--orange)' },
  '揀貨中': { bg: 'var(--cyan-dim)', color: 'var(--cyan)' },
  '已複核': { bg: 'var(--blue-dim)', color: 'var(--blue)' },
  '已出貨': { bg: 'var(--green-dim)', color: 'var(--green)' },
}

export default function Outbound() {
  const nav = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('outbound_orders').select('*, outbound_items(*)')
      .in('status', ['待揀貨', '揀貨中', '已複核'])
      .order('due_date')
      .then(({ data }) => { setOrders(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const updateStatus = async (id, newStatus) => {
    const { data } = await supabase.from('outbound_orders').update({ status: newStatus }).eq('id', id).select().single()
    if (data) setOrders(prev => prev.map(o => o.id === id ? { ...o, ...data } : o))
  }

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/wms')}>
        <ArrowLeft size={18} /> <span>出貨作業</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>載入中...</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>目前無待出貨訂單</div>
      ) : (
        orders.map(o => {
          const s = STATUS_STYLE[o.status] || STATUS_STYLE['待揀貨']
          const nextAction = o.status === '待揀貨' ? { label: '開始揀貨', next: '揀貨中' }
            : o.status === '揀貨中' ? { label: '揀貨完成', next: '已複核' }
            : o.status === '已複核' ? { label: '確認出貨', next: '已出貨' } : null

          return (
            <div key={o.id} className="card-item" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>#{o.order_number}</div>
                  <div style={{ fontSize: 12, color: 'var(--t2)' }}>{o.customer}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                    <Truck size={11} style={{ verticalAlign: -1 }} /> {o.carrier || '未指定'} · 到期 {o.due_date || '—'}
                  </div>
                </div>
                <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color }}>{o.status}</span>
              </div>

              {o.outbound_items?.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>
                  {o.outbound_items.map(i => `${i.sku_name} ×${i.quantity}`).join('、')}
                </div>
              )}

              {nextAction && (
                <button onClick={() => updateStatus(o.id, nextAction.next)} style={{
                  width: '100%', padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
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
