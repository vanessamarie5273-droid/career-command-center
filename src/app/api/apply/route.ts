import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { markApplied } from "@/lib/apply";

// "I submitted it": records the application with the kit's materials and schedules the follow-ups.
export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ jobId: z.string(), kitId: z.string().nullable().optional() }).parse(await req.json());
  return markApplied(prisma, b.jobId, b.kitId ?? null, u.sub);
});
