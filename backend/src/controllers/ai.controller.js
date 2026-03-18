// backend/src/controllers/ai.controller.js
import { getPrisma } from "../config/prisma.js";
import { HttpError } from "../utils/httpError.js";
import { formatZodErrors } from "../utils/formatZodErrors.js";
import { learnMoreSchema } from "../validators/ai.validator.js";
import { getLearnMoreContent } from "../services/ai.service.js";

export async function learnMore(req, res) {
  const parsed = learnMoreSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  const prisma = getPrisma();
  const result = await getLearnMoreContent(prisma, parsed.data);

  return res.status(200).json({
    ok: true,
    source: result.source,
    content: result.content
  });
}