'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { friendPair } from '@/lib/social'
import type { FriendItem } from './page'

export default function FriendsList({
  incoming,
  outgoing,
  friends,
}: {
  incoming: FriendItem[]
  outgoing: FriendItem[]
  friends: FriendItem[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function act(otherId: string, fn: (supabase: ReturnType<typeof createClient>, pair: { user_a: string; user_b: string }) => PromiseLike<unknown>) {
    setBusy(otherId)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(null); return }
    await fn(supabase, friendPair(user.id, otherId))
    setBusy(null)
    router.refresh()
  }

  const accept = (id: string) => act(id, (s, p) =>
    s.from('friendships').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('user_a', p.user_a).eq('user_b', p.user_b))
  const remove = (id: string) => act(id, (s, p) =>
    s.from('friendships').delete().eq('user_a', p.user_a).eq('user_b', p.user_b))

  if (!incoming.length && !outgoing.length && !friends.length) {
    return <p className="text-[12px] text-[#6b6a62] border border-[#2a2a25] p-4">No friends or requests yet. Find athletes in Discover.</p>
  }

  return (
    <div className="space-y-8">
      {incoming.length > 0 && (
        <Section title={`Requests · ${incoming.length}`} accent>
          {incoming.map(f => (
            <Row key={f.otherId} item={f}>
              <SmallBtn onClick={() => accept(f.otherId)} disabled={busy === f.otherId} variant="primary">ACCEPT</SmallBtn>
              <SmallBtn onClick={() => remove(f.otherId)} disabled={busy === f.otherId} variant="ghost">DECLINE</SmallBtn>
            </Row>
          ))}
        </Section>
      )}

      {outgoing.length > 0 && (
        <Section title={`Sent · ${outgoing.length}`}>
          {outgoing.map(f => (
            <Row key={f.otherId} item={f}>
              <SmallBtn onClick={() => remove(f.otherId)} disabled={busy === f.otherId} variant="ghost">CANCEL</SmallBtn>
            </Row>
          ))}
        </Section>
      )}

      <Section title={`Friends · ${friends.length}`}>
        {friends.length === 0 ? (
          <p className="text-[12px] text-[#6b6a62]">No friends yet.</p>
        ) : friends.map(f => (
          <Row key={f.otherId} item={f}>
            <SmallBtn onClick={() => remove(f.otherId)} disabled={busy === f.otherId} variant="ghost">REMOVE</SmallBtn>
          </Row>
        ))}
      </Section>
    </div>
  )
}

function Section({ title, accent, children }: { title: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className={`text-[10px] tracking-[0.25em] uppercase mb-3 ${accent ? 'text-[#d9a441]' : 'text-[#6b6a62]'}`}>// {title} //</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ item, children }: { item: FriendItem; children: React.ReactNode }) {
  const name = item.displayName || item.username || 'Unknown athlete'
  const inner = (
    <>
      <div className="w-10 h-10 border border-[#2a2a25] overflow-hidden bg-[rgba(244,237,224,0.03)] flex items-center justify-center shrink-0">
        {item.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="font-display text-lg font-black text-[#3a3a32]">{name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold truncate">{name}</div>
        {item.username && <div className="text-[11px] text-[#6b6a62] truncate">@{item.username}</div>}
      </div>
    </>
  )
  return (
    <div className="flex items-center gap-3 border border-[#2a2a25] p-3">
      {item.username ? (
        <Link href={`/u/${item.username}`} className="flex items-center gap-3 min-w-0 flex-1">{inner}</Link>
      ) : (
        <div className="flex items-center gap-3 min-w-0 flex-1">{inner}</div>
      )}
      <div className="flex gap-2 shrink-0">{children}</div>
    </div>
  )
}

function SmallBtn({ children, onClick, disabled, variant }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; variant: 'primary' | 'ghost' }) {
  const cls = variant === 'primary'
    ? 'bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0]'
    : 'border border-[#2a2a25] text-[#6b6a62] hover:border-[#f4ede0] hover:text-[#f4ede0]'
  return (
    <button onClick={onClick} disabled={disabled} className={`font-bold tracking-[0.15em] text-[10px] uppercase py-2 px-3 transition-all disabled:opacity-50 cursor-pointer ${cls}`}>
      {children}
    </button>
  )
}
