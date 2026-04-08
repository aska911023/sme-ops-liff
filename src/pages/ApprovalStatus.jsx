import { useState, useEffect } from 'react'
import { ChevronLeft, ArrowRight, Check, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function ApprovalStatus() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [forms, setForms] = useState([])
  const [steps, setSteps] = useState([])
  const [chains, setChains] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('mine') // mine | pending

  useEffect(() => {
    if (!employee) return
    Promise.all([
      supabase.from('approval_forms').select('*').order('created_at', { ascending: false }),
      supabase.from('approval_form_steps').select('*').order('form_id,step_order'),
      supabase.from('approval_chains').select('*'),
    ]).then(([f, s, c]) => {
      setForms(f.data || [])
      setSteps(s.data || [])
      setChains(c.data || [])
      setLoading(false)
    })
  }, [employee])

  const getFS = (id) => steps.filter(s => s.form_id === id).sort((a, b) => a.step_order - b.step_order)
  const getChain = (id) => chains.find(c => c.id === id)

  // My forms = I submitted
  const myForms = forms.filter(f => f.applicant === employee?.name)
  // Pending for me = steps where status='待簽' and my role matches
  const pendingForms = forms.filter(f => {
    const fSteps = getFS(f.id)
    return fSteps.some(s => s.status === '待簽')
  })

  const handleApprove = async (stepId, formId, action) => {
    let comment = ''
    if (action === '退回') {
      comment = prompt('退回原因：')
      if (!comment?.trim()) return
    }
    const { data: step } = await supabase.from('approval_form_steps').update({
      status: action === '核准' ? '已核准' : '已退回',
      approver: employee.name,
      comment: comment || null,
      acted_at: new Date().toISOString(),
    }).eq('id', stepId).select().single()
    if (!step) return
    setSteps(prev => prev.map(s => s.id === stepId ? step : s))

    if (action === '核准') {
      const all = steps.map(s => s.id === stepId ? step : s).filter(s => s.form_id === formId)
      const next = all.find(s => s.status === '等待中')
      if (next) {
        const { data: ns } = await supabase.from('approval_form_steps').update({ status: '待簽' }).eq('id', next.id).select().single()
        if (ns) setSteps(prev => prev.map(s => s.id === ns.id ? ns : s))
      } else {
        const { data: f } = await supabase.from('approval_forms').update({ status: '已通過', completed_at: new Date().toISOString() }).eq('id', formId).select().single()
        if (f) setForms(prev => prev.map(x => x.id === formId ? f : x))
      }
    } else {
      const { data: f } = await supabase.from('approval_forms').update({ status: '已退回', completed_at: new Date().toISOString() }).eq('id', formId).select().single()
      if (f) setForms(prev => prev.map(x => x.id === formId ? f : x))
    }
  }

  const stColor = (s) => s === '已通過' || s === '已核准' ? 'var(--green)' : s === '已退回' ? 'var(--red)' : s === '待簽' ? 'var(--orange)' : 'var(--t3)'
  const stBg = (s) => s === '已通過' || s === '已核准' ? 'var(--green-dim)' : s === '已退回' ? 'var(--red-dim)' : s === '待簽' ? 'rgba(251,146,60,0.1)' : 'var(--card)'

  const displayed = tab === 'mine' ? myForms : pendingForms

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🛡️ 簽核狀態</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'mine', label: '我的申請', count: myForms.length },
          { key: 'pending', label: '待我簽核', count: pendingForms.filter(f => getFS(f.id).some(s => s.status === '待簽')).length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            border: `1.5px solid ${tab === t.key ? 'var(--cyan)' : 'var(--border2)'}`,
            background: tab === t.key ? 'var(--cyan-dim)' : 'var(--card)',
            color: tab === t.key ? 'var(--cyan)' : 'var(--t2)',
            cursor: 'pointer', position: 'relative',
          }}>
            {t.label}
            {t.count > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                width: 20, height: 20, borderRadius: '50%',
                background: t.key === 'pending' ? 'var(--orange)' : 'var(--cyan)',
                color: '#fff', fontSize: 11, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : displayed.length === 0 ? (
        <div className="empty">{tab === 'mine' ? '尚無提交的簽核' : '目前沒有待簽核的表單'}</div>
      ) : displayed.map(f => {
        const fSteps = getFS(f.id)
        const chain = getChain(f.chain_id)
        return (
          <div key={f.id} className="list-item" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{f.title}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  {chain?.name} · {f.store || '—'} · {f.created_at?.slice(0, 10)}
                </div>
              </div>
              <span style={{
                padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: stBg(f.status), color: stColor(f.status),
              }}>{f.status}</span>
            </div>

            {/* Flow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--cyan-dim)', color: 'var(--cyan)', fontWeight: 600 }}>{f.applicant}</span>
              {fSteps.map((s, i) => (
                <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <ArrowRight size={10} style={{ color: 'var(--t3)' }} />
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                    background: stBg(s.status), color: stColor(s.status),
                  }}>
                    {chain?.steps?.[i]?.label || s.role}
                    {s.status === '已核准' && ' ✓'}
                    {s.status === '已退回' && ' ✗'}
                  </span>
                </span>
              ))}
            </div>

            {/* Step details for pending */}
            {fSteps.map((s, i) => {
              if (s.status !== '待簽' && s.status !== '已退回') return null
              return (
                <div key={s.id} style={{
                  padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                  background: s.status === '待簽' ? 'rgba(251,146,60,0.08)' : 'var(--red-dim)',
                  border: `1px solid ${s.status === '待簽' ? 'rgba(251,146,60,0.2)' : 'rgba(248,113,113,0.15)'}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>
                    {chain?.steps?.[i]?.label || `第 ${i + 1} 關`} — {s.role}
                  </div>
                  {s.comment && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>退回原因：{s.comment}</div>}
                  {s.status === '待簽' && tab === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => handleApprove(s.id, f.id, '核准')} style={{
                        flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                        background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}><Check size={16} /> 核准</button>
                      <button onClick={() => handleApprove(s.id, f.id, '退回')} style={{
                        flex: 1, padding: '10px', borderRadius: 10,
                        border: '1.5px solid var(--red)', background: 'transparent',
                        color: 'var(--red)', fontSize: 14, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}><X size={16} /> 退回</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
