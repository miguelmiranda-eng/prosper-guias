-- Corrige: INSERT ... RETURNING en guides fallaba con 42501.
-- La política SELECT usaba can_read_guide(id), que busca la guía por id en la tabla; durante el
-- INSERT la fila nueva todavía no es visible para esa consulta, así que el RETURNING se negaba.
-- Ahora la regla se evalúa con las columnas de la propia fila (misma lógica que can_read_guide).
drop policy guides_select on public.guides;
create policy guides_select on public.guides for select to authenticated
  using (
    public.ws_role(workspace_id) is not null
    and (
      owner_id = (select auth.uid())
      or (visibility = 'workspace' and (deleted_at is null or public.ws_role(workspace_id) in ('owner', 'admin')))
    )
  );
