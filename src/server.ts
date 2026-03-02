import "dotenv/config";
import { app } from "./app";
import { closeDatabase, initializeDatabase } from "./db/prisma";

const port = Number(process.env.PORT ?? 3000);

async function main() {
  await initializeDatabase();

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${port}`);
  });

  const shutdown = async () => {
    await closeDatabase();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
