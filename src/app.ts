import express from "express";
import { identifyRouter } from "./routes/identify";

export const app = express();

app.use(express.json());
app.use(identifyRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});
