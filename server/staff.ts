import { z } from 'zod'
import { HttpError } from './http.ts'
import { rpcError, type AdminClient } from './supabase.ts'

export const createStaffSchema = z.object({
  restaurantId: z.uuid(),
  email: z.email().transform((v) => v.trim().toLowerCase()),
  displayName: z.string().trim().min(1).max(80),
  role: z.enum(['manager', 'kitchen', 'waiter']),
  password: z.string().min(8).max(72),
})

export type CreateStaffInput = z.infer<typeof createStaffSchema>

/**
 * Creates (or links) a staff account. The caller must be an active manager of the restaurant —
 * checked with the caller's own JWT so the database decides, not this server.
 */
export async function createStaffMember(
  admin: AdminClient,
  callerClient: AdminClient,
  input: CreateStaffInput,
): Promise<{ staffId: string; userId: string; created: boolean }> {
  const { data: isManager, error: roleError } = await callerClient.rpc('is_staff', {
    p_restaurant_id: input.restaurantId,
    p_roles: ['manager'],
  })
  if (roleError) throw rpcError(roleError)
  if (!isManager) throw new HttpError(403, 'forbidden')

  let userId: string
  let created = false
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.displayName },
  })

  if (newUser.user) {
    userId = newUser.user.id
    created = true
  } else if (createError && /already|registered|exists/i.test(createError.message)) {
    // Existing account (e.g. works at two restaurants): link it, don't reset their password.
    const { data: profile } = await admin.from('profiles').select('id').eq('email', input.email).maybeSingle()
    if (!profile) throw new HttpError(409, 'email_in_use')
    userId = profile.id
  } else {
    throw new HttpError(400, 'invalid_staff_account', createError?.message)
  }

  const { data: staff, error: insertError } = await admin
    .from('staff_members')
    .upsert(
      {
        restaurant_id: input.restaurantId,
        user_id: userId,
        role: input.role,
        display_name: input.displayName,
        email: input.email,
        is_active: true,
      },
      { onConflict: 'restaurant_id,user_id' },
    )
    .select('id')
    .single()
  if (insertError) throw rpcError(insertError)

  return { staffId: staff.id, userId, created }
}
