import { useState, useEffect } from 'react'
import { ChevronLeft, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const TAGS = ['潛在客戶', 'VIP', '一般', '經銷商', '大客戶']

export default function NewCustomer() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [locations, setLocations] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    name: '', contact_person: '', phone: '', email: '',
    address: '', tag: TAGS[0], location: '', notes: '',
    credit_limit: '', assigned_to: '',
  })

  useEffect(() => {
    supabase.from('locations').select('*').order('name').then(({ data }) => setLocations(data || []))
    if (employee) setForm(f => ({ ...f, assigned_to: employee.name }))
  }, [employee])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name) return
    setSubmitting(true)
    const row = { name: form.name, status: '活躍' }
    if (form.contact_person) row.contact_person = form.contact_person
    if (form.phone) row.phone = form.phone
    if (form.email) row.email = form.email
    if (form.address) row.address = form.address
    if (form.tag) row.tag = form.tag
    if (form.location) row.location = form.location
    if (form.notes) row.notes = form.notes
    if (form.credit_limit) row.credit_limit = Number(form.credit_limit) || 0
    row.outstanding_amount = 0
    if (form.assigned_to) row.assigned_to = form.assigned_to

    const { data, error } = await supabase.from('customers').insert(row).select().single()

    if (error) { alert('新增失敗: ' + error.message); setSubmitting(false); return }
    if (data) {
      setSuccess(true)
      setTimeout(() => navigate('/'), 2000)
    }
    setSubmitting(false)
  }

  if (success) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'var(--green-dim)', border: '2px solid var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <Check size={36} color="var(--green)" />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>客戶新增成功</div>
        <div style={{ fontSize: 13, color: 'var(--t3)' }}>即將返回首頁...</div>
      </div>
    )
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🤝 新增客戶</div>
      </div>

      <div className="card">
        <div className="form-group">
          <label className="form-label">公司 / 客戶名稱 *</label>
          <input className="form-input" type="text" placeholder="例：ABC 有限公司" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">聯絡人</label>
            <input className="form-input" type="text" placeholder="姓名" value={form.contact_person} onChange={e => set('contact_person', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">電話</label>
            <input className="form-input" type="tel" placeholder="0912-345-678" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" placeholder="email@example.com" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">地址</label>
          <input className="form-input" type="text" placeholder="公司地址" value={form.address} onChange={e => set('address', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">客戶標籤</label>
            <select className="form-input" value={form.tag} onChange={e => set('tag', e.target.value)}>
              {TAGS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">所屬分店</label>
            <select className="form-input" value={form.location} onChange={e => set('location', e.target.value)}>
              <option value="">請選擇</option>
              {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">信用額度 (NT$)</label>
          <input className="form-input" type="number" placeholder="0" value={form.credit_limit} onChange={e => set('credit_limit', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">負責業務</label>
          <input className="form-input" type="text" value={form.assigned_to} readOnly style={{ color: 'var(--t3)' }} />
        </div>

        <div className="form-group">
          <label className="form-label">備註</label>
          <textarea className="form-input" placeholder="客戶備註..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || !form.name}>
          {submitting ? '新增中...' : '新增客戶'}
        </button>
      </div>
    </div>
  )
}
