'use client'

import { useState } from 'react'

// Copies a server-built report to the clipboard (same fallback dance as the
// log page, so it works on older mobile browsers too).
export default function ExportButton({ text, label }: { text: string; label: string }) {
  const [shown, setShown] = useState(label)

  function flash() {
    setShown('✓ COPIED TO CLIPBOARD')
    setTimeout(() => setShown(label), 2000)
  }

  function copy() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(flash)
      return
    }
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    flash()
  }

  return (
    <button
      onClick={copy}
      className="w-full bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer"
    >
      {shown}
    </button>
  )
}
