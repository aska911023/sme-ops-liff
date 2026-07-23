import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Check, X, UserPlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import EmployeePicker from '../components/EmployeePicker'

const money = (n) => n != null && n !== '' ? 'NT$ ' + Number(n).toLocaleString() : '—'
const STEP_COLOR = { '待審': 'var(--orange)', '已核准': 'var(--green)', '已駁回': 'var(--red)' }

export default function RecruitmentOffer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reason, setReason] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addApprover, setAddApprover] = useState('')
  const [employees, setEmployees] = useState([])
  const [adding, setAdding] = useState(false)

  const reload = () => supabase.rpc('liff_get_offer_detail', {
    p_line_user_id: lineProfile.lineUserId, p_offer_id: Number(id),
  }).then(({ data }) => setData(data))

  const openAdd = async () => {
    setShowAdd(true)
    if (employees.length === 0) {
      const { data: emps } = await supabase.rpc('liff_list_employees_in_org', { p_line_user_id: lineProfile.lineUserId })
      setEmployees(Array.isArray(emps) ? emps : [])
    }
  }
  const doAddSigner = async () => {
    if (!addApprover) { alert('請選擇加簽人'); return }
    setAdding(true)
    try {
      const { data: res, error } = await supabase.rpc('liff_add_offer_signer', {
        p_line_user_id: lineProfile.lineUserId, p_offer_id: Number(id),
        p_approver_id: Number(addApprover), p_after_step: data?.offer?.current_step ?? 1,
      })
      if (error) throw error
      if (!res?.ok) throw new Error(res?.error || '加簽失敗')
      alert('已加簽，已通知該簽核人先審，簽完會再回到你')
      setShowAdd(false); setAddApprover('')
      await reload()
    } catch (e) { alert('加簽失敗：' + e.message) } finally { setAdding(false) }
  }

  useEffect(() => {
    if (!lineProfile?.lineUserId || !id) return
    setLoading(true)
    supabase.rpc('liff_get_offer_detail', {
      p_line_user_id: lineProfile.lineUserId, p_offer_id: Number(id),
    }).then(({ data }) => setData(data)).finally(() => setLoading(false))
  }, [lineProfile?.lineUserId, id])

  const act = async (action) => {
    if (action === 'reject' && !reason.trim()) { alert('請填寫退回原因'); return }
    setSubmitting(true)
    try {
      const { data: res, error } = await supabase.rpc('liff_advance_offer_approval', {
        p_line_user_id: lineProfile.lineUserId, p_offer_id: Number(id),
        p_action: action, p_reason: action === 'reject' ? reason.trim() : null,
      })
      if (error) throw error
      if (!res?.ok) throw new Error(res?.error || '操作失敗')
      alert(action === 'approve' ? (res.final ? '已核准，錄取簽呈全部通過 🎉' : '已核准，已送下一關') : '已退回')
      navigate(-1)
    } catch (e) { alert('失敗：' + e.message) } finally { setSubmitting(false) }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>載入中…</div>
  if (!data?.ok) return (
    <div style={{ padding: 24 }}>
      <div style={{ color: 'var(--red)', marginBottom: 12 }}>
        {data?.error === 'FORBIDDEN' ? '你不是此簽核的簽核人'
          : data?.error === 'NOT_FOUND' ? '找不到此錄取簽呈'
          : data?.error === 'NOT_AUTHENTICATED' ? '請先綁定 LINE 帳號' : '無法載入'}
      </div>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontSize: 14 }}>返回</button>
    </div>
  )

  const o = data.offer
  const canAct = data.can_act

  return (
    <div style={{ padding: 14, paddingBottom: canAct ? 'calc(160px + env(safe-area-inset-bottom, 8px))' : 24 }}>
      <button onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--cyan)', padding: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <ChevronLeft size={16} /> 返回
      </button>

      <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)', margin: '0 0 4px' }}>📝 錄取簽呈</h2>
      <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 14 }}>{o.candidate_name} · {o.status}</div>

      <div style={{ padding: 14, background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 14 }}>
        {[['應徵者', o.candidate_name], ['職位', [o.dept, o.position].filter(Boolean).join(' · ') || '—'],
          ['待遇', money(o.salary)], ['到職日', o.start_date || '—'],
          ['試用期', o.probation_days ? o.probation_days + ' 天' : '—']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
            <span style={{ color: 'var(--t3)' }}>{k}</span>
            <span style={{ color: 'var(--t1)', fontWeight: 600, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>簽核關卡</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {(data.steps || []).map(s => (
          <div key={s.step_order} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--glass)', borderRadius: 8, borderLeft: `3px solid ${STEP_COLOR[s.status] || 'var(--border)'}` }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)' }}>第{s.step_order}關</span>
            <span style={{ fontSize: 13, color: 'var(--t1)', flex: 1 }}>{s.approver_name || '—'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: STEP_COLOR[s.status] || 'var(--t3)' }}>{s.status}</span>
          </div>
        ))}
      </div>

      {o.status === '已駁回' && o.reject_reason && (
        <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>駁回原因：{o.reject_reason}</div>
      )}

      {!canAct && o.status === '待審' && (
        <div style={{ padding: 10, background: 'rgba(6,182,212,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--cyan)' }}>目前不是你這關，無法簽核</div>
      )}

      {canAct && (
        <>
          {/* 加簽 — 在自己這關之前插一位簽核人(先審,簽完再回到自己) */}
          <div style={{ marginBottom: 12 }}>
            {!showAdd ? (
              <button onClick={openAdd}
                style={{ width: '100%', justifyContent: 'center', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--cyan)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserPlus size={15} /> 加簽（在你這關之前插一位先審）
              </button>
            ) : (
              <div style={{ padding: 12, background: 'var(--glass)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>加簽人（排在你之前先審，簽完再回到你）</div>
                <EmployeePicker value={addApprover} onChange={setAddApprover} employees={employees} placeholder="選擇加簽人" />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => { setShowAdd(false); setAddApprover('') }}
                    style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontWeight: 600 }}>取消</button>
                  <button onClick={doAddSigner} disabled={adding}
                    style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: 'var(--cyan)', color: '#fff', fontWeight: 700, opacity: adding ? 0.5 : 1 }}>{adding ? '加簽中…' : '確認加簽'}</button>
                </div>
              </div>
            )}
          </div>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="退回原因（退回時必填）"
            style={{ width: '100%', minHeight: 70, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--glass)', color: 'var(--t1)', fontSize: 14 }} />
          <div style={{
            position: 'fixed', left: 0, right: 0,
            bottom: 'calc(54px + env(safe-area-inset-bottom, 8px))', padding: 14,
            background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, zIndex: 99,
          }}>
            <button onClick={() => act('reject')} disabled={submitting}
              style={{ flex: 1, padding: 12, borderRadius: 8, border: '2px solid var(--red)', background: 'transparent', color: 'var(--red)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <X size={16} /> 退回
            </button>
            <button onClick={() => act('approve')} disabled={submitting}
              style={{ flex: 2, padding: 12, borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: submitting ? 0.5 : 1 }}>
              <Check size={18} /> {submitting ? '處理中…' : '核准'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
