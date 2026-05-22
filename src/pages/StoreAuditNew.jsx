import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const SHIFTS = ['開店', '早班', '中班', '晚班', '打烊班']

export default function StoreAuditNew() {
  const navigate = useNavigate()
  const { employee } = useAuth()
  const [stores, setStores] = useState([])
  const [boundChainId, setBoundChainId] = useState(null)
  const [storeId, setStoreId] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [shift, setShift] = useState('')
  const [arrive, setArrive] = useState('')
  const [depart, setDepart] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const orgId = employee?.organization_id
    if (!orgId) return
    Promise.all([
      supabase.from('stores').select('id, name').eq('organization_id', orgId).order('name'),
      supabase.from('form_chain_configs').select('chain_id').eq('form_type', 'store_audit').eq('organization_id', orgId).maybeSingle(),
    ]).then(([s, c]) => {
      setStores(s.data || [])
      setBoundChainId(c.data?.chain_id || null)
    })
  }, [employee?.organization_id])

  const submit = async () => {
    if (!storeId) { alert('請選門市'); return }
    if (!date) { alert('請選稽核日期'); return }
    setSaving(true)
    const store = stores.find(s => s.id === Number(storeId))
    const { data, error } = await supabase.from('store_audits').insert({
      organization_id: employee.organization_id,
      store_id: Number(storeId),
      store_name: store?.name || '',
      audit_date: date,
      shift: shift || null,
      arrive_time: arrive || null,
      depart_time: depart || null,
      auditor_id: employee?.id || null,
      auditor_name: employee?.name || '',
      approval_chain_id: boundChainId,
      status: '草稿',
    }).select().single()
    setSaving(false)
    if (error) { alert('建立失敗：' + error.message); return }
    navigate(`/store-audit/${data.id}`, { replace: true })
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate(-1)}><ChevronLeft size={16} /> 返回</button>
      <div className="header">
        <div className="header-title">📝 新增稽核單</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>建立後將自動帶入 42 項評核</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <Field label="門市 *">
          <select className="form-input" value={storeId} onChange={e => setStoreId(e.target.value)}
            style={{ width: '100%', padding: 10, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--t1)' }}>
            <option value="">請選擇</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="日期 *">
            <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--t1)' }} />
          </Field>
          <Field label="班次">
            <select className="form-input" value={shift} onChange={e => setShift(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--t1)' }}>
              <option value="">未指定</option>
              {SHIFTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="到店時間">
            <input type="time" value={arrive} onChange={e => setArrive(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--t1)' }} />
          </Field>
          <Field label="離店時間">
            <input type="time" value={depart} onChange={e => setDepart(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--t1)' }} />
          </Field>
        </div>

        <div style={{ padding: 10, background: 'var(--glass)', borderRadius: 8, fontSize: 12, color: 'var(--t2)' }}>
          {boundChainId
            ? '✓ 將套用「稽核簽核設定」中的簽核流程'
            : '⚠ 尚未設定稽核簽核流程，送出後將直接核准'}
        </div>

        <button
          onClick={submit} disabled={saving || !storeId}
          style={{
            padding: 14, borderRadius: 10, border: 'none',
            background: '#22c55e', color: '#fff', fontSize: 15, fontWeight: 700,
            opacity: (saving || !storeId) ? 0.5 : 1, cursor: 'pointer', marginTop: 8,
          }}>
          {saving ? '建立中…' : '建立 + 填寫評核'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}
