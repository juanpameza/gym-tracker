import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Activity, Profile } from '@/lib/social'
import Feed from './feed'

export const dynamic = 'force-dynamic'

export type FeedActor = { username: string | null; displayName: string | null; avatarUrl: string | null }

export type FeedItem = {
  activity: Activity
  actor: FeedActor
  kudosCount: number
  viewerKudoed: boolean
  commentCount: number
}

export default async function FeedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // RLS scopes this to self + accepted friends + public actors. No friend filter needed here.
  const { data: acts } = await supabase
    .from('activities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(40)

  const activities = (acts ?? []) as Activity[]
  const ids = activities.map(a => a.id)
  const actorIds = [...new Set(activities.map(a => a.actor_id))]

  const profileById = new Map<string, Profile>()
  const kudosByActivity = new Map<string, { count: number; mine: boolean }>()
  const commentCountByActivity = new Map<string, number>()

  if (actorIds.length) {
    const [{ data: profs }, { data: kudos }, { data: comments }] = await Promise.all([
      supabase.from('profiles').select('*').in('user_id', actorIds),
      supabase.from('kudos').select('activity_id, user_id').in('activity_id', ids),
      supabase.from('comments').select('activity_id').in('activity_id', ids),
    ])
    for (const p of (profs ?? []) as Profile[]) profileById.set(p.user_id, p)
    for (const k of (kudos ?? []) as { activity_id: string; user_id: string }[]) {
      const cur = kudosByActivity.get(k.activity_id) ?? { count: 0, mine: false }
      cur.count += 1
      if (k.user_id === user.id) cur.mine = true
      kudosByActivity.set(k.activity_id, cur)
    }
    for (const c of (comments ?? []) as { activity_id: string }[]) {
      commentCountByActivity.set(c.activity_id, (commentCountByActivity.get(c.activity_id) ?? 0) + 1)
    }
  }

  const items: FeedItem[] = activities.map(a => {
    const p = profileById.get(a.actor_id)
    const k = kudosByActivity.get(a.id) ?? { count: 0, mine: false }
    return {
      activity: a,
      actor: { username: p?.username ?? null, displayName: p?.display_name ?? null, avatarUrl: p?.avatar_url ?? null },
      kudosCount: k.count,
      viewerKudoed: k.mine,
      commentCount: commentCountByActivity.get(a.id) ?? 0,
    }
  })

  return (
    <div
      className="min-h-screen px-4 py-8 pb-24"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)', backgroundAttachment: 'fixed' }}
    >
      <div className="max-w-lg mx-auto">
        <header className="border-2 border-[#f4ede0] p-6 mb-6 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">FEED</div>
          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">★ THE SQUAD'S ★</div>
          <h1 className="font-display font-black leading-none text-4xl">
            FEED<span className="text-[#d9a441] italic">.</span>
          </h1>
        </header>

        {items.length === 0 ? (
          <div className="border border-[#d9a441] bg-[rgba(217,164,65,0.05)] p-6 text-center">
            <p className="text-[13px] text-[#f4ede0] mb-4">
              Your feed is quiet. Add friends and their workouts, PRs and forks will show up here.
            </p>
            <Link href="/discover" className="inline-block bg-[#d9a441] text-[#1a1a17] font-bold tracking-[0.2em] text-[11px] uppercase py-3 px-5 hover:bg-[#f4ede0] transition-colors">
              ▸ FIND ATHLETES
            </Link>
          </div>
        ) : (
          <Feed items={items} viewerId={user.id} />
        )}

        <footer className="mt-12 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">// FEED //</footer>
      </div>
    </div>
  )
}
