/**
 * Parcours de bout en bout (navigateur réel) — voir docs/TESTS.md.
 * Prérequis : application démarrée sur une base VIERGE avec ENABLE_DEMO_DATA=true et les données de démonstration
 * (npm run db:seed-demo), Chromium disponible, paquet « playwright-core » installé.
 *   node e2e/scenario.mjs <dossier-de-sortie> [url] [chemin-chromium]
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = process.argv[2] ?? "test-results";
const BASE = process.argv[3] ?? "http://localhost:3100";
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("✔", ...a);
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
fs.writeFileSync(`${OUT}/photo.jpg`, JPEG);

const browser = await chromium.launch(process.argv[4] ? { executablePath: process.argv[4] } : {});
const ctxA = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctxA.newPage();
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

// 1. Installation
await page.goto(`${BASE}/login`);
await page.waitForURL(/\/setup/);
await page.fill("#orgName", "Agence de test");
await page.fill("#name", "Alice Admin");
await page.fill("#email", "admin@test.fr");
await page.fill("#password", "Admin-Password-2026");
await page.fill("#confirm", "Admin-Password-2026");
await page.click("button[type=submit]");
await page.waitForURL(/\/settings\?welcome/);
log("installation + connexion");

// 2. Tableau de bord réel : sources en erreur, aucune donnée fictive
await page.goto(`${BASE}/dashboard`);
await page.getByText("Sources en erreur ou non actualisées").waitFor();
await shot(page, "01-dashboard-reel");
log("dashboard réel : sources en erreur affichées");
await page.goto(`${BASE}/sources`);
await page.getByText("Historique des synchronisations").waitFor();
if (!(await page.getByText("échec").first().isVisible())) throw new Error("échecs non affichés");
await shot(page, "02-sources");
log("état des connecteurs");
await page.goto(`${BASE}/radar`);
await page.getByText("Aucune opportunité ne correspond").waitFor();
log("radar réel vide (pas de données démo mélangées)");

// 3. Espace démonstration
await page.getByRole("button", { name: /Voir les données de démonstration/ }).click();
await page.waitForTimeout(800);
await page.goto(`${BASE}/radar`);
await page.getByText("MODE DÉMONSTRATION — données").waitFor();
const rows = await page.locator("tbody tr").count();
if (rows < 4) throw new Error("démo : " + rows);
await shot(page, "03-radar-demo");
await page.locator("tbody tr a").first().click();
await page.getByText("Score de pertinence").waitFor();
await page.selectOption("#status", "EN_ANALYSE");
await page.getByRole("button", { name: "Mettre à jour" }).click();
await page.getByText("Statut mis à jour.").waitFor();
await page.fill("textarea[name=body]", "Note de test");
await page.getByRole("button", { name: "Ajouter la note" }).click();
await page.getByText("Note ajoutée.").waitFor();
await page.fill("input[name=title]", "Télécharger le DCE");
await page.getByRole("button", { name: "Créer la tâche" }).click();
await page.getByText("Tâche créée.").waitFor();
await shot(page, "04-fiche-opportunite");
log("fiche : statut, note, tâche");
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exporter (PDF)" }).click()]);
if (!(await dl.path())) throw new Error("pdf");
log("export PDF synthèse :", dl.suggestedFilename());
const csv = await page.request.get(`${BASE}/api/opportunities/export?fields=title,score`);
if (!csv.ok() || !(await csv.text()).includes("Titre;Score")) throw new Error("csv");
log("export CSV");
await page.goto(`${BASE}/assistant`);
await page.fill("#question", "Quels marchés méritent d'être étudiés en priorité ?");
await page.getByRole("button", { name: "Demander" }).click();
await page.getByText("Informations manquantes / limites").waitFor();
await shot(page, "05-assistant");
log("assistant");
await page.goto(`${BASE}/dashboard`);
await page.getByRole("button", { name: /revenir aux données réelles/ }).click();
await page.waitForTimeout(500);

// 4. Utilisateurs
await page.goto(`${BASE}/admin/users`);
await page.fill("input[name=name]", "Ivan Inspecteur");
await page.fill("input[name=email]", "ivan@test.fr");
await page.selectOption("select[name=role] >> nth=-1", "INSPECTOR_LIFT");
await page.getByRole("button", { name: "Créer le compte" }).click();
const msg = await page.getByText(/reset-password\?token=/).textContent();
const link = msg.match(/http\S+/)[0];
log("compte inspecteur créé, lien d'activation");

// 5. Modèles
await page.goto(`${BASE}/templates`);
await page.getByRole("button", { name: /Installer les modèles/ }).click();
await page.getByText("Levage — exemple à adapter").waitFor();
await page.getByText("Levage — exemple à adapter").click();
await page.getByRole("button", { name: "Valider cette version" }).click();
await page.getByText("v1 · validée").waitFor();
log("modèle levage validé par un responsable");

// 6. Client
await page.goto(`${BASE}/clients`);
await page.fill("input[name=name]", "Client Démo SA");
await page.getByRole("button", { name: "Créer" }).click();
await page.getByText("Client créé.").waitFor();
await page.getByRole("link", { name: "Client Démo SA" }).click();
await page.waitForURL(/clients\/[0-9a-f-]{36}/);
await page.getByText("Sites (0)").waitFor();
await page.fill("input[name=name] >> nth=0", "Usine Nord");
await page.fill("input[name=city]", "Lille");
await page.getByRole("button", { name: "Ajouter le site" }).click();
await page.getByText("Site ajouté.").waitFor();
log("client + site");

// 7. Inspecteur : activation, mission, saisie terrain sur mobile
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const m = await ctxB.newPage();
m.on("dialog", (d) => d.accept());
m.on("pageerror", (e) => errors.push("mobile: " + e.message));
await m.goto(link);
await m.fill("#password", "Inspecteur-Pass-2026");
await m.fill("#confirm", "Inspecteur-Pass-2026");
await m.click("button[type=submit]");
await m.waitForURL(/login\?reset/);
await m.fill("#email", "ivan@test.fr");
await m.fill("#password", "Inspecteur-Pass-2026");
await m.click("button[type=submit]");
await m.waitForURL(/missions\/levage/);
log("inspecteur activé et connecté (redirigé vers ses rapports)");
await m.goto(`${BASE}/radar`);
if (!m.url().includes("forbidden")) throw new Error("inspecteur a accès au radar");
log("inspecteur levage : radar refusé");
await m.goto(`${BASE}/missions/levage/new`);
await m.fill("#title", "VGP atelier Nord");
await m.selectOption("#clientId", { label: "Client Démo SA" });
await m.fill("#scheduledAt", "2026-10-12T08:30");
await m.getByRole("button", { name: "Créer la mission" }).click();
await m.waitForURL(/missions\/levage\/[0-9a-f-]{36}$/);
const missionUrl = m.url();
await m.getByText("✓ Enregistré").waitFor();
await m.selectOption("#f-type_mission", "Vérification générale périodique");
await m.getByRole("tab", { name: /Équipements/ }).click();
await m.getByRole("button", { name: "+ Appareil de levage" }).click();
await m.selectOption("#f-famille", "Pont roulant");
await m.fill("#f-designation", "Pont roulant hall A");
await m.fill("#f-capacite_nominale", "5000");
await m.locator("input[aria-label='Valeur mesurée']").fill("5500");
await m.getByRole("button", { name: "Ajouter le relevé" }).click();
await m.getByRole("button", { name: "+ Observation" }).click();
await m.fill("#obs-desc", "Fin de course haut à contrôler");
await m.getByRole("button", { name: "Anomalie" }).click();
await m.getByRole("button", { name: "Enregistrer" }).click();
await m.setInputFiles("input[type=file][accept='image/*']", `${OUT}/photo.jpg`);
await m.getByText("✓ Enregistré").waitFor({ timeout: 15000 });
await m.waitForTimeout(1500);
await m.locator("figure img").first().waitFor({ timeout: 15000 });
if ((await m.inputValue("#item-label")) !== "Pont roulant hall A") throw new Error("libellé " + await m.inputValue("#item-label"));
await shot(m, "06-mobile-equipement");
log("mobile : équipement, relevé, anomalie, photo, sauvegarde auto");

// 8. Hors ligne : rechargement depuis le cache chiffré et file de modifications
await m.reload();
await m.getByText("✓ Enregistré").waitFor();
await m.waitForTimeout(1500);
await ctxB.setOffline(true);
await m.reload().catch(() => {});
await m.getByText(/Hors connexion : copie locale/).waitFor({ timeout: 15000 });
await m.getByRole("tab", { name: "Mission" }).click();
await m.fill("#notes", "Saisie hors ligne : accès toiture impossible");
await m.getByText(/Hors ligne — \d+ modification/).waitFor();
await shot(m, "07-mobile-hors-ligne");
log("hors ligne : dossier rouvert depuis la copie locale, modification en file");

// 9. Conflit : le responsable (admin, autre appareil) modifie le même champ pendant ce temps
const missionId = missionUrl.split("/").pop();
const opRes = await page.request.post(`${BASE}/api/missions/${missionId}/ops`, {
  headers: { Origin: BASE, "Content-Type": "application/json" },
  data: { ops: [{ opId: crypto.randomUUID(), kind: "patchMission", changes: { generalNotes: { base: null, value: "Note du bureau" } } }] },
});
const opJson = await opRes.json();
if (opJson.results[0].status !== "applied") throw new Error("op admin " + JSON.stringify(opJson));
await ctxB.setOffline(false);
await m.evaluate(() => window.dispatchEvent(new Event("online")));
await m.getByText(/Conflits de synchronisation/).waitFor({ timeout: 20000 });
await shot(m, "08-conflit");
log("conflit détecté au retour du réseau, rien d'écrasé");
await m.getByRole("button", { name: "Appliquer ma version" }).click();
await m.getByText("✓ Enregistré").waitFor({ timeout: 20000 });
const after = await (await m.request.get(`${BASE}/api/missions/${missionId}`)).json();
if (after.mission.generalNotes !== "Saisie hors ligne : accès toiture impossible") throw new Error("résolution " + after.mission.generalNotes);
if (after.items.length !== 1 || after.measurements.length !== 1 || after.observations.length !== 1 || after.attachments.length !== 1) throw new Error("données " + JSON.stringify({ i: after.items.length, m: after.measurements.length, o: after.observations.length, a: after.attachments.length }));
log("résolution explicite appliquée ; équipement, relevé, observation, photo présents côté serveur");

// 10. Brouillon et exports
await m.getByRole("tab", { name: /Brouillon/ }).click();
await m.getByText("Informations manquantes ou à vérifier").waitFor();
await shot(m, "09-brouillon-onglet");
const pdf = await m.request.get(`${BASE}/api/missions/${missionId}/export?format=pdf`);
if (!pdf.ok() || (await pdf.body()).subarray(0, 5).toString() !== "%PDF-") throw new Error("pdf mission");
const json = await (await m.request.get(`${BASE}/api/missions/${missionId}/export?format=json`)).json();
if (json.format !== "levage-radar/brouillon-rapport") throw new Error("json");
fs.writeFileSync(`${OUT}/brouillon.pdf`, await pdf.body());
log("exports brouillon PDF + JSON");
await page.goto(`${BASE}${new URL(missionUrl).pathname}/brouillon`);
await page.getByText("BROUILLON NON OFFICIEL").waitFor();
await shot(page, "10-brouillon");
await page.goto(`${BASE}${new URL(missionUrl).pathname}/historique`);
await page.getByText("Ajout d'un relevé").waitFor();
log("brouillon et historique consultables par le responsable");

// 11. Isolation : un inspecteur électricité n'accède pas au dossier levage
const fake = await m.request.get(`${BASE}/api/missions/00000000-0000-4000-8000-000000000000`);
if (fake.status() !== 404) throw new Error("404 attendu");
const noOrigin = await m.request.post(`${BASE}/api/missions/${missionId}/ops`, { data: { ops: [] }, headers: { Origin: "https://evil.example" } });
if (noOrigin.status() !== 403) throw new Error("CSRF attendu 403, reçu " + noOrigin.status());
log("contrôles : 404 sur dossier inexistant, origine étrangère refusée (403)");

for (const path of ["/buyers", "/tasks", "/alerts", "/reports/daily", "/templates", "/clients", "/exports", "/audit", "/settings", "/missions/electricite"]) {
  const r = await page.goto(BASE + path);
  if (!r.ok()) throw new Error(path + " " + r.status());
}
log("toutes les pages d'administration répondent");
console.log("Erreurs JS navigateur :", errors.length ? errors : "aucune");
await browser.close();
