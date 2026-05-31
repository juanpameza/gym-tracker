'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { activityHeadline } from '@/lib/social'
import type { Comment } from '@/lib/social'
import type { FeedItem } from './page'

export default function Feed({ items, viewerId }: { items: FeedItem[]; viewerId: string }) {
  return (
    <div className="space-y-3">
      {items.map(item => (
        <Card key={item.activity.id} item={item} viewerId={viewerId} />
      ))}
    </div>
  )
}

function Card({ item, viewerId }: { item: FeedItem; viewerId: string }) {
  const { activity, actor } = item
  const [kudoed, setKudoed] = useState(item.viewerKudoed)
  const [kudosCount, setKudosCount] = useState(item.kudosCount)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentCount, setCommentCount] = useState(item.commentCount)
  const [loadingComments, setLoadingComments] = useState(false)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  const name = actor.displayName || actor.username || 'Unknown athlete'

  async function toggleKudos() {
    const supabase = createClient()
    if (kudoed) {
      setKudoed(false); setKudosCount(c => c - 1)
      await supabase.from('kudos').delete().eq('activity_id', activity.id).eq('user_id', viewerId)
    } else {
      setKudoed(true); setKudosCount(c => c + 1)
      await supabase.from('kudos').insert({ activity_id: activity.id, user_id: viewerId })
    }
  }

  async function openComments() {
    const next = !showComments
    setShowComments(next)
    if (next && comments.length === 0 && commentCount > 0) {
      setLoadingComments(true)
      const supabase = createClient()
      const { data } = await supabase.from('comments').select('*').eq('activity_id', activity.id).order('created_at', { ascending: true })
      setComments((data ?? []) as Comment[])
      setLoadingComments(false)
    }
  }

  async function postComment() {
    const body = draft.trim()
    if (!body) return
    setPosting(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('comments')
      .insert({ activity_id: activity.id, author_id: viewerId, body })
      .select('*')
      .single()
    setPosting(false)
    if (error || !data) return
    setComments(c => [...c, data as Comment])
    setCommentCount(c => c + 1)
    setDraft('')
  }

  return (
    <div className="border border-[#2a2a25] p-4">
      {/* actor row */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 border border-[#2a2a25] overflow-hidden bg-[rgba(244,237,224,0.03)] flex items-center justify-center shrink-0">
          {actor.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={actor.avatarUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="font-display text-base font-black text-[#3a3a32]">{name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {actor.username ? (
            <Link href={`/u/${actor.username}`} className="text-[13px] font-bold truncate hover:text-[#d9a441] transition-colors block">{name}</Link>
          ) : (
            <div className="text-[13px] font-bold truncate">{name}</div>
          )}
        </div>
        <span className="text-[10px] text-[#6b6a62] whitespace-nowrap">{timeAgo(activity.created_at)}</span>
      </div>

      {/* headline */}
      <p className="text-[14px] text-[#f4ede0] mb-3 leading-snug">{activityHeadline(activity)}</p>

      {/* actions */}
      <div className="flex items-center gap-4 border-t border-dashed border-[#2a2a25] pt-3">
        <button onClick={toggleKudos} className={`text-[11px] font-bold tracking-[0.1em] uppercase transition-colors cursor-pointer ${kudoed ? 'text-[#4a9b5e]' : 'text-[#6b6a62] hover:text-[#4a9b5e]'}`}>
          ▲ KUDOS{kudosCount > 0 ? ` · ${kudosCount}` : ''}
        </button>
        <button onClick={openComments} className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#6b6a62] hover:text-[#d9a441] transition-colors cursor-pointer">
          ✎ COMMENT{commentCount > 0 ? ` · ${commentCount}` : ''}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 space-y-2">
          {loadingComments && <p className="text-[11px] text-[#6b6a62]">Loading…</p>}
          {comments.map(c => (
            <div key={c.id} className="text-[12px] border-l-2 border-[#2a2a25] pl-3 py-0.5">
              <span className="text-[#f4ede0]">{c.body}</span>
              <span className="text-[#6b6a62] text-[10px] ml-2">{timeAgo(c.created_at)}</span>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') postComment() }}
              placeholder="Add a comment…"
              maxLength={1000}
              className="flex-1 bg-transparent border border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-[12px] py-2 px-2.5 outline-none transition-colors"
            />
            <button onClick={postComment} disabled={posting || !draft.trim()} className="border border-[#f4ede0] hover:bg-[#f4ede0] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.15em] text-[10px] uppercase px-3 transition-all disabled:opacity-40 cursor-pointer">
              SEND
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}
