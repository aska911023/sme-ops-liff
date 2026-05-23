import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 全部走 SECURITY DEFINER RPC 繞過 anon RLS（參考 feedback_liff_anon_rls）

const SHIFTS = ['開店', '早班', '中班', '晚班', '打烊班']

export default function StoreAuditNew() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const bindingId = searchParams.get('binding_id')
    ? Number(searchParams.get('binding_id')) : null
  const taskId = searchParams.get('task_id')
  const { lineProfile } = useAuth()
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
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_get_store_audit_init', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => {
        if (!data?.ok) return
        setStores(data.stores || [])
        setBoundChainId(data.bound_chain_id || null)
      })
  }, [lineProfile?.lineUserId])

  const submit = async () => {
    if (!storeId) { alert('請選門市'); return }
    if (!date) { alert('請選稽核日期'); return }
    setSaving(true)
    const { data, error } = await supabase.rpc('liff_create_store_audit', {
      p_line_user_id: lineProfile.lineUserId,
      p_store_id: Number(storeId),
      p_audit_date: date,
      p_shift: shift || null,
      p_arrive_time: arrive || null,
      p_depart_time: depart || null,
      p_binding_id: bindingId,
    })
    setSaving(false)
    if (error || !data?.ok) { alert('建立失敗：' + (error?.message || data?.error || 'unknown')); return }
    // 從任務跳來的，建立完直接回任務詳情；否則進稽核單明細
    if (bindingId && taskId) {
      navigate(`/tasks?task=${taskId}`, { replace: true })
    } else {
      navigate(`/store-audit/${data.audit_id}`, { replace: true })
    }
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
