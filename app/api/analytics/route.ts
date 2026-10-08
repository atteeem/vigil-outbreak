import { getAnalytics } from "@/lib/server/queries";
import { json, handleError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(await getAnalytics());
  } catch (err) {
    return handleError(err);
  }
}
