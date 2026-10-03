import { describe, expect, it } from 'vitest'
import { openStatus, zonedNow, type OpeningHours } from '../../shared/hours.ts'
import { toAppError } from '../../src/lib/errors.ts'

describe('opening hours', () => {
  const hours: OpeningHours = {
    fri: [{ open: '11:30', close: '23:30' }],
    sat: [{ open: '18:00', close: '02:00' }],
  }

  it('resolves the local weekday and time in the restaurant’s timezone', () => {
    // 2026-10-03T04:00Z is Friday 23:00 in Chicago
    expect(zonedNow('America/Chicago', new Date('2026-10-03T04:00:00Z'))).toEqual({ day: 'fri', minutes: 23 * 60 })
  })

  it('knows when it’s open, closed, or open past midnight', () => {
    expect(openStatus(hours, 'America/Chicago', new Date('2026-10-03T04:00:00Z'))).toEqual({ open: true, closesAt: '23:30' })
    expect(openStatus(hours, 'America/Chicago', new Date('2026-10-03T05:00:00Z')).open).toBe(false) // Fri 00:00 → Sat 00:00
    // Saturday 17:00 Chicago → closed, opens at 18:00
    expect(openStatus(hours, 'America/Chicago', new Date('2026-10-03T22:00:00Z'))).toEqual({ open: false, opensAt: '18:00' })
    // Sunday 01:00 Chicago is inside Saturday's late shift
    expect(openStatus(hours, 'America/Chicago', new Date('2026-10-04T06:00:00Z'))).toEqual({ open: true, closesAt: '02:00' })
  })
})

describe('error copy', () => {
  it('maps database codes to actionable messages', () => {
    expect(toAppError({ message: 'restaurant_closed' }).message).toMatch(/isn’t taking orders/)
    expect(toAppError({ message: 'item_unavailable', details: 'Burger' }).message).toBe('Burger just sold out. Remove it to continue.')
    expect(toAppError({ message: 'new row violates row-level security policy' }).code).toBe('forbidden')
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('network')
    expect(toAppError({ error: 'payments_not_configured' }).message).toMatch(/Ask for the check/)
  })
})
