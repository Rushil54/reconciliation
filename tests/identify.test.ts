import request from "supertest";
import { app } from "../src/app";
import { closeDatabase, getDb, initializeDatabase } from "../src/db/prisma";

async function insertContact(data: {
  email: string | null;
  phoneNumber: string | null;
  linkPrecedence: string;
  linkedId?: number | null;
  createdAt?: string;
}): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`,
    [
      data.email,
      data.phoneNumber,
      data.linkedId ?? null,
      data.linkPrecedence,
      data.createdAt ?? null,
    ],
  );

  return result.lastID as number;
}

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(async () => {
  const db = await getDb();
  await db.exec("DELETE FROM Contact;");
  await db.exec("DELETE FROM sqlite_sequence WHERE name='Contact';");
});

afterAll(async () => {
  await closeDatabase();
});

describe("POST /identify", () => {
  it("creates a new primary contact when no match exists", async () => {
    const response = await request(app).post("/identify").send({
      email: "new@fluxkart.com",
      phoneNumber: "111111",
    });

    expect(response.status).toBe(200);
    expect(response.body.contact.primaryContatctId).toBeDefined();
    expect(response.body.contact.emails).toEqual(["new@fluxkart.com"]);
    expect(response.body.contact.phoneNumbers).toEqual(["111111"]);
    expect(response.body.contact.secondaryContactIds).toEqual([]);
  });

  it("creates a secondary contact when partial match has new info", async () => {
    const primary = await insertContact({
      email: "lorraine@hillvalley.edu",
      phoneNumber: "123456",
      linkPrecedence: "primary",
    });

    const response = await request(app).post("/identify").send({
      email: "mcfly@hillvalley.edu",
      phoneNumber: "123456",
    });

    expect(response.status).toBe(200);
    expect(response.body.contact.primaryContatctId).toBe(primary);
    expect(response.body.contact.emails).toEqual([
      "lorraine@hillvalley.edu",
      "mcfly@hillvalley.edu",
    ]);
    expect(response.body.contact.phoneNumbers).toEqual(["123456"]);
    expect(response.body.contact.secondaryContactIds.length).toBe(1);
  });

  it("merges two primary contacts and keeps oldest as canonical primary", async () => {
    const olderPrimary = await insertContact({
      email: "george@hillvalley.edu",
      phoneNumber: "919191",
      linkPrecedence: "primary",
      createdAt: "2023-04-11 00:00:00",
    });

    const newerPrimary = await insertContact({
      email: "biffsucks@hillvalley.edu",
      phoneNumber: "717171",
      linkPrecedence: "primary",
      createdAt: "2023-04-21 05:30:00",
    });

    const response = await request(app).post("/identify").send({
      email: "george@hillvalley.edu",
      phoneNumber: "717171",
    });

    expect(response.status).toBe(200);
    expect(response.body.contact.primaryContatctId).toBe(olderPrimary);
    expect(response.body.contact.secondaryContactIds).toContain(newerPrimary);
    expect(response.body.contact.emails).toEqual([
      "george@hillvalley.edu",
      "biffsucks@hillvalley.edu",
    ]);
    expect(response.body.contact.phoneNumbers).toEqual(["919191", "717171"]);
  });
});
