import { parseLessonProse } from '../lib/lessonProse'

/**
 * Render one lesson step body as readable prose. The markup is parsed by the
 * pure `parseLessonProse`; this component only maps blocks to semantic HTML.
 * It is intentionally server-safe (no hooks, no client APIs) and is reused by
 * the client LessonPlayer and its no-JavaScript "read all steps" fallback.
 */
export function LessonProse({ text }: { text: string }) {
  const blocks = parseLessonProse(text)
  return (
    <div className="ppg-lesson-prose" data-ppg-prose>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Heading = block.level === 2 ? 'h3' : 'h4'
          return (
            <Heading
              key={index}
              className={`ppg-prose-heading ppg-prose-heading-${block.level}`}
            >
              {block.text}
            </Heading>
          )
        }
        if (block.type === 'bullets') {
          return (
            <ul key={index} className="ppg-prose-list">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'numbered') {
          return (
            <ol key={index} className="ppg-prose-list ppg-prose-numbered">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ol>
          )
        }
        return (
          <p key={index} className="ppg-prose-paragraph">
            {block.text}
          </p>
        )
      })}
    </div>
  )
}
