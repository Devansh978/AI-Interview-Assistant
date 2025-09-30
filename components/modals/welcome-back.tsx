"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useAppDispatch, useAppSelector } from "@/lib/store-hooks"
import { resumeSession, startNewCandidate } from "@/state/interview-slice"
import { useEffect } from "react"

export function WelcomeBackModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const dispatch = useAppDispatch()
  const state = useAppSelector((s) => s.interview)
  const current = state.currentCandidateId ? state.candidates[state.currentCandidateId] : undefined
  const hasUnfinished = !!current && !current.completed

  // Debug logging
  useEffect(() => {
    console.log('WelcomeBackModal debug:', {
      hasUnfinished,
      currentCandidateId: state.currentCandidateId,
      currentCandidate: current,
      open
    })
  }, [hasUnfinished, state.currentCandidateId, current, open])

  // Don't render the dialog at all if there's no unfinished session
  if (!hasUnfinished) {
    console.log('No unfinished session, not rendering modal')
    return null
  }

  const handleStartNew = () => {
    onOpenChange(false)
    dispatch(startNewCandidate())
  }

  const handleResume = () => {
    onOpenChange(false)
    if (current?.id) {
      dispatch(resumeSession({ candidateId: current.id }))
    }
  }

  console.log('Rendering WelcomeBackModal with open:', open)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome back</DialogTitle>
          <DialogDescription>
            You have an unfinished interview with {current?.name || 'the candidate'}. Would you like to resume where you left off?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleStartNew}>
            Start New
          </Button>
          <Button onClick={handleResume}>
            Resume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
