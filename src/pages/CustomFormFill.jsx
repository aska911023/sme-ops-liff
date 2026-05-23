import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// 預設值 token 替換（與主系統 CustomFormFill.jsx 同邏輯）
function resolveDefaultToken(raw, me) {
  if (typeof raw !== 'string' || !raw.includes('${')) return raw
  return raw
    .replace(/\$\{user\.id\}/g, me?.id ?? '')
    .replace(/\$\{user\.name\}/g, me?.name || '')
    .replace(/\$\{user\.dept_id\}/g, me?.department_id ?? '')
    .replace(/\$\{user\.dept\}/g, me?.dept || '')
    .replace(/\$\{user\.store_id\}/g, me?.store_id ?? '')
    .replace(/\$\{user\.store\}/g, me?.store || '')
    .replace(/\$\{user\.position\}/g, me?.position || '')
    .replace(/\$\{user\.email\}/g, me?.email || '')
    .replace(/\$\{today\}/g, new Date().toISOString().slice(0, 10))
    .replace(/\$\{now\}/g, new Date().toISOString().slice(0, 16).replace('T', ' '))
}

function fieldVisible(field, data) {
  const si = field.show_if
  if (!si?.field) return true
  const target = data[si.field]
  switch (si.operator) {
    case 'eq':        return String(target ?? '') === String(si.value ?? '')
    case 'neq':       return String(target ?? '') !== String(si.value ?? '')
    case 'not_empty': return target !== '' && target !== null && target !== undefined && target !== false
    case 'empty':     return target === '' || target === null || target === undefined || target === false
    default:          return true
  }
}

export default function CustomFormFill() {
  const { templateId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const bindingId = searchParams.get('binding_id')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [template, setTemplate] = useState(null)
  const [me, setMe] = useState(null)
  const [pickers, setPickers] = useState({ employees: [], departments: [], stores: [] })
  const [data, setData] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!lineProfile?.lineUserId || !templateId) return
    supabase.rpc('liff_get_form_template', {
      p_line_user_id: lineProfile.lineUserId,
      p_template_id: Number(templateId),
    }).then(({ data: res, error }) => {
      if (error) { setError(error.message); setLoading(false); return }
      if (res?.error) { setError(res.error); setLoading(false); return }
      setTemplate(res.template)
      setMe(res.me)
      setPickers(res.pickers || { employees: [], departments: [], stores: [] })
      // init defaults
      const initial = {}
      for (const f of res.template.fields || []) {
        if (f.type === 'section') continue
        const raw = f.default ?? (f.type === 'checkbox' ? false : '')
        initial[f.key] = resolveDefaultToken(raw, res.me)
      }
      setData(initial)
      setLoading(false)
    })
  }, [lineProfile?.lineUserId, templateId])

  const setField = (k, v) => setData(d => ({ ...d, [k]: v }))

  const submit = async () => {
    if (!template) return
    // 驗證
    for (const f of template.fields || []) {
      if (f.type === 'section') continue
      if (!fieldVisible(f, data)) continue
      if (!f.required) continue
      const v = data[f.key]
      const empty = f.type === 'date_range'
        ? (!v?.start || !v?.end)
        : (v === '' || v === null || v === undefined || (f.type === 'checkbox' && !v) || (Array.isArray(v) && v.length === 0))
      if (empty) { alert(`「${f.label}」為必填`); return }
    }
    // 只送可見欄位
    const visibleData = {}
    for (const f of (template.fields || [])) {
      if (f.type === 'section') continue
      if (fieldVisible(f, data)) visibleData[f.key] = data[f.key]
    }
    setSubmitting(true)
    try {
      const { data: res, error } = await supabase.rpc('liff_create_form_submission', {
        p_line_user_id: lineProfile.lineUserId,
        p_template_id: Number(templateId),
        p_data: visibleData,
        p_binding_id: bindingId ? Number(bindingId) : null,
      })
      if (error) throw error
      if (!res?.ok) throw new Error(res?.error || '送出失敗')
      alert('已送出申請！')
      // 帶 binding 回 task 頁；否則回首頁
      if (bindingId) {
        const taskId = searchParams.get('task_id')
        navigate(taskId ? `/tasks?task=${taskId}` : '/tasks')
      } else {
        navigate('/')
      }
    } catch (e) {
      alert('送出失敗：' + (e.message || '未知錯誤'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--t2)' }}>載入中…</div>
  if (error === 'unauthorized') return <div style={{ padding: 24, color: 'var(--red)' }}>未授權，請重新登入</div>
  if (error === 'not_found' || !template) return (
    <div style={{ padding: 24 }}>
      <div style={{ color: 'var(--red)', marginBottom: 12 }}>找不到此表單</div>
      <button className="btn" onClick={() => navigate(-1)}>返回</button>
    </div>
  )

  return (
    <div style={{ padding: 14, paddingBottom: 80 }}>
      <button onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--cyan)', padding: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <ChevronLeft size={16} /> 返回
      </button>

      <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)', margin: '0 0 4px' }}>{template.name}</h2>
      {template.description && (
        <p style={{ fontSize: 12, color: 'var(--t3)', margin: '0 0 14px' }}>{template.description}</p>
      )}

      {bindingId && (
        <div style={{
          padding: '8px 10px', borderRadius: 6, background: 'rgba(6,182,212,0.12)',
          border: '1px solid var(--cyan)', color: 'var(--cyan)', fontSize: 12, marginBottom: 12,
        }}>
          📋 此表單對應任務綁定，送出後會自動回填任務狀態
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(template.fields || []).map((f, idx) => {
          if (f.type === 'section') {
            return (
              <div key={`sec_${idx}`} style={{
                marginTop: idx === 0 ? 0 : 6, paddingTop: idx === 0 ? 0 : 10,
                borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cyan)' }}>{f.label}</div>
                {f.description && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{f.description}</div>}
              </div>
            )
          }
          if (!fieldVisible(f, data)) return null
          return (
            <FieldRender key={f.key} field={f} value={data[f.key]} onChange={v => setField(f.key, v)} pickers={pickers} />
          )
        })}
      </div>

      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, padding: 14,
        background: 'var(--bg)', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8,
      }}>
        <button onClick={() => navigate(-1)}
          style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontWeight: 600 }}>
          取消
        </button>
        <button onClick={submit} disabled={submitting}
          style={{ flex: 2, padding: '12px', borderRadius: 8, border: 'none', background: 'var(--cyan)', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: submitting ? 0.5 : 1 }}>
          <Send size={14} /> {submitting ? '送出中…' : '送出申請'}
        </button>
      </div>
    </div>
  )
}

function FieldRender({ field, value, onChange, pickers }) {
  const labelEl = (
    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>
      {field.label}
      {field.required && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
    </label>
  )

  const baseInput = {
    width: '100%', padding: '10px 12px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--bg2)',
    color: 'var(--t1)', fontSize: 14,
  }

  if (field.type === 'textarea') {
    return (
      <div>{labelEl}
        <textarea style={{ ...baseInput, minHeight: 80, resize: 'vertical' }}
          rows={field.rows || 4} placeholder={field.placeholder || ''}
          value={value || ''} onChange={e => onChange(e.target.value)} />
      </div>
    )
  }

  if (field.type === 'select') {
    const options = (field.options || '').split('\n').map(s => s.trim()).filter(Boolean)
    return (
      <div>{labelEl}
        <select style={baseInput} value={value || ''} onChange={e => onChange(e.target.value)}>
          <option value="">請選擇</option>
          {options.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
        </select>
      </div>
    )
  }

  if (field.type === 'checkbox') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: 'var(--cyan)' }} />
        <span style={{ fontSize: 14, color: 'var(--t1)' }}>
          {field.label}
          {field.required && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
        </span>
      </label>
    )
  }

  if (field.type === 'date_range') {
    const start = value?.start || ''
    const end = value?.end || ''
    const days = (start && end)
      ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
      : null
    return (
      <div>{labelEl}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" style={{ ...baseInput, flex: 1 }} value={start}
            onChange={e => onChange({ ...value, start: e.target.value })} />
          <span style={{ color: 'var(--t3)', fontSize: 12 }}>→</span>
          <input type="date" style={{ ...baseInput, flex: 1 }} value={end}
            onChange={e => onChange({ ...value, end: e.target.value })} />
        </div>
        {days !== null && (
          <div style={{ fontSize: 11, color: 'var(--cyan)', marginTop: 4 }}>共 {days} 天</div>
        )}
      </div>
    )
  }

  if (field.type === 'employee_picker') {
    return (
      <div>{labelEl}
        <select style={baseInput} value={value || ''} onChange={e => onChange(e.target.value)}>
          <option value="">請選擇員工…</option>
          {(pickers.employees || []).map(e => (
            <option key={e.id} value={e.id}>{e.name}{e.dept ? `（${e.dept}）` : ''}</option>
          ))}
        </select>
      </div>
    )
  }
  if (field.type === 'department_picker') {
    return (
      <div>{labelEl}
        <select style={baseInput} value={value || ''} onChange={e => onChange(e.target.value)}>
          <option value="">請選擇部門…</option>
          {(pickers.departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
    )
  }
  if (field.type === 'store_picker') {
    return (
      <div>{labelEl}
        <select style={baseInput} value={value || ''} onChange={e => onChange(e.target.value)}>
          <option value="">請選擇門市…</option>
          {(pickers.stores || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    )
  }

  if (field.type === 'file') {
    return (
      <div>{labelEl}
        <div style={{ fontSize: 12, color: 'var(--orange)', padding: '10px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid var(--orange)' }}>
          📎 此欄位需上傳檔案，請在電腦版 SME Ops 填寫
        </div>
      </div>
    )
  }

  return (
    <div>{labelEl}
      <input style={baseInput}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        placeholder={field.placeholder || ''}
        value={value || ''}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}
