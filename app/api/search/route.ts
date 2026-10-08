import { search } from "@/lib/server/queries";
import { json, handleError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    return json(await search(new URL(req.url).searchParams.get("q") ?? ""));
  } catch (err) {
    return handleError(err);
  }
}
