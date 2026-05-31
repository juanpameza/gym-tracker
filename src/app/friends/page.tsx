import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { friendRel } from '@/lib/social'
import type { Friendship, Profile } from '@/lib/social'
import FriendsList from './list'

export const dynamic = 'force-dynamic'

export type FriendItem = {
  otherId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
}

export default async function FriendsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: rows } = await supabase
    .from('friendships')
    .select('*')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order('created_at', { ascending: false })

  const friendships = (rows ?? []) as Friendship[]
  const otherIds = friendships.map(f => (f.user_a === user.id ? f.user_b : f.user_a))

  const profileById = new Map<string, Profile>()
  if (otherIds.length) {
    const { data: profs } = await supabase.from('profiles').select('*').in('user_id', otherIds)
    for (const p of (profs ?? []) as Profile[]) profileById.set(p.user_id, p)
  }

  const toItem = (f: Friendship): FriendItem => {
    const otherId = f.user_a === user.id ? f.user_b : f.user_a
    const p = profileById.get(otherId)
    return { otherId, username: p?.username ?? null, displayName: p?.display_name ?? null, avatarUrl: p?.avatar_url ?? null }
  }

  const incoming = friendships.filter(f => friendRel(f, user.id) === 'incoming').map(toItem)
  const outgoing = friendships.filter(f => friendRel(f, user.id) === 'outgoing').map(toItem)
  const friends = friendships.filter(f => friendRel(f, user.id) === 'friends').map(toItem)

  return (
    <div
      className="min-h-screen px-4 py-8 pb-24"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)', backgroundAttachment: 'fixed' }}
    >
      <div className="max-w-lg mx-auto">
        <header className="border-2 border-[#f4ede0] p-6 mb-6 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">PEOPLE</div>
          <h1 className="font-display font-black leading-none text-4xl">
            FRIENDS<span className="text-[#d9a441] italic">.</span>
          </h1>
        </header>

        <Link href="/discover" className="flex items-center justify-between border border-[#2a2a25] hover:border-[#f4ede0] p-4 transition-colors group mb-7">
          <span className="text-[13px] font-bold">Find more athletes</span>
          <span className="text-[#6b6a62] group-hover:text-[#f4ede0] text-xs tracking-widest">→</span>
        </Link>

        <FriendsList incoming={incoming} outgoing={outgoing} friends={friends} />

        <footer className="mt-12 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">// FRIENDS //</footer>
      </div>
    </div>
  )
}
