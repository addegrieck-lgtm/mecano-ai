/** Création du premier administrateur sans interface : ORG_NAME, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD. */
import { openDb } from "./_db";
import { setupFirstAdmin } from "../lib/services/users";

const { ORG_NAME, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ORG_NAME || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Variables requises : ORG_NAME, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD");
  process.exit(1);
}
const { db, close, migrate } = await openDb();
await migrate();
const { user } = await setupFirstAdmin(db, { orgName: ORG_NAME, name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
console.log(`Administrateur créé : ${user.email}`);
await close();
