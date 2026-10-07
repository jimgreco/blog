import { revalidatePath } from "next/cache"
import { Conflict } from "./post-store"
export function refreshPosts(slug?: string) {
  for (const type of ["notes", "essays", "projects", "links"]) {
    revalidatePath(`/${type}`)
    if (slug) revalidatePath(`/${type}/${slug}`)
  }
}
export function mutationFailure(error: unknown): Response {
  if (error instanceof Conflict) return Response.json({ error: error.message }, { status: 409 })
  // Provider payloads/SDK errors may include private content. Never log raw errors.
  console.error("Post persistence failed")
  return Response.json({ error: "Save could not be confirmed. Your text is still here; retry the same save." }, { status: 503 })
}
