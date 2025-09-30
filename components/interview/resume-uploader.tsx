"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppDispatch } from "@/lib/store-hooks"
import { setProfile, setResumeMeta, addChat } from "@/state/interview-slice"
import { parseResume } from "@/lib/resume-parse"

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(",")[1] || "")
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ResumeUploader({ candidateId }: { candidateId: string }) {
  const dispatch = useAppDispatch()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  return (
    <div className="space-y-2">
      <Label htmlFor="resume">Upload Resume (PDF or DOCX)</Label>
      <Input
        id="resume"
        type="file"
        accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={async (e) => {
          setError(null)
          const file = e.target.files?.[0]
          if (!file) return
          const valid =
            file.type === "application/pdf" ||
            file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          if (!valid) {
            setError("Invalid file. Please upload PDF or DOCX.")
            return
          }
          setLoading(true)
          try {
            const base64 = await fileToBase64(file)
            dispatch(setResumeMeta({ candidateId, fileName: file.name }))

            const { name, email, phone } = await parseResume(file)

            dispatch(
              setProfile({
                candidateId,
                name,
                email,
                phone,
              }),
            )

            dispatch(
              addChat({
                candidateId,
                msg: {
                  id: crypto.randomUUID(),
                  role: "system",
                  text:
                    name || email || phone
                      ? "Resume processed. We extracted some contact details. We'll collect any missing info before starting."
                      : "Resume processed. We couldn't extract contact details; we'll collect them now before starting.",
                  timestamp: Date.now(),
                  meta: { kind: "info", fileName: file.name, base64Len: base64.length },
                },
              }),
            )
          } catch (err: any) {
            setError("Failed to process resume. Please try again.")
          } finally {
            setLoading(false)
          }
        }}
      />
      {loading ? <p className="text-sm text-muted-foreground">Extracting details...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
