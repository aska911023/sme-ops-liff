import { useState, useEffect } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

export default function Inbound() {
  const nav = useNavigate()
  const { employee } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    supabase.from('inbound_orders').select('*, inbound_items(*)')
      .in('status', ['待到貨', '收貨中'])
      .order('expected_date')
      .then(({ data }) => { setOrders(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleReceiveItem = async (orderId, itemId, qty) => {
    await supabase.from('inbound_items').update({ received_qty: qty, status: '已收貨' }).eq('id', itemId)
    // Refresh
    const { data } = await supabase.from('inbound_orders').select('*, inbound_items(*)').eq('id', orderId).single()
    if (data) setOrders(prev => prev.map(o => o.id === orderId ? data : o))
  }

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/wms')}>
        <ArrowLeft size={18} /> <span>收貨作業</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>載入中...</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>目前無待收貨訂單</div>
      ) : (
        orders.map(o => (
          <div key={o.id} className="card-item" style={{ marginBottom: 10 }}>
            <div onClick={() => setExpandedId(expandedId === o.id ? null : o.id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>PO#{o.po_number}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{o.supplier} · 預計 {o.expected_date}</div>
                </div>
                <span style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                  background: o.status === '收貨中' ? 'var(--cyan-dim)' : 'var(--orange-dim)',
                  color: o.status === '收貨中' ? 'var(--cyan)' : 'var(--orange)',
                }}>{o.status}</span>
              </div>
            </div>

            {expandedId === o.id && o.inbound_items && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                {o.inbound_items.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.sku_name || item.sku_id}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>訂 {item.ordered_qty} / 收 {item.received_qty || 0}</div>
                    </div>
                    {(item.received_qty || 0) < item.ordered_qty ? (
                      <button className="btn-sm" onClick={() => handleReceiveItem(o.id, item.id, item.ordered_qty)}
                        style={{ background: 'var(--green-dim)', color: 'var(--green)', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        <Check size={12} /> 全收
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>✓ 已收</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
