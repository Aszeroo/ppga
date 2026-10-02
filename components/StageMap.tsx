import { StageNode, type StageNodeProps } from './StageNode'

/**
 * The StageMap primitive (#41 stage 3, ticket #44) — the ordered pixel road
 * of the Course's Modules: an `<ol>` of `.ppg-stage-item` rows (the ORDER is
 * the map's semantics: `order_index` from the DATABASE), each carrying the
 * `.ppg-stage-connector` road segment + a `.ppg-stage-node` (see
 * `components/StageNode.tsx`). The vocabulary is the shared stage-map
 * language ticket #45 reuses; every state marker is a `data-ppg-stage-*`
 * attribute + copy, never colour alone.
 *
 * Pure props (no hooks, no server APIs): the server Course page renders the
 * real derived stages, the client gallery demos the same primitive.
 */
export interface StageMapProps {
  /** The ordered stage nodes (the caller sorts by `order_index`). */
  stages: StageNodeProps[]
  /** The localized region name (`course.mapLabel`). */
  mapLabel: string
}

export function StageMap({ stages, mapLabel }: StageMapProps) {
  return (
    <ol className="ppg-stage-map" aria-label={mapLabel} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {stages.map((stage, index) => (
        <StageNode key={stage.moduleKey} {...stage} isFirst={index === 0} />
      ))}
    </ol>
  )
}
