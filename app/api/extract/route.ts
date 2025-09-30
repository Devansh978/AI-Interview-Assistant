import { generateObject } from "ai"
import { z } from "zod"

const schema = z.object({
  name: z.string().optional().describe("Full name of the candidate"),
  email: z.string().optional().describe("Email address of the candidate"),
  phone: z.string().optional().describe("Phone number of the candidate"),
})

const USE_REAL_AI = process.env.USE_REAL_AI === "1"

// Very lightweight heuristic that attempts to find email/phone if given plain text input.
// For PDFs/DOCX in preview without AI, we return undefineds and let chat collect missing fields.
function mockExtractFromText(text: string) {
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  const phoneMatch = text.match(/(\+?\d[\d\s\-().]{8,}\d)/)
  // Try a naive name guess: first non-empty line without @ or digits
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const nameGuess = lines.find(
    (l) => !/@/.test(l) && !/\d/.test(l) && l.split(" ").length <= 5 && /^[A-Za-z ,.'-]+$/.test(l),
  )
  return {
    name: nameGuess,
    email: emailMatch?.[0],
    phone: phoneMatch?.[0],
  }
}

export async function POST(req: Request) {
  const { file } = await req.json()

  // Basic guardrails
  if (!file?.data) {
    return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 })
  }

  if (!USE_REAL_AI) {
    // If client also sent a best-effort plainText (optional), try to parse. Otherwise return undefineds.
    const plainText = file.plainText as string | undefined
    if (plainText && typeof plainText === "string") {
      const extracted = mockExtractFromText(plainText)
      return Response.json({ extracted, fallback: true })
    }
    return Response.json({ extracted: { name: undefined, email: undefined, phone: undefined }, fallback: true })
  }

  try {
    const { object } = await generateObject({
      model: "openai/gpt-5",
      schema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the following fields from this resume (PDF or DOCX): Name, Email, Phone." },
            {
              type: "file",
              data: file.data,
              mediaType: file.mediaType || "application/pdf",
              filename: file.filename || "resume.pdf",
            },
            {
              type: "text",
              text: "If any field is missing, return it as undefined. Only include the fields in the structured object.",
            },
          ],
        },
      ],
    })

    return Response.json({ extracted: object })
  } catch (e) {
    // Fallback if AI errors out (e.g., 403 in preview)
    const plainText = file.plainText as string | undefined
    if (plainText && typeof plainText === "string") {
      const extracted = mockExtractFromText(plainText)
      return Response.json({ extracted, fallback: true })
    }
    return Response.json({ extracted: { name: undefined, email: undefined, phone: undefined }, fallback: true })
  }
}
