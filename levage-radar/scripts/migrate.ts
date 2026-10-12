import { openDb } from "./_db";

const { migrate, close } = await openDb();
await migrate();
console.log(`Migrations appliquées (${process.env.DATABASE_URL ? "PostgreSQL" : "PGlite locale"}).`);
await close();
