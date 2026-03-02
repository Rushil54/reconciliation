import path from "path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";

let dbInstance: Database | null = null;

function resolveDatabasePath(): string {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must use sqlite file: format, e.g. file:./dev.db");
  }

  const relativePath = databaseUrl.replace(/^file:/, "");
  return path.resolve(process.cwd(), relativePath);
}

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await open({
    filename: resolveDatabasePath(),
    driver: sqlite3.Database,
  });

  return dbInstance;
}

export async function initializeDatabase(): Promise<void> {
  const db = await getDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS Contact (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phoneNumber TEXT,
      email TEXT,
      linkedId INTEGER,
      linkPrecedence TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deletedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_contact_email ON Contact(email);
    CREATE INDEX IF NOT EXISTS idx_contact_phone ON Contact(phoneNumber);
    CREATE INDEX IF NOT EXISTS idx_contact_linked ON Contact(linkedId);
  `);
}

export async function closeDatabase(): Promise<void> {
  if (!dbInstance) {
    return;
  }

  await dbInstance.close();
  dbInstance = null;
}
