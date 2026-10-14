import { describe, expect, it } from "vitest";
import { canEditGuide, canManageGuide, canManageTeam, canCreateGuides } from "./permissions";

// Espejo de la matriz de la base (can_edit_guide / can_manage_guide). Si cambia una, cambia la otra:
// estas pruebas y supabase/tests/rls.sql deben contar la misma historia.
const ME = "u-me";
const OTHER = "u-other";
const shared = (owner: string) => ({ owner_id: owner, visibility: "workspace", deleted_at: null });
const priv = (owner: string) => ({ owner_id: owner, visibility: "private", deleted_at: null });

describe("matriz de permisos (sólo UI)", () => {
  it("el lector no crea ni edita, ni siquiera lo suyo", () => {
    expect(canCreateGuides("viewer")).toBe(false);
    expect(canEditGuide("viewer", ME, shared(ME))).toBe(false);
    expect(canManageGuide("viewer", ME, shared(ME))).toBe(false);
  });

  it("el colaborador edita lo suyo pero no lo del equipo", () => {
    expect(canEditGuide("member", ME, shared(ME))).toBe(true);
    expect(canEditGuide("member", ME, shared(OTHER))).toBe(false);
  });

  it("el editor edita lo compartido pero no lo administra", () => {
    expect(canEditGuide("editor", ME, shared(OTHER))).toBe(true);
    expect(canManageGuide("editor", ME, shared(OTHER))).toBe(false);
  });

  it("nadie toca una guía privada ajena, ni el propietario del espacio", () => {
    for (const role of ["owner", "admin", "editor", "member"] as const) {
      expect(canEditGuide(role, ME, priv(OTHER))).toBe(false);
      expect(canManageGuide(role, ME, priv(OTHER))).toBe(false);
    }
  });

  it("en la papelera no se edita, pero sí se administra (restaurar)", () => {
    const trashed = { ...shared(ME), deleted_at: "2026-10-14T00:00:00Z" };
    expect(canEditGuide("owner", ME, trashed)).toBe(false);
    expect(canManageGuide("owner", ME, trashed)).toBe(true);
  });

  it("sólo propietario y administrador gestionan el equipo", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("editor")).toBe(false);
  });
});
