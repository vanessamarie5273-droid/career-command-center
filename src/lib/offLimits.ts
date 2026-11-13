// Employers she has ruled out (Nov 12): "no interest in food or restaurant". Toast and DoorDash by name, plus any employer
// whose name or profile says it is a restaurant, food, food-delivery or grocery business. Checked when companies are seeded,
// when Google Jobs finds a new employer, and on every deploy, which removes ones already stored.
import type { PrismaClient } from "@prisma/client";

// Matched at the start of the name, so "DoorDash USA" or "Kraft Heinz Company" counts too.
const NAMES = /^(toast|toasttab|doordash|grubhub|uber eats|postmates|instacart|gopuff|olo|ezcater|chownow|popmenu|owner\.com|7shifts|restaurant365|spoton|par technology|sysco|us foods|performance food group|gordon food service|hellofresh|blue apron|aramark|compass group|sodexo|kraft|heinz|kraft heinz|general mills|pepsico|pepsi|coca[- ]?cola|keurig|nestl[eé]|mondelez|kellogg|kellanova|conagra|tyson|hormel|mccormick|campbell'?s?|hershey|smucker|mars wrigley|starbucks|mcdonald'?s|chipotle|yum!? brands|darden|domino'?s|papa john'?s|wendy'?s|panera|dutch bros|taco bell|subway|kfc)\b/;
const FOOD_NAME = /\b(restaurants?|pizza|pizzeria|grill|cafe|café|coffee|bakery|catering|burgers?|tacos?|brewing|brewery|eatery|diner|steakhouse|foods?|foodservice|food service|kitchens?)\b/;
const FOOD_PROFILE = /\b(restaurants?|food ?service|food delivery|grocery|groceries|meal kits?|quick[- ]service|qsr|food and beverage|packaged foods?|snack foods?)\b/;

// Drops trailing legal and country words, repeatedly: "DoorDash USA, Inc." → "doordash".
const SUFFIX = /[,.]?\s+(inc|llc|ltd|corp|corporation|co|company|holdings|group|usa|us|u\.s\.?|north america|americas)\.?$/;
function normalize(name: string) {
  let n = (name ?? "").toLowerCase().replace(/\s+/g, " ").trim().replace(/^the /, "");
  for (let prev = ""; prev !== n; ) { prev = n; n = n.replace(SUFFIX, "").trim(); }
  return n;
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
