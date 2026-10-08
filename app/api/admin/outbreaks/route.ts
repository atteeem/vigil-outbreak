import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";
import { CLASSIFICATIONS, PATHOGEN_STATUSES, GEO_PRECISIONS, LOCATION_ROLES } from "@/lib/domain/enums";
import { countryByCode } from "@/lib/geo/countries";

export const dynamic = "force-dynamic";

export async function GET() {
  const outbreaks = await prisma.outbreak.findMany({ orderBy: { updatedAt: "desc" }, include: { disease: true, suspectedDisease: true, _count: { select: { articles: true, observations: true, claims: true } } } });
  return json({ outbreaks });
}

export const LocationInput = z.object({
  name: z.string().min(1).max(200),
  admin1: z.string().max(200).nullable().optional(),
  countryCode: z.string().length(2),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  precision: z.enum(GEO_PRECISIONS),
  role: z.enum(LOCATION_ROLES),
  notes: z.string().max(1000).nullable().optional(),
});

const Create = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  title: z.string().min(5).max(300),
  summary: z.string().min(10).max(5000),
  classification: z.enum(CLASSIFICATIONS),
  pathogenStatus: z.enum(PATHOGEN_STATUSES),
  diseaseId: z.string().nullable().optional(),
  suspectedDiseaseId: z.string().nullable().optional(),
  countryCode: z.string().length(2),
  firstReportedAt: z.string().datetime(),
  eventStartDate: z.string().datetime().nullable().optional(),
  location: LocationInput.optional(),
  published: z.boolean().default(false),
  reason: z.string().min(3).max(1000).default("Record created"),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, Create);
    if (!body.ok) return body.res;
    const d = body.data;
    const country = countryByCode(d.countryCode);
    if (!country) return fail("Unknown country code", 422);
    if (d.pathogenStatus === "CONFIRMED" && !d.diseaseId) return fail("A confirmed pathogen status requires a confirmed disease", 422);
    if (await prisma.outbreak.findUnique({ where: { slug: d.slug } })) return fail("Slug already in use", 409);
    const first = new Date(d.firstReportedAt);
    const outbreak = await prisma.outbreak.create({
      data: {
        slug: d.slug, title: d.title, summary: d.summary, classification: d.classification, pathogenStatus: d.pathogenStatus,
        diseaseId: d.pathogenStatus === "CONFIRMED" ? d.diseaseId : null, suspectedDiseaseId: d.suspectedDiseaseId ?? null,
        countryCode: country.code, countryName: country.name, firstReportedAt: first, eventStartDate: d.eventStartDate ? new Date(d.eventStartDate) : null, published: d.published,
        statusHistory: { create: { toClassification: d.classification, toPathogenStatus: d.pathogenStatus, reason: d.reason, effectiveAt: first, actor: "admin" } },
        locations: d.location ? { create: { ...d.location, firstReportedAt: first } } : undefined,
      },
    });
    await audit("outbreak.create", "outbreak", outbreak.id, { slug: d.slug });
    return json({ outbreak }, 201);
  } catch (err) {
    return handleError(err);
  }
}
