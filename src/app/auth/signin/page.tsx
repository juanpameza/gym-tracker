'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
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

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)' }}>
      <div className="w-full max-w-sm">
        <div className="border-2 border-[#f4ede0] p-8 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">
            FORM AUTH
          </div>

          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-4 -rotate-1 font-bold">
            ★ GYM TRACKER ★
          </div>

          <h1 className="font-display font-black leading-none mb-2 text-5xl">
            SIGN <span className="text-[#d9a441] italic">IN.</span>
          </h1>
          <p className="text-[11px] text-[#6b6a62] tracking-[0.2em] uppercase mt-4 mb-8 border-t border-dashed border-[#2a2a25] pt-4">
            Magic link — no password needed
          </p>

          {sent ? (
            <div className="border-l-4 border-[#d9a441] pl-4 py-2 bg-[rgba(217,164,65,0.04)]">
              <p className="text-sm text-[#d9a441] font-bold tracking-wider">LINK SENT.</p>
              <p className="text-xs text-[#6b6a62] mt-1">Check your email and tap the link to sign in.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[9px] tracking-[0.25em] text-[#6b6a62] mb-2 uppercase">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full bg-transparent border-b-[1.5px] border-[#2a2a25] focus:border-[#d9a441] outline-none text-lg py-2 text-[#f4ede0] placeholder:text-[#2a2a25] transition-colors"
                />
              </div>
              {error && <p className="text-xs text-[#c8311a]">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.25em] text-[13px] uppercase py-4 transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading ? '...' : '▸ SEND MAGIC LINK'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
