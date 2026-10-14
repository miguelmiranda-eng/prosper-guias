import { getWorkspaceContext } from "@/lib/session";
import { canManageTeam } from "@/lib/permissions";
import { ROLE_LABELS, type WorkspaceRole } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { When } from "@/components/when";
import { AddMemberForm, MemberRow, ProfileForm, WorkspaceNameForm } from "./team-forms";

export const metadata = { title: "Equipo" };

const ROLE_HELP: [WorkspaceRole, string][] = [
  ["owner", "Todo, incluido nombrar administradores. Siempre queda al menos uno."],
  ["admin", "Administra miembros (excepto propietarios/admins) y todas las guías del equipo."],
  ["editor", "Crea guías y edita cualquier guía compartida con el equipo."],
  ["member", "Crea guías y edita sólo las suyas; lee las del equipo."],
  ["viewer", "Sólo lee las guías compartidas con el equipo."],
];

export default async function TeamPage() {
  const { supabase, userId, workspace, role, profile } = await getWorkspaceContext();
  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("user_id, role, created_at, profile:profiles(full_name, email)")
    .eq("workspace_id", workspace.id)
    .order("created_at");
  if (error) throw new Error(`No se pudieron leer los miembros: ${error.message}`);
  const manage = canManageTeam(role);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="Equipo" subtitle={workspace.name} />

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 font-medium">Tu perfil</h2>
          <ProfileForm name={profile.name} email={profile.email} />
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-medium">Espacio de trabajo</h2>
          <WorkspaceNameForm name={workspace.name} canEdit={manage} />
        </section>
      </div>

      <section className="card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <h2 className="font-medium">Miembros ({members?.length ?? 0})</h2>
          {manage && <AddMemberForm canAddAdmin={role === "owner"} />}
        </div>
        <ul className="divide-y divide-line">
          {(members ?? []).map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.profile?.full_name ?? "—"}{m.user_id === userId && <span className="ml-1 text-xs text-muted">(tú)</span>}</p>
                <p className="truncate text-xs text-muted">{m.profile?.email} · desde <When iso={m.created_at} /></p>
              </div>
              <MemberRow
                userId={m.user_id}
                role={m.role}
                isSelf={m.user_id === userId}
                myRole={role}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 card p-4">
        <h2 className="mb-2 font-medium">Qué puede hacer cada rol</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
          {ROLE_HELP.map(([r, text]) => (
            <div key={r} className="contents">
              <dt className="font-medium">{ROLE_LABELS[r]}</dt>
              <dd className="text-muted">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          Las guías privadas sólo las ve su autor, sin importar el rol. Los permisos se validan en la base de datos, no sólo en pantalla.
          Por ahora sólo se pueden agregar personas que ya crearon su cuenta; las invitaciones por correo llegan en la siguiente fase.
        </p>
      </section>
    </div>
  );
}
