'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/social'

type Hit = Pick<Profile, 'user_id' | 'username' | 'display_name' | 'avatar_url' | 'bio'>

export default function DiscoverPage() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const meRef = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => { meRef.current = data.user?.id ?? null })
  }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    const term = q.trim()
    if (term.length < 2) { setResults([]); setSearched(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      const supabase = createClient()
      // Strip characters that have meaning in a PostgREST filter string to
      // prevent filter injection via .or(). Usernames are [a-z0-9_] anyway.
      const safe = term.replace(/[,()%*\\:]/g, '').slice(0, 40)
      if (!safe) { setResults([]); setLoading(false); setSearched(true); return }
      // RLS already restricts SELECT to public profiles (+ self).
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, bio')
        .eq('is_public', true)
        .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
        .limit(20)
      const hits = ((data ?? []) as Hit[]).filter(h => h.user_id !== meRef.current)
      setResults(hits)
      setLoading(false)
      setSearched(true)
    }, 300)
    return () => clearTimeout(timer.current)
  }, [q])

  return (
    <div
      className="min-h-screen px-4 py-8 pb-24"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)', backgroundAttachment: 'fixed' }}
    >
      <div className="max-w-lg mx-auto">
        <header className="border-2 border-[#f4ede0] p-6 mb-6 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">PEOPLE</div>
          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">★ FIND ATHLETES ★</div>
          <h1 className="font-display font-black leading-none text-4xl">
            DISCOVER<span className="text-[#d9a441] italic">.</span>
          </h1>
        </header>

        <Link href="/friends" className="flex items-center justify-between border border-[#2a2a25] hover:border-[#f4ede0] p-4 transition-colors group mb-6">
          <span className="text-[13px] font-bold">Friend Requests &amp; Friends</span>
          <span className="text-[#6b6a62] group-hover:text-[#f4ede0] text-xs tracking-widest">→</span>
        </Link>

        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by username or name…"
          className="w-full bg-transparent border border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-[15px] py-3 px-3.5 outline-none transition-colors mb-5 placeholder:text-[#3a3a32]"
        />

        {loading && <p className="text-[12px] text-[#6b6a62] tracking-[0.2em]">SEARCHING…</p>}

        {!loading && searched && results.length === 0 && (
          <p className="text-[12px] text-[#6b6a62] border border-[#2a2a25] p-4">No public profiles match &ldquo;{q.trim()}&rdquo;.</p>
        )}

        <div className="space-y-2">
          {results.map(h => (
            <Link key={h.user_id} href={`/u/${h.username}`} className="flex items-center gap-3 border border-[#2a2a25] hover:border-[#d9a441] p-3 transition-colors">
              <div className="w-11 h-11 border border-[#2a2a25] overflow-hidden bg-[rgba(244,237,224,0.03)] flex items-center justify-center shrink-0">
                {h.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.avatar_url} alt={h.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display text-xl font-black text-[#3a3a32]">{(h.display_name || h.username).charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-bold truncate">{h.display_name || h.username}</div>
                <div className="text-[11px] text-[#6b6a62] truncate">@{h.username}{h.bio ? ` · ${h.bio}` : ''}</div>
              </div>
            </Link>
          ))}
        </div>

        {!searched && q.trim().length < 2 && (
          <p className="text-[11px] text-[#6b6a62] mt-2 leading-relaxed">Type at least 2 characters. Only athletes with a public profile appear here.</p>
        )}

        <footer className="mt-12 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">// DISCOVER //</footer>
      </div>
    </div>
  )
}
