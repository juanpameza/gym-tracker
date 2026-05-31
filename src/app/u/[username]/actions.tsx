'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendPair, normalizeRoutineForFork } from '@/lib/social'
import type { FriendRel } from '@/lib/social'

export default function ProfileActions({
  targetUserId,
  targetUsername,
  initialRel,
  canFork,
  viewerHasRoutine,
}: {
  targetUserId: string
  targetUsername: string
  initialRel: FriendRel
  canFork: boolean
  viewerHasRoutine: boolean
}) {
  const router = useRouter()
  const [rel, setRel] = useState<FriendRel>(initialRel)
  const [busy, setBusy] = useState(false)
  const [confirmFork, setConfirmFork] = useState(false)
  const [forkState, setForkState] = useState<'idle' | 'forking' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  async function sendRequest() {
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const pair = friendPair(user.id, targetUserId)
    const { error: e } = await supabase.from('friendships').insert({
      ...pair, status: 'pending', requested_by: user.id,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    setRel('outgoing')
  }

  async function accept() {
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const pair = friendPair(user.id, targetUserId)
    const { error: e } = await supabase
      .from('friendships')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('user_a', pair.user_a).eq('user_b', pair.user_b)
    setBusy(false)
    if (e) { setError(e.message); return }
    setRel('friends')
  }

  async function remove() {
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const pair = friendPair(user.id, targetUserId)
    const { error: e } = await supabase.from('friendships').delete()
      .eq('user_a', pair.user_a).eq('user_b', pair.user_b)
    setBusy(false)
    if (e) { setError(e.message); return }
    setRel('none')
  }

  async function doFork() {
    setForkState('forking'); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setForkState('error'); setError('Not signed in.'); return }

    // Pull the opt-in snapshot from the source PROFILE (never their private program).
    const { data: src } = await supabase
      .from('profiles')
      .select('shared_routine, shared_targets, shares_routine')
      .eq('user_id', targetUserId)
      .maybeSingle()

    const { routine, targets, dayCount } = normalizeRoutineForFork(src?.shared_routine, src?.shared_targets)
    if (!src?.shares_routine || !routine) {
      setForkState('error'); setError('This routine is no longer shared.'); return
    }

    // Upsert so a brand-new user (no program row yet) is bootstrapped from the
    // fork; an existing user has only these columns overwritten (profile kept).
    const { error: e } = await supabase.from('programs').upsert({
      user_id: user.id,
      routine,
      targets,
      forked_from_user: targetUserId,
      forked_from_username: targetUsername,
      forked_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (e) { setForkState('error'); setError(e.message); return }

    await supabase.from('activities').insert({
      actor_id: user.id,
      type: 'program_forked',
      payload: { sourceUsername: targetUsername, dayCount },
      visibility: 'friends',
    }).then(() => {}, () => {})

    setForkState('done')
    setTimeout(() => router.push('/'), 1200)
  }

  const friendBtn = (() => {
    switch (rel) {
      case 'none':
        return <Btn onClick={sendRequest} disabled={busy} variant="primary">▸ ADD FRIEND</Btn>
      case 'outgoing':
        return <Btn onClick={remove} disabled={busy} variant="ghost">REQUEST SENT · CANCEL</Btn>
      case 'incoming':
        return <Btn onClick={accept} disabled={busy} variant="primary">✓ ACCEPT REQUEST</Btn>
      case 'friends':
        return <Btn onClick={remove} disabled={busy} variant="ghost">✓ FRIENDS · REMOVE</Btn>
    }
  })()

  return (
    <div className="mb-7">
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">{friendBtn}</div>
        {canFork && (
          <div className="flex-1 min-w-[160px]">
            <Btn onClick={() => setConfirmFork(true)} disabled={forkState === 'forking'} variant="amber">⑂ FORK ROUTINE</Btn>
          </div>
        )}
      </div>

      {error && <p className="text-[12px] text-[#c8311a] mt-3">{error}</p>}
      {forkState === 'done' && <p className="text-[12px] text-[#4a9b5e] mt-3">Forked — taking you to your dashboard…</p>}

      {/* Fork confirm */}
      {confirmFork && forkState !== 'done' && (
        <div className="border-2 border-[#d9a441] bg-[rgba(217,164,65,0.05)] p-5 mt-4">
          {viewerHasRoutine ? (
            <>
              <p className="text-[11px] tracking-[0.2em] text-[#d9a441] uppercase font-bold mb-2">Heads up</p>
              <p className="text-[13px] text-[#f4ede0] mb-4">
                Forking <span className="font-bold">replaces your current routine and targets</span> with @{targetUsername}&apos;s. Your workout logs are kept.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-[#f4ede0] mb-4">
              This starts your program with @{targetUsername}&apos;s routine. You can add your profile afterward so Claude can personalize it.
            </p>
          )}
          <div className="flex gap-3">
            <Btn onClick={doFork} disabled={forkState === 'forking'} variant="primary">
              {forkState === 'forking' ? '…' : viewerHasRoutine ? '▸ REPLACE & FORK' : '▸ FORK & START'}
            </Btn>
            <Btn onClick={() => setConfirmFork(false)} variant="ghost">CANCEL</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

function Btn({ children, onClick, disabled, variant }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant: 'primary' | 'ghost' | 'amber'
}) {
  const cls =
    variant === 'primary'
      ? 'bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0]'
      : variant === 'amber'
      ? 'border border-[#d9a441] text-[#d9a441] hover:bg-[#d9a441] hover:text-[#1a1a17]'
      : 'border border-[#2a2a25] text-[#6b6a62] hover:border-[#f4ede0] hover:text-[#f4ede0]'
  return (
    <button onClick={onClick} disabled={disabled} className={`w-full font-bold tracking-[0.2em] text-[11px] uppercase py-3.5 px-4 transition-all disabled:opacity-50 cursor-pointer ${cls}`}>
      {children}
    </button>
  )
}
