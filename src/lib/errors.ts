// Turns stable error codes raised by the database / API into copy a person can act on.

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Your session has expired. Refresh the page to continue.',
  forbidden: 'You don’t have access to do that.',
  account_required: 'Sign in with a staff account to do that.',
  session_not_found: 'This tab couldn’t be found. Scan the QR code on your table again.',
  session_closed: 'This tab has been closed. Scan the table’s QR code to start a new one.',
  session_settled: 'This tab is already paid.',
  not_session_guest: 'Join the table before ordering.',
  table_not_found: 'This table doesn’t exist any more. Ask a member of staff for help.',
  table_unavailable: 'This table isn’t taking orders right now. Ask a member of staff for help.',
  restaurant_closed: 'This restaurant isn’t taking orders right now.',
  restaurant_not_found: 'This restaurant couldn’t be found.',
  ordering_disabled: 'Ordering from the table is paused. A member of staff can take your order.',
  item_unavailable: 'Something in your order just sold out. Remove it to continue.',
  item_not_found: 'An item in your order is no longer on the menu.',
  variant_required: 'Choose a size or option for every item.',
  invalid_variant: 'That option isn’t available for this item.',
  invalid_modifier: 'One of the extras you chose isn’t available.',
  modifier_selection_invalid: 'Check the required choices for each item.',
  duplicate_modifier: 'An extra was selected twice.',
  invalid_quantity: 'Quantities must be between 1 and 99.',
  empty_order: 'Add something to your order first.',
  too_many_lines: 'That’s a big order — please split it into two.',
  invalid_party_size: 'Party size must be between 1 and 50.',
  invalid_transition: 'That order has already moved on. Refresh to see its current status.',
  order_not_found: 'That order couldn’t be found.',
  already_removed: 'That item was already removed.',
  nothing_due: 'There’s nothing left to pay on this tab.',
  invalid_amount: 'Enter an amount no larger than what’s due.',
  invalid_method: 'Choose cash, card or other for manual payments.',
  balance_due: 'This tab still has a balance. Record the payment first, or close it as a manager.',
  payment_in_progress: 'Someone at your table is already paying online. Wait a moment, then refresh.',
  payments_not_configured: 'Online payment isn’t available here yet. Ask for the check instead.',
  payment_provider_error: 'The payment provider didn’t respond. Try again, or ask for the check.',
  review_not_available: 'You can leave a review once your tab is settled.',
  invalid_rating: 'Choose between one and five stars.',
  slug_taken: 'That web address is taken. Try another.',
  confirmation_mismatch: 'The confirmation text doesn’t match.',
  currency_locked_active_tabs: 'Currency can’t change while tables have open tabs with orders.',
  owner_protected: 'The owner’s account can’t be demoted or deactivated.',
  last_manager: 'Keep at least one active manager.',
  email_in_use: 'That email belongs to an account that can’t be linked.',
  invalid_staff_account: 'That account couldn’t be created. Check the email and password.',
  invalid_request: 'Some details are missing or invalid.',
  network: 'You appear to be offline. Check your connection and try again.',
}

export class AppError extends Error {
  readonly code: string
  readonly detail?: string

  constructor(code: string, message?: string, detail?: string) {
    super(message ?? MESSAGES[code] ?? 'Something went wrong. Try again.')
    this.code = code
    this.detail = detail
  }
}

interface ErrorLike {
  message?: string
  code?: string
  details?: string | null
  error?: string
}

/** Normalizes Supabase / fetch / thrown errors into an AppError with friendly copy. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return new AppError('network')
  }
  const e = (err ?? {}) as ErrorLike
  const raw = e.error ?? e.message ?? ''
  if (/^[a-z_]+$/.test(raw) && raw in MESSAGES) {
    let message = MESSAGES[raw]
    if (raw === 'item_unavailable' && e.details) message = `${e.details} just sold out. Remove it to continue.`
    return new AppError(raw, message, e.details ?? undefined)
  }
  if (/JWT|jwt expired|invalid claim/i.test(raw)) return new AppError('not_authenticated')
  if (/permission denied|row-level security/i.test(raw)) return new AppError('forbidden')
  if (/Failed to fetch|NetworkError/i.test(raw)) return new AppError('network')
  if (/duplicate key/i.test(raw)) return new AppError('duplicate', 'That already exists.')
  if (/violates check constraint/i.test(raw)) return new AppError('invalid', 'Some values are out of range.')
  return new AppError('unknown', raw || undefined)
}

export function errorMessage(err: unknown): string {
  return toAppError(err).message
}
