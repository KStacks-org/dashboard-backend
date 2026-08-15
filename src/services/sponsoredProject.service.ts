import { NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import type {
  CreateSponsoredProjectInput,
  UpdateSponsoredProjectInput,
} from "@/validation/sponsoredProject.schema.js";

export function listSponsoredProjects() {
  return prisma.sponsoredProject.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getSponsoredProject(id: string) {
  const project = await prisma.sponsoredProject.findUnique({ where: { id } });
  if (!project) throw new NotFoundError("Project not found");
  return project;
}

export function createSponsoredProject(data: CreateSponsoredProjectInput) {
  return prisma.sponsoredProject.create({
    data: {
      name: data.name,
      description: data.description,
      ownerName: data.ownerName,
      contact: data.contact ?? null,
      projectUrl: data.projectUrl ?? null,
      repoUrl: data.repoUrl ?? null,
      status: data.status,
      resources: data.resources ?? null,
      notes: data.notes ?? null,
    },
  });
}

export async function updateSponsoredProject(id: string, data: UpdateSponsoredProjectInput) {
  await getSponsoredProject(id);
  return prisma.sponsoredProject.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.ownerName !== undefined && { ownerName: data.ownerName }),
      ...(data.contact !== undefined && { contact: data.contact }),
      ...(data.projectUrl !== undefined && { projectUrl: data.projectUrl }),
      ...(data.repoUrl !== undefined && { repoUrl: data.repoUrl }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.resources !== undefined && { resources: data.resources }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
}

export async function deleteSponsoredProject(id: string) {
  await getSponsoredProject(id);
  await prisma.sponsoredProject.delete({ where: { id } });
}
