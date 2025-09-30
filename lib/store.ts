"use client"

import { configureStore, combineReducers } from "@reduxjs/toolkit"
import interviewReducer from "@/state/interview-slice"

const rootReducer = combineReducers({
  interview: interviewReducer,
})

const PERSIST_KEY = "ai-interview-assistant-v1"

function loadPreloadedState() {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY)
    if (!raw) return undefined
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export const store = configureStore({
  reducer: rootReducer,
  preloadedState: loadPreloadedState(),
  middleware: (getDefault) =>
    getDefault({
      serializableCheck: {
        // allow timestamps or File metadata if needed
        ignoredPaths: [],
      },
    }),
})

if (typeof window !== "undefined") {
  let saveTimer: number | undefined
  store.subscribe(() => {
    try {
      // throttle saves to avoid excessive writes
      if (saveTimer) window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        const state = store.getState()
        window.localStorage.setItem(PERSIST_KEY, JSON.stringify(state))
      }, 150)
    } catch {
      // ignore write errors
    }
  })
}

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
