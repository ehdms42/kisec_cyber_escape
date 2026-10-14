import { useEffect, useRef, useState } from "react"

const AUTO_DISMISS_MS = 4000

/**
 * 관리자 화면의 알림 배너(admin-notice) 상태. 일반 useState("")와 동일하게 쓰되,
 * 값이 채워지면 일정 시간 후 자동으로 비워져 배너가 스스로 사라진다.
 * (수동으로 "닫기"를 눌러도 되고, 그냥 두면 몇 초 뒤 자동으로 닫힌다.)
 */
export function useNotice(timeoutMs: number = AUTO_DISMISS_MS) {
  const [notice, setNotice] = useState("")
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!notice) return
    timerRef.current = window.setTimeout(() => {
      setNotice("")
      timerRef.current = null
    }, timeoutMs)
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [notice, timeoutMs])

  return [notice, setNotice] as const
}
