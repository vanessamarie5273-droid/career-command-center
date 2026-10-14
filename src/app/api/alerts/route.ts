import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
export const POST = route("EDITOR", async () => ({ updated: (await prisma.alert.updateMany({ where: { read: false }, data: { read: true } })).count }));
