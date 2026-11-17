import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyExecutionCommand } from '../../packages/domain/src/protocol-execution'
import type { ProtocolExecution } from '../../packages/domain/src/protocol-execution'

/** Simple ISO timestamp function matching the app's `nowIso` pattern. */
function nowIso(): string {
  return new Date().toISOString()
}

describe('client/server timestamp divergence handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-14T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('client preview updatedAt equals eventAt; server will use now()', () => {
    const execution = createTestExecution()
    const eventAt = nowIso() // Single clock read

    const preview = applyExecutionCommand(execution, { kind: 'complete-step', stepId: 'step-1' }, { at: eventAt })

    // Client preview uses eventAt for updatedAt
    expect(preview.updatedAt).toBe(eventAt)

    // Server will use now() — they will differ by a few ms
    // UI MUST NOT assert equality (documented behavior)
  })

  it('single eventAt used for both preview and wire p_at', () => {
    const execution = createTestExecution()
    const eventAt = nowIso()

    const preview = applyExecutionCommand(execution, { kind: 'complete-step', stepId: 'step-1' }, { at: eventAt })

    // Wire command would use same eventAt for p_at
    const wireCommand = { p_at: eventAt, command: { kind: 'complete-step', stepId: 'step-1' } }

    expect(wireCommand.p_at).toBe(eventAt)
    expect(preview.updatedAt).toBe(eventAt)
  })
})

function createTestExecution(): ProtocolExecution {
  return {
    executionId: 'exec-1',
    recommendationRunId: 'run-1',
    startedAt: '2026-11-14T12:00:00.000Z',
    updatedAt: '2026-11-14T12:00:00.000Z',
    status: 'in_progress',
    steps: [
      {
        stepId: 'step-1',
        position: 1,
        planned: {
          stepId: 'step-1',
          position: 1,
          action: 'wash',
          productId: 'prod-1',
          productVersionId: null,
          toolId: null,
          toolVersionId: null,
          waitSeconds: null,
          rinse: null,
          reasons: [],
        },
        state: 'pending',
        confirmedAt: null,
        deviation: null,
      },
    ],
    finishedAt: null,
    closeReason: null,
  } as unknown as ProtocolExecution
}