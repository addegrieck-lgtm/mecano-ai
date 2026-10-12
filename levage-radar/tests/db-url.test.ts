import { afterEach, describe, expect, it } from "vitest";
import { databaseUrl, preparedStatementsAllowed } from "@/lib/db/url";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("URL PostgreSQL", () => {
  it("retire channel_binding (chaîne Neon) et garde sslmode", () => {
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
    const u = databaseUrl()!;
    expect(u).not.toContain("channel_binding");
    expect(u).toContain("sslmode=require");
    expect(preparedStatementsAllowed(u)).toBe(false);
  });
  it("ajoute sslmode=require pour un hôte distant, pas en local", () => {
    process.env.DATABASE_URL = '"postgres://u:p@db.example.com:5432/x"';
    expect(databaseUrl()).toBe("postgres://u:p@db.example.com:5432/x?sslmode=require");
    process.env.DATABASE_URL = "postgres://lr@localhost:55432/levage";
    expect(databaseUrl()).toBe("postgres://lr@localhost:55432/levage");
  });
});
