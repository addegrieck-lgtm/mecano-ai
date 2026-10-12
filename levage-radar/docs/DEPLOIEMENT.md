# Déploiement

## Option A — Vercel + PostgreSQL managé (Neon ou Supabase)

1. Créer une base PostgreSQL (offres gratuites Neon / Supabase : quotas de stockage et de calcul limités).
   - Supabase via le *pooler* en mode transaction (port 6543) : ajouter `DATABASE_PREPARE=false`.
2. Importer le dépôt dans Vercel avec **Root Directory = `levage-radar`**. `vercel.json` définit la commande de build (`npm run build:vercel` = migrations puis build) et le cron quotidien.
3. Variables : `DATABASE_URL`, `APP_URL`, `CRON_SECRET`, `SETUP_TOKEN`, éventuellement `SMTP_*`, `EMAIL_FROM`, `TED_COUNTRIES`, `CONNECTOR_CONTACT_EMAIL`.
4. Déployer puis ouvrir `/setup`.

**Tâche planifiée Vercel** : `vercel.json` appelle `/api/cron/daily` chaque jour à 05:15 UTC ; Vercel envoie `Authorization: Bearer $CRON_SECRET`. Limites à connaître : l'offre gratuite (Hobby) n'autorise que des crons quotidiens et une durée d'exécution de fonction limitée ; une collecte large peut dépasser cette durée. Les collectes interrompues sont marquées « échec » (jamais « en cours » indéfiniment) et la suivante reprend à partir de la dernière réussite. Si la durée pose problème, utilisez l'option GitHub Actions ci-dessous.

## Option B — GitHub Actions (collecte sans limite de durée de fonction)

Le workflow `.github/workflows/levage-radar-daily.yml` exécute `npm run daily` chaque jour (05:15 UTC) et sur demande. Pour l'activer, créez la variable de dépôt `LEVAGE_RADAR_DAILY` = `github` (sinon le workflow est ignoré). Secrets à créer : `DATABASE_URL`, `APP_URL`, et facultativement `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `CONNECTOR_CONTACT_EMAIL` ; variable `TED_COUNTRIES`. Le job échoue (code 2) si **toutes** les sources ont échoué, ce qui déclenche la notification GitHub. Les minutes GitHub Actions sont gratuites dans une certaine limite (dépôts privés : quota mensuel).

N'activez qu'**une** des deux planifications (Vercel ou GitHub), ou acceptez une double exécution (sans danger : déduplication et curseurs incrémentaux).

## Option C — Serveur (VM, Docker, on-premise)

```bash
npm ci && npm run db:migrate && npm run build
npm start                         # derrière un reverse proxy HTTPS (nginx, Caddy…)
# crontab : tâche quotidienne
15 5 * * * cd /srv/levage-radar && npm run daily >> /var/log/levage-radar.log 2>&1
```

## Vérifications après déploiement

- `GET /api/health` → `{"status":"ok","database":"postgres"}`
- Page « État des connecteurs » : dernière exécution, réussites, erreurs
- Page « Rapport quotidien » : statut `ok` / `incomplète` / `NON effectuée`
- `npm run connectors:check` depuis l'environnement de production (réseau sortant autorisé vers les API)

## Sauvegardes et restauration

Toutes les données (y compris photos et documents, stockés en `bytea`) sont dans PostgreSQL :
- sauvegarde : `pg_dump --format=custom "$DATABASE_URL" > levage-radar-$(date +%F).dump` (ou sauvegardes automatiques de l'hébergeur — vérifier leur durée de rétention, souvent courte en offre gratuite) ;
- restauration : `pg_restore --clean --if-exists -d "$DATABASE_URL" fichier.dump` ;
- tester la restauration périodiquement sur une base séparée.

## Coûts (services pouvant engendrer des frais)

| Poste | Gratuit possible | Remarques |
|---|---|---|
| Hébergement Next.js | Vercel Hobby (usage non commercial selon les conditions Vercel — à vérifier pour un usage professionnel), ou serveur existant | Offres payantes pour usage commercial / durées d'exécution plus longues |
| PostgreSQL | Neon / Supabase gratuits (quotas) | Photos stockées en base : surveiller le volume |
| Tâche planifiée | Vercel Cron (quotidien) ou GitHub Actions (quota) | |
| E-mails | Quotas gratuits Brevo / Mailjet, SMTP d'entreprise | Facultatif |
| Collecte | BOAMP et TED : API publiques gratuites | Respecter un volume raisonnable |
| IA | Aucune par défaut ; Ollama local gratuit | API Claude payante à l'usage, facultative et désactivée par défaut |
