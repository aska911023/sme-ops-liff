import { useState, useEffect } from 'react'
import { ChevronLeft, Paperclip, X, Image, FileText, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const ERR_MSG = {
  EMPLOYEE_NOT_FOUND: '找不到員工資料',
  TITLE_REQUIRED: '請填寫任務標題',
  ASSIGNEE_NOT_FOUND: '找不到指派對象',
  ASSIGNEE_CROSS_ORG: '指派對象不在同一個組織',
  INVALID_APPROVAL_MODE: '簽核模式設定錯誤',
}

const PRIORITIES = ['高', '中', '低']
const APPROVAL_MODES = [
  { v: 'none',   l: '不需簽核' },
  { v: 'people', l: '指定人員' },
  { v: 'chain',  l: '套用簽核鏈' },
]
const FORM_TYPES = [
  { v: 'form_submission',  l: '自建表單' },
  { v: 'expense_request', l: '非經常性費用申請' },
  { v: 'expense',         l: '核銷' },
]

export default function TaskNew() {
  const { employee, lineProfile } = useAuth()
  const navigate = useNavigate()
  const lineUserId = lineProfile?.lineUserId

  const [form, setForm] = useState({
    title: '', description: '',
    planned_start: '', due_date: '',
    priority: '中',
    assignee_id: '',
    store_id: '',
    role: '',
    bucket: '一般工作',
    workflow: '',
    approval_mode: 'none',
    approval_chain_id: '',
    confirmation_approvers: [],
    confirmation_mode: 'parallel',
    required_forms: [],
  })

  // Lookup data
  const [colleagues, setColleagues]       = useState([])
  const [stores, setStores]               = useState([])
  const [taskCategories, setTaskCategories] = useState([])
  const [workflowDefs, setWorkflowDefs]   = useState([])
  const [approvalChains, setApprovalChains] = useState([])
  const [formTemplates, setFormTemplates] = useState([])

  // UI state
  const [submitting, setSubmitting]   = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [approverPick, setApproverPick] = useState('')
  const [formPick, setFormPick]       = useState({ form_type: 'form_submission', form_template_id: '' })

  // ── Lookup load ──────────────────────────────────────────────
  useEffect(() => {
    if (!lineUserId) return
    Promise.all([
      supabase.rpc('liff_list_employees_in_org',   { p_line_user_id: lineUserId }),
      supabase.rpc('liff_list_stores_for_line_user', { p_line_user_id: lineUserId }),
      supabase.rpc('liff_list_task_categories',    { p_line_user_id: lineUserId }),
      supabase.rpc('liff_list_workflow_defs',      { p_line_user_id: lineUserId }),
      supabase.rpc('liff_list_approval_chains',    { p_line_user_id: lineUserId }),
      supabase.rpc('liff_list_form_templates',     { p_line_user_id: lineUserId }),
    ]).then(([emps, sts, cats, wfs, chs, fts]) => {
      setColleagues(Array.isArray(emps?.data) ? emps.data : [])
      setStores(Array.isArray(sts?.data) ? sts.data : [])
      setTaskCategories(Array.isArray(cats?.data) ? cats.data : [])
      setWorkflowDefs(Array.isArray(wfs?.data) ? wfs.data : [])
      setApprovalChains(Array.isArray(chs?.data) ? chs.data : [])
      setFormTemplates(Array.isArray(fts?.data) ? fts.data : [])
    })
  }, [lineUserId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── File 處理 ───────────────────────────────────────────────
  const handleFilesPicked = (e) => {
    const list = Array.from(e.target.files || [])
    e.target.value = ''
    setPendingFiles(prev => [...prev, ...list])
  }
  const removePendingFile = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx))

  // ── 簽核人員 add/remove ──────────────────────────────────────
  const addApprover = () => {
    if (!approverPick) return
    if (form.confirmation_approvers.includes(approverPick)) { setApproverPick(''); return }
    set('confirmation_approvers', [...form.confirmation_approvers, approverPick])
    setApproverPick('')
  }
  const removeApprover = (name) =>
    set('confirmation_approvers', form.confirmation_approvers.filter(x => x !== name))

  // ── 表單綁定 add/remove ──────────────────────────────────────
  const addRequiredForm = () => {
    if (formPick.form_type === 'form_submission' && !formPick.form_template_id) {
      alert('自建表單需選範本'); return
    }
    const label = formPick.form_type === 'form_submission'
      ? (formTemplates.find(f => String(f.id) === String(formPick.form_template_id))?.name || '表單')
      : FORM_TYPES.find(t => t.v === formPick.form_type)?.l || formPick.form_type

    set('required_forms', [...form.required_forms, {
      form_type: formPick.form_type,
      form_template_id: formPick.form_template_id || null,
      form_label: label,
      required_status: formPick.form_type === 'expense' ? '已核銷' : '已核准',
    }])
    setFormPick({ form_type: 'form_submission', form_template_id: '' })
  }
  const removeRequiredForm = (idx) =>
    set('required_forms', form.required_forms.filter((_, i) => i !== idx))

  // ── Submit ─────────────────────────────────────────────────
  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { alert('請填寫任務標題'); return }
    setSubmitting(true)

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      planned_start: form.planned_start || null,
      due_date: form.due_date || null,
      priority: form.priority,
      assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
      store_id: form.store_id ? Number(form.store_id) : null,
      role: form.role.trim() || null,
      bucket: form.bucket || null,
      workflow: form.workflow || null,
      approval_mode: form.approval_mode,
      approval_chain_id: form.approval_mode === 'chain' && form.approval_chain_id
        ? Number(form.approval_chain_id) : null,
      confirmation_approvers: form.approval_mode === 'people' ? form.confirmation_approvers : [],
      confirmation_mode: form.approval_mode === 'people' ? form.confirmation_mode : null,
      required_forms: form.required_forms,
    }

    const { data, error } = await supabase.rpc('liff_create_task', {
      p_line_user_id: lineUserId,
      p_payload:      payload,
    })
    if (error)     { setSubmitting(false); alert('系統錯誤：' + error.message); return }
    if (!data?.ok) { setSubmitting(false); alert(ERR_MSG[data?.error] || `新增失敗：${data?.error || 'unknown'}`); return }

    // 上傳發起附件
    const newTaskId = data.id
    if (newTaskId && pendingFiles.length > 0) {
      let failed = 0
      for (const file of pendingFiles) {
        try {
          const ext = file.name.split('.').pop()
          const path = `tasks/${newTaskId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
          const { error: upErr } = await supabase.storage.from('task-attachments').upload(path, file, { upsert: false })
          if (upErr) { failed++; continue }
          const { data: ins, error: insErr } = await supabase.rpc('liff_insert_task_attachment', {
            p_line_user_id: lineUserId,
            p_payload: {
              task_id: newTaskId, file_name: file.name, storage_path: path,
              file_size: file.size, file_type: file.type, kind: 'initiator',
            },
          })
          if (insErr || !ins?.ok) failed++
        } catch { failed++ }
      }
      if (failed > 0) alert(`任務已建立，但 ${failed} 個附件上傳失敗`)
    }

    setSubmitting(false)
    navigate('/tasks', { replace: true })
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/tasks')}><ChevronLeft size={16} /> 任務列表</button>
      <div className="header">
        <div className="header-title">➕ 新增任務</div>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ─── 基本資料 ─── */}
        <Field label="任務標題" required>
          <input type="text" required value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="例：月底盤點倉庫" style={inputStyle} />
        </Field>

        <Field label="描述">
          <textarea value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="具體工作內容..." rows={3}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="計畫開始" style={{ flex: 1 }}>
            <input type="date" value={form.planned_start}
              onChange={e => set('planned_start', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="截止日期" style={{ flex: 1 }}>
            <input type="date" value={form.due_date}
              onChange={e => set('due_date', e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="優先度" style={{ flex: 1 }}>
            <select value={form.priority}
              onChange={e => set('priority', e.target.value)} style={inputStyle}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="分類" style={{ flex: 1 }}>
            <select value={form.bucket}
              onChange={e => set('bucket', e.target.value)} style={inputStyle}>
              {taskCategories.length > 0
                ? taskCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                : ['一般工作', '私人工作', '工作流程'].map(b => <option key={b}>{b}</option>)}
            </select>
          </Field>
        </div>

        <Field label="指派給">
          <select value={form.assignee_id}
            onChange={e => set('assignee_id', e.target.value)} style={inputStyle}>
            <option value="">指派給自己（{employee?.name}）</option>
            {colleagues.filter(c => c.id !== employee?.id).map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.dept ? `（${c.dept}）` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="門市" style={{ flex: 1 }}>
            <select value={form.store_id}
              onChange={e => set('store_id', e.target.value)} style={inputStyle}>
              <option value="">— 選擇門市 —</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="角色" style={{ flex: 1 }}>
            <input type="text" value={form.role}
              onChange={e => set('role', e.target.value)}
              placeholder="例：店長" style={inputStyle} />
          </Field>
        </div>

        <Field label="所屬流程">
          <select value={form.workflow}
            onChange={e => set('workflow', e.target.value)} style={inputStyle}>
            <option value="">— 選擇流程 —</option>
            {workflowDefs.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
          </select>
        </Field>

        {/* ─── 簽核設定 ─── */}
        <SectionBox title="🔧 簽核設定（選填）">
          <Field label="簽核方式">
            <div style={{ display: 'flex', gap: 6 }}>
              {APPROVAL_MODES.map(opt => {
                const active = form.approval_mode === opt.v
                return (
                  <button type="button" key={opt.v}
                    onClick={() => set('approval_mode', opt.v)}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: active ? '1.5px solid var(--cyan)' : '1px solid var(--border2)',
                      background: active ? 'var(--cyan-dim)' : 'var(--card)',
                      color: active ? 'var(--cyan)' : 'var(--t2)',
                    }}>
                    {opt.l}
                  </button>
                )
              })}
            </div>
          </Field>

          {form.approval_mode === 'people' && (
            <>
              <Field label="加入簽核人員">
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={approverPick}
                    onChange={e => setApproverPick(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}>
                    <option value="">— 選擇人員 —</option>
                    {colleagues
                      .filter(c => !form.confirmation_approvers.includes(c.name))
                      .map(c => <option key={c.id} value={c.name}>{c.name}{c.dept ? `（${c.dept}）` : ''}</option>)}
                  </select>
                  <button type="button" onClick={addApprover}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--cyan)',
                             background: 'var(--cyan-dim)', color: 'var(--cyan)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    加入
                  </button>
                </div>
              </Field>
              {form.confirmation_approvers.length > 0 && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {form.confirmation_approvers.map(name => (
                      <span key={name} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 14, fontSize: 12,
                        background: 'var(--purple-dim)', color: 'var(--purple)',
                        border: '1px solid var(--purple)',
                      }}>
                        <ShieldCheck size={11} /> {name}
                        <button type="button" onClick={() => removeApprover(name)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer',
                                   color: 'var(--purple)', padding: 0, lineHeight: 1 }}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                  {form.confirmation_approvers.length > 1 && (
                    <Field label="多人簽核模式">
                      <select value={form.confirmation_mode}
                        onChange={e => set('confirmation_mode', e.target.value)} style={inputStyle}>
                        <option value="parallel">並簽（任一人通過即可）</option>
                        <option value="sequential">會簽（每個人都要通過）</option>
                      </select>
                    </Field>
                  )}
                </>
              )}
            </>
          )}

          {form.approval_mode === 'chain' && (
            <Field label="選擇簽核鏈">
              <select value={form.approval_chain_id}
                onChange={e => set('approval_chain_id', e.target.value)} style={inputStyle}>
                <option value="">— 請選擇 —</option>
                {approvalChains.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.steps_count || 0} 關）
                  </option>
                ))}
              </select>
            </Field>
          )}
        </SectionBox>

        {/* ─── 綁定表單 ─── */}
        <SectionBox title="📋 綁定表單（選填）">
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>
            員工開任務後要填完這些表單、全部核准才能完成任務
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {form.required_forms.map((f, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', background: 'var(--card)', borderRadius: 8,
                border: '1px solid var(--border2)', fontSize: 12,
              }}>
                <FileText size={12} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.form_label}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                    {FORM_TYPES.find(t => t.v === f.form_type)?.l || f.form_type} · 完成條件：{f.required_status}
                  </div>
                </div>
                <button type="button" onClick={() => removeRequiredForm(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={formPick.form_type}
              onChange={e => setFormPick({ form_type: e.target.value, form_template_id: '' })}
              style={{ ...inputStyle, flex: '1 1 100px', minWidth: 100 }}>
              {FORM_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
            {formPick.form_type === 'form_submission' && (
              <select value={formPick.form_template_id}
                onChange={e => setFormPick(p => ({ ...p, form_template_id: e.target.value }))}
                style={{ ...inputStyle, flex: '2 1 150px' }}>
                <option value="">— 選範本 —</option>
                {formTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <button type="button" onClick={addRequiredForm}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--cyan)',
                       background: 'var(--cyan-dim)', color: 'var(--cyan)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              加入
            </button>
          </div>
        </SectionBox>

        {/* ─── 發起附件 ─── */}
        <Field label={`📎 發起附件（選填，${pendingFiles.length} 個）`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{
              cursor: 'pointer',
              padding: '10px 12px', borderRadius: 8, border: '1px dashed var(--border2)',
              background: 'var(--card)', color: 'var(--cyan)',
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
              justifyContent: 'center',
            }}>
              <Paperclip size={14} /> 加照片/檔案
              <input type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                multiple onChange={handleFilesPicked} style={{ display: 'none' }} />
            </label>
            {pendingFiles.map((f, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 8,
                background: 'var(--card)', border: '1px solid var(--border2)', fontSize: 12,
              }}>
                {f.type?.startsWith('image/')
                  ? <Image size={14} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
                  : <FileText size={14} style={{ color: 'var(--purple)', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>{(f.size / 1024).toFixed(0)} KB</div>
                </div>
                <button type="button" onClick={() => removePendingFile(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </Field>

        {/* ─── Actions ─── */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={() => navigate('/tasks')}
            style={{
              flex: 1, padding: '12px', borderRadius: 10,
              border: '1.5px solid var(--border2)', background: 'transparent',
              color: 'var(--t2)', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
            取消
          </button>
          <button type="submit" disabled={submitting}
            style={{
              flex: 2, padding: '12px', borderRadius: 10, border: 'none',
              background: 'var(--cyan)', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              opacity: submitting ? 0.5 : 1,
            }}>
            {submitting ? '新增中...' : '建立任務'}
          </button>
        </div>
      </form>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border2)', fontSize: 14,
  background: 'var(--card)', color: 'var(--t1)', outline: 'none',
  boxSizing: 'border-box',
}

function Field({ label, required, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--red)' }}> *</span>}
      </div>
      {children}
    </div>
  )
}

function SectionBox({ title, children }) {
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: 'var(--card2, var(--card))',
      border: '1px solid var(--border2)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>{title}</div>
      {children}
    </div>
  )
}
