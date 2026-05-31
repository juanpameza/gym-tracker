'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Routine } from '@/lib/routine'

interface NavState {
  signedIn: boolean
  hasRoutine: boolean
  logHref: string
  pendingRequests: number
}

export default function NavBar() {
  const pathname = usePathname()
  const [state, setState] = useState<NavState | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (active) setState({ signedIn: false, hasRoutine: false, logHref: '/log/1/1', pendingRequests: 0 })
        return
      }

      const [{ data: prog }, { data: logs }, { data: pending }] = await Promise.all([
        supabase.from('programs').select('routine').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('workout_logs')
          .select('week_num, day_num')
          .eq('user_id', user.id)
          .order('week_num', { ascending: false })
          .order('day_num', { ascending: false })
          .limit(20),
        supabase
          .from('friendships')
          .select('requested_by')
          .eq('status', 'pending')
          .neq('requested_by', user.id),
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

      if (active) setState({ signedIn: true, hasRoutine, logHref, pendingRequests: pending?.length ?? 0 })
    }
    load()
    return () => { active = false }
  }, [pathname])

  if (pathname.startsWith('/auth')) return null
  if (!state || !state.signedIn) return null

  const items: { href: string; label: string; match: string; badge?: number }[] = [
    { href: '/', label: 'HOME', match: '/' },
  ]
  if (state.hasRoutine) {
    items.push({ href: state.logHref, label: 'LOG', match: '/log' })
  }
  items.push({ href: '/feed', label: 'FEED', match: '/feed' })
  items.push({ href: '/discover', label: 'PEOPLE', match: '/discover', badge: state.pendingRequests })
  items.push({ href: '/profile/edit', label: 'PROFILE', match: '/profile' })

  function isActive(match: string) {
    if (match === '/') return pathname === '/'
    // /friends and /u/* belong to the PEOPLE tab too.
    if (match === '/discover') return pathname.startsWith('/discover') || pathname.startsWith('/friends') || pathname.startsWith('/u/')
    return pathname.startsWith(match)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0e0e0c] border-t border-[#2a2a25]">
      <div className="max-w-2xl mx-auto flex items-stretch">
        {items.map(item => (
          <Link
            key={item.label}
            href={item.href}
            className={`relative flex-1 py-3 text-center text-[9px] tracking-[0.15em] font-bold uppercase transition-colors border-t-2 ${
              isActive(item.match)
                ? 'border-[#d9a441] text-[#d9a441]'
                : 'border-transparent text-[#6b6a62] hover:text-[#f4ede0]'
            }`}
          >
            {item.label}
            {!!item.badge && item.badge > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-22px)] min-w-[14px] h-[14px] px-1 rounded-full bg-[#c8311a] text-[#f4ede0] text-[8px] leading-[14px] tracking-normal">
                {item.badge}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  )
}
