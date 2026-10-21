-- Registro de consumo de la API de Claude por llamada (lib/ia.ts).
-- Sirve para medir costos reales y para el límite diario de recomendaciones.
create table public.ai_uso (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ruta text not null check (ruta in ('etiquetar', 'opinar', 'recomendar')),
  modelo text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  created_at timestamptz not null default now()
);

create index ai_uso_user_ruta_fecha on public.ai_uso (user_id, ruta, created_at);

alter table public.ai_uso enable row level security;

create policy "ai_uso_insert" on public.ai_uso
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "ai_uso_select" on public.ai_uso
  for select to authenticated using ((select auth.uid()) = user_id);
