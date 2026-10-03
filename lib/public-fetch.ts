import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"

const blocked = new BlockList()
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4")
// Only ordinary globally routed IPv6; exclude tunnels, documentation, and
// protocol-assignment ranges. This also excludes mapped IPv4, ULA and NAT64.
const globalIPv6 = new BlockList()
globalIPv6.addSubnet("2000::", 3, "ipv6")
for (const [address, prefix] of [
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const) blocked.addSubnet(address, prefix, "ipv6")

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address, "ipv4")
  return family === 6 && globalIPv6.check(address, "ipv6") && !blocked.check(address, "ipv6")
}

async function publicTarget(input: string) {
  const url = new URL(input)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && url.port !== "80" && url.port !== "443")) {
    throw new Error("Preview URL must be a public HTTP(S) address")
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Preview URL resolves to a non-public address")
  }
  return { url, address: addresses[0] }
}

type PreviewResponse = { status: number; location?: string; body: Buffer; contentType: string }

function requestTarget(target: Awaited<ReturnType<typeof publicTarget>>, maxBytes: number,
  acceptedTypes: readonly string[], signal: AbortSignal): Promise<PreviewResponse> {
  return new Promise((resolve, reject) => {
    const { url, address } = target
    const request = url.protocol === "https:" ? httpsRequest : httpRequest
    const req = request(url, {
      method: "GET", signal, agent: false,
      headers: { "User-Agent": "BlogBot/1.0", "Accept-Encoding": "identity" },
      // Pin the vetted address for this connection. Keep the original hostname
      // for Host and TLS certificate verification; never resolve it a second time.
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [address])
        else callback(null, address.address, address.family)
      },
    }, (res) => {
      const status = res.statusCode || 0
      const contentType = (res.headers["content-type"] || "").split(";")[0].trim().toLowerCase()
      if ([301, 302, 303, 307, 308].includes(status)) {
        res.destroy()
        resolve({ status, location: res.headers.location, body: Buffer.alloc(0), contentType })
        return
      }
      if (status < 200 || status >= 300 || !acceptedTypes.includes(contentType) ||
          Number(res.headers["content-length"] || 0) > maxBytes ||
          (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) {
        res.destroy()
        reject(new Error("Unsupported preview response"))
        return
      }
      const chunks: Buffer[] = []
      let bytes = 0
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > maxBytes) res.destroy(new Error("Preview exceeds byte limit"))
        else chunks.push(chunk)
      })
      res.on("error", reject)
      res.on("end", () => resolve({ status, body: Buffer.concat(chunks), contentType }))
    })
    req.on("error", reject)
    req.end()
  })
}

export async function fetchPublicPreview(input: string, maxBytes: number, acceptedTypes: readonly string[]) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error("Preview timed out"))
    }, 8000)
  })
  const work = async () => {
    let current = input
    for (let redirects = 0; redirects <= 3; redirects++) {
      const target = await publicTarget(current)
      controller.signal.throwIfAborted()
      const response = await requestTarget(target, maxBytes, acceptedTypes, controller.signal)
      if (response.location) {
        current = new URL(response.location, target.url).href
        continue
      }
      if (response.status >= 300) throw new Error("Preview redirect missing location")
      return { ...response, url: target.url.href }
    }
    throw new Error("Too many preview redirects")
  }
  try { return await Promise.race([work(), timeout]) }
  finally { clearTimeout(timer) }
}
