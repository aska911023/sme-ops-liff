import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, FileText, Phone, Star } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function RecruitmentInterview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lineProfile?.lineUserId || !id) return
    supabase.rpc('liff_get_interview_detail', {
      p_line_user_id: lineProfile.lineUserId,
      p_interview_id: Number(id),
    }).then(({ data }) => setData(data)).finally(() => setLoading(false))
  }, [lineProfile?.lineUserId, id])

  if (loading) return <div style={{ padding: 24, color: 'var(--t2)' }}>載入中…</div>
  if (data?.error) return (
    <div style={{ padding: 24 }}>
      <div style={{ color: 'var(--red)', marginBottom: 12 }}>
        {data.error === 'forbidden' ? '你不是這場面試的面試官' : '找不到此面試'}
      </div>
      <button onClick={() => navigate(-1)} style={{ color: 'var(--cyan)' }}>返回</button>
    </div>
  )

  const iv = data.interview
  const c = data.candidate
  const job = data.job
  const prior = data.prior_interviews || []
  const fmtDt = (iso) => iso
    ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
    : '—'

  return (
    <div style={{ padding: 14, paddingBottom: 140 }}>
      <button onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--cyan)', padding: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <ChevronLeft size={16} /> 返回
      </button>

      <div style={{ background: 'var(--glass)', borderRadius: 10, padding: 14, marginBottom: 14, border: '1px solid var(--cyan)' }}>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>面試</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cyan)', margin: '4px 0' }}>{iv.round}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>🕒 {fmtDt(iv.scheduled_at)}</div>
        {iv.location && <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>📍 {iv.location}</div>}
      </div>

      {/* 候選人 */}
      <div style={{ background: 'var(--glass)', borderRadius: 10, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>{c.name}</div>
            {job && (
              <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>
                應徵：<b>{job.title}</b>{job.dept ? ` · ${job.dept}` : ''}
              </div>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{c.stage}</span>
        </div>
        {Array.isArray(c.tags) && c.tags.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {c.tags.map(t => (
              <span key={t} style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                background: 'rgba(6,182,212,0.15)', color: 'var(--cyan)',
              }}>{t}</span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          {c.phone && (
            <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
              style={{ flex: 1, padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cyan)', textDecoration: 'none', fontSize: 12, fontWeight: 600, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Phone size={12} /> 撥電話
            </a>
          )}
          {c.resume_url && (
            <a href={c.resume_url} target="_blank" rel="noreferrer"
              style={{ flex: 1, padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--cyan)', textDecoration: 'none', fontSize: 12, fontWeight: 600, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <FileText size={12} /> 看履歷
            </a>
          )}
        </div>
      </div>

      {/* 前次面試 */}
      {prior.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>
            前次面試（{prior.length}）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {prior.map(p => {
              const resColor = p.result === '通過' ? 'var(--green)' : p.result === '不通過' ? 'var(--red)' : 'var(--t3)'
              return (
                <div key={p.id} style={{ padding: 10, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{p.round}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: resColor }}>
                      {p.result}{p.score ? ` (${p.score}/5)` : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                    {fmtDt(p.scheduled_at)} · {p.interviewer_name || '—'}
                  </div>
                  {p.note && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4, fontStyle: 'italic' }}>📝 {p.note}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 本場目前狀態 / CTA */}
      <div style={{
        position: 'fixed', left: 0, right: 0,
        /* 墊到全域 TabBar(fixed bottom:0, 高約 54px + 安全區)上方,否則按鈕被 hub tab 蓋住 */
        bottom: 'calc(54px + env(safe-area-inset-bottom, 8px))', padding: 14,
        background: 'var(--bg)', borderTop: '1px solid var(--border)', zIndex: 99,
      }}>
        {iv.result === '待定' ? (
          <button onClick={() => navigate(`/recruitment/interview/${iv.id}/eval`)}
            style={{ width: '100%', padding: 14, borderRadius: 8, border: 'none',
              background: 'var(--cyan)', color: '#fff', fontWeight: 700, fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Star size={16} /> 開始填寫評核
          </button>
        ) : (
          <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>本場已評核</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: iv.result === '通過' ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
              {iv.result}{iv.score ? ` · ${iv.score}/5` : ''}
            </div>
            {iv.note && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4 }}>{iv.note}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
