import { useState, useEffect } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Orders() {
  const nav = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('sales_orders').select('*')
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { setOrders(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = orders.filter(o =>
    !search || o.order_number?.includes(search) || o.customer?.includes(search)
  )

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/sales')}>
        <ArrowLeft size={18} /> <span>訂單查詢</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="input" placeholder="搜尋訂單號/客戶" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>載入中...</div>
      ) : (
        filtered.map(o => (
          <div key={o.id} className="card-item" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>#{o.order_number}</div>
                <div style={{ fontSize: 12, color: 'var(--t2)' }}>{o.customer}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{o.created_at?.slice(0, 10)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--green)' }}>${o.total?.toLocaleString() || 0}</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <span style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                    background: o.payment_status === '已付款' ? 'var(--green-dim)' : 'var(--orange-dim)',
                    color: o.payment_status === '已付款' ? 'var(--green)' : 'var(--orange)',
                  }}>{o.payment_status || '未付款'}</span>
                  <span style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                    background: o.shipping_status === '已出貨' ? 'var(--green-dim)' : 'var(--cyan-dim)',
                    color: o.shipping_status === '已出貨' ? 'var(--green)' : 'var(--cyan)',
                  }}>{o.shipping_status || '待出貨'}</span>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
