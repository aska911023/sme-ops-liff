import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Minus, Trash2, CreditCard } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

export default function POSMobile() {
  const nav = useNavigate()
  const { employee } = useAuth()
  const [skus, setSkus] = useState([])
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [payMethod, setPayMethod] = useState('現金')

  useEffect(() => {
    supabase.from('skus').select('id, code, name, barcode, unit_cost, category')
      .eq('status', '啟用').order('name').limit(200)
      .then(({ data }) => setSkus(data || []))
  }, [])

  const addToCart = (sku) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === sku.id)
      if (existing) return prev.map(i => i.id === sku.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { id: sku.id, name: sku.name, price: sku.unit_cost || 0, qty: 1 }]
    })
  }

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
  }

  const removeItem = (id) => setCart(prev => prev.filter(i => i.id !== id))

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0)

  const handleCheckout = async () => {
    if (cart.length === 0) return
    const txn = {
      store: employee?.store || '',
      cashier: employee?.name || '',
      items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      subtotal: total,
      discount: 0,
      tax: Math.round(total * 0.05),
      total: Math.round(total * 1.05),
      payment_method: payMethod,
      status: '完成',
    }
    const { error } = await supabase.from('pos_transactions').insert(txn)
    if (error) { alert('結帳失敗: ' + error.message); return }
    alert(`結帳成功！金額 $${txn.total.toLocaleString()}`)
    setCart([])
  }

  const filtered = skus.filter(s =>
    !search || s.name?.includes(search) || s.code?.includes(search) || s.barcode?.includes(search)
  )

  return (
    <div className="page" style={{ paddingBottom: 180 }}>
      <div className="page-header-back" onClick={() => nav('/sales')}>
        <ArrowLeft size={18} /> <span>POS 收銀</span>
      </div>

      <input className="input" placeholder="搜尋商品/條碼" value={search} onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 12 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
        {filtered.slice(0, 12).map(s => (
          <button key={s.id} onClick={() => addToCart(s)} style={{
            padding: '10px 4px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--card)', cursor: 'pointer', textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.3 }}>{s.name}</div>
            <div style={{ fontSize: 10, color: 'var(--cyan)', marginTop: 2 }}>${s.unit_cost || 0}</div>
          </button>
        ))}
      </div>

      {/* Cart fixed at bottom */}
      {cart.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 60, left: 0, right: 0, zIndex: 100,
          background: 'var(--bg2)', borderTop: '1px solid var(--border2)',
          padding: '12px 16px', maxHeight: '40vh', overflowY: 'auto',
        }}>
          {cart.map(i => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{i.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => updateQty(i.id, -1)} style={{ background: 'var(--glass)', border: 'none', borderRadius: 6, padding: 4, cursor: 'pointer', color: 'var(--t2)' }}><Minus size={14} /></button>
                <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{i.qty}</span>
                <button onClick={() => updateQty(i.id, 1)} style={{ background: 'var(--glass)', border: 'none', borderRadius: 6, padding: 4, cursor: 'pointer', color: 'var(--t2)' }}><Plus size={14} /></button>
              </div>
              <div style={{ minWidth: 60, textAlign: 'right', fontWeight: 700, color: 'var(--cyan)', fontSize: 13 }}>${(i.price * i.qty).toLocaleString()}</div>
              <button onClick={() => removeItem(i.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: 12 }}>
              <option>現金</option><option>信用卡</option><option>行動支付</option><option>禮券</option>
            </select>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>${Math.round(total * 1.05).toLocaleString()}</div>
          </div>
          <button onClick={handleCheckout} style={{
            width: '100%', marginTop: 8, padding: 12, borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, var(--cyan), var(--blue))', color: '#fff',
            fontSize: 15, fontWeight: 800, cursor: 'pointer',
          }}>
            <CreditCard size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> 結帳
          </button>
        </div>
      )}
    </div>
  )
}
