import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Star, Check, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function RecruitmentInterviewEval() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [scores, setScores] = useState({})
  const [singleScore, setSingleScore] = useState(0)
  const [result, setResult] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!lineProfile?.lineUserId || !id) return
    supabase.rpc('liff_get_interview_detail', {
      p_line_user_id: lineProfile.lineUserId,
      p_interview_id: Number(id),
    }).then(({ data }) => {
      setData(data)
      if (data?.interview) {
        setScores(data.interview.scores || {})
        setSingleScore(data.interview.score || 0)
        setResult(data.interview.result === '待定' ? '' : data.interview.result)
        setNote(data.interview.note || '')
      }
    }).finally(() => setLoading(false))
  }, [lineProfile?.lineUserId, id])

  const evalTpl = data?.evaluation_template
  const dims = evalTpl?.dimensions || []

  // 加權平均（多維度）
  const weightedAvg = useMemo(() => {
    if (!dims.length) return 0
    let sum = 0, w = 0
    for (const d of dims) {
      const v = Number(scores[d.key] || 0)
      const weight = Number(d.weight || 1)
      if (v > 0) { sum += v * weight; w += weight }
    }
    return w > 0 ? Math.round((sum / w) * 10) / 10 : 0
  }, [dims, scores])

  const finalScore = evalTpl ? weightedAvg : singleScore

  const submit = async () => {
    if (!result) { alert('請選擇結果（通過 / 不通過）'); return }
    if (evalTpl && weightedAvg === 0) { alert('請完成至少一個維度評分'); return }
    if (!evalTpl && singleScore === 0) { alert('請填寫評分'); return }
    setSubmitting(true)
    try {
      const { data: res, error } = await supabase.rpc('liff_submit_interview_eval', {
        p_line_user_id: lineProfile.lineUserId,
        p_interview_id: Number(id),
        p_scores: evalTpl ? scores : {},
        p_score: finalScore,
        p_result: result,
        p_note: note || null,
      })
      if (error) throw error
      if (!res?.ok) throw new Error(res?.error || '送出失敗')
      alert('評核已送出，HR 將收到通知')
      navigate('/recruitment', { replace: true })
    } catch (e) {
      alert('送出失敗：' + (e.message || '未知錯誤'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--t2)' }}>載入中…</div>
  if (data?.error) return (
    <div style={{ padding: 24 }}>
      <div style={{ color: 'var(--red)', marginBottom: 12 }}>
        {data.error === 'forbidden' ? '你不是這場面試的面試官' : '找不到此面試'}
      </div>
      <button onClick={() => navigate(-1)} style={{ color: 'var(--cyan)' }}>返回</button>
    </div>
  )

  const c = data.candidate
  const iv = data.interview

  return (
    <div style={{ padding: 14, paddingBottom: 140 }}>
      <button onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--cyan)', padding: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <ChevronLeft size={16} /> 返回
      </button>

      <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)', margin: '0 0 4px' }}>📝 填寫面試評核</h2>
      <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 14 }}>
        {c.name} · {iv.round}
      </div>

      {/* 維度評分 or 單一評分 */}
      {evalTpl ? (
        <div style={{ padding: 14, background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>
            多維度評核 — <b style={{ color: 'var(--cyan)' }}>{evalTpl.name}</b>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {dims.map(d => {
              const v = Number(scores[d.key] || 0)
              const max = d.max || 5
              return (
                <div key={d.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>
                      {d.label}
                      {d.weight && d.weight !== 1 && (
                        <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 6 }}>權重 ×{d.weight}</span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 700 }}>{v} / {max}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Array.from({ length: max }, (_, i) => i + 1).map(n => (
                      <button key={n}
                        onClick={() => setScores(s => ({ ...s, [d.key]: v === n ? 0 : n }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        <Star size={24} fill={n <= v ? 'var(--orange)' : 'none'}
                          style={{ color: n <= v ? 'var(--orange)' : 'var(--t3)' }} />
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {weightedAvg > 0 && (
            <div style={{ marginTop: 12, padding: 8, background: 'rgba(6,182,212,0.1)', borderRadius: 6, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--cyan)' }}>
              加權平均：{weightedAvg} / 5
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: 14, background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>整體評分（1-5）</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {[1,2,3,4,5].map(n => (
              <button key={n}
                onClick={() => setSingleScore(singleScore === n ? 0 : n)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <Star size={32} fill={n <= singleScore ? 'var(--orange)' : 'none'}
                  style={{ color: n <= singleScore ? 'var(--orange)' : 'var(--t3)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 結果 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>結果 *</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setResult('通過')}
            style={{
              flex: 1, padding: 14, borderRadius: 8, fontWeight: 700, fontSize: 15,
              border: `2px solid ${result === '通過' ? 'var(--green)' : 'var(--border)'}`,
              background: result === '通過' ? 'rgba(34,197,94,0.15)' : 'transparent',
              color: result === '通過' ? 'var(--green)' : 'var(--t2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Check size={18} /> 通過
          </button>
          <button onClick={() => setResult('不通過')}
            style={{
              flex: 1, padding: 14, borderRadius: 8, fontWeight: 700, fontSize: 15,
              border: `2px solid ${result === '不通過' ? 'var(--red)' : 'var(--border)'}`,
              background: result === '不通過' ? 'rgba(239,68,68,0.15)' : 'transparent',
              color: result === '不通過' ? 'var(--red)' : 'var(--t2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <X size={18} /> 不通過
          </button>
        </div>
      </div>

      {/* 備註 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>備註 / 評語</div>
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder="可寫優缺點、特別觀察、建議下一輪重點..."
          style={{
            width: '100%', minHeight: 100, padding: 12, borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--glass)',
            color: 'var(--t1)', fontSize: 14, resize: 'vertical',
          }} />
      </div>

      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, padding: 14,
        background: 'var(--bg)', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8,
      }}>
        <button onClick={() => navigate(-1)}
          style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontWeight: 600 }}>
          取消
        </button>
        <button onClick={submit} disabled={submitting}
          style={{
            flex: 2, padding: 12, borderRadius: 8, border: 'none',
            background: result === '不通過' ? 'var(--red)' : 'var(--green)',
            color: '#fff', fontWeight: 700, fontSize: 15,
            opacity: submitting ? 0.5 : 1,
          }}>
          {submitting ? '送出中…' : '送出評核'}
        </button>
      </div>
    </div>
  )
}
