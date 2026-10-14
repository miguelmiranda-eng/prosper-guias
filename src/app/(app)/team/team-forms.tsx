"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { addMember, removeMember, renameWorkspace, updateMemberRole, updateProfileName } from "@/lib/team/actions";
import { ROLE_LABELS, type ActionResult, type WorkspaceRole } from "@/lib/types";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult>, okText = "Guardado.") =>
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { ok: true, text: okText } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  const feedback = msg && (
    <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
  );
  return { pending, run, feedback };
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const { pending, run, feedback } = useRun();
  const [value, setValue] = useState(name);
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => updateProfileName(value)); }}>
      <label className="label" htmlFor="pname">Nombre</label>
      <div className="flex gap-2">
        <input id="pname" className="input" value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} />
        <button className="btn" disabled={pending || value.trim() === name}>Guardar</button>
      </div>
      <p className="text-xs text-muted">{email}</p>
      {feedback}
    </form>
  );
}

export function WorkspaceNameForm({ name, canEdit }: { name: string; canEdit: boolean }) {
  const { pending, run, feedback } = useRun();
  const [value, setValue] = useState(name);
  if (!canEdit) return <p className="text-sm">{name}</p>;
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => renameWorkspace(value)); }}>
      <label className="label" htmlFor="wname">Nombre del espacio</label>
      <div className="flex gap-2">
        <input id="wname" className="input" value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} />
        <button className="btn" disabled={pending || value.trim() === name}>Guardar</button>
      </div>
      {feedback}
    </form>
  );
}

export function AddMemberForm({ canAddAdmin }: { canAddAdmin: boolean }) {
  const { pending, run, feedback } = useRun();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const options: WorkspaceRole[] = canAddAdmin ? ["admin", "editor", "member", "viewer"] : ["editor", "member", "viewer"];
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const res = await addMember(email, role);
          if (res.ok) setEmail("");
          return res;
        }, "Miembro agregado.");
      }}
    >
      <input
        type="email"
        required
        className="input w-56 py-1.5"
        placeholder="correo@prosper-mfg.com"
        aria-label="Correo de la persona"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <select className="input w-auto py-1.5" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)} aria-label="Rol">
        {options.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
      <button className="btn btn-primary btn-sm" disabled={pending}><UserPlus className="h-3.5 w-3.5" />Agregar</button>
      <div className="w-full">{feedback}</div>
    </form>
  );
}

export function MemberRow({ userId, role, isSelf, myRole }: { userId: string; role: WorkspaceRole; isSelf: boolean; myRole: WorkspaceRole }) {
  const { pending, run, feedback } = useRun();
  // Lo mismo que valida la base: el admin no toca a propietarios ni admins.
  const canChange = !isSelf && (myRole === "owner" || (myRole === "admin" && role !== "owner" && role !== "admin"));
  const options: WorkspaceRole[] = myRole === "owner" ? ["owner", "admin", "editor", "member", "viewer"] : ["editor", "member", "viewer"];

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {canChange ? (
          <select
            className="input w-auto py-1 text-xs"
            value={role}
            disabled={pending}
            aria-label="Cambiar rol"
            onChange={(e) => run(() => updateMemberRole(userId, e.target.value), "Rol actualizado.")}
          >
            {options.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        ) : (
          <span className="badge bg-surface-2 text-muted">{ROLE_LABELS[role]}</span>
        )}
        {(canChange || isSelf) && (
          <button
            className="btn btn-ghost btn-sm text-danger"
            disabled={pending}
            onClick={() => {
              const q = isSelf ? "¿Salir de este espacio? Perderás acceso a sus guías." : "¿Quitar a esta persona del espacio?";
              if (confirm(q)) run(() => removeMember(userId), isSelf ? "Saliste del espacio." : "Miembro quitado.");
            }}
          >
            {isSelf ? "Salir" : "Quitar"}
          </button>
        )}
      </div>
      {feedback}
    </div>
  );
}
