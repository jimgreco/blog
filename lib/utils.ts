export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 80)
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function formatDateShort(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  })
}

export function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return "https://" + url
}

export function getExcerpt(body: string, maxLen = 150): string {
  const text = body
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|\*|_|~~|`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+>]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim()
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…"
}
