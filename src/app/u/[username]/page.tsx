import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { friendPair, friendRel, activityHeadline } from '@/lib/social'
import type { Profile, Activity, Friendship } from '@/lib/social'
import type { Routine } from '@/lib/routine'
import ProfileActions from './actions'

export const dynamic = 'force-dynamic'

export default async function PublicProfile({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle()

  const profile = profileRow as Profile | null

  if (!profile) {
    return (
      <Shell>
        <div className="text-center py-20">
          <p className="font-display font-black text-3xl text-[#c8311a] mb-3">NOT FOUND.</p>
          <p className="text-[13px] text-[#6b6a62] mb-6">
            No public profile for <span className="text-[#f4ede0]">@{username}</span>.
          </p>
          <Link href="/discover" className="inline-block border border-[#f4ede0] hover:bg-[#f4ede0] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-3 px-6 transition-all">
            ▸ FIND PEOPLE
          </Link>
        </div>
      </Shell>
    )
  }

  const isOwn = profile.user_id === user.id

  const pair = friendPair(user.id, profile.user_id)
  const [{ data: friendRow }, { data: acts }, { data: viewerProg }] = await Promise.all([
    isOwn
      ? Promise.resolve({ data: null })
      : supabase.from('friendships').select('*').eq('user_a', pair.user_a).eq('user_b', pair.user_b).maybeSingle(),
    supabase
      .from('activities')
      .select('*')
      .eq('actor_id', profile.user_id)
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.from('programs').select('id, routine').eq('user_id', user.id).maybeSingle(),
  ])

  const rel = friendRel(friendRow as Friendship | null, user.id)
  const viewerHasRoutine = Object.keys((viewerProg?.routine as Routine) ?? {}).length > 0
  const activities = (acts ?? []) as Activity[]
  const sharedRoutine = profile.shared_routine as Routine | null
  const statEntries = profile.share_stats ? Object.entries(profile.lift_stats ?? {}) : []
  const routineDays = sharedRoutine ? Object.entries(sharedRoutine) : []

  return (
    <Shell>
      <header className="border-2 border-[#f4ede0] p-6 mb-6 relative bg-[rgba(244,237,224,0.02)]">
        <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">ATHLETE</div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 border border-[#2a2a25] overflow-hidden bg-[rgba(244,237,224,0.03)] flex items-center justify-center shrink-0">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-3xl font-black text-[#3a3a32]">{(profile.display_name || profile.username).charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-black leading-none text-3xl truncate">{profile.display_name || profile.username}</h1>
            <div className="text-[12px] tracking-[0.15em] text-[#6b6a62] mt-1">@{profile.username}</div>
          </div>
        </div>
        {profile.bio && <p className="text-[13px] text-[#f4ede0] mt-4 leading-relaxed border-t border-dashed border-[#2a2a25] pt-4">{profile.bio}</p>}
      </header>

      {isOwn ? (
        <Link href="/profile/edit" className="block text-center border border-[#d9a441] text-[#d9a441] hover:bg-[#d9a441] hover:text-[#1a1a17] font-bold tracking-[0.2em] text-[11px] uppercase py-3 transition-all mb-7">
          ▸ EDIT YOUR PROFILE
        </Link>
      ) : (
        <ProfileActions
          targetUserId={profile.user_id}
          targetUsername={profile.username}
          initialRel={rel}
          canFork={profile.shares_routine && !!sharedRoutine}
          viewerHasRoutine={viewerHasRoutine}
        />
      )}

      {/* Lift stats */}
      {statEntries.length > 0 && (
        <section className="mb-7">
          <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase mb-3">// Best Lifts (est. 1RM) //</div>
          <div className="grid grid-cols-2 gap-3">
            {statEntries.map(([id, s]) => (
              <div key={id} className="border border-[#2a2a25] p-3">
                <div className="font-display text-2xl font-black text-[#d9a441] leading-none">{s.est1rm}<span className="text-[11px] text-[#6b6a62] ml-1">{s.unit}</span></div>
                <div className="text-[10px] tracking-[0.12em] text-[#6b6a62] uppercase mt-1.5 truncate">{s.name}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Shared routine */}
      {routineDays.length > 0 && (
        <section className="mb-7">
          <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase mb-3">// Routine — {routineDays.length} days //</div>
          <div className="space-y-2">
            {routineDays.map(([dk, d]) => (
              <div key={dk} className="border border-[#2a2a25] p-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-[13px] tracking-wide">{d.name}</span>
                  <span className="text-[10px] text-[#6b6a62]">{d.exercises.length} exercises</span>
                </div>
                {d.meta && <div className="text-[10px] text-[#6b6a62] tracking-[0.1em] mt-0.5">{d.meta}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activity */}
      <section className="mb-8">
        <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase mb-3">// Recent Activity //</div>
        {activities.length === 0 ? (
          <p className="text-[12px] text-[#6b6a62] border border-[#2a2a25] p-4">Nothing here yet.</p>
        ) : (
          <div className="space-y-2">
            {activities.map(a => (
              <div key={a.id} className="border border-[#2a2a25] p-3 flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-[#f4ede0]">{activityHeadline(a)}</span>
                <span className="text-[10px] text-[#6b6a62] whitespace-nowrap">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-8 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">// @{profile.username} //</footer>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen px-4 py-8 pb-24"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)', backgroundAttachment: 'fixed' }}
    >
      <div className="max-w-lg mx-auto">{children}</div>
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
