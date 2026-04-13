import { useState, useEffect } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

export default function StockCount() {
  const nav = useNavigate()
  const { employee } = useAuth()
  const [counts, setCounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [sku, setSku] = useState('')
  const [qty, setQty] = useState('')
  const [items, setItems] = useState([])

  useEffect(() => {
    supabase.from('stock_counts').select('*')
      .order('count_date', { ascending: false }).limit(10)
      .then(({ data }) => { setCounts(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const addItem = () => {
    if (!sku || !qty) return
    setItems(prev => [...prev, { sku_code: sku, count: parseInt(qty) }])
    setSku(''); setQty('')
  }

  const handleSubmit = async () => {
    if (items.length === 0) return
    const { data, error } = await supabase.from('stock_counts').insert({
      count_date: new Date().toISOString().slice(0, 10),
      counter: employee?.name,
      warehouse: employee?.store || '',
      items,
      total_items: items.reduce((s, i) => s + i.count, 0),
      status: '盤點中',
    }).select().single()
    if (data) setCounts(prev => [data, ...prev])
    if (error) alert('建立失敗: ' + error.message)
    setItems([]); setShowNew(false)
  }

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/wms')}>
        <ArrowLeft size={18} /> <span>盤點作業</span>
      </div>

      <button onClick={() => setShowNew(!showNew)} style={{
        width: '100%', padding: 10, borderRadius: 10, border: '1px dashed var(--cyan)',
        background: 'var(--cyan-dim)', color: 'var(--cyan)', fontSize: 13, fontWeight: 700,
        cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}><Plus size={16} /> 新增盤點</button>

      {showNew && (
        <div className="card-item" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>盤點項目</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input className="input" placeholder="SKU/條碼" value={sku} onChange={e => setSku(e.target.value)} style={{ flex: 2 }} />
            <input className="input" type="number" placeholder="數量" value={qty} onChange={e => setQty(e.target.value)} style={{ flex: 1 }} />
            <button onClick={addItem} className="btn-primary" style={{ padding: '8px 12px' }}>加入</button>
          </div>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
              <span>{it.sku_code}</span><span style={{ fontWeight: 700 }}>×{it.count}</span>
            </div>
          ))}
          {items.length > 0 && (
            <button onClick={handleSubmit} style={{
              width: '100%', marginTop: 10, padding: 10, borderRadius: 8, border: 'none',
              background: 'var(--green-dim)', color: 'var(--green)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>送出盤點 ({items.length} 品項)</button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>載入中...</div>
      ) : (
        counts.map(c => (
          <div key={c.id} className="card-item" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.count_date} · {c.warehouse}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>盤點員: {c.counter} · {c.total_items} 件</div>
              </div>
              <span style={{
                padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                background: c.status === '已完成' ? 'var(--green-dim)' : 'var(--orange-dim)',
                color: c.status === '已完成' ? 'var(--green)' : 'var(--orange)',
              }}>{c.status}</span>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
