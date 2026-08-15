import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();

const TEMPORARY_PASSWORD = "123456";

// THE ROSTER — this list *is* the login allowlist. Nobody outside it can sign
// in; there is no public sign-up.
//
// To authorise someone, put their real university address in `email` here and
// re-run `pnpm db:seed`. Rows are matched on `username`, so correcting an email
// updates the existing person rather than creating a second account.
//
// Addresses on `pending.invalid` are placeholders for team members whose real
// address has not been supplied yet. `.invalid` is a reserved TLD (RFC 2606)
// that can never belong to a real mailbox, so a placeholder can never
// accidentally let an unrelated KAU student in. Those accounts still work as
// task assignees — they simply cannot be logged into until the email is filled.
const USERS: Array<{
  username: string;
  email: string;
  displayName: string;
  role?: "ADMIN" | "MEMBER";
  jobTitle?: string;
  responsibilities?: string[];
}> = [
  { username: "tariq", email: "tariq@pending.invalid", displayName: "طارق" },
  { username: "yasser.alawfi", email: "yasser.alawfi@pending.invalid", displayName: "ياسر العوفي" },
  {
    username: "fawaz.abdullah",
    email: "fawaz.abdullah@pending.invalid",
    displayName: "فواز عبد الله",
  },
  {
    username: "mohammed.khayyat",
    email: "mohammed.khayyat@pending.invalid",
    displayName: "محمد خياط",
  },
  {
    username: "amjad.alqasimi",
    email: "amjad.alqasimi@pending.invalid",
    displayName: "أمجد القاسمي",
  },
  { username: "abdulaziz", email: "abdulaziz@pending.invalid", displayName: "عبد العزيز" },
  { username: "yasser", email: "yasser@pending.invalid", displayName: "ياسر" },
  {
    username: "abdullah.sayrawan",
    email: "aalserawan@stu.kau.edu.sa",
    displayName: "عبدالله السيروان",
    role: "ADMIN",
  },
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
  /// Probed by the health scheduler. Live services default to their public URL;
  /// unreleased ones have nothing to probe yet.
  healthCheckUrl: string | null;
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
    healthCheckUrl: "https://kauindex.com",
  },
  {
    name: "Planner",
    codename: "kplanner",
    tagline: "Schedule Builder",
    description: "Plan your semester with visual conflict detection",
    status: "LIVE",
    url: "https://kauindex.com/planner",
    sortOrder: 2,
    healthCheckUrl: "https://kauindex.com/planner",
  },
  {
    name: "Groups",
    codename: "kgroups",
    tagline: "Student Communities",
    description: "Find Whatsapp groups based on your own schedule with ease",
    status: "BETA",
    url: "https://groups.kstacks.org",
    sortOrder: 3,
    healthCheckUrl: "https://groups.kstacks.org",
  },
  {
    name: "Grades",
    codename: "kgpa",
    tagline: "GPA Calculator",
    description: "Calculate your semester and cumulative GPA to track your academic performance",
    status: "LIVE",
    url: "https://grades.kstacks.org",
    sortOrder: 4,
    healthCheckUrl: "https://grades.kstacks.org",
  },
  {
    name: "Devs",
    codename: "kdevs",
    tagline: "Developer Resources",
    description: "Learn how to build on the stack, access documentation, and learn for free",
    status: "COMING_SOON",
    url: null,
    sortOrder: 5,
    healthCheckUrl: null,
  },
  {
    name: "Subjects",
    codename: "ksubjects",
    tagline: "Subject Explorer",
    description: "Explore subjects, rate, and review them with the community",
    status: "COMING_SOON",
    url: null,
    sortOrder: 6,
    healthCheckUrl: null,
  },
];

async function main() {
  const temporaryPasswordHash = await hashPassword(TEMPORARY_PASSWORD);

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { username: user.username },
      // Email and display name are re-applied so corrections take effect, but
      // the password is never reset for someone who has already changed theirs.
      update: {
        displayName: user.displayName,
        email: user.email,
        role: user.role ?? "MEMBER",
        ...(user.jobTitle !== undefined && { jobTitle: user.jobTitle }),
        ...(user.responsibilities !== undefined && { responsibilities: user.responsibilities }),
      },
      create: {
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role ?? "MEMBER",
        jobTitle: user.jobTitle ?? null,
        responsibilities: user.responsibilities ?? [],
        passwordHash: temporaryPasswordHash,
        mustChangePassword: true,
      },
    });
  }
  const pending = USERS.filter((u) => u.email.endsWith("@pending.invalid"));
  console.log(`Seeded ${USERS.length} users (temporary password: ${TEMPORARY_PASSWORD}).`);
  if (pending.length > 0) {
    console.log(
      `  ${pending.length} still need a real email before they can sign in: ` +
        pending.map((u) => u.displayName).join(", "),
    );
  }

  for (const service of SERVICES) {
    await prisma.service.upsert({
      where: { codename: service.codename },
      // Only the public catalogue fields are refreshed; overview, owner and
      // repo URL are team-authored and must survive re-seeding.
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
  // healthCheckUrl is deliberately absent from the update block above so the
  // team's own choice is never clobbered — but fill in the default wherever it
  // has never been set, including on databases seeded before it existed.
  for (const service of SERVICES) {
    if (!service.healthCheckUrl) continue;
    await prisma.service.updateMany({
      where: { codename: service.codename, healthCheckUrl: null },
      data: { healthCheckUrl: service.healthCheckUrl },
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
