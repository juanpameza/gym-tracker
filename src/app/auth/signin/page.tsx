'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'magic' | 'password' | 'signup'

export default function SignIn() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function switchMode(m: Mode) {
    setMode(m)
    setError('')
    setSent(false)
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else router.push('/')
    setLoading(false)
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: 'magic', label: 'Magic Link' },
    { id: 'password', label: 'Sign In' },
    { id: 'signup', label: 'Sign Up' },
  ]

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)',
      }}
    >
      <div className="w-full max-w-sm">
        <div className="border-2 border-[#f4ede0] p-8 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">
            FORM AUTH
          </div>

          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-4 -rotate-1 font-bold">
            ★ GYM TRACKER ★
          </div>

          <h1 className="font-display font-black leading-none mb-2 text-5xl">
            {mode === 'signup'
              ? <>CREATE <span className="text-[#d9a441] italic">ACCOUNT.</span></>
              : <>SIGN <span className="text-[#d9a441] italic">IN.</span></>}
          </h1>

          {/* Mode tabs */}
          <div className="flex gap-2 mt-4 mb-6 border-t border-dashed border-[#2a2a25] pt-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => switchMode(tab.id)}
                className={`flex-1 py-2 text-[10px] tracking-[0.15em] font-bold uppercase border transition-colors cursor-pointer ${
                  mode === tab.id
                    ? 'border-[#d9a441] text-[#d9a441]'
                    : 'border-[#2a2a25] text-[#6b6a62] hover:border-[#f4ede0] hover:text-[#f4ede0]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Magic link */}
          {mode === 'magic' && sent && (
            <div className="border-l-4 border-[#d9a441] pl-4 py-2 bg-[rgba(217,164,65,0.04)]">
              <p className="text-sm text-[#d9a441] font-bold tracking-wider">LINK SENT.</p>
              <p className="text-xs text-[#6b6a62] mt-1">Check your email and tap the link to sign in.</p>
            </div>
          )}
          {mode === 'magic' && !sent && (
            <form onSubmit={handleMagicLink} className="space-y-6">
              <EmailField value={email} onChange={setEmail} />
              {error && <p className="text-xs text-[#c8311a]">{error}</p>}
              <SubmitBtn loading={loading} label="▸ SEND MAGIC LINK" />
            </form>
          )}

          {/* Password sign in */}
          {mode === 'password' && (
            <form onSubmit={handlePassword} className="space-y-5">
              <EmailField value={email} onChange={setEmail} />
              <PasswordField value={password} onChange={setPassword} />
              {error && <p className="text-xs text-[#c8311a]">{error}</p>}
              <SubmitBtn loading={loading} label="▸ SIGN IN" />
            </form>
          )}

          {/* Sign up */}
          {mode === 'signup' && sent && (
            <div className="border-l-4 border-[#4a9b5e] pl-4 py-2 bg-[rgba(74,155,94,0.04)]">
              <p className="text-sm text-[#4a9b5e] font-bold tracking-wider">ACCOUNT CREATED.</p>
              <p className="text-xs text-[#6b6a62] mt-1">
                Check your email to confirm, then sign in with the Password tab.
                <br />If email confirmation is disabled in Supabase, you&apos;re already in — try Sign In.
              </p>
            </div>
          )}
          {mode === 'signup' && !sent && (
            <form onSubmit={handleSignUp} className="space-y-5">
              <EmailField value={email} onChange={setEmail} />
              <PasswordField value={password} onChange={setPassword} label="Choose a password" />
              {error && <p className="text-xs text-[#c8311a]">{error}</p>}
              <SubmitBtn loading={loading} label="▸ CREATE ACCOUNT" />
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[9px] tracking-[0.25em] text-[#6b6a62] mb-2 uppercase">
        Email address
      </label>
      <input
        type="email"
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        placeholder="you@example.com"
        className="w-full bg-transparent border-b-[1.5px] border-[#2a2a25] focus:border-[#d9a441] outline-none text-lg py-2 text-[#f4ede0] placeholder:text-[#2a2a25] transition-colors"
      />
    </div>
  )
}

function PasswordField({
  value,
  onChange,
  label = 'Password',
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  return (
    <div>
      <label className="block text-[9px] tracking-[0.25em] text-[#6b6a62] mb-2 uppercase">
        {label}
      </label>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        minLength={6}
        placeholder="••••••••"
        className="w-full bg-transparent border-b-[1.5px] border-[#2a2a25] focus:border-[#d9a441] outline-none text-lg py-2 text-[#f4ede0] placeholder:text-[#2a2a25] transition-colors"
      />
    </div>
  )
}

function SubmitBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.25em] text-[13px] uppercase py-4 transition-all disabled:opacity-50 cursor-pointer"
    >
      {loading ? '...' : label}
    </button>
  )
}
