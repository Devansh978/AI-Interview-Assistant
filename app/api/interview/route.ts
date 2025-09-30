import { generateObject, generateText } from "ai"
import { z } from "zod"

const USE_REAL_AI = process.env.USE_REAL_AI === "1"

type Difficulty = "easy" | "medium" | "hard"

function mockQuestion(difficulty: Difficulty) {
  const pools: Record<Difficulty, string[]> = {
    easy: [
      "Explain the difference between var, let, and const in JavaScript, and when to use each.",
      "What is the Virtual DOM in React and how does it improve performance?",
      "How do you handle component state in React? Give a simple example.",
    ],
    medium: [
      "Describe how you would implement server-side rendering with Next.js for SEO-sensitive pages.",
      "How do you design a REST API in Node.js/Express for a posts resource, including validation and error handling?",
      "Explain how React hooks like useMemo and useCallback help with performance. Provide examples.",
    ],
    hard: [
      "Design a robust authentication/authorization flow for a full-stack app (React frontend, Node backend) including token refresh and protected routes.",
      "How would you scale a real-time feature (e.g., notifications) across multiple Node instances? Discuss architecture and tradeoffs.",
      "Given a slow React list rendering thousands of items, outline a plan to optimize it end-to-end (rendering, data-fetching, memoization).",
    ],
  }
  const list = pools[difficulty]
  return list[Math.floor(Math.random() * list.length)]
}

function mockJudge(question: string, answer: string, difficulty: Difficulty) {
  const base = Math.min(10, Math.max(0, Math.floor(answer.trim().length / 50))) // length heuristic
  // keyword bonus
  const keywords = [
    "react",
    "state",
    "props",
    "node",
    "express",
    "api",
    "performance",
    "memo",
    "useMemo",
    "useCallback",
    "next.js",
    "ssr",
    "csr",
    "auth",
    "token",
    "jwt",
    "cache",
    "scal",
    "optimiz",
    "virtual dom",
  ]
  const lower = answer.toLowerCase()
  let bonus = 0
  for (const k of keywords) {
    if (lower.includes(k)) bonus += 1
  }
  const difficultyBoost = difficulty === "hard" ? 2 : difficulty === "medium" ? 1 : 0
  const score = Math.max(0, Math.min(10, base + Math.min(3, bonus) + difficultyBoost))
  const reasoning =
    "Heuristic grading applied locally: based on answer length, presence of relevant technical keywords, and difficulty bonus. This is a non-AI fallback."
  return { score, reasoning }
}

function mockFinalize(qa: Array<{ difficulty: Difficulty; score: number }>, profile: Record<string, any>) {
  let total = 0
  let weightSum = 0
  for (const { difficulty, score } of qa) {
    const weight = difficulty === "hard" ? 1.3 : difficulty === "medium" ? 1.1 : 1.0
    total += score * weight
    weightSum += 10 * weight
  }
  const pct = Math.round((total / (weightSum || 60)) * 100)
  const name = profile?.name || "Candidate"
  const summary =
    `${name} completed a full‑stack interview using a local evaluation fallback. Strengths observed ` +
    `include familiarity with React and Node fundamentals. Areas for improvement may include deeper ` +
    `discussion of tradeoffs, architectural patterns, and performance measurement with concrete metrics.`
  return { finalScore: Math.max(0, Math.min(100, pct)), summary }
}

export async function POST(req: Request) {
  const body = await req.json()
  const action = body?.action

  if (action === "next-question") {
    const difficulty: Difficulty = body?.difficulty ?? "easy"
    const role = body?.role ?? "Full Stack (React/Node)"
    const previous = body?.previous ?? []

    const prompt =
      `You are an expert interviewer for a ${role} role.\n` +
      `Generate ONE ${difficulty} difficulty technical interview question focused on practical skills.\n` +
      `Avoid multiple questions; be concise but clear. Do not include answers.\n` +
      `Previous questions and scores: ${JSON.stringify(previous)}.`

    if (!USE_REAL_AI) {
      // Local fallback
      return Response.json({ question: mockQuestion(difficulty) })
    }

    try {
      const { text } = await generateText({
        model: "openai/gpt-5",
        prompt,
        maxOutputTokens: 300,
        temperature: 0.7,
      })
      return Response.json({ question: text.trim() })
    } catch (e) {
      // Fallback on any AI error (e.g., 403 billing)
      return Response.json({ question: mockQuestion(difficulty), fallback: true })
    }
  }

  if (action === "judge-answer") {
    const difficulty: Difficulty = body?.difficulty ?? "easy"
    const question: string = body?.question ?? ""
    const answer: string = body?.answer ?? ""
    const role = body?.role ?? "Full Stack (React/Node)"

    const schema = z.object({
      score: z.number().min(0).max(10),
      reasoning: z.string(),
    })

    if (!USE_REAL_AI) {
      return Response.json(mockJudge(question, answer, difficulty))
    }

    try {
      const { object } = await generateObject({
        model: "openai/gpt-5",
        schema,
        messages: [
          {
            role: "system",
            content: [
              {
                type: "text",
                text: "You are a strict but fair technical interviewer. Score the answer from 0 to 10 based on correctness, completeness, clarity, and relevance.",
              },
            ],
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Role: ${role}` },
              { type: "text", text: `Difficulty: ${difficulty}` },
              { type: "text", text: `Question: ${question}` },
              { type: "text", text: `Candidate Answer: ${answer}` },
            ],
          },
        ],
      })
      return Response.json(object)
    } catch (e) {
      return Response.json(mockJudge(question, answer, difficulty))
    }
  }

  if (action === "finalize") {
    const questions = body?.questions ?? []
    const profile = body?.profile ?? {}

    const schema = z.object({
      finalScore: z.number().min(0).max(100),
      summary: z.string(),
    })

    if (!USE_REAL_AI) {
      const qa = questions.map((q: any) => ({ difficulty: q.difficulty as Difficulty, score: Number(q.score || 0) }))
      return Response.json(mockFinalize(qa, profile))
    }

    try {
      const { object } = await generateObject({
        model: "openai/gpt-5",
        schema,
        messages: [
          {
            role: "system",
            content: [
              {
                type: "text",
                text: "Create a brief, professional candidate summary and an overall score 0-100 based on per-question scores and difficulty.",
              },
            ],
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Profile: ${JSON.stringify(profile)}` },
              { type: "text", text: `Questions/Answers/Scores: ${JSON.stringify(questions)}` },
              {
                type: "text",
                text: "Weigh harder questions slightly more. Keep summary under 120 words and mention strengths and areas to improve.",
              },
            ],
          },
        ],
      })
      return Response.json(object)
    } catch (e) {
      const qa = questions.map((q: any) => ({ difficulty: q.difficulty as Difficulty, score: Number(q.score || 0) }))
      return Response.json(mockFinalize(qa, profile))
    }
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 })
}
