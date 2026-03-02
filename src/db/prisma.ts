import path from "path";
import fs from "fs";
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

  const dbPath = resolveDatabasePath();

  // Ensure parent directory exists (useful for container deploy targets like /var/data).
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  } catch (error) {
    throw new Error(
      `Failed to prepare database directory for ${dbPath}. Check DATABASE_URL and disk mount. ${
        error instanceof Error ? error.message : ""
      }`,
    );
  }

  dbInstance = await open({
    filename: dbPath,
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
