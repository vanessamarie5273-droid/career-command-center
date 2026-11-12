// Employers she has ruled out (Nov 12): "no interest in food or restaurant". Toast and DoorDash by name, plus any employer
// whose name or profile says it is a restaurant, food, food-delivery or grocery business. Checked when companies are seeded,
// when Google Jobs finds a new employer, and on every deploy, which removes ones already stored.
import type { PrismaClient } from "@prisma/client";

const NAMES = /^(toast|toasttab|doordash|grubhub|uber eats|postmates|instacart|gopuff|olo|ezcater|chownow|popmenu|owner\.com|7shifts|restaurant365|spoton|par technology|sysco|us foods|performance food group|gordon food service|hellofresh|blue apron|aramark|compass group|sodexo)$/;
const FOOD_NAME = /\b(restaurants?|pizza|pizzeria|grill|cafe|café|coffee|bakery|catering|burgers?|tacos?|brewing|brewery|eatery|diner|steakhouse|foods?|foodservice|food service|kitchens?)\b/;
const FOOD_PROFILE = /\b(restaurants?|food ?service|food delivery|grocery|groceries|meal kits?|quick[- ]service|qsr)\b/;

function normalize(name: string) {
  return (name ?? "").toLowerCase().replace(/[,.]?\s+(inc|llc|ltd|corp|corporation|co|company|holdings|group)\.?$/g, "").replace(/\s+/g, " ").trim();
}

export function offLimitsReason(c: { name: string; description?: string | null; customers?: string | null; category?: string | null }): string | undefined {
  const n = normalize(c.name);
  if (NAMES.test(n) || FOOD_NAME.test(n)) return "Food or restaurant company";
  if (FOOD_PROFILE.test([c.description, c.customers, c.category].filter(Boolean).join(" ").toLowerCase())) return "Food or restaurant company";
  return undefined;
}

// Removes stored off-limits companies with their jobs. A company she has an application with is kept, so her history stays.
export async function removeOffLimitsCompanies(db: PrismaClient) {
  const all = await db.company.findMany({ select: { id: true, name: true, description: true, customers: true, category: true, _count: { select: { applications: true } } } });
  const removed: string[] = [];
  const kept: string[] = [];
  for (const c of all) {
    if (!offLimitsReason(c)) continue;
    if (c._count.applications) { kept.push(c.name); continue; }
    await db.company.delete({ where: { id: c.id } });
    removed.push(c.name);
  }
  return { removed, kept };
}
