import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * 加簽回覆卡（左右滑）：顯示這張單所有「已處理」的加簽 + 加簽人核准/退回時留的備註，
 * 讓後續簽核人（如發起加簽的執行長）看到加簽人的判斷。
 * list_request_extra_steps 是 SECURITY DEFINER，anon 可直接呼叫。
 * @param {string} sourceTable 對 approval_extra_steps.source_table（如 'expense_requests'）
 * @param {number} sourceId
 */
export default function ExtraSignerReplyCards({ sourceTable, sourceId }) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!sourceTable || !sourceId) return
    let cancelled = false
    supabase.rpc('list_request_extra_steps', { p_source_table: sourceTable, p_source_id: Number(sourceId) })
      .then(({ data }) => {
        if (cancelled) return
        const done = (Array.isArray(data) ? data : []).filter(
          e => (e.status === 'approved' && e.processor_note) || (e.status === 'rejected' && e.reject_reason)
        )
        setRows(done)
      })
    return () => { cancelled = true }
  }, [sourceTable, sourceId])

  if (!rows.length) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>🪶 加簽回覆</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
        {rows.map(e => {
          const rejected = e.status === 'rejected'
          return (
            <div key={e.id} style={{
              flex: rows.length > 1 ? '0 0 86%' : '1 1 100%', scrollSnapAlign: 'start',
              padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
              border: `1px solid ${rejected ? 'var(--red)' : 'var(--green)'}`,
              background: rejected ? 'rgba(248,113,113,0.08)' : 'var(--green-dim)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: rejected ? 'var(--red)' : 'var(--green)' }}>
                {rejected ? '❌ 退回' : '✅ 核准'} · {e.assignee_name || '加簽人'}
              </div>
              {e.reason && (
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, lineHeight: 1.4 }}>
                  發起：{e.requester_name || ''}｜{e.reason}
                </div>
              )}
              <div style={{ fontSize: 13, color: 'var(--t1)', marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {rejected ? e.reject_reason : e.processor_note}
              </div>
            </div>
          )
        })}
      </div>
      {rows.length > 1 && (
        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2, textAlign: 'center' }}>← 左右滑看更多加簽回覆 →</div>
      )}
    </div>
  )
}
