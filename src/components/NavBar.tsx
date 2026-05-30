'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Routine } from '@/lib/routine'

interface NavState {
  signedIn: boolean
  hasRoutine: boolean
  hasDay0: boolean
  logHref: string
}

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<NavState | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (active) setState({ signedIn: false, hasRoutine: false, hasDay0: false, logHref: '/log/1/1' })
        return
      }

      const [{ data: prog }, { data: day0 }, { data: logs }] = await Promise.all([
        supabase.from('programs').select('routine').eq('user_id', user.id).maybeSingle(),
        supabase.from('day0_results').select('id').eq('user_id', user.id).limit(1).maybeSingle(),
        supabase
          .from('workout_logs')
          .select('week_num, day_num')
          .eq('user_id', user.id)
          .order('week_num', { ascending: false })
          .order('day_num', { ascending: false })
          .limit(20),
      ])

      const routine = (prog?.routine as Routine) ?? {}
      const dayKeys = Object.keys(routine)
      const hasRoutine = dayKeys.length > 0

      // Point LOG at the next unfinished day (or week N+1 if this week is complete).
      let logHref = '/log/1/1'
      if (hasRoutine) {
        const latestWeek = logs?.[0]?.week_num ?? 1
        const loggedDays = new Set((logs ?? []).filter(l => l.week_num === latestWeek).map(l => l.day_num))
        const nextDayIdx = dayKeys.findIndex((_, i) => !loggedDays.has(i + 1))
        logHref = nextDayIdx === -1 ? `/log/${latestWeek + 1}/1` : `/log/${latestWeek}/${nextDayIdx + 1}`
      }

      if (active) setState({ signedIn: true, hasRoutine, hasDay0: !!day0, logHref })
    }
    load()
    return () => {
      active = false
    }
  }, [pathname])

  if (pathname.startsWith('/auth')) return null
  // Hide until we know the user's state, and entirely when signed out.
  if (!state || !state.signedIn) return null

  const items: { href: string; label: string; match: string }[] = [
    { href: '/', label: 'HOME', match: '/' },
  ]
  // DAY 0 and LOG only make sense once a routine exists — otherwise they're dead ends.
  if (state.hasRoutine) {
    items.push({ href: '/day0', label: state.hasDay0 ? 'DAY 0' : 'DAY 0 ●', match: '/day0' })
    items.push({ href: state.logHref, label: 'LOG', match: '/log' })
  }
  items.push({ href: '/intake', label: 'INTAKE', match: '/intake' })
  items.push({ href: '/import', label: 'IMPORT', match: '/import' })

  function isActive(match: string) {
    if (match === '/') return pathname === '/'
    return pathname.startsWith(match)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/signin')
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0e0e0c] border-t border-[#2a2a25]">
      <div className="max-w-2xl mx-auto flex items-stretch">
        {items.map(item => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex-1 py-3 text-center text-[9px] tracking-[0.15em] font-bold uppercase transition-colors border-t-2 ${
              isActive(item.match)
                ? 'border-[#d9a441] text-[#d9a441]'
                : 'border-transparent text-[#6b6a62] hover:text-[#f4ede0]'
            }`}
          >
            {item.label}
          </Link>
        ))}
        <button
          onClick={handleSignOut}
          className="flex-1 py-3 text-center text-[9px] tracking-[0.15em] font-bold uppercase text-[#6b6a62] hover:text-[#c8311a] border-t-2 border-transparent transition-colors cursor-pointer"
        >
          OUT ↗
        </button>
      </div>
    </nav>
  )
}
