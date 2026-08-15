import { prisma } from "@/lib/prisma.js";

const PROBE_TIMEOUT_MS = 8_000;
/** Probes older than this are pruned so the table stays small on a long-running server. */
const HISTORY_RETENTION_DAYS = 14;

export type ProbeResult = {
  isUp: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
};

/** Sends one HEAD/GET probe. Never throws — a failed probe is a recorded result. */
export async function probe(url: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "KStacks-Dashboard-HealthCheck/1.0" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    return {
      isUp: response.ok,
      statusCode: response.status,
      responseTimeMs: Date.now() - startedAt,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return {
      isUp: false,
      statusCode: null,
      responseTimeMs: Date.now() - startedAt,
      // Bounded so a huge error string can never overflow the column.
      error: message.slice(0, 300),
    };
  }
}

/** Probes every service that has a health URL configured and records the results. */
export async function runHealthChecks(): Promise<number> {
  const services = await prisma.service.findMany({
    where: { healthCheckUrl: { not: null } },
    select: { id: true, healthCheckUrl: true },
  });

  const results = await Promise.all(
    services.map(async (service) => ({
      serviceId: service.id,
      // Non-null by the query filter above.
      ...(await probe(service.healthCheckUrl as string)),
    })),
  );

  if (results.length > 0) {
    await prisma.serviceHealthCheck.createMany({ data: results });
  }

  await pruneOldChecks();
  return results.length;
}

/** Probes a single service on demand and records the result. */
export async function checkServiceNow(serviceId: string) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, healthCheckUrl: true },
  });
  if (!service?.healthCheckUrl) return null;

  const result = await probe(service.healthCheckUrl);
  return prisma.serviceHealthCheck.create({ data: { serviceId: service.id, ...result } });
}

export async function getHealthOverview() {
  const services = await prisma.service.findMany({
    orderBy: { sortOrder: "asc" },
    include: { healthChecks: { orderBy: { checkedAt: "desc" }, take: 24 } },
  });

  return services.map((service) => {
    const checks = service.healthChecks;
    const upCount = checks.filter((check) => check.isUp).length;

    return {
      id: service.id,
      name: service.name,
      codename: service.codename,
      logoUrl: service.logoUrl,
      status: service.status,
      url: service.url,
      healthCheckUrl: service.healthCheckUrl,
      latest: checks[0] ?? null,
      // Ascending so the UI can render the history left-to-right in time order.
      history: [...checks].reverse(),
      uptimeRatio: checks.length > 0 ? upCount / checks.length : null,
    };
  });
}

async function pruneOldChecks() {
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.serviceHealthCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } });
}
