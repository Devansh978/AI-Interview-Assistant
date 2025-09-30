"use client"

import { useMemo, useState } from "react"
import { useAppDispatch, useAppSelector } from "@/lib/store-hooks"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { addChat, setFinalSummary } from "@/state/interview-slice"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "../ui/label"

type SortKey = "createdAt" | "score" | "name"

export function Dashboard() {
  const dispatch = useAppDispatch()
  const candidates = useAppSelector((s) => Object.values(s.interview.candidates))
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<SortKey>("score")
  const [asc, setAsc] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const list = candidates.filter((c) => {
      const t = `${c.name ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase()
      return t.includes(q.toLowerCase())
    })
    list.sort((a, b) => {
      let va: number | string = 0
      let vb: number | string = 0
      if (sort === "score") {
        va = a.session?.finalScore ?? 0
        vb = b.session?.finalScore ?? 0
      } else if (sort === "name") {
        va = (a.name ?? "").toLowerCase()
        vb = (b.name ?? "").toLowerCase()
      } else {
        va = a.createdAt
        vb = b.createdAt
      }
      const res = va < vb ? -1 : va > vb ? 1 : 0
      return asc ? res : -res
    })
    return list
  }, [candidates, q, sort, asc])

  const selected = useMemo(() => candidates.find((c) => c.id === selectedId), [selectedId, candidates])

  async function finalizeIfNeeded() {
    if (!selected || selected.completed) return
    const sess = selected.session
    if (!sess) return
    if (sess.phase === "finalized") return

    // Build final score if not already set
    if (typeof sess.finalScore !== "number") {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          questions: sess.questions.map((qq) => ({
            difficulty: qq.difficulty,
            question: qq.text,
            answer: qq.answer ?? "",
            score: qq.score ?? 0,
          })),
          profile: {
            name: selected.name,
            email: selected.email,
            phone: selected.phone,
          },
        }),
      })
      const data = await res.json()
      dispatch(
        setFinalSummary({
          candidateId: selected.id,
          finalScore: data?.finalScore ?? 0,
          summary: data?.summary ?? "N/A",
        }),
      )
      dispatch(
        addChat({
          candidateId: selected.id,
          msg: {
            id: crypto.randomUUID(),
            role: "system",
            text: `Finalized by interviewer. Score: ${data?.finalScore}/100`,
            timestamp: Date.now(),
            meta: { kind: "info" },
          },
        }),
      )
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <Input
            placeholder="Search candidates..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="md:max-w-sm"
          />
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Sort by</Label>
            <select
              className="border rounded px-2 py-1 bg-background"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="score">Score</option>
              <option value="name">Name</option>
              <option value="createdAt">Created</option>
            </select>
            <Button variant="outline" onClick={() => setAsc((v) => !v)}>
              {asc ? "Asc" : "Desc"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Resume</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name ?? "—"}</TableCell>
                <TableCell>{c.email ?? "—"}</TableCell>
                <TableCell>{c.phone ?? "—"}</TableCell>
                <TableCell>{c.session?.finalScore ?? "—"}</TableCell>
                <TableCell className="truncate max-w-[160px]">{c.resumeFileName ?? "—"}</TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => setSelectedId(c.id)}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No candidates found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={!!selectedId}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null)
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Candidate Details</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <div>{selected.name ?? "—"}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <div>{selected.email ?? "—"}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <div>{selected.phone ?? "—"}</div>
                  </div>
                </div>
              </Card>

              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Difficulty</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead>Answer</TableHead>
                      <TableHead>Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.session?.questions.map((qq, i) => (
                      <TableRow key={qq.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="capitalize">{qq.difficulty}</TableCell>
                        <TableCell className="whitespace-pre-wrap">{qq.text}</TableCell>
                        <TableCell className="whitespace-pre-wrap">{qq.answer ?? "—"}</TableCell>
                        <TableCell>{qq.score ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              <Card className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Final Summary</h4>
                  <Button variant="outline" onClick={finalizeIfNeeded}>
                    Generate / Refresh Summary
                  </Button>
                </div>
                <div className="text-sm">
                  Score: {selected.session?.finalScore != null ? `${selected.session?.finalScore}/100` : "—"}
                </div>
                <div className="whitespace-pre-wrap">{selected.session?.summary ?? "—"}</div>
              </Card>

              <Card className="p-4">
                <h4 className="font-semibold mb-2">Chat History</h4>
                <div className="max-h-64 overflow-auto space-y-2">
                  {selected.session?.chat.map((m) => (
                    <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
                      <span className="inline-block px-2 py-1 rounded bg-muted">{m.role}</span>
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
