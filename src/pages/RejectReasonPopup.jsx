import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X, AlertTriangle, Send } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 7 種申請類型 → 顯示用標籤
const TYPE_LABEL = {
  leave: '請假申請',
  overtime: '加班申請',
  trip: '出差申請',
  expense: '報帳申請',
  expense_request: '經費申請',
  correction: '補打卡申請',
  cover: '代班邀請',
  off_request: '希望休申請',
}

// 4 個常用駁回原因（跟 BOT quick reply 對齊）
const QUICK_REASONS = [
  '需附證明文件',
  '請改其他日期',
  '當天工時不允許',
  '請先跟主管討論',
]

export default function RejectReasonPopup() {
  const { lineProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const type = searchParams.get('type')
  const id = Number(searchParams.get('id'))
  const applicant = searchParams.get('applicant') || '員工'

  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    // 自動 focus textarea，讓使用者打開直接打字
    textareaRef.current?.focus()
  }, [])

  const close = async () => {
    try {
      const liff = (await import('@line/liff')).default
      if (liff.isInClient && liff.isInClient()) {
        liff.closeWindow()
      } else {
        window.close()
      }
    } catch {
      window.close()
    }
  }

  const submit = async () => {
    const r = reason.trim()
    if (!r) {
      setError('請填寫駁回原因')
      return
    }
    if (!lineProfile?.lineUserId || !type || !id) {
      setError('參數缺失，請從 LINE 重開')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      const { data, error: rpcErr } = await supabase.rpc('liff_approve_request', {
        p_line_user_id: lineProfile.lineUserId,
        p_type: type,
        p_id: id,
        p_action: 'reject',
        p_reason: r,
      })
      if (rpcErr) {
        setError(`系統錯誤：${rpcErr.message}`)
        setSubmitting(false)
        return
      }
      if (!data?.ok) {
        const errMap = {
          EMPLOYEE_NOT_FOUND: '你的 LINE 還沒綁員工',
          NOT_FOUND_OR_ALREADY_PROCESSED: '此單不存在或已被處理',
          ORG_MISMATCH: '跨組織不能簽核',
          NOT_YOUR_TURN: '不輪到你簽核',
          REASON_REQUIRED: '請填寫駁回原因',
        }
        setError(errMap[data?.error] || data?.error || '駁回失敗')
        setSubmitting(false)
        return
      }

      // 清掉 pending action（避免使用者下次打字又被當駁回原因）
      await supabase.rpc('liff_card_clear_pending', {
        p_line_user_id: lineProfile.lineUserId,
      })

      setDone(true)
      // 1.2 秒後自動關閉
      setTimeout(close, 1200)
    } catch (e) {
      setError(`系統錯誤：${e.message || e}`)
      setSubmitting(false)
    }
  }

  const typeLabel = TYPE_LABEL[type] || '申請'

  // 完成畫面
  if (done) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>
            已駁回
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)', textAlign: 'center', marginBottom: 4 }}>
            {applicant} 的{typeLabel}（#{id}）
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center' }}>
            已通知申請人，可修改後重送
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 16, background: 'rgba(220,38,38,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626',
            }}>
              <AlertTriangle size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>駁回 {typeLabel}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>{applicant} · #{id}</div>
            </div>
          </div>
          <button
            onClick={close}
            disabled={submitting}
            style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>
          常用原因（點選一鍵代入）
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {QUICK_REASONS.map(r => (
            <button
              key={r}
              onClick={() => setReason(r)}
              disabled={submitting}
              style={{
                padding: '6px 10px', borderRadius: 14, fontSize: 12,
                background: reason === r ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.05)',
                color: reason === r ? '#fca5a5' : 'var(--t2)',
                border: `1px solid ${reason === r ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.1)'}`,
                cursor: submitting ? 'default' : 'pointer',
              }}
            >
              {r}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>
          駁回原因（必填）
        </div>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={e => setReason(e.target.value)}
          disabled={submitting}
          placeholder="例：請附上醫師診斷書"
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 8,
            background: 'rgba(0,0,0,0.25)', color: 'var(--t1)', fontSize: 14,
            border: '1px solid rgba(255,255,255,0.1)', outline: 'none', resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />

        {error && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
            color: '#fca5a5', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={close}
            disabled={submitting}
            style={{
              flex: 1, padding: '12px', borderRadius: 8, fontSize: 14,
              background: 'rgba(255,255,255,0.05)', color: 'var(--t2)',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting || !reason.trim()}
            style={{
              flex: 2, padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700,
              background: submitting || !reason.trim() ? 'rgba(220,38,38,0.4)' : '#dc2626',
              color: '#fff', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: submitting || !reason.trim() ? 'default' : 'pointer',
            }}
          >
            {submitting ? '送出中...' : <><Send size={14} /> 確認駁回</>}
          </button>
        </div>
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'var(--bg)',
}

const cardStyle = {
  width: '100%',
  maxWidth: 420,
  background: 'var(--surface, rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
}
