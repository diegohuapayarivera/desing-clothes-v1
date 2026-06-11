'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const onboardingSchema = z.object({
  nombre: z.string().min(1).max(100).trim(),
  preferencia_prendas: z.enum(['hombre', 'mujer', 'ambas']),
})

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const parsed = onboardingSchema.safeParse({
    nombre: formData.get('nombre'),
    preferencia_prendas: formData.get('preferencia_prendas'),
  })

  if (!parsed.success) {
    redirect('/onboarding?error=validation')
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      nombre: parsed.data.nombre,
      preferencia_prendas: parsed.data.preferencia_prendas,
      onboarding_completado: true,
    })
    .eq('id', user.id)

  if (error) {
    redirect('/onboarding?error=save')
  }

  redirect('/')
}
