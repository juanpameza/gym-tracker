import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Fraunces } from 'next/font/google'
import './globals.css'
import NavBar from '@/components/NavBar'

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
})

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['400', '700', '900'],
})

export const metadata: Metadata = {
  title: 'Gym Tracker',
  description: 'Personal strength training log',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0e0e0c',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${fraunces.variable}`}>
      <body className="min-h-screen">
        {children}
        <NavBar />
      </body>
    </html>
  )
}
