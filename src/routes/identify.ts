import { Router } from "express";
import { z } from "zod";
import { identifyContact } from "../services/identity.service";

const identifyRequestSchema = z
  .object({
    email: z.string().trim().min(1).optional().nullable(),
    phoneNumber: z.union([z.string(), z.number()]).optional().nullable(),
  })
  .refine((value) => Boolean(value.email ?? value.phoneNumber), {
    message: "Either email or phoneNumber must be provided",
  });

export const identifyRouter = Router();

identifyRouter.post("/identify", async (req, res) => {
  const parsed = identifyRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid request payload",
    });
  }

  try {
    const payload = {
      email: parsed.data.email ?? null,
      phoneNumber: parsed.data.phoneNumber?.toString() ?? null,
    };

    const response = await identifyContact(payload);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected error",
    });
  }
});
