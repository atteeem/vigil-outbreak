import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";
import { ADAPTERS, SOURCE_KINDS } from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = await prisma.source.findMany({ orderBy: [{ adapter: "asc" }, { name: "asc" }], include: { runs: { orderBy: { startedAt: "desc" }, take: 1 }, _count: { select: { articles: true } } } });
  return json({ sources });
}

const Create = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  name: z.string().min(2).max(200),
  organization: z.string().min(2).max(200),
  kind: z.enum(SOURCE_KINDS),
  adapter: z.enum(ADAPTERS),
  url: z.string().url().nullable().optional(),
  homepage: z.string().url().nullable().optional(),
  pollIntervalMinutes: z.number().int().min(5).max(1440).default(15),
  enabled: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, Create);
    if (!body.ok) return body.res;
    if (await prisma.source.findUnique({ where: { slug: body.data.slug } })) return fail("A source with this slug exists", 409);
    const source = await prisma.source.create({ data: body.data });
    await audit("source.create", "source", source.id, body.data);
    return json({ source }, 201);
  } catch (err) {
    return handleError(err);
  }
}
