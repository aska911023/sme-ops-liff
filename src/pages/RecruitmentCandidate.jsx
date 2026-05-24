import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, FileText, Phone, Mail } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const STAGE_COLOR = {
  '投遞':   'var(--t3)',
  '篩選':   '#6366f1',
  '面試':   'var(--cyan)',
  '錄取決定': 'var(--orange)',
  '已錄取':  'var(--green)',
  '淘汰':    'var(--red)',
}

export default function RecruitmentCandidate() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lineProfile?.lineUserId || !id) return
    supabase.rpc('liff_get_candidate_detail', {
      p_line_user_id: lineProfile.lineUserId,
      p_candidate_id: Number(id),
    }).then(({ data }) => setData(data)).finally(() => setLoading(false))
  }, [lineProfile?.lineUserId, id])

  if (loading) return <div style={{ padding: 24, color: 'var(--t2)' }}>載入中…</div>
  if (data?.error) return (
    <div style={{ padding: 24 }}>
      <div style={{ color: 'var(--red)', marginBottom: 12 }}>
        {data.error === 'forbidden' ? '你沒有權限看這位候選人' : '找不到此候選人'}
      </div>
      <button onClick={() => navigate(-1)} style={{ color: 'var(--cyan)' }}>返回</button>
    </div>
  )

  const c = data.candidate
  const job = data.job
  const interviews = data.interviews || []

  const fmtDt = (iso) => iso
    ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div style={{ padding: 14, paddingBottom: 40 }}>
      <button onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--cyan)', padding: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <ChevronLeft size={16} /> 返回
      </button>

      <div style={{ background: 'var(--glass)', borderRadius: 10, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>{c.name}</h2>
          <span style={{
            padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
            background: 'rgba(255,255,255,0.1)', color: STAGE_COLOR[c.stage] || 'var(--t3)',
          }}>{c.stage}</span>
        </div>
        {job && (
          <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 6 }}>
            應徵：<b>{job.title}</b>{job.dept ? ` · ${job.dept}` : ''}
          </div>
        )}
        {Array.isArray(c.tags) && c.tags.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {c.tags.map(t => (
              <span key={t} style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                background: 'rgba(6,182,212,0.15)', color: 'var(--cyan)',
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* 聯絡 + 履歷 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {c.phone && (
          <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'var(--glass)', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--t1)', textDecoration: 'none' }}>
            <Phone size={16} style={{ color: 'var(--cyan)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>電話</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.phone}</div>
            </div>
          </a>
        )}
        {c.email && (
          <a href={`mailto:${c.email}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'var(--glass)', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--t1)', textDecoration: 'none' }}>
            <Mail size={16} style={{ color: 'var(--cyan)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Email</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.email}</div>
            </div>
          </a>
        )}
        {c.resume_url && (
          <a href={c.resume_url} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'var(--glass)', borderRadius: 8, border: '1px solid var(--cyan)', color: 'var(--cyan)', textDecoration: 'none' }}>
            <FileText size={16} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>📄 看履歷</div>
          </a>
        )}
        {c.source && (
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>應徵管道：{c.source}</div>
        )}
      </div>

      {c.notes && (
        <div style={{ padding: 10, background: 'var(--glass)', borderRadius: 8, marginBottom: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>備註</div>
          <div style={{ fontSize: 13, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>{c.notes}</div>
        </div>
      )}

      {/* 面試紀錄 */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>
        面試紀錄（{interviews.length}）
      </div>
      {interviews.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--t3)', fontSize: 12, background: 'var(--glass)', borderRadius: 8 }}>
          尚無面試
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {interviews.map(iv => {
            const resColor = iv.result === '通過' ? 'var(--green)' : iv.result === '不通過' ? 'var(--red)' : 'var(--t3)'
            const clickable = iv.is_mine
            return (
              <div key={iv.id}
                onClick={() => clickable && navigate(`/recruitment/interview/${iv.id}/eval`)}
                style={{
                  padding: 10, borderRadius: 8, background: 'var(--glass)',
                  border: '1px solid var(--border)', cursor: clickable ? 'pointer' : 'default',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{iv.round}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: resColor }}>{iv.result}{iv.score ? ` (${iv.score}/5)` : ''}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                  {fmtDt(iv.scheduled_at)} · {iv.interviewer_name || '—'}
                  {clickable && iv.result === '待定' && <span style={{ color: 'var(--orange)', marginLeft: 6 }}>· 點擊評核 →</span>}
                </div>
                {iv.note && (
                  <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4, fontStyle: 'italic' }}>📝 {iv.note}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
