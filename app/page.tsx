"use client"

import { useEffect, useState } from "react"
import { ReduxProvider } from "@/components/providers/redux-provider"
import { Button } from "@/components/ui/button"
import { ChatPanel } from "@/components/interview/chat-panel"
import { Dashboard } from "@/components/interviewer/dashboard"
import { WelcomeBackModal } from "@/components/modals/welcome-back"
import { useAppSelector } from "@/lib/store-hooks"

function AppShell() {
  const [tab, setTab] = useState<"interviewee" | "interviewer">("interviewee")

  const { hasUnfinishedSession } = useAppSelector((s) => {
    const currentId = s.interview.currentCandidateId
    const c = currentId ? s.interview.candidates[currentId] : undefined
    const unfinished = !!c && !c.completed && !!c.session && c.session.phase !== "finalized"
    return { hasUnfinishedSession: unfinished }
  })

  const [welcomeOpen, setWelcomeOpen] = useState(false)
  useEffect(() => {
    if (hasUnfinishedSession) setWelcomeOpen(true)
  }, [hasUnfinishedSession])

  return (
    <main className="mx-auto min-h-[100svh] max-w-6xl px-4 py-8 bg-grid">
      <header className="mb-6 glass-panel p-4 border flex items-center justify-between">
        <h1 className="text-balance text-2xl font-semibold">AI Interview Assistant</h1>
        <div className="flex items-center gap-2">
          <Button 
            variant={tab === "interviewee" ? "default" : "outline"}
            onClick={() => setTab("interviewee")}
          >
            Interviewee
          </Button>
          <Button 
            variant={tab === "interviewer" ? "default" : "outline"}
            onClick={() => setTab("interviewer")}
          >
            Interviewer
          </Button>
        </div>
      </header>

      <div className="glass-panel border p-4">
        {tab === "interviewee" ? <ChatPanel /> : <Dashboard />}
      </div>

      <WelcomeBackModal open={welcomeOpen} onOpenChange={setWelcomeOpen} />
    </main>
  )
}

export default function Page() {
  return (
    <ReduxProvider>
      <AppShell />
    </ReduxProvider>
  )
}
