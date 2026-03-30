import { useState, useEffect } from 'react'
import { ChevronLeft, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function InventoryPage() {
  const navigate = useNavigate()
  const [stocks, setStocks] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [whFilter, setWhFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('stock_levels').select('*').order('sku_name'),
      supabase.from('warehouses').select('*').order('name'),
    ]).then(([s, w]) => {
      setStocks(s.data || [])
      setWarehouses(w.data || [])
      setLoading(false)
    })
  }, [])

  const getWhName = (id) => warehouses.find(w => w.id === id)?.name || ''

  const filtered = stocks.filter(s =>
    (whFilter === '' || String(s.warehouse_id) === whFilter) &&
    (search === '' || s.sku_name?.includes(search) || s.sku_code?.includes(search))
  )

  const totalQty = filtered.reduce((s, i) => s + (i.quantity || 0), 0)
  const lowStock = filtered.filter(s => s.quantity <= (s.min_qty || 10))

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📦 庫存查詢</div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--t3)' }} />
        <input
          className="form-input"
          style={{ paddingLeft: 36 }}
          placeholder="搜尋品名或品號..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Warehouse Filter */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 12 }}>
        <button onClick={() => setWhFilter('')} style={{
          padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border2)', flexShrink: 0,
          background: whFilter === '' ? 'var(--cyan)' : 'var(--card)',
          color: whFilter === '' ? '#fff' : 'var(--t2)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>全部</button>
        {warehouses.map(w => (
          <button key={w.id} onClick={() => setWhFilter(String(w.id))} style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border2)', flexShrink: 0,
            background: whFilter === String(w.id) ? 'var(--cyan)' : 'var(--card)',
            color: whFilter === String(w.id) ? '#fff' : 'var(--t2)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>{w.name}</button>
        ))}
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--cyan)' }}>{filtered.length}</div>
          <div className="stat-label">品項數</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: lowStock.length > 0 ? 'var(--red)' : 'var(--green)' }}>{lowStock.length}</div>
          <div className="stat-label">低庫存警示</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="empty">找不到品項</div>
      ) : filtered.map(s => {
        const isLow = s.quantity <= (s.min_qty || 10)
        return (
          <div key={s.id} className="list-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{s.sku_name}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                  {s.sku_code} · {getWhName(s.warehouse_id)}
                  {s.bin_code ? ` · ${s.bin_code}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: isLow ? 'var(--red)' : 'var(--green)' }}>
                  {s.quantity}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>{s.unit || '個'}</div>
              </div>
            </div>
            {isLow && (
              <div style={{
                marginTop: 8, padding: '6px 10px', borderRadius: 8,
                background: 'var(--red-dim)', color: 'var(--red)',
                fontSize: 11, fontWeight: 600,
              }}>
                ⚠ 低於安全庫存（最低 {s.min_qty || 10}）
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
