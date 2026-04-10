function getCredentials() {
  const instanceUrl = process.env.MASTODON_INSTANCE_URL
  const accessToken = process.env.MASTODON_ACCESS_TOKEN

  if (!instanceUrl || !accessToken) {
    console.error("[Mastodon] Credentials missing from process.env")
    throw new Error("Mastodon credentials not configured")
  }

  return { instanceUrl, accessToken }
}

function stripMarkdown(body: string): string {
  return body
    .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, "$1 ($2)") // Links: [text](url) -> text (url)
    .replace(/[\*_]{1,2}([^\*_]+)[\*_]{1,2}/g, "$1") // Bold/Italic
    .replace(/^#+\s+/gm, "") // Headers
    .replace(/`{1,3}[^`]+`{1,3}/g, "") // Code blocks
    .replace(/^>\s+/gm, "") // Blockquotes
    .trim()
}

async function prepareText(body: string, slug: string, type: string, externalLink?: string) {
  let plainText = stripMarkdown(body)
  
  if (externalLink && !plainText.includes(externalLink)) {
    plainText += `\n\n${externalLink}`
  }

  let text = plainText
  const MAX_CHARS = 500 // Mastodon default limit
  
  if (plainText.length > MAX_CHARS) {
    const url = `https://jim-greco.com/${type}s/${slug}`
    text = plainText.slice(0, 450).trimEnd() + "... " + url
  }

  return text
}

export async function postToMastodon(_title: string, body: string, slug: string, type: string, externalLink?: string) {
  try {
    const { instanceUrl, accessToken } = await getCredentials()
    const status = await prepareText(body, slug, type, externalLink)

    const res = await fetch(`${instanceUrl}/api/v1/statuses`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    })

    if (!res.ok) {
      const errorData = await res.json()
      console.error("[Mastodon] Error posting status:", errorData)
      return null
    }

    const data = await res.json()
    return { uri: data.url, id: data.id }
  } catch (err) {
    console.error("Failed to post to Mastodon:", err)
    return null
  }
}

export async function updateMastodonPost(id: string, _title: string, body: string, slug: string, type: string, externalLink?: string) {
  try {
    const { instanceUrl, accessToken } = await getCredentials()
    const status = await prepareText(body, slug, type, externalLink)

    // Mastodon supports status editing (v4.0.0+)
    const res = await fetch(`${instanceUrl}/api/v1/statuses/${id}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    })

    if (!res.ok) {
      const errorData = await res.json()
      console.error("[Mastodon] Error updating status:", errorData)
      return null
    }

    const data = await res.json()
    return { uri: data.url, id: data.id }
  } catch (err) {
    console.error("Failed to update Mastodon post:", err)
    return null
  }
}

export async function deleteMastodonPost(id: string) {
  try {
    const { instanceUrl, accessToken } = await getCredentials()
    const res = await fetch(`${instanceUrl}/api/v1/statuses/${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    })

    if (!res.ok) {
      console.error("[Mastodon] Error deleting status:", res.status)
      return false
    }

    return true
  } catch (err) {
    console.error("Failed to delete Mastodon post:", err)
    return false
  }
}
