/**
 * Vérification EN CONDITIONS RÉELLES des connecteurs (réseau requis, aucune écriture en base) :
 * interroge BOAMP et TED sur les 7 derniers jours et affiche ce qui serait collecté.
 *   npm run connectors:check
 */
import { implementedConnectors } from "../lib/connectors/registry";
import { classify } from "../lib/radar/classify";

const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
let ok = 0;
for (const c of implementedConnectors()) {
  process.stdout.write(`\n== ${c.info.name} (depuis ${since}) ==\n`);
  try {
    const r = await c.fetch({ since, maxPages: 1, log: (m) => console.log("  " + m) });
    ok++;
    console.log(`  ${r.notices.length} avis normalisés, ${r.warnings.length} avertissement(s)`);
    for (const w of r.warnings) console.log(`  ⚠ ${w}`);
    for (const n of r.notices.slice(0, 5)) {
      const cl = classify(n);
      console.log(`  - [${n.sourceRef}] ${n.title.slice(0, 90)} | ${n.buyerName ?? "?"} | publié ${n.publishedAt ?? "?"} | limite ${n.deadlineAt ?? "non publiée"} | ${cl.domain}/${cl.serviceType}`);
    }
  } catch (e) {
    console.log(`  ÉCHEC : ${e instanceof Error ? e.message : String(e)}`);
  }
}
process.exit(ok ? 0 : 2);
