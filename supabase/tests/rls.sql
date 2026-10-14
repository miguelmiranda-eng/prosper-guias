-- Pruebas de permisos (RLS + funciones). Corren dentro de una transacción y hacen ROLLBACK:
-- no dejan datos. Cada bloque DO lanza excepción si una regla no se cumple.
-- Uso: pegar en el SQL editor de Supabase o ejecutar con psql contra la base.
begin;

-- Usuarios de prueba (el trigger crea perfil + espacio personal de cada uno).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'owner@test.local', '{"full_name":"Olga Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'editor@test.local', '{"full_name":"Edu Editor"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'viewer@test.local', '{"full_name":"Vero Viewer"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'outsider@test.local', '{"full_name":"Otto Outsider"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'member@test.local', '{"full_name":"Memo Member"}', now(), now());

-- Espacio de Olga (lo creó el trigger). Lo guardamos en una tabla temporal accesible para todos.
create temp table t (k text primary key, v uuid) on commit drop;
grant all on t to authenticated;
insert into t select 'ws', workspace_id from public.workspace_members where user_id = 'a0000000-0000-4000-8000-00000000000a';
insert into t select 'ws_d', workspace_id from public.workspace_members where user_id = 'd0000000-0000-4000-8000-00000000000d';

do $$ begin
  if (select count(*) from public.profiles where email like '%@test.local') <> 5 then raise exception 'FALLA: el trigger no creó los perfiles'; end if;
  if (select role from public.workspace_members where user_id = 'a0000000-0000-4000-8000-00000000000a') <> 'owner' then raise exception 'FALLA: el creador no es owner'; end if;
end $$;

-- ───── Como OLGA (owner) ─────
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select public.add_member((select v from t where k = 'ws'), 'editor@test.local', 'editor');
select public.add_member((select v from t where k = 'ws'), 'viewer@test.local', 'viewer');
select public.add_member((select v from t where k = 'ws'), 'member@test.local', 'member');

insert into public.guides (id, workspace_id, owner_id, title, visibility)
values
  ('10000000-0000-4000-8000-000000000001', (select v from t where k = 'ws'), 'a0000000-0000-4000-8000-00000000000a', 'Compartida', 'workspace'),
  ('10000000-0000-4000-8000-000000000002', (select v from t where k = 'ws'), 'a0000000-0000-4000-8000-00000000000a', 'Privada de Olga', 'private');

select public.insert_step('10000000-0000-4000-8000-000000000001', null, 'action', 'click', 'Paso A');
select public.insert_step('10000000-0000-4000-8000-000000000001', null, 'action', 'click', 'Paso C');
select public.insert_step('10000000-0000-4000-8000-000000000001', 2, 'manual', 'manual', 'Paso B');

do $$ begin
  if (select string_agg(instruction, ',' order by position) from public.guide_steps where guide_id = '10000000-0000-4000-8000-000000000001') <> 'Paso A,Paso B,Paso C' then
    raise exception 'FALLA: insert_step con posición no respeta el orden';
  end if;
end $$;

-- Reordenar y versionar
select public.reorder_steps('10000000-0000-4000-8000-000000000001',
  array(select id from public.guide_steps where guide_id = '10000000-0000-4000-8000-000000000001' order by position desc));
select public.create_version('10000000-0000-4000-8000-000000000001', 'v prueba');
do $$ begin
  if (select string_agg(instruction, ',' order by position) from public.guide_steps where guide_id = '10000000-0000-4000-8000-000000000001') <> 'Paso C,Paso B,Paso A' then
    raise exception 'FALLA: reorder_steps';
  end if;
  begin
    perform public.reorder_steps('10000000-0000-4000-8000-000000000001', array['10000000-0000-4000-8000-000000000001'::uuid]);
    raise exception 'FALLA: reorder_steps aceptó una lista incompleta';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- Borrar un paso compacta posiciones; restaurar versión recupera los 3 pasos y guarda copia previa.
select public.delete_step((select id from public.guide_steps where guide_id = '10000000-0000-4000-8000-000000000001' and position = 1));
do $$ begin
  if (select array_agg(position order by position) from public.guide_steps where guide_id = '10000000-0000-4000-8000-000000000001') <> array[1, 2] then
    raise exception 'FALLA: delete_step no compactó posiciones';
  end if;
end $$;
select public.restore_version((select id from public.guide_versions where guide_id = '10000000-0000-4000-8000-000000000001' and version_no = 1));
do $$ begin
  if (select count(*) from public.guide_steps where guide_id = '10000000-0000-4000-8000-000000000001') <> 3 then raise exception 'FALLA: restore_version'; end if;
  if (select count(*) from public.guide_versions where guide_id = '10000000-0000-4000-8000-000000000001') <> 2 then raise exception 'FALLA: restore_version no guardó la copia previa'; end if;
end $$;

-- Ruta de imagen fuera de la carpeta de la guía: el constraint la rechaza.
do $$ begin
  begin
    perform public.insert_step('10000000-0000-4000-8000-000000000001', null, 'action', 'click', 'x', null, null, null,
      '10000000-0000-4000-8000-000000000002/robo.jpg');
    raise exception 'FALLA: se aceptó una imagen de otra guía';
  exception when check_violation then null;
  end;
end $$;

-- ───── Como EDU (editor) ─────
reset role;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.guides where id = '10000000-0000-4000-8000-000000000002') <> 0 then raise exception 'FALLA: editor ve la privada de otro'; end if;
  if (select count(*) from public.guides where id = '10000000-0000-4000-8000-000000000001') <> 1 then raise exception 'FALLA: editor no ve la compartida'; end if;
  update public.guide_steps set instruction = 'Editado por Edu' where guide_id = '10000000-0000-4000-8000-000000000001' and position = 1;
  if not found then raise exception 'FALLA: editor no puede editar pasos de la compartida'; end if;
  -- Editar contenido sí; administrar (papelera/visibilidad) no.
  begin
    update public.guides set visibility = 'private' where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'FALLA: editor cambió la visibilidad de una guía ajena';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.guides set deleted_at = now() where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'FALLA: editor mandó a la papelera una guía ajena';
  exception when insufficient_privilege then null;
  end;
  -- Un editor no puede agregar miembros.
  begin
    perform public.add_member((select v from t where k = 'ws'), 'outsider@test.local', 'viewer');
    raise exception 'FALLA: editor agregó miembros';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ───── Como MEMO (colaborador) ─────
reset role;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  update public.guide_steps set instruction = 'hack' where guide_id = '10000000-0000-4000-8000-000000000001';
  if found then raise exception 'FALLA: colaborador editó una guía ajena'; end if;
  insert into public.guides (id, workspace_id, owner_id, title)
  values ('10000000-0000-4000-8000-000000000003', (select v from t where k = 'ws'), 'e0000000-0000-4000-8000-00000000000e', 'Mía de Memo');
  perform public.insert_step('10000000-0000-4000-8000-000000000003', null, 'manual', 'manual', 'Paso de Memo');
end $$;

-- ───── Como VERO (lectora) ─────
reset role;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.guide_steps where guide_id = '10000000-0000-4000-8000-000000000001') <> 3 then raise exception 'FALLA: lectora no lee los pasos'; end if;
  update public.guide_steps set instruction = 'hack' where guide_id = '10000000-0000-4000-8000-000000000001';
  if found then raise exception 'FALLA: lectora editó pasos'; end if;
  begin
    insert into public.guides (workspace_id, owner_id, title) values ((select v from t where k = 'ws'), 'c0000000-0000-4000-8000-00000000000c', 'x');
    raise exception 'FALLA: lectora creó una guía';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.insert_step('10000000-0000-4000-8000-000000000001', null, 'manual', 'manual', 'x');
    raise exception 'FALLA: lectora insertó un paso por RPC';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ───── Como OTTO (otro espacio) ─────
reset role;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.guides where workspace_id = (select v from t where k = 'ws')) <> 0 then raise exception 'FALLA: externo ve guías de otro espacio'; end if;
  if (select count(*) from public.guide_steps) <> 0 then raise exception 'FALLA: externo ve pasos ajenos'; end if;
  if (select count(*) from public.workspace_members where workspace_id = (select v from t where k = 'ws')) <> 0 then raise exception 'FALLA: externo ve miembros ajenos'; end if;
  if (select count(*) from public.activity_log where workspace_id = (select v from t where k = 'ws')) <> 0 then raise exception 'FALLA: externo ve actividad ajena'; end if;
  if (select count(*) from public.profiles where email = 'owner@test.local') <> 0 then raise exception 'FALLA: externo ve perfiles de otro espacio'; end if;
  -- Crear una guía en un espacio ajeno poniendo su id a mano.
  begin
    insert into public.guides (workspace_id, owner_id, title) values ((select v from t where k = 'ws'), 'd0000000-0000-4000-8000-00000000000d', 'intrusa');
    raise exception 'FALLA: externo creó una guía en otro espacio';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ───── Olga: papelera y borrado definitivo ─────
reset role;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  delete from public.guides where id = '10000000-0000-4000-8000-000000000001';
  if found then raise exception 'FALLA: se borró definitivo sin pasar por la papelera'; end if;
  update public.guides set deleted_at = now() where id = '10000000-0000-4000-8000-000000000001';
  update public.guide_steps set instruction = 'x' where guide_id = '10000000-0000-4000-8000-000000000001';
  if found then raise exception 'FALLA: se editó una guía en la papelera'; end if;
  delete from public.guides where id = '10000000-0000-4000-8000-000000000001';
  if not found then raise exception 'FALLA: owner no pudo borrar desde la papelera'; end if;
  -- Último propietario no puede degradarse.
  begin
    perform public.update_member_role((select v from t where k = 'ws'), 'a0000000-0000-4000-8000-00000000000a', 'admin');
    raise exception 'FALLA: el último propietario se degradó';
  exception when sqlstate '22023' then null;
  end;
end $$;

select 'RLS: todas las pruebas pasaron' as resultado;
rollback;
