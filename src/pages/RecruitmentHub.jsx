import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Calendar, AlertCircle, Users } from 'lucide-react'
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

export default function RecruitmentHub() {
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_get_recruitment_hub', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false))
  }, [lineProfile?.lineUserId])

  if (loading) return <div style={{ padding: 24, color: 'var(--t2)' }}>載入中…</div>
  if (data?.error === 'unauthorized') return <div style={{ padding: 24, color: 'var(--red)' }}>未授權</div>

  const upcoming  = data?.upcoming_interviews || []
  const pending   = data?.past_pending_eval || []
  const myCands   = data?.my_candidates || []
  const empty = upcoming.length === 0 && pending.length === 0 && myCands.length === 0

  const fmtDt = (iso) => iso
    ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
    : '—'

  return (
    <div style={{ padding: 14, paddingBottom: 40 }}>
      <button onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--cyan)', padding: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <ChevronLeft size={16} /> 返回
      </button>

      <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)', margin: '0 0 12px' }}>🔍 招募管理</h2>

      {empty && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', background: 'var(--glass)', borderRadius: 10 }}>
          🎉 目前沒有相關的招募任務
        </div>
      )}

      {/* 待打分（最高優先） */}
      {pending.length > 0 && (
        <Section icon={AlertCircle} title={`待打分的面試（${pending.length}）`} color="var(--orange)">
          {pending.map(iv => (
            <Card key={iv.id} onClick={() => navigate(`/recruitment/interview/${iv.id}/eval`)}>
              <Row label={iv.candidate_name} value={iv.round} valueStyle={{ color: 'var(--orange)', fontWeight: 700 }} />
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {iv.job_title || '—'} · {fmtDt(iv.scheduled_at)}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--orange)', fontWeight: 600 }}>
                點擊填寫評核 →
              </div>
            </Card>
          ))}
        </Section>
      )}

      {/* 即將到來的面試 */}
      {upcoming.length > 0 && (
        <Section icon={Calendar} title={`即將到來的面試（${upcoming.length}）`} color="var(--cyan)">
          {upcoming.map(iv => (
            <Card key={iv.id} onClick={() => navigate(`/recruitment/interview/${iv.id}`)}>
              <Row label={iv.candidate_name} value={iv.round} />
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {iv.job_title || '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t1)', marginTop: 4, fontWeight: 600 }}>
                🕒 {fmtDt(iv.scheduled_at)}
              </div>
              {iv.location && (
                <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>📍 {iv.location}</div>
              )}
            </Card>
          ))}
        </Section>
      )}

      {/* 我招的候選人 */}
      {myCands.length > 0 && (
        <Section icon={Users} title={`我的候選人（${myCands.length}）`} color="var(--purple)">
          {myCands.map(c => (
            <Card key={c.id} onClick={() => navigate(`/recruitment/candidate/${c.id}`)}>
              <Row label={c.name} value={c.stage}
                valueStyle={{ color: STAGE_COLOR[c.stage] || 'var(--t3)', fontWeight: 700 }} />
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {c.job_title || '—'} · {c.created_at}
              </div>
              {Array.isArray(c.tags) && c.tags.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {c.tags.slice(0, 4).map(t => (
                    <span key={t} style={{
                      padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                      background: 'rgba(6,182,212,0.15)', color: 'var(--cyan)',
                    }}>{t}</span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ icon: Icon, title, color, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color, fontSize: 13, fontWeight: 700 }}>
        <Icon size={14} /> {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function Card({ children, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        padding: 12, borderRadius: 8, background: 'var(--glass)',
        border: '1px solid var(--border)', cursor: 'pointer',
      }}>
      {children}
    </div>
  )
}

function Row({ label, value, valueStyle }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{label}</span>
      <span style={{ fontSize: 11, ...valueStyle }}>{value}</span>
    </div>
  )
}
