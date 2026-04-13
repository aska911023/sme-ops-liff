import { useState } from 'react'
import { ArrowLeft, Search, Phone, Mail } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function CustomerLookup() {
  const nav = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    const q = query.trim()
    const { data } = await supabase.from('customers').select('*')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%,code.ilike.%${q}%`)
      .limit(20)
    setResults(data || [])
    setLoading(false)
  }

  return (
    <div className="page">
      <div className="page-header-back" onClick={() => nav('/crm')}>
        <ArrowLeft size={18} /> <span>客戶查詢</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="input" type="text" placeholder="搜尋姓名/電話/公司/代碼"
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          style={{ flex: 1 }} />
        <button className="btn-primary" onClick={handleSearch} disabled={loading}>
          <Search size={16} />
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>搜尋中...</div>}

      {results.map(c => (
        <div key={c.id} className="card-item" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
              {c.company && <div style={{ fontSize: 12, color: 'var(--t3)' }}>{c.company}</div>}
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                {c.code && <span style={{ marginRight: 8 }}>#{c.code}</span>}
                <span style={{
                  padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: c.status === '活躍' ? 'var(--green-dim)' : 'var(--orange-dim)',
                  color: c.status === '活躍' ? 'var(--green)' : 'var(--orange)',
                }}>{c.status || '活躍'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {c.phone && <a href={`tel:${c.phone}`} style={{ color: 'var(--cyan)' }}><Phone size={18} /></a>}
              {c.email && <a href={`mailto:${c.email}`} style={{ color: 'var(--blue)' }}><Mail size={18} /></a>}
            </div>
          </div>
          {c.credit_limit && (
            <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 11, color: 'var(--t3)' }}>
              <span>信用額度: ${c.credit_limit?.toLocaleString()}</span>
              <span>待收: ${c.outstanding_amount?.toLocaleString() || 0}</span>
            </div>
          )}
        </div>
      ))}

      {!loading && results.length === 0 && query && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>無搜尋結果</div>
      )}
    </div>
  )
}
