import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'PPGA — Gamified PowerPoint Learning Platform',
  description:
    'A bilingual (Thai/English) gamified web platform for ปวช.2 vocational learners to build real Microsoft PowerPoint presentation-creation skills.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}