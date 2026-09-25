import { Suspense } from 'react'

export default function HomePage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <main>
        <section>PPGA scaffold is up.</section>
        <section>
          <a href="/health">Health page</a>
        </section>
      </main>
    </Suspense>
  )
}