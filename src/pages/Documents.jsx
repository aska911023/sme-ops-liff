import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, Search, Download, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const TYPE_ICONS = { PDF: '📕', DOCX: '📘', XLSX: '📗', PPTX: '📙', JPG: '🖼️', PNG: '🖼️' }

export default function Documents() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [docs, setDocs] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCat, setActiveCat] = useState('全部')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_documents', {
      p_line_user_id: lineProfile.lineUserId,
      p_category: null,
      p_search: null,
    }).then(({ data, error: err }) => {
      if (err || !data?.ok) { setError(data?.error || err?.message || '載入失敗'); return }
      setDocs(Array.isArray(data.documents) ? data.documents : [])
      setCategories(['全部', ...(Array.isArray(data.categories) ? data.categories : [])])
    }).finally(() => setLoading(false))
  }, [lineProfile])

  const filtered = useMemo(() => {
    let list = docs
    if (activeCat !== '全部') list = list.filter(d => d.category === activeCat)
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter(d =>
        (d.name || '').toLowerCase().includes(s) ||
        (d.notes || '').toLowerCase().includes(s)
      )
    }
    return list
  }, [docs, activeCat, search])

  if (loading) {
    return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>
  }
  if (error) {
    return (
      <div className="page">
        <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
        <div className="empty"><div style={{ color: 'var(--red)', fontSize: 14 }}>😵 {error}</div></div>
      </div>
    )
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📁 公司文件</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
          {docs.length} 份文件 · 點選下方分類篩選
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)' }} />
        <input
          type="text"
          placeholder="搜尋文件名稱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12,
            border: '1px solid var(--border2)', background: 'var(--card)',
            color: 'var(--t1)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Category chips */}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 12, scrollbarWidth: 'none' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat)}
              style={{
                flexShrink: 0, padding: '8px 14px', borderRadius: 999,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: '1px solid ' + (activeCat === cat ? 'var(--cyan)' : 'var(--border2)'),
                background: activeCat === cat ? 'var(--cyan-dim)' : 'var(--card)',
                color: activeCat === cat ? 'var(--cyan)' : 'var(--t2)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 48 }}>📂</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>
            {search.trim() || activeCat !== '全部' ? '沒有符合條件的文件' : '目前沒有文件'}
          </div>
        </div>
      ) : (
        filtered.map(d => (
          <div key={d.id} style={{
            padding: '14px 16px', marginBottom: 8, borderRadius: 14,
            background: 'var(--card)', border: '1px solid var(--border)',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <div style={{ fontSize: 32, flexShrink: 0, lineHeight: 1 }}>
              {TYPE_ICONS[d.type] || '📄'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', wordBreak: 'break-word' }}>
                {d.name}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                {d.category && (
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 999,
                    background: 'var(--cyan-dim)', color: 'var(--cyan)', fontWeight: 600,
                  }}>{d.category}</span>
                )}
                {d.type && (
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{d.type}</span>
                )}
                {d.size && (
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>· {d.size}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                {d.uploader || '—'} · {d.upload_date || '—'}
              </div>
              {d.notes && (
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 6, lineHeight: 1.5 }}>
                  {d.notes}
                </div>
              )}
              {d.url && (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    marginTop: 8, padding: '6px 12px', borderRadius: 8,
                    background: 'var(--cyan-dim)', color: 'var(--cyan)',
                    fontSize: 12, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  <Download size={12} /> 開啟 / 下載
                </a>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
