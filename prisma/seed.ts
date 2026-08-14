import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();

const TEMPORARY_PASSWORD = "123456";

// Display names are stored exactly as provided by the team. Usernames are a
// separate, unambiguous ASCII identifier — this matters because two people
// share the display name/fragment "ياسر".
const USERS: Array<{ username: string; displayName: string }> = [
  { username: "tariq", displayName: "طارق" },
  { username: "yasser.alawfi", displayName: "ياسر العوفي" },
  { username: "fawaz.abdullah", displayName: "فواز عبد الله" },
  { username: "mohammed.khayyat", displayName: "محمد خياط" },
  { username: "amjad.alqasimi", displayName: "أمجد القاسمي" },
  { username: "abdulaziz", displayName: "عبد العزيز" },
  { username: "yasser", displayName: "ياسر" },
  { username: "abdullah.sayrawan", displayName: "عبدالله السيروان" },
];

// Official KStack services, kept in sync with kstacks.org's "Official Stack
// Services" section. See scripts/sync-services.ts for the refresh mechanism.
const SERVICES: Array<{
  name: string;
  codename: string;
  tagline: string;
  description: string;
  status: "LIVE" | "BETA" | "COMING_SOON";
  url: string | null;
  sortOrder: number;
}> = [
  {
    name: "Index",
    codename: "kindex",
    tagline: "Course & Section Search",
    description:
      "Find courses and sections with advanced filtering for a powerful searching experience",
    status: "LIVE",
    url: "https://kauindex.com",
    sortOrder: 1,
  },
  {
    name: "Planner",
    codename: "kplanner",
    tagline: "Schedule Builder",
    description: "Plan your semester with visual conflict detection",
    status: "LIVE",
    url: "https://kauindex.com/planner",
    sortOrder: 2,
  },
  {
    name: "Groups",
    codename: "kgroups",
    tagline: "Student Communities",
    description: "Find Whatsapp groups based on your own schedule with ease",
    status: "BETA",
    url: "https://groups.kstacks.org",
    sortOrder: 3,
  },
  {
    name: "Grades",
    codename: "kgpa",
    tagline: "GPA Calculator",
    description: "Calculate your semester and cumulative GPA to track your academic performance",
    status: "LIVE",
    url: "https://grades.kstacks.org",
    sortOrder: 4,
  },
  {
    name: "Devs",
    codename: "kdevs",
    tagline: "Developer Resources",
    description: "Learn how to build on the stack, access documentation, and learn for free",
    status: "COMING_SOON",
    url: null,
    sortOrder: 5,
  },
  {
    name: "Subjects",
    codename: "ksubjects",
    tagline: "Subject Explorer",
    description: "Explore subjects, rate, and review them with the community",
    status: "COMING_SOON",
    url: null,
    sortOrder: 6,
  },
];

async function main() {
  const temporaryPasswordHash = await hashPassword(TEMPORARY_PASSWORD);

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: { displayName: user.displayName },
      create: {
        username: user.username,
        displayName: user.displayName,
        passwordHash: temporaryPasswordHash,
        mustChangePassword: true,
      },
    });
  }
  console.log(`Seeded ${USERS.length} users (temporary password: ${TEMPORARY_PASSWORD}).`);

  for (const service of SERVICES) {
    await prisma.service.upsert({
      where: { codename: service.codename },
      update: {
        name: service.name,
        tagline: service.tagline,
        description: service.description,
        status: service.status,
        url: service.url,
        sortOrder: service.sortOrder,
      },
      create: service,
    });
  }
  console.log(`Seeded ${SERVICES.length} KStack services.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
