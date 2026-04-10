"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Post, PostType } from "@/lib/dynamo"
import { formatDate } from "@/lib/utils"

interface Props {
  initialPosts: Post[]
  defaultType?: PostType
  defaultSlug?: string
}

type EditorMode = "write" | "preview"

function nowLocalDatetime() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

export default function AdminClient({ initialPosts, defaultType, defaultSlug }: Props) {
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [editing, setEditing] = useState<Post | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [mode, setMode] = useState<EditorMode>("write")

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [link, setLink] = useState("")
  const [postType, setPostType] = useState<PostType>("note")
  const [publishedAt, setPublishedAt] = useState("")
  const [published, setPublished] = useState(true)
  const [bskyText, setBskyText] = useState("")
  const [bskyLinkTarget, setBskyLinkTarget] = useState<"post" | "link" | "none">("post")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const editorOpen = isNew || editing !== null

  useEffect(() => {
    if (defaultSlug) {
      const post = initialPosts.find((p) => p.pk === defaultSlug)
      if (post) openEdit(post)
    } else if (defaultType) {
      setIsNew(true)
      setPostType(defaultType)
      setLink("")
      setPublishedAt(nowLocalDatetime())
      setPublished(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setEditing(null)
    setIsNew(true)
    setTitle("")
    setBody("")
    setLink("")
    setPostType("note")
    setPublishedAt(nowLocalDatetime())
    setPublished(true)
    setBskyText("")
    setBskyLinkTarget("post")
    setError("")
    setMode("write")
  }

  function openEdit(post: Post) {
    setIsNew(false)
    setEditing(post)
    setTitle(post.title)
    setBody(post.body)
    setLink(post.link ?? "")
    setPostType(post.type)
    const d = new Date(post.publishedAt)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    setPublishedAt(d.toISOString().slice(0, 16))
    setPublished(post.published)
    setBskyText(post.bskyText ?? "")
    setBskyLinkTarget(post.bskyLinkTarget ?? "post")
    setError("")
    setMode("write")
  }

  function cancel() {
    setEditing(null)
    setIsNew(false)
    setLink("")
    setBskyText("")
    setBskyLinkTarget("post")
    setError("")
  }

  async function save() {
    if (!title.trim()) {
      setError("Title is required.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const data = {
        title: title.trim(),
        body,
        link: link.trim() || undefined,
        type: postType,
        publishedAt: new Date(publishedAt).toISOString(),
        published,
        bskyText: bskyText,
        bskyLinkTarget: bskyText.trim() ? bskyLinkTarget : undefined,
      }

      if (isNew) {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
        if (!res.ok) {
          const json = await res.json()
          setError(json.error ?? "Failed to create post.")
          return
        }
        const newPost: Post = await res.json()
        setPosts((prev) =>
          [newPost, ...prev].sort(
            (a, b) =>
              new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
          )
        )
      } else if (editing) {
        const res = await fetch(`/api/posts/${editing.pk}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
        if (!res.ok) {
          const json = await res.json()
          setError(json.error ?? "Failed to update post.")
          return
        }
        setPosts((prev) =>
          prev
            .map((p) => (p.pk === editing.pk ? { ...p, ...data } : p))
            .sort(
              (a, b) =>
                new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
            )
        )
      }

      cancel()
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(slug: string) {
    if (!confirm("Delete this post? This cannot be undone.")) return
    const res = await fetch(`/api/posts/${slug}`, { method: "DELETE" })
    if (!res.ok) {
      alert("Failed to delete post.")
      return
    }
    setPosts((prev) => prev.filter((p) => p.pk !== slug))
    if (editing?.pk === slug) cancel()
    router.refresh()
  }

  const bskyCharCount = bskyText.length
  const bskyOverLimit = bskyCharCount > 300

  return (
    <div className="admin-wrapper">
      <div className="admin-top">
        <h2>Admin</h2>
        {!editorOpen && (
          <button className="btn btn-primary" onClick={openNew}>
            + New Post
          </button>
        )}
      </div>

      {!editorOpen && (
        <ul className="admin-post-list">
          {posts.length === 0 && (
            <li
              style={{
                padding: "1rem 0",
                color: "var(--text-muted)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.9rem",
              }}
            >
              No posts yet.
            </li>
          )}
          {posts.map((post) => (
            <li key={post.pk} className="admin-post-item">
              <div className="admin-post-info">
                <p className="admin-post-title">{post.title}</p>
                <p className="admin-post-meta">
                  <span className="type-badge">{post.type}</span>
                  {formatDate(post.publishedAt)}
                  {!post.published && (
                    <span className="draft-badge"> · Draft</span>
                  )}
                  {post.bskyUri && (
                    <span className="bsky-badge"> · Bluesky</span>
                  )}
                  {post.mastodonUri && (
                    <span className="masto-badge"> · Mastodon</span>
                  )}
                </p>
              </div>
              <div className="admin-post-actions">
                <button className="btn btn-sm" onClick={() => openEdit(post)}>
                  Edit
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDelete(post.pk)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editorOpen && (
        <div className="editor">
          <h3>{isNew ? "New Post" : "Edit Post"}</h3>

          <div className="form-group">
            <label htmlFor="postType">Type</label>
            <select
              id="postType"
              className="form-select"
              value={postType}
              onChange={(e) => setPostType(e.target.value as PostType)}
            >
              <option value="note">Note</option>
              <option value="essay">Essay</option>
              <option value="project">Project</option>
              <option value="link">Link</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              className="form-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="link">URL <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
            <input
              id="link"
              className="form-input"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="form-group">
            <label htmlFor="publishedAt">Date</label>
            <input
              id="publishedAt"
              className="form-input"
              type="datetime-local"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
            />
          </div>

          <div className="form-group">
            <div className="editor-tabs">
              <button
                className={`editor-tab ${mode === "write" ? "active" : ""}`}
                onClick={() => setMode("write")}
              >
                Write
              </button>
              <button
                className={`editor-tab ${mode === "preview" ? "active" : ""}`}
                onClick={() => setMode("preview")}
              >
                Preview
              </button>
            </div>

            {mode === "write" ? (
              <textarea
                className="form-textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write in Markdown…"
              />
            ) : (
              <div className="preview-body post-body">
                {body ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                ) : (
                  <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                    Nothing to preview yet.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-checkbox-row">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
              />
              Published
            </label>
          </div>

          <div className="form-group">
            <div className="bsky-label-row">
              <label htmlFor="bskyText">Social post (BlueSky/Mastodon) <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(leave blank to skip)</span></label>
              <span className={`bsky-char-count ${bskyOverLimit ? "bsky-char-over" : ""}`}>
                {bskyCharCount}/300
              </span>
            </div>
            <textarea
              id="bskyText"
              className="form-textarea bsky-textarea"
              value={bskyText}
              onChange={(e) => setBskyText(e.target.value)}
              placeholder="Custom text for social posts… (uses main body if blank for Mastodon)"
            />
            {bskyText.trim() && (
              <div className="bsky-link-target">
                <span className="bsky-link-target-label">Link to:</span>
                <label className="bsky-radio-label">
                  <input
                    type="radio"
                    name="bskyLinkTarget"
                    value="post"
                    checked={bskyLinkTarget === "post"}
                    onChange={() => setBskyLinkTarget("post")}
                  />
                  Link to Post
                </label>
                <label className={`bsky-radio-label ${!link.trim() ? "bsky-radio-disabled" : ""}`}>
                  <input
                    type="radio"
                    name="bskyLinkTarget"
                    value="link"
                    checked={bskyLinkTarget === "link"}
                    onChange={() => setBskyLinkTarget("link")}
                    disabled={!link.trim()}
                  />
                  Provided URL{!link.trim() && " (none set)"}
                </label>
                <label className="bsky-radio-label">
                  <input
                    type="radio"
                    name="bskyLinkTarget"
                    value="none"
                    checked={bskyLinkTarget === "none"}
                    onChange={() => setBskyLinkTarget("none")}
                  />
                  None
                </label>
              </div>
            )}
          </div>

          {error && <p className="editor-error">{error}</p>}

          <div className="editor-actions">
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="btn" onClick={cancel} disabled={saving}>
              Cancel
            </button>
            {editing && (
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(editing.pk)}
                disabled={saving}
                style={{ marginLeft: "auto" }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
