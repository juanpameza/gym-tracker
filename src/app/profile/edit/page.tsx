'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { buildLiftStats } from '@/lib/social'
import type { LiftStats } from '@/lib/social'
import type { Routine } from '@/lib/routine'

type SaveState = 'idle' | 'saving' | 'done' | 'error'

export default function ProfileEditPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [hasProfile, setHasProfile] = useState(false)

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(false)
  const [shareStats, setShareStats] = useState(false)
  const [sharesRoutine, setSharesRoutine] = useState(false)

  // Snapshot source — the user's own private program/logs, read only to build the opt-in copy.
  const [routine, setRoutine] = useState<Routine | null>(null)
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [logs, setLogs] = useState<{ exercises: Record<string, { sets: { weight: string; reps: string }[] }> }[]>([])

  const [status, setStatus] = useState<SaveState>('idle')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/signin'); return }

      const [{ data: profile }, { data: prog }, { data: workoutLogs }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('programs').select('routine, targets').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('workout_logs')
          .select('exercises')
          .eq('user_id', user.id)
          .order('week_num', { ascending: false })
          .order('day_num', { ascending: false })
          .limit(8),
      ])
      if (!active) return

      setUserId(user.id)
      setRoutine((prog?.routine as Routine) ?? null)
      setTargets((prog?.targets as Record<string, number>) ?? {})
      setLogs(workoutLogs ?? [])

      if (profile) {
        setHasProfile(true)
        setUsername(profile.username ?? '')
        setDisplayName(profile.display_name ?? '')
        setBio(profile.bio ?? '')
        setAvatarUrl(profile.avatar_url ?? null)
        setIsPublic(profile.is_public)
        setShareStats(profile.share_stats)
        setSharesRoutine(profile.shares_routine)
      } else {
        // Sensible default handle from the email local-part.
        const suggested = (user.email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
        setUsername(suggested)
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [router])

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploading(true)
    setError('')
    const supabase = createClient()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${userId}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) {
      setUploading(false)
      setError(`Avatar upload failed: ${upErr.message}`)
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    // Cache-bust so a re-upload to the same path shows immediately.
    setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`)
    setUploading(false)
  }

  async function handleSave() {
    if (!userId) return
    const handle = username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      setError('Username must be 3–20 chars: lowercase letters, numbers, underscores.')
      setStatus('error')
      return
    }
    setStatus('saving')
    setError('')
    const supabase = createClient()

    // Saving doubles as a snapshot refresh: rebuild the opt-in copies from
    // current private data so what friends see is current as of this save.
    const liftStats: LiftStats = shareStats ? buildLiftStats(routine, logs) : {}
    const sharedRoutine = sharesRoutine ? routine : null
    const sharedTargets = sharesRoutine ? targets : null

    const row = {
      user_id: userId,
      username: handle,
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      avatar_url: avatarUrl ? avatarUrl.split('?')[0] : null,
      is_public: isPublic,
      share_stats: shareStats,
      shares_routine: sharesRoutine,
      lift_stats: liftStats,
      shared_routine: sharedRoutine,
      shared_targets: sharedTargets,
      updated_at: new Date().toISOString(),
    }

    const { error: saveErr } = await supabase.from('profiles').upsert(row, { onConflict: 'user_id' })
    if (saveErr) {
      setStatus('error')
      setError(
        saveErr.code === '23505'
          ? `Username "@${handle}" is already taken. Pick another.`
          : saveErr.message
      )
      return
    }

    // Announce going public for the first time, once.
    if (isPublic && !hasProfile) {
      await supabase.from('activities').insert({ actor_id: userId, type: 'joined', payload: {}, visibility: 'public' }).then(() => {}, () => {})
    }
    setHasProfile(true)
    setStatus('done')
    setTimeout(() => setStatus('idle'), 2500)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/signin')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[#6b6a62] text-[13px] tracking-[0.2em]">LOADING…</div>
  }

  const statsPreview = shareStats ? buildLiftStats(routine, logs) : {}
  const statsCount = Object.keys(statsPreview).length
  const routineDays = routine ? Object.keys(routine).length : 0

  return (
    <div
      className="min-h-screen px-4 py-8 pb-24"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)', backgroundAttachment: 'fixed' }}
    >
      <div className="max-w-lg mx-auto">
        <header className="border-2 border-[#f4ede0] p-6 mb-7 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">PROFILE</div>
          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">★ MEET THE MACHINE ★</div>
          <h1 className="font-display font-black leading-none text-4xl">
            EDIT <span className="text-[#d9a441] italic">PROFILE.</span>
          </h1>
          {username && (
            <div className="text-[11px] tracking-[0.2em] text-[#6b6a62] uppercase mt-4 border-t border-dashed border-[#2a2a25] pt-4 flex justify-between">
              <span>@{username}</span>
              <span>{isPublic ? <span className="text-[#4a9b5e]">PUBLIC</span> : 'PRIVATE'}</span>
            </div>
          )}
        </header>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-7">
          <div className="w-20 h-20 border border-[#2a2a25] overflow-hidden bg-[rgba(244,237,224,0.03)] flex items-center justify-center shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-3xl font-black text-[#3a3a32]">{(displayName || username || '?').charAt(0).toUpperCase()}</span>
            )}
          </div>
          <label className="border border-[#f4ede0] hover:bg-[#f4ede0] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[10px] uppercase py-3 px-4 transition-all cursor-pointer">
            {uploading ? 'UPLOADING…' : 'CHANGE AVATAR'}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} disabled={uploading} />
          </label>
        </div>

        <Field label="Username" hint="3–20 chars · a–z 0–9 _ · your public @handle">
          <input
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase())}
            placeholder="ironjuan"
            className="w-full bg-transparent border border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-[15px] py-2.5 px-3 outline-none transition-colors"
          />
        </Field>

        <Field label="Display name">
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Juan"
            className="w-full bg-transparent border border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-[15px] py-2.5 px-3 outline-none transition-colors"
          />
        </Field>

        <Field label="Bio">
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="Chasing a 4-plate deadlift."
            rows={3}
            maxLength={300}
            className="w-full bg-transparent border border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-[13px] py-2.5 px-3 outline-none transition-colors resize-y"
          />
        </Field>

        {/* Opt-in toggles */}
        <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase mb-3 mt-8">// Sharing — all off by default //</div>
        <div className="space-y-3 mb-7">
          <Toggle
            label="Public profile"
            desc="Let other users find you and view your profile. Off = invisible to everyone."
            on={isPublic}
            onToggle={() => setIsPublic(v => !v)}
          />
          <Toggle
            label="Share lift stats"
            desc={`Publish a snapshot of your best est. 1RMs (${statsCount} lift${statsCount !== 1 ? 's' : ''} from recent logs). Your raw logs stay private.`}
            on={shareStats}
            onToggle={() => setShareStats(v => !v)}
            disabled={!isPublic}
          />
          <Toggle
            label="Share routine (forkable)"
            desc={routineDays ? `Let others fork a copy of your ${routineDays}-day routine.` : 'No routine yet — import one first.'}
            on={sharesRoutine}
            onToggle={() => setSharesRoutine(v => !v)}
            disabled={!isPublic || !routineDays}
          />
        </div>
        <p className="text-[11px] text-[#6b6a62] leading-relaxed mb-7 border-l-2 border-[#2a2a25] pl-3">
          Stats and routine are saved as a <span className="text-[#d9a441]">snapshot</span>. Saving again refreshes them from your latest logs.
        </p>

        {status === 'error' && (
          <div className="border-l-4 border-[#c8311a] pl-4 py-2 mb-4 bg-[rgba(200,49,26,0.04)]">
            <p className="text-[12px] text-[#c8311a]">{error}</p>
          </div>
        )}
        {status === 'done' && (
          <div className="border-l-4 border-[#4a9b5e] pl-4 py-2 mb-4 bg-[rgba(74,155,94,0.04)]">
            <p className="text-[12px] text-[#4a9b5e]">Profile saved.</p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          className="w-full bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.25em] text-[13px] uppercase py-4 transition-all disabled:opacity-50 cursor-pointer mb-3"
        >
          {status === 'saving' ? '…' : '▸ SAVE PROFILE'}
        </button>

        {isPublic && username && (
          <Link
            href={`/u/${username}`}
            className="block text-center border border-[#2a2a25] hover:border-[#f4ede0] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-3 transition-all mb-8"
          >
            VIEW PUBLIC PROFILE →
          </Link>
        )}

        {/* Account hub — relocated from the nav bar */}
        <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase mb-3 mt-8">// Account //</div>
        <div className="space-y-2 mb-8">
          {[
            { href: '/intake', label: 'Update Intake / Re-run Program' },
            { href: '/import', label: "Import Claude's Program" },
            { href: '/day0', label: 'Day 0 Baseline Test' },
          ].map(l => (
            <Link key={l.href} href={l.href} className="flex items-center justify-between border border-[#2a2a25] hover:border-[#f4ede0] p-4 transition-colors group">
              <span className="text-[13px] font-bold">{l.label}</span>
              <span className="text-[#6b6a62] group-hover:text-[#f4ede0] text-xs tracking-widest">→</span>
            </Link>
          ))}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-between border border-[#2a2a25] hover:border-[#c8311a] p-4 transition-colors group cursor-pointer"
          >
            <span className="text-[13px] font-bold text-[#c8311a]">Sign Out</span>
            <span className="text-[#6b6a62] group-hover:text-[#c8311a] text-xs tracking-widest">↗</span>
          </button>
        </div>

        <footer className="mt-8 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">// PROFILE //</footer>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] tracking-[0.2em] text-[#6b6a62] uppercase mb-2">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[#3a3a32] mt-1.5 tracking-[0.05em]">{hint}</p>}
    </div>
  )
}

function Toggle({ label, desc, on, onToggle, disabled }: { label: string; desc: string; on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full flex items-start gap-3 border p-4 text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        on && !disabled ? 'border-[#4a9b5e] bg-[rgba(74,155,94,0.05)]' : 'border-[#2a2a25] hover:border-[#3a3a32]'
      }`}
    >
      <div className={`w-9 h-5 shrink-0 mt-0.5 rounded-full relative transition-colors ${on && !disabled ? 'bg-[#4a9b5e]' : 'bg-[#2a2a25]'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#f4ede0] transition-all ${on && !disabled ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
      <div>
        <div className="text-[13px] font-bold tracking-[0.05em]">{label}</div>
        <div className="text-[11px] text-[#6b6a62] mt-0.5 leading-snug">{desc}</div>
      </div>
    </button>
  )
}
