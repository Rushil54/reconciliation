import type { IdentifyRequest, IdentifyResponse } from "../types/contact";
import { getDb } from "../db/prisma";

type Input = { email: string | null; phoneNumber: string | null };

type ContactRow = {
  id: number;
  phoneNumber: string | null;
  email: string | null;
  linkedId: number | null;
  linkPrecedence: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

const PRIMARY = "primary";
const SECONDARY = "secondary";

function normalizeInput(input: IdentifyRequest): Input {
  const email = input.email?.trim().toLowerCase() ?? null;
  const phone = input.phoneNumber?.toString().trim() ?? null;

  return {
    email: email && email.length > 0 ? email : null,
    phoneNumber: phone && phone.length > 0 ? phone : null,
  };
}

function uniqueOrdered(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    out.push(value);
  }

  return out;
}

async function queryContactsByInputs(email: string | null, phoneNumber: string | null): Promise<ContactRow[]> {
  if (!email && !phoneNumber) {
    return [];
  }

  const db = await getDb();
  const clauses: string[] = [];
  const params: string[] = [];

  if (email) {
    clauses.push("email = ?");
    params.push(email);
  }

  if (phoneNumber) {
    clauses.push("phoneNumber = ?");
    params.push(phoneNumber);
  }

  return db.all<ContactRow[]>(
    `SELECT * FROM Contact WHERE deletedAt IS NULL AND (${clauses.join(" OR ")})`,
    params,
  );
}

async function queryConnectedBySets(ids: number[], emails: string[], phones: string[]): Promise<ContactRow[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: Array<number | string> = [];

  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    clauses.push(`id IN (${placeholders})`);
    params.push(...ids);
    clauses.push(`linkedId IN (${placeholders})`);
    params.push(...ids);
  }

  if (emails.length > 0) {
    const placeholders = emails.map(() => "?").join(",");
    clauses.push(`email IN (${placeholders})`);
    params.push(...emails);
  }

  if (phones.length > 0) {
    const placeholders = phones.map(() => "?").join(",");
    clauses.push(`phoneNumber IN (${placeholders})`);
    params.push(...phones);
  }

  if (clauses.length === 0) {
    return [];
  }

  return db.all<ContactRow[]>(
    `SELECT * FROM Contact WHERE deletedAt IS NULL AND (${clauses.join(" OR ")})`,
    params,
  );
}

async function fetchConnectedContacts(seed: ContactRow[]): Promise<ContactRow[]> {
  const map = new Map<number, ContactRow>();
  let queue = [...seed];

  while (queue.length > 0) {
    for (const contact of queue) {
      map.set(contact.id, contact);
    }

    const idSet = new Set<number>();
    const emailSet = new Set<string>();
    const phoneSet = new Set<string>();

    for (const contact of map.values()) {
      idSet.add(contact.id);
      if (contact.linkedId) {
        idSet.add(contact.linkedId);
      }
      if (contact.email) {
        emailSet.add(contact.email);
      }
      if (contact.phoneNumber) {
        phoneSet.add(contact.phoneNumber);
      }
    }

    const found = await queryConnectedBySets(Array.from(idSet), Array.from(emailSet), Array.from(phoneSet));
    const unseen = found.filter((c) => !map.has(c.id));

    if (unseen.length === 0) {
      break;
    }

    queue = unseen;
  }

  return Array.from(map.values());
}

function choosePrimary(contacts: ContactRow[]): ContactRow {
  const oldest = contacts
    .slice()
    .sort((a, b) => {
      const timeDelta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return a.id - b.id;
    })[0];

  if (!oldest) {
    throw new Error("Cannot choose primary from an empty contact list");
  }

  return oldest;
}

async function normalizeLinksToPrimary(primaryId: number, contacts: ContactRow[]): Promise<void> {
  const toNormalize = contacts
    .filter((contact) => contact.id !== primaryId)
    .filter((contact) => contact.linkPrecedence !== SECONDARY || contact.linkedId !== primaryId);

  if (toNormalize.length === 0) {
    return;
  }

  const db = await getDb();
  await db.exec("BEGIN");

  try {
    for (const contact of toNormalize) {
      await db.run(
        "UPDATE Contact SET linkPrecedence = ?, linkedId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
        [SECONDARY, primaryId, contact.id],
      );
    }

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function createContact(data: {
  email: string | null;
  phoneNumber: string | null;
  linkPrecedence: string;
  linkedId?: number | null;
}): Promise<number> {
  const db = await getDb();

  const result = await db.run(
    `INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [data.email, data.phoneNumber, data.linkedId ?? null, data.linkPrecedence],
  );

  return result.lastID as number;
}

async function getClusterByPrimary(primaryId: number): Promise<ContactRow[]> {
  const db = await getDb();
  return db.all<ContactRow[]>(
    `SELECT * FROM Contact
     WHERE deletedAt IS NULL AND (id = ? OR linkedId = ?)
     ORDER BY datetime(createdAt) ASC, id ASC`,
    [primaryId, primaryId],
  );
}

async function buildResponse(primaryId: number): Promise<IdentifyResponse> {
  const contacts = await getClusterByPrimary(primaryId);

  const primary = contacts.find((contact) => contact.id === primaryId);
  if (!primary) {
    throw new Error("Primary contact not found while building response");
  }

  const emails = uniqueOrdered([primary.email, ...contacts.map((c) => c.email)]);
  const phoneNumbers = uniqueOrdered([primary.phoneNumber, ...contacts.map((c) => c.phoneNumber)]);
  const secondaryContactIds = contacts
    .filter((c) => c.id !== primaryId)
    .map((c) => c.id)
    .sort((a, b) => a - b);

  return {
    contact: {
      primaryContatctId: primaryId,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  };
}

export async function identifyContact(input: IdentifyRequest): Promise<IdentifyResponse> {
  const normalized = normalizeInput(input);

  if (!normalized.email && !normalized.phoneNumber) {
    throw new Error("Either email or phoneNumber must be provided");
  }

  const directMatches = await queryContactsByInputs(normalized.email, normalized.phoneNumber);

  if (directMatches.length === 0) {
    const id = await createContact({
      email: normalized.email,
      phoneNumber: normalized.phoneNumber,
      linkPrecedence: PRIMARY,
    });

    return {
      contact: {
        primaryContatctId: id,
        emails: normalized.email ? [normalized.email] : [],
        phoneNumbers: normalized.phoneNumber ? [normalized.phoneNumber] : [],
        secondaryContactIds: [],
      },
    };
  }

  let connected = await fetchConnectedContacts(directMatches);
  const primary = choosePrimary(connected);

  await normalizeLinksToPrimary(primary.id, connected);

  connected = await getClusterByPrimary(primary.id);

  const hasEmail = !normalized.email || connected.some((c) => c.email === normalized.email);
  const hasPhone = !normalized.phoneNumber || connected.some((c) => c.phoneNumber === normalized.phoneNumber);

  if (!hasEmail || !hasPhone) {
    await createContact({
      email: normalized.email,
      phoneNumber: normalized.phoneNumber,
      linkPrecedence: SECONDARY,
      linkedId: primary.id,
    });
  }

  return buildResponse(primary.id);
}
