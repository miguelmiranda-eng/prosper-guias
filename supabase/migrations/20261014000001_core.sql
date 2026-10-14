-- Prosper Guías · esquema central (fase 2)
-- Espacios de trabajo, membresías, guías, pasos, versiones, actividad y almacenamiento privado.
-- Todos los permisos se validan aquí (RLS + funciones), no en el frontend.

create extension if not exists pg_trgm;

-- ───────────────────────── Tipos ─────────────────────────
create type public.workspace_role as enum ('owner', 'admin', 'editor', 'member', 'viewer');
create type public.guide_status as enum ('draft', 'published', 'archived');
create type public.guide_visibility as enum ('private', 'workspace');
create type public.step_kind as enum ('action', 'manual');
create type public.note_kind as enum ('tip', 'warning', 'info');

-- ───────────────────────── Tablas ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.guides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null references public.profiles (id),
  title text not null default 'Guía sin título' check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  status public.guide_status not null default 'draft',
  visibility public.guide_visibility not null default 'workspace',
  source text not null default 'manual' check (source in ('manual', 'extension')),
  recording boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id)
);
create index guides_ws_updated_idx on public.guides (workspace_id, updated_at desc) where deleted_at is null;
create index guides_ws_trash_idx on public.guides (workspace_id, deleted_at desc) where deleted_at is not null;
create index guides_owner_idx on public.guides (owner_id);
create index guides_title_trgm_idx on public.guides using gin (title gin_trgm_ops);

create table public.guide_steps (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides (id) on delete cascade,
  position integer not null check (position >= 1),
  kind public.step_kind not null default 'action',
  action text check (action in ('click', 'input', 'select', 'submit', 'navigate', 'manual')),
  instruction text not null default '' check (char_length(instruction) <= 2000),
  note text not null default '' check (char_length(note) <= 2000),
  note_kind public.note_kind,
  page_url text check (char_length(page_url) <= 2048),
  page_title text check (char_length(page_title) <= 300),
  element_label text check (char_length(element_label) <= 200),
  screenshot_path text,
  click_x real check (click_x between 0 and 1),
  click_y real check (click_y between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Las capturas de un paso sólo pueden vivir en la carpeta de su propia guía.
  constraint guide_steps_path_in_guide check (
    screenshot_path is null or split_part(screenshot_path, '/', 1) = guide_id::text
  ),
  constraint guide_steps_position_unique unique (guide_id, position) deferrable initially deferred
);

create table public.guide_versions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides (id) on delete cascade,
  version_no integer not null,
  label text not null default '' check (char_length(label) <= 200),
  snapshot jsonb not null,
  step_count integer not null default 0,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (guide_id, version_no)
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_ws_created_idx on public.activity_log (workspace_id, created_at desc);

-- ─────────────────── Funciones de permiso ───────────────────
-- SECURITY DEFINER para que las políticas no se llamen a sí mismas en recursión.

create function public.ws_role(ws uuid)
returns public.workspace_role
language sql stable security definer set search_path = ''
as $$
  select role from public.workspace_members
  where workspace_id = ws and user_id = auth.uid()
$$;

create function public.shares_workspace(other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- Leer: privada = sólo su autor; del espacio = todos los miembros.
-- En la papelera, las del espacio sólo las ven owner/admin (y el autor).
create function public.can_read_guide(gid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.guides g
    join public.workspace_members m on m.workspace_id = g.workspace_id and m.user_id = auth.uid()
    where g.id = gid and (
      g.owner_id = auth.uid()
      or (g.visibility = 'workspace' and (g.deleted_at is null or m.role in ('owner', 'admin')))
    )
  )
$$;

-- Editar contenido: el autor (si no es lector) o editor+ en guías del espacio. Nunca en la papelera.
create function public.can_edit_guide(gid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.guides g
    join public.workspace_members m on m.workspace_id = g.workspace_id and m.user_id = auth.uid()
    where g.id = gid and g.deleted_at is null and m.role <> 'viewer' and (
      g.owner_id = auth.uid()
      or (g.visibility = 'workspace' and m.role in ('owner', 'admin', 'editor'))
    )
  )
$$;

-- Administrar (visibilidad, papelera, restaurar, borrar definitivo): el autor o owner/admin.
create function public.can_manage_guide(gid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.guides g
    join public.workspace_members m on m.workspace_id = g.workspace_id and m.user_id = auth.uid()
    where g.id = gid and m.role <> 'viewer' and (
      g.owner_id = auth.uid()
      or (g.visibility = 'workspace' and m.role in ('owner', 'admin'))
    )
  )
$$;

create function public.guide_from_path(p text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return split_part(p, '/', 1)::uuid;
exception when others then
  return null;
end
$$;

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.guides enable row level security;
alter table public.guide_steps enable row level security;
alter table public.guide_versions enable row level security;
alter table public.activity_log enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_workspace(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy workspaces_select on public.workspaces for select to authenticated
  using (public.ws_role(id) is not null);
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.ws_role(id) in ('owner', 'admin'))
  with check (public.ws_role(id) in ('owner', 'admin'));

-- Altas, bajas y cambios de rol sólo por las funciones add/update/remove_member.
create policy members_select on public.workspace_members for select to authenticated
  using (public.ws_role(workspace_id) is not null);

create policy guides_select on public.guides for select to authenticated
  using (public.can_read_guide(id));
create policy guides_insert on public.guides for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.ws_role(workspace_id) in ('owner', 'admin', 'editor', 'member')
    and deleted_at is null
  );
create policy guides_update on public.guides for update to authenticated
  using (public.can_edit_guide(id) or public.can_manage_guide(id))
  with check (public.ws_role(workspace_id) is not null);
create policy guides_delete on public.guides for delete to authenticated
  using (deleted_at is not null and public.can_manage_guide(id));

create policy steps_select on public.guide_steps for select to authenticated
  using (public.can_read_guide(guide_id));
create policy steps_insert on public.guide_steps for insert to authenticated
  with check (public.can_edit_guide(guide_id));
create policy steps_update on public.guide_steps for update to authenticated
  using (public.can_edit_guide(guide_id)) with check (public.can_edit_guide(guide_id));
create policy steps_delete on public.guide_steps for delete to authenticated
  using (public.can_edit_guide(guide_id));

create policy versions_select on public.guide_versions for select to authenticated
  using (public.can_read_guide(guide_id));
create policy versions_insert on public.guide_versions for insert to authenticated
  with check (public.can_edit_guide(guide_id) and created_by = (select auth.uid()));

create policy activity_select on public.activity_log for select to authenticated
  using (public.ws_role(workspace_id) is not null);

-- ───────────────────────── Triggers ─────────────────────────

-- Separa "editar contenido" de "administrar": un editor no puede cambiar la visibilidad
-- ni mandar a la papelera la guía de otro aunque la política UPDATE lo deje pasar.
create function public.guides_before_update()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if new.workspace_id <> old.workspace_id or new.owner_id <> old.owner_id then
    raise exception 'No se puede mover ni reasignar la guía' using errcode = '42501';
  end if;
  if auth.uid() is not null then
    if (new.visibility, new.deleted_at) is distinct from (old.visibility, old.deleted_at)
       and not public.can_manage_guide(old.id) then
      raise exception 'Sin permiso para administrar esta guía' using errcode = '42501';
    end if;
    if (new.title, new.description, new.status, new.recording) is distinct from
       (old.title, old.description, old.status, old.recording)
       and not public.can_edit_guide(old.id) then
      raise exception 'Sin permiso para editar esta guía' using errcode = '42501';
    end if;
  end if;
  if new.status = 'published' and old.status <> 'published' then
    new.published_at := now();
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_by := auth.uid();
  elsif new.deleted_at is null then
    new.deleted_by := null;
  end if;
  new.updated_at := now();
  return new;
end
$$;
create trigger guides_before_update before update on public.guides
  for each row execute function public.guides_before_update();

-- Cualquier cambio de pasos marca la guía como modificada.
create function public.steps_touch_guide()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op <> 'DELETE' then
    new.updated_at := now();
  end if;
  update public.guides set updated_at = now()
  where id = coalesce(new.guide_id, old.guide_id) and deleted_at is null;
  return coalesce(new, old);
end
$$;
create trigger steps_touch_guide before insert or update on public.guide_steps
  for each row execute function public.steps_touch_guide();
create trigger steps_touch_guide_del after delete on public.guide_steps
  for each row execute function public.steps_touch_guide();

-- Bitácora de actividad (sólo ids; el título se resuelve con RLS al leer, así no se filtran privadas).
create function public.guides_log_activity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null then v_action := 'trashed';
    elsif new.deleted_at is null and old.deleted_at is not null then v_action := 'restored';
    elsif new.status <> old.status then v_action := new.status::text;
    elsif new.visibility <> old.visibility then v_action := 'visibility_' || new.visibility::text;
    else return new;
    end if;
  else
    insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, action, meta)
    values (
      old.workspace_id, auth.uid(), 'guide', old.id, 'deleted',
      -- El t�tulo de una privada no se guarda: la bit�cora la lee todo el espacio.
      case when old.visibility = 'workspace' then jsonb_build_object('title', old.title) else '{}'::jsonb end
    );
    return old;
  end if;
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, action)
  values (new.workspace_id, auth.uid(), 'guide', new.id, v_action);
  return new;
end
$$;
create trigger guides_log_activity after insert or update or delete on public.guides
  for each row execute function public.guides_log_activity();

-- Alta de usuario: perfil + espacio personal como propietario.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ws uuid;
  v_name text;
begin
  v_name := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), 120);
  insert into public.profiles (id, full_name, email) values (new.id, v_name, new.email);
  insert into public.workspaces (name, created_by) values (left('Espacio de ' || v_name, 80), new.id)
    returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, new.id, 'owner');
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── RPCs de pasos ─────────────────────────
-- SECURITY INVOKER: RLS sigue mandando; el candado consultivo serializa el orden por guía.

create function public.insert_step(
  p_guide uuid,
  p_position integer default null,
  p_kind public.step_kind default 'action',
  p_action text default null,
  p_instruction text default '',
  p_page_url text default null,
  p_page_title text default null,
  p_element_label text default null,
  p_screenshot_path text default null,
  p_click_x real default null,
  p_click_y real default null
)
returns public.guide_steps
language plpgsql security invoker set search_path = ''
as $$
declare
  v_max integer;
  v_pos integer;
  r public.guide_steps;
begin
  if not public.can_edit_guide(p_guide) then
    raise exception 'Sin permiso para editar esta guía' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_guide::text, 0));
  select coalesce(max(position), 0) into v_max from public.guide_steps where guide_id = p_guide;
  if p_position is null or p_position > v_max then
    v_pos := v_max + 1;
  else
    v_pos := greatest(p_position, 1);
    update public.guide_steps set position = position + 1
    where guide_id = p_guide and position >= v_pos;
  end if;
  insert into public.guide_steps (
    guide_id, position, kind, action, instruction, page_url, page_title,
    element_label, screenshot_path, click_x, click_y
  ) values (
    p_guide, v_pos, p_kind, p_action, coalesce(p_instruction, ''), p_page_url, p_page_title,
    p_element_label, p_screenshot_path, p_click_x, p_click_y
  ) returning * into r;
  return r;
end
$$;

create function public.delete_step(p_step uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_guide uuid;
  v_pos integer;
begin
  select guide_id, position into v_guide, v_pos from public.guide_steps where id = p_step;
  if v_guide is null or not public.can_edit_guide(v_guide) then
    raise exception 'Paso no encontrado o sin permiso' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_guide::text, 0));
  delete from public.guide_steps where id = p_step;
  update public.guide_steps set position = position - 1 where guide_id = v_guide and position > v_pos;
end
$$;

create function public.duplicate_step(p_step uuid)
returns public.guide_steps
language plpgsql security invoker set search_path = ''
as $$
declare
  s public.guide_steps;
begin
  select * into s from public.guide_steps where id = p_step;
  if s.id is null then
    raise exception 'Paso no encontrado' using errcode = '42501';
  end if;
  return public.insert_step(
    s.guide_id, s.position + 1, s.kind, s.action, s.instruction, s.page_url, s.page_title,
    s.element_label, s.screenshot_path, s.click_x, s.click_y
  );
end
$$;

-- p_ids debe ser exactamente el conjunto de pasos de la guía, en el orden nuevo.
create function public.reorder_steps(p_guide uuid, p_ids uuid[])
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.can_edit_guide(p_guide) then
    raise exception 'Sin permiso para editar esta guía' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_guide::text, 0));
  select count(*) into v_count from public.guide_steps where guide_id = p_guide;
  if v_count <> coalesce(array_length(p_ids, 1), 0)
     or v_count <> (select count(distinct x) from unnest(p_ids) x)
     or exists (
       select 1 from unnest(p_ids) x
       where not exists (select 1 from public.guide_steps s where s.id = x and s.guide_id = p_guide)
     ) then
    raise exception 'La lista de pasos no coincide con la guía (¿alguien más la editó?)' using errcode = '22023';
  end if;
  update public.guide_steps s set position = o.ord
  from unnest(p_ids) with ordinality as o(id, ord)
  where s.id = o.id;
end
$$;

-- ───────────────────────── Versiones ─────────────────────────
create function public.create_version(p_guide uuid, p_label text default '')
returns public.guide_versions
language plpgsql security invoker set search_path = ''
as $$
declare
  g public.guides;
  v_no integer;
  r public.guide_versions;
begin
  if not public.can_edit_guide(p_guide) then
    raise exception 'Sin permiso para editar esta guía' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('v' || p_guide::text, 0));
  select * into g from public.guides where id = p_guide;
  select coalesce(max(version_no), 0) + 1 into v_no from public.guide_versions where guide_id = p_guide;
  insert into public.guide_versions (guide_id, version_no, label, snapshot, step_count, created_by)
  values (
    p_guide, v_no, left(coalesce(p_label, ''), 200),
    jsonb_build_object(
      'title', g.title,
      'description', g.description,
      'steps', coalesce((
        select jsonb_agg(to_jsonb(s) - 'guide_id' - 'created_at' - 'updated_at' order by s.position)
        from public.guide_steps s where s.guide_id = p_guide
      ), '[]'::jsonb)
    ),
    (select count(*) from public.guide_steps s where s.guide_id = p_guide),
    auth.uid()
  ) returning * into r;
  return r;
end
$$;

-- Restaurar nunca destruye: primero guarda el estado actual como versión nueva.
create function public.restore_version(p_version uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v public.guide_versions;
begin
  select * into v from public.guide_versions where id = p_version;
  if v.id is null or not public.can_edit_guide(v.guide_id) then
    raise exception 'Versión no encontrada o sin permiso' using errcode = '42501';
  end if;
  perform public.create_version(v.guide_id, 'Automática antes de restaurar v' || v.version_no);
  perform pg_advisory_xact_lock(hashtextextended(v.guide_id::text, 0));
  delete from public.guide_steps where guide_id = v.guide_id;
  insert into public.guide_steps (
    id, guide_id, position, kind, action, instruction, note, note_kind, page_url, page_title,
    element_label, screenshot_path, click_x, click_y
  )
  select
    gen_random_uuid(), v.guide_id, (row_number() over (order by s.position))::integer, s.kind, s.action,
    s.instruction, s.note, s.note_kind, s.page_url, s.page_title, s.element_label,
    s.screenshot_path, s.click_x, s.click_y
  from jsonb_populate_recordset(null::public.guide_steps, v.snapshot -> 'steps') s;
  update public.guides
  set title = v.snapshot ->> 'title', description = coalesce(v.snapshot ->> 'description', '')
  where id = v.guide_id;
end
$$;

-- ───────────────────────── Equipo ─────────────────────────
-- Fase 2: se agrega a usuarios YA registrados. Invitaciones por correo con expiración = fase 6.
create function public.add_member(p_ws uuid, p_email text, p_role public.workspace_role)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
begin
  if public.ws_role(p_ws) not in ('owner', 'admin') then
    raise exception 'Sólo propietario o administrador pueden agregar miembros' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'No se puede agregar a alguien como propietario' using errcode = '22023';
  end if;
  if p_role = 'admin' and public.ws_role(p_ws) <> 'owner' then
    raise exception 'Sólo el propietario puede nombrar administradores' using errcode = '42501';
  end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No existe una cuenta con ese correo; pídele que se registre primero' using errcode = 'P0002';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (p_ws, v_user, p_role)
  on conflict (workspace_id, user_id) do nothing;
  if not found then
    raise exception 'Esa persona ya es miembro del espacio' using errcode = '23505';
  end if;
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, action, meta)
  values (p_ws, auth.uid(), 'member', v_user, 'member_added', jsonb_build_object('role', p_role));
end
$$;

create function public.update_member_role(p_ws uuid, p_user uuid, p_role public.workspace_role)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_mine public.workspace_role := public.ws_role(p_ws);
  v_theirs public.workspace_role;
begin
  select role into v_theirs from public.workspace_members where workspace_id = p_ws and user_id = p_user;
  if v_theirs is null then
    raise exception 'Miembro no encontrado' using errcode = 'P0002';
  end if;
  if v_mine is null or v_mine not in ('owner', 'admin') then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if v_mine = 'admin' and (v_theirs in ('owner', 'admin') or p_role in ('owner', 'admin')) then
    raise exception 'Un administrador no puede cambiar propietarios ni administradores' using errcode = '42501';
  end if;
  if v_theirs = 'owner' and p_role <> 'owner'
     and (select count(*) from public.workspace_members where workspace_id = p_ws and role = 'owner') = 1 then
    raise exception 'El espacio debe conservar al menos un propietario' using errcode = '22023';
  end if;
  update public.workspace_members set role = p_role where workspace_id = p_ws and user_id = p_user;
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, action, meta)
  values (p_ws, auth.uid(), 'member', p_user, 'member_role', jsonb_build_object('role', p_role));
end
$$;

create function public.remove_member(p_ws uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_mine public.workspace_role := public.ws_role(p_ws);
  v_theirs public.workspace_role;
begin
  select role into v_theirs from public.workspace_members where workspace_id = p_ws and user_id = p_user;
  if v_theirs is null then
    raise exception 'Miembro no encontrado' using errcode = 'P0002';
  end if;
  -- Cualquiera puede salirse; quitar a otros exige owner/admin y jerarquía.
  if p_user <> auth.uid() then
    if v_mine is null or v_mine not in ('owner', 'admin') then
      raise exception 'Sin permiso' using errcode = '42501';
    end if;
    if v_mine = 'admin' and v_theirs in ('owner', 'admin') then
      raise exception 'Un administrador no puede quitar propietarios ni administradores' using errcode = '42501';
    end if;
  end if;
  if v_theirs = 'owner'
     and (select count(*) from public.workspace_members where workspace_id = p_ws and role = 'owner') = 1 then
    raise exception 'El espacio debe conservar al menos un propietario' using errcode = '22023';
  end if;
  delete from public.workspace_members where workspace_id = p_ws and user_id = p_user;
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, action)
  values (p_ws, auth.uid(), 'member', p_user, 'member_removed');
end
$$;

-- Funciones internas: nadie las llama por la API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guides_log_activity() from public, anon, authenticated;
revoke execute on function public.steps_touch_guide() from public, anon, authenticated;
revoke execute on function public.guides_before_update() from public, anon, authenticated;
-- Las RPC sólo para sesiones autenticadas.
revoke execute on function public.insert_step, public.delete_step, public.duplicate_step,
  public.reorder_steps, public.create_version, public.restore_version,
  public.add_member, public.update_member_role, public.remove_member from public, anon;
grant execute on function public.insert_step, public.delete_step, public.duplicate_step,
  public.reorder_steps, public.create_version, public.restore_version,
  public.add_member, public.update_member_role, public.remove_member to authenticated;

-- ───────────────────────── Almacenamiento ─────────────────────────
-- Bucket privado: <guide_id>/<archivo>. Sin URL pública; sólo URLs firmadas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guide-media', 'guide-media', false, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'guide-media' and public.can_read_guide(public.guide_from_path(name)));
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'guide-media' and public.can_edit_guide(public.guide_from_path(name)));
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'guide-media' and public.can_edit_guide(public.guide_from_path(name)));
create policy media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'guide-media'
    and (public.can_edit_guide(public.guide_from_path(name)) or public.can_manage_guide(public.guide_from_path(name)))
  );
