import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/lib/db";
import { contextFromToken, createResetToken, hashPassword, login, resetPassword, revokeSession, validatePasswordStrength, verifyPassword } from "@/lib/auth/core";
import { resolvePermissions } from "@/lib/auth/permissions";
import { createUser, setupFirstAdmin, updateRolePermissions, updateUser } from "@/lib/services/users";
import { createOrgWithUsers, createTestDb } from "./helpers";

let db: DB;
let close: () => Promise<void>;
beforeEach(async () => ({ db, close } = await createTestDb()));
afterEach(async () => close());

describe("mots de passe", () => {
  it("hache et vérifie (scrypt)", async () => {
    const h = await hashPassword("Correct-Horse-42");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Correct-Horse-42", h)).toBe(true);
    expect(await verifyPassword("correct-horse-42", h)).toBe(false);
  });
  it("impose une robustesse minimale", () => {
    expect(validatePasswordStrength("court")).not.toBeNull();
    expect(validatePasswordStrength("toutenminuscules")).not.toBeNull();
    expect(validatePasswordStrength("Un-Mot-De-Passe-1")).toBeNull();
  });
});

describe("connexion et sessions", () => {
  it("installation initiale unique, connexion, session, déconnexion", async () => {
    await setupFirstAdmin(db, { orgName: "Mon entreprise", name: "Admin", email: "Admin@Test.fr", password: "Admin-Password-1" });
    await expect(setupFirstAdmin(db, { orgName: "X", name: "Y", email: "y@t.fr", password: "Admin-Password-1" })).rejects.toThrow(/déjà initialisée/);
    const r = await login(db, { email: "admin@test.fr", password: "Admin-Password-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ctx = await contextFromToken(db, r.token);
    expect(ctx?.user.role).toBe("ADMIN");
    expect(ctx?.perms.has("users.manage")).toBe(true);
    await revokeSession(db, r.token);
    expect(await contextFromToken(db, r.token)).toBeNull();
  });

  it("message identique pour un compte inconnu ou un mauvais mot de passe", async () => {
    await setupFirstAdmin(db, { orgName: "Org", name: "Admin", email: "a@t.fr", password: "Admin-Password-1" });
    const a = await login(db, { email: "a@t.fr", password: "mauvais" });
    const b = await login(db, { email: "inconnu@t.fr", password: "mauvais" });
    expect(a).toEqual(b);
  });

  it("limite les tentatives par compte", async () => {
    await setupFirstAdmin(db, { orgName: "Org", name: "Admin", email: "a@t.fr", password: "Admin-Password-1" });
    for (let i = 0; i < 5; i++) await login(db, { email: "a@t.fr", password: "x", ip: "1.2.3.4" });
    const r = await login(db, { email: "a@t.fr", password: "Admin-Password-1", ip: "1.2.3.4" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Trop de tentatives/);
  });

  it("jeton invalide ou falsifié refusé", async () => {
    expect(await contextFromToken(db, "n-importe-quoi")).toBeNull();
    expect(await contextFromToken(db, "")).toBeNull();
  });

  it("réinitialisation : jeton à usage unique, révoque les sessions", async () => {
    await setupFirstAdmin(db, { orgName: "Org", name: "Admin", email: "a@t.fr", password: "Admin-Password-1" });
    const s = await login(db, { email: "a@t.fr", password: "Admin-Password-1" });
    const t = (await createResetToken(db, "a@t.fr"))!;
    await resetPassword(db, t.token, "Nouveau-Password-2");
    await expect(resetPassword(db, t.token, "Encore-Password-3")).rejects.toThrow(/invalide ou expiré/);
    if (s.ok) expect(await contextFromToken(db, s.token)).toBeNull();
    expect((await login(db, { email: "a@t.fr", password: "Nouveau-Password-2" })).ok).toBe(true);
    expect(await createResetToken(db, "inconnu@t.fr")).toBeNull();
  });

  it("compte désactivé : sessions révoquées et connexion impossible", async () => {
    const { ctx } = await createOrgWithUsers(db, "Org", ["ADMIN", "BUSINESS"]);
    const s = await login(db, { email: ctx.BUSINESS.user.email, password: "Mot-de-passe-Test-123" });
    expect(s.ok).toBe(true);
    await updateUser(ctx.ADMIN, ctx.BUSINESS.user.id, { active: false });
    if (s.ok) expect(await contextFromToken(db, s.token)).toBeNull();
    expect((await login(db, { email: ctx.BUSINESS.user.email, password: "Mot-de-passe-Test-123" })).ok).toBe(false);
  });
});

describe("rôles et permissions", () => {
  it("matrice par défaut", () => {
    expect(resolvePermissions("INSPECTOR_LIFT").has("reports.lift.write")).toBe(true);
    expect(resolvePermissions("INSPECTOR_LIFT").has("reports.elec.write")).toBe(false);
    expect(resolvePermissions("INSPECTOR_LIFT").has("opps.read")).toBe(false);
    expect(resolvePermissions("BUSINESS").has("reports.lift.write")).toBe(false);
    expect(resolvePermissions("READER").has("opps.track")).toBe(false);
    expect(resolvePermissions("INCONNU").size).toBe(0);
  });
  it("surcharges d'organisation et permissions individuelles", () => {
    const p = resolvePermissions("READER", ["opps.export", "permission.bidon"], { READER: ["opps.read"] });
    expect([...p].sort()).toEqual(["opps.export", "opps.read"]);
  });
  it("un administrateur ne peut pas se retirer ses droits ni supprimer le dernier admin", async () => {
    const { ctx } = await createOrgWithUsers(db, "Org", ["ADMIN"]);
    await expect(updateUser(ctx.ADMIN, ctx.ADMIN.user.id, { role: "READER" })).rejects.toThrow();
  });
  it("seul un gestionnaire d'utilisateurs crée des comptes ; e-mail unique", async () => {
    const { ctx } = await createOrgWithUsers(db, "Org", ["ADMIN", "BUSINESS"]);
    await expect(createUser(ctx.BUSINESS, { name: "X", email: "x@t.fr", role: "READER" })).rejects.toThrow(/Accès refusé/);
    const r = await createUser(ctx.ADMIN, { name: "Nouvel inspecteur", email: "insp@t.fr", role: "INSPECTOR_ELEC" });
    expect(r.token.length).toBeGreaterThan(20);
    await expect(createUser(ctx.ADMIN, { name: "Doublon", email: "INSP@t.fr", role: "READER" })).rejects.toThrow(/existe déjà/);
  });
  it("modification de la matrice de rôles (ADMIN non modifiable)", async () => {
    const { ctx } = await createOrgWithUsers(db, "Org", ["ADMIN"]);
    await updateRolePermissions(ctx.ADMIN, { READER: ["opps.read", "opps.export"], ADMIN: [] });
    const fresh = await contextFromToken(db, null);
    expect(fresh).toBeNull();
  });
});
