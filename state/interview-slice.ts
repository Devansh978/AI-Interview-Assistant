import { createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit"

type Difficulty = "easy" | "medium" | "hard"
type Phase = "collecting-profile" | "in-progress" | "finalizing" | "finalized" | "paused"

export interface ChatMessage {
  id: string
  role: "system" | "assistant" | "user"
  text: string
  timestamp: number
  meta?: { kind?: "question" | "answer" | "feedback" | "info" }
}

export interface Question {
  id: string
  difficulty: Difficulty
  text: string
  // AI scoring data per answer
  answer?: string
  score?: number // 0-10
  reasoning?: string
  startedAt?: number // epoch ms
  endAt?: number // epoch ms absolute for persistence
  durationSec: number
}

export interface Session {
  id: string
  phase: Phase
  questions: Question[]
  activeIndex: number // index into questions
  chat: ChatMessage[]
  summary?: string
  finalScore?: number // 0-100
  missingFieldsAsked?: Record<"name" | "email" | "phone", boolean>
}

export interface Candidate {
  id: string
  name?: string
  email?: string
  phone?: string
  resumeFileName?: string
  createdAt: number
  completed: boolean
  session?: Session
}

export interface InterviewState {
  currentCandidateId?: string
  candidates: Record<string, Candidate>
}

const initialState: InterviewState = {
  candidates: {},
}

const durations: Record<Difficulty, number> = {
  easy: 20,
  medium: 60,
  hard: 120,
}

function buildQuestionPlan(): Question[] {
  const plan: Difficulty[] = ["easy", "easy", "medium", "medium", "hard", "hard"]
  return plan.map((d) => ({
    id: nanoid(),
    difficulty: d,
    text: "", // will be populated by AI
    durationSec: durations[d],
  }))
}

function ensureSession(candidate: Candidate) {
  if (!candidate.session) {
    candidate.session = {
      id: nanoid(),
      phase: "collecting-profile",
      questions: buildQuestionPlan(),
      activeIndex: 0,
      chat: [],
      missingFieldsAsked: { name: false, email: false, phone: false },
    }
  }
}

const interviewSlice = createSlice({
  name: "interview",
  initialState,
  reducers: {
    startNewCandidate: {
      reducer(state, action: PayloadAction<{ candidateId: string }>) {
        const id = action.payload.candidateId
        state.currentCandidateId = id
        state.candidates[id] = {
          id,
          createdAt: Date.now(),
          completed: false,
        }
      },
      prepare() {
        return { payload: { candidateId: nanoid() } }
      },
    },
    setResumeMeta(state, action: PayloadAction<{ candidateId: string; fileName: string }>) {
      const c = state.candidates[action.payload.candidateId]
      if (c) c.resumeFileName = action.payload.fileName
    },
    setProfile(
      state,
      action: PayloadAction<{
        candidateId: string
        name?: string
        email?: string
        phone?: string
      }>,
    ) {
      const c = state.candidates[action.payload.candidateId]
      if (!c) return
      c.name = action.payload.name ?? c.name
      c.email = action.payload.email ?? c.email
      c.phone = action.payload.phone ?? c.phone
      ensureSession(c)
    },
    addChat(state, action: PayloadAction<{ candidateId: string; msg: ChatMessage }>) {
      const c = state.candidates[action.payload.candidateId]
      if (!c) return
      ensureSession(c)
      c.session!.chat.push(action.payload.msg)
    },
    markMissingAsked(
      state,
      action: PayloadAction<{
        candidateId: string
        field: "name" | "email" | "phone"
      }>,
    ) {
      const c = state.candidates[action.payload.candidateId]
      if (!c?.session) return
      c.session.missingFieldsAsked![action.payload.field] = true
    },
    setQuestionText(state, action: PayloadAction<{ candidateId: string; index: number; text: string }>) {
      const c = state.candidates[action.payload.candidateId]
      if (!c?.session) return
      c.session.questions[action.payload.index].text = action.payload.text
    },
    startQuestionTimer(state, action: PayloadAction<{ candidateId: string; index: number }>) {
      const c = state.candidates[action.payload.candidateId]
      if (!c?.session) return
      const q = c.session.questions[action.payload.index]
      const now = Date.now()
      q.startedAt = now
      q.endAt = now + q.durationSec * 1000
      c.session.phase = "in-progress"
    },
    answerCurrent(
      state,
      action: PayloadAction<{
        candidateId: string
        answer: string
        score?: number
        reasoning?: string
      }>,
    ) {
      const c = state.candidates[action.payload.candidateId]
      if (!c?.session) return
      const idx = c.session.activeIndex
      const q = c.session.questions[idx]
      q.answer = action.payload.answer
      if (typeof action.payload.score === "number") q.score = action.payload.score
      if (action.payload.reasoning) q.reasoning = action.payload.reasoning
    },
    advanceQuestion(state, action: PayloadAction<{ candidateId: string }>) {
      const c = state.candidates[action.payload.candidateId]
      if (!c?.session) return
      if (c.session.activeIndex < c.session.questions.length - 1) {
        c.session.activeIndex += 1
      } else {
        c.session.phase = "finalizing"
      }
    },
    setFinalSummary(
      state,
      action: PayloadAction<{
        candidateId: string
        finalScore: number
        summary: string
      }>,
    ) {
      const c = state.candidates[action.payload.candidateId]
      if (!c?.session) return
      c.session.finalScore = action.payload.finalScore
      c.session.summary = action.payload.summary
      c.session.phase = "finalized"
      c.completed = true
    },
    pauseSession(state, action: PayloadAction<{ candidateId: string }>) {
      const c = state.candidates[action.payload.candidateId]
      if (!c?.session) return
      c.session.phase = "paused"
      // freeze timers: convert endAt to remaining and store as negative
      const idx = c.session.activeIndex
      const q = c.session.questions[idx]
      if (q.endAt && q.startedAt) {
        const remaining = Math.max(0, q.endAt - Date.now())
        q.endAt = Date.now() + remaining // keep absolute, effectively same result
      }
    },
    resumeSession(state, action: PayloadAction<{ candidateId: string }>) {
      const c = state.candidates[action.payload.candidateId]
      if (!c?.session) return
      // if currently in-progress/paused, ensure timers still valid
      c.session.phase = c.session.phase === "finalized" ? "finalized" : "in-progress"
    },
    setCurrentCandidate(state, action: PayloadAction<{ candidateId: string }>) {
      state.currentCandidateId = action.payload.candidateId
    },
  },
})

export const {
  startNewCandidate,
  setResumeMeta,
  setProfile,
  addChat,
  markMissingAsked,
  setQuestionText,
  startQuestionTimer,
  answerCurrent,
  advanceQuestion,
  setFinalSummary,
  pauseSession,
  resumeSession,
  setCurrentCandidate,
} = interviewSlice.actions

export default interviewSlice.reducer
