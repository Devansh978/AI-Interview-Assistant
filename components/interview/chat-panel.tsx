"use client"

import { cn } from "@/lib/utils"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAppDispatch, useAppSelector } from "@/lib/store-hooks"
import {
  addChat,
  advanceQuestion,
  answerCurrent,
  markMissingAsked,
  setProfile,
  setQuestionText,
  startNewCandidate,
  startQuestionTimer,
} from "@/state/interview-slice"
import { ResumeUploader } from "./resume-uploader"
import { Label } from "../ui/label"

function useCurrentCandidateId() {
  const dispatch = useAppDispatch()
  const currentCandidateId = useAppSelector((s) => s.interview.currentCandidateId)
  useEffect(() => {
    if (!currentCandidateId) {
      dispatch(startNewCandidate())
    }
  }, [currentCandidateId, dispatch])
  return useAppSelector((s) => s.interview.currentCandidateId)!
}

function useCandidate(candidateId: string) {
  return useAppSelector((s) => s.interview.candidates[candidateId])
}

function secondsLeft(endAt?: number) {
  if (!endAt) return undefined
  return Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
}

export function ChatPanel() {
  const dispatch = useAppDispatch()
  const candidateId = useCurrentCandidateId()
  const candidate = useCandidate(candidateId)

  const session = candidate?.session
  const idx = session?.activeIndex ?? 0
  const q = session?.questions[idx]
  const [answerInput, setAnswerInput] = useState("")
  const [sending, setSending] = useState(false)

  const missing = useMemo(() => {
    if (!candidate) return []
    const miss: Array<"name" | "email" | "phone"> = []
    if (!candidate.name) miss.push("name")
    if (!candidate.email) miss.push("email")
    if (!candidate.phone) miss.push("phone")
    return miss
  }, [candidate])

  // On mount: greet chat if empty
  useEffect(() => {
    if (!candidate) return
    if (!candidate.session?.chat.length) {
      dispatch(
        addChat({
          candidateId,
          msg: {
            id: crypto.randomUUID(),
            role: "assistant",
            text: "Welcome! Please upload your resume (PDF/DOCX). I will extract your details and collect any missing info before we begin.",
            timestamp: Date.now(),
            meta: { kind: "info" },
          },
        }),
      )
    }
  }, [candidate, candidateId, dispatch])

  // Ask for missing fields one by one before starting interview
  useEffect(() => {
    if (!candidate?.session) return
    if (candidate.completed) return
    if (candidate.session.phase !== "collecting-profile") return

    const order: Array<"name" | "email" | "phone"> = ["name", "email", "phone"]
    for (const f of order) {
      const asked = candidate.session.missingFieldsAsked?.[f]
      const value = candidate[f]
      if (!value && !asked) {
        dispatch(
          addChat({
            candidateId,
            msg: {
              id: crypto.randomUUID(),
              role: "assistant",
              text:
                f === "name"
                  ? "Could you please provide your full name?"
                  : f === "email"
                    ? "I could not find your email. Please provide it."
                    : "Please share your phone number, including country code if applicable.",
              timestamp: Date.now(),
              meta: { kind: "info" },
            },
          }),
        )
        dispatch(markMissingAsked({ candidateId, field: f }))
        break
      }
    }
  }, [candidate, candidateId, dispatch])

  // Generate next question when ready
  const canStart = useMemo(() => {
    return candidate?.name && candidate.email && candidate.phone
  }, [candidate])
  const needsQuestion = useMemo(() => {
    return canStart && session?.phase !== "finalized" && session?.phase !== "finalizing" && q && !q.text
  }, [canStart, session, q])

  useEffect(() => {
    if (!needsQuestion || !q) return
    const controller = new AbortController()
    ;(async () => {
      const res = await fetch("/api/interview", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next-question",
          difficulty: q.difficulty,
          role: "Full Stack (React/Node)",
          previous: session?.questions
            .slice(0, session.activeIndex)
            .map((qq) => ({ difficulty: qq.difficulty, question: qq.text, score: qq.score ?? null })),
          profile: {
            name: candidate?.name,
            email: candidate?.email,
            phone: candidate?.phone,
          },
        }),
      })
      const data = await res.json()
      const questionText = data?.question
      if (questionText) {
        dispatch(setQuestionText({ candidateId, index: idx, text: questionText }))
        dispatch(
          addChat({
            candidateId,
            msg: {
              id: crypto.randomUUID(),
              role: "assistant",
              text: questionText,
              timestamp: Date.now(),
              meta: { kind: "question" },
            },
          }),
        )
        dispatch(startQuestionTimer({ candidateId, index: idx }))
      }
    })()
    return () => controller.abort()
  }, [needsQuestion, q, idx, candidateId, dispatch, session, candidate])

  // Auto submit on timer end
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (!q?.endAt) return
    const left = secondsLeft(q.endAt)
    if (left === 0 && q.answer == null) {
      onSubmitAnswer(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, q?.endAt])

  async function onProvideMissing(field: "name" | "email" | "phone", value: string) {
    if (!value) return
    // store
    dispatch(setProfile({ candidateId, [field]: value } as any))
    dispatch(
      addChat({
        candidateId,
        msg: {
          id: crypto.randomUUID(),
          role: "user",
          text: value,
          timestamp: Date.now(),
          meta: { kind: "answer" },
        },
      }),
    )
    // If all set, announce start
    const afterAllSet =
      (field === "name" ? !!value : !!candidate?.name) &&
      (field === "email" ? !!value : !!candidate?.email) &&
      (field === "phone" ? !!value : !!candidate?.phone)
    if (afterAllSet) {
      dispatch(
        addChat({
          candidateId,
          msg: {
            id: crypto.randomUUID(),
            role: "assistant",
            text: "Great, all set! We will start a timed interview of 6 questions: 2 Easy (20s), 2 Medium (60s), 2 Hard (120s). Please answer concisely.",
            timestamp: Date.now(),
            meta: { kind: "info" },
          },
        }),
      )
    }
  }

  async function onSubmitAnswer(auto = false) {
    if (!q) return
    if (q.answer != null) return // already answered
    const content = auto ? answerInput || "[No answer provided in time]" : answerInput
    setSending(true)
    try {
      // echo user
      if (!auto) {
        dispatch(
          addChat({
            candidateId,
            msg: {
              id: crypto.randomUUID(),
              role: "user",
              text: content,
              timestamp: Date.now(),
              meta: { kind: "answer" },
            },
          }),
        )
      }
      // judge
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "judge-answer",
          question: q.text,
          answer: content,
          difficulty: q.difficulty,
          role: "Full Stack (React/Node)",
        }),
      })
      const data = await res.json()
      const score: number = Math.max(0, Math.min(10, data?.score ?? 0))
      const reasoning: string = data?.reasoning ?? "N/A"
      dispatch(
        answerCurrent({
          candidateId,
          answer: content,
          score,
          reasoning,
        }),
      )
      dispatch(
        addChat({
          candidateId,
          msg: {
            id: crypto.randomUUID(),
            role: "assistant",
            text: `Score: ${score}/10\nReasoning: ${reasoning}`,
            timestamp: Date.now(),
            meta: { kind: "feedback" },
          },
        }),
      )
      setAnswerInput("")
      // advance or finalize
      if (session && session.activeIndex === session.questions.length - 1) {
        const res2 = await fetch("/api/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "finalize",
            questions: session.questions.map((qq) => ({
              difficulty: qq.difficulty,
              question: qq.text,
              answer: qq.answer ?? "",
              score: qq.score ?? 0,
            })),
            profile: {
              name: candidate?.name,
              email: candidate?.email,
              phone: candidate?.phone,
            },
          }),
        })
        const data2 = await res2.json()
        dispatch(
          addChat({
            candidateId,
            msg: {
              id: crypto.randomUUID(),
              role: "assistant",
              text: `Interview complete. Final score: ${data2?.finalScore}/100\n` + `Summary: ${data2?.summary}`,
              timestamp: Date.now(),
              meta: { kind: "info" },
            },
          }),
        )
        // store final set in slice via action at dashboard view (done there)
        // We'll trigger finalize from dashboard list read; handled by API consumer there as well if needed.
      } else {
        dispatch(advanceQuestion({ candidateId }))
      }
    } finally {
      setSending(false)
    }
  }

  const timeLeft = secondsLeft(q?.endAt)

  return (
    <div className="grid gap-6 md:grid-cols-5">
      <div className="md:col-span-3 space-y-4">
        <Card className="p-4 h-[520px] overflow-auto">
          <div className="space-y-3">
            {(session?.chat ?? []).map((m) => (
              <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={cn(
                    "inline-block rounded-md px-3 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Input row */}
        {candidate && candidate.session?.phase !== "finalized" ? (
          <div className="space-y-2">
            {/* Missing fields collector */}
            {candidate.session?.phase === "collecting-profile" && (
              <div className="space-y-3">
                {!candidate.name && (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Your full name"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onProvideMissing("name", (e.target as HTMLInputElement).value)
                          ;(e.target as HTMLInputElement).value = ""
                        }
                      }}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const el = document.querySelector<HTMLInputElement>('input[placeholder="Your full name"]')
                        if (el?.value) {
                          onProvideMissing("name", el.value)
                          el.value = ""
                        }
                      }}
                    >
                      Submit
                    </Button>
                  </div>
                )}
                {!candidate.email && (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Your email"
                      type="email"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onProvideMissing("email", (e.target as HTMLInputElement).value)
                          ;(e.target as HTMLInputElement).value = ""
                        }
                      }}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const el = document.querySelector<HTMLInputElement>('input[placeholder="Your email"]')
                        if (el?.value) {
                          onProvideMissing("email", el.value)
                          el.value = ""
                        }
                      }}
                    >
                      Submit
                    </Button>
                  </div>
                )}
                {!candidate.phone && (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Your phone number"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onProvideMissing("phone", (e.target as HTMLInputElement).value)
                          ;(e.target as HTMLInputElement).value = ""
                        }
                      }}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const el = document.querySelector<HTMLInputElement>('input[placeholder="Your phone number"]')
                        if (el?.value) {
                          onProvideMissing("phone", el.value)
                          el.value = ""
                        }
                      }}
                    >
                      Submit
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Answer box during questions */}
            {candidate.session?.phase !== "collecting-profile" && q && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Question {idx + 1} of {session?.questions.length} · Difficulty: {q.difficulty}
                  </p>
                  <p className="text-sm font-medium">{timeLeft != null ? `${timeLeft}s left` : "—"}</p>
                </div>
                <Textarea
                  placeholder="Type your answer..."
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  disabled={!q || q.answer != null}
                />
                <div className="flex items-center gap-2">
                  <Button onClick={() => onSubmitAnswer(false)} disabled={sending || !q || q.answer != null}>
                    Submit Answer
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onSubmitAnswer(true)}
                    disabled={sending || !q || q.answer != null}
                  >
                    Skip / No Answer
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="md:col-span-2 space-y-4">
        <Card className="p-4 space-y-4">
          <h3 className="text-lg font-semibold">Candidate Profile</h3>
          <ResumeUploader candidateId={candidateId} />
          <div className="grid gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <div>{candidate?.name || "—"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <div>{candidate?.email || "—"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <div>{candidate?.phone || "—"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Resume</Label>
              <div>{candidate?.resumeFileName || "—"}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="text-lg font-semibold">Progress</h3>
          <p className="text-sm text-muted-foreground">
            {candidate?.session?.phase === "finalized"
              ? "Interview complete."
              : candidate?.session?.phase === "collecting-profile"
                ? "Collecting profile details."
                : "In progress..."}
          </p>
        </Card>
      </div>
    </div>
  )
}
