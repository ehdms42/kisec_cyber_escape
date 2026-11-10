import { useCallback, useEffect, useState } from "react"
import {
  createDepartmentCode,
  deleteDepartmentCode,
  listDepartmentCodes,
} from "../../admin/institutionRepository"
import type { DepartmentCode } from "../../admin/institutionTypes"
import { useAdminDialog } from "./AdminDialogProvider"

// 헷갈리기 쉬운 0/O, 1/I/L은 뺀다.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const chars = Array.from(
    bytes,
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  )
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`
}

export default function DepartmentCodesSection({
  campaignId,
  setNotice,
}: {
  campaignId: string
  setNotice: (message: string) => void
}) {
  const { confirm } = useAdminDialog()
  const [codes, setCodes] = useState<DepartmentCode[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [department, setDepartment] = useState("")
  const [code, setCode] = useState(generateCode)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setCodes(await listDepartmentCodes(campaignId))
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "부서 참여 코드를 불러오지 못했습니다.",
      )
    } finally {
      setLoading(false)
    }
  }, [campaignId, setNotice])

  useEffect(() => void refresh(), [refresh])

  const add = async () => {
    if (!department.trim()) {
      setNotice("부서명을 입력해 주세요.")
      return
    }
    if (!/^[A-Za-z0-9-]{6,40}$/.test(code.trim())) {
      setNotice("참여 코드는 영문, 숫자, 하이픈으로 6~40자 입력해 주세요.")
      return
    }
    setSaving(true)
    try {
      const created = await createDepartmentCode(campaignId, {
        department: department.trim(),
        code: code.trim(),
      })
      setNotice(`${created.department} 참여 코드를 추가했습니다.`)
      setDepartment("")
      setCode(generateCode())
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "부서 참여 코드를 추가하지 못했습니다.",
      )
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: DepartmentCode) => {
    const ok = await confirm({
      title: "부서 코드 삭제",
      message: `${item.department} 코드(${item.code})를 삭제할까요? 이미 입장한 참가자의 기록은 그대로 남고, 이 코드로는 더 이상 새로 입장할 수 없습니다.`,
      confirmLabel: "삭제",
      tone: "danger",
    })
    if (!ok) return
    setSaving(true)
    try {
      await deleteDepartmentCode(campaignId, item.id)
      setNotice(`${item.department} 참여 코드를 삭제했습니다.`)
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "부서 참여 코드를 삭제하지 못했습니다.",
      )
    } finally {
      setSaving(false)
    }
  }

  const copy = async (item: DepartmentCode) => {
    try {
      await navigator.clipboard.writeText(item.code)
      setNotice(`${item.department} 코드를 복사했습니다.`)
    } catch {
      setNotice(
        "클립보드에 복사하지 못했습니다. 코드를 직접 선택해 복사해 주세요.",
      )
    }
  }

  return (
    <section className="department-codes">
      <div className="department-codes-head">
        <b>부서 참여 코드</b>
        <span>
          같은 부서는 같은 코드로 입장하고, 요원명은 참가자가 직접 정합니다.
          브라우저(기기)마다 한 번만 응시할 수 있습니다.
        </span>
      </div>

      <div className="campaign-manual-add department-codes-form">
        <input
          value={department}
          onChange={(event) => setDepartment(event.target.value.slice(0, 60))}
          placeholder="부서명 (예: 정보보호팀)"
          aria-label="부서명"
        />
        <input
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\s/g, "").slice(0, 40))
          }
          placeholder="참여 코드"
          aria-label="참여 코드"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => setCode(generateCode())}
        >
          새 코드
        </button>
        <button
          type="button"
          className="admin-primary"
          disabled={saving}
          onClick={add}
        >
          추가
        </button>
      </div>

      {loading ? (
        <p className="admin-empty">불러오는 중…</p>
      ) : codes.length === 0 ? (
        <p className="admin-empty">
          등록된 부서 코드가 없습니다. 부서를 추가하면 참가자가 그 코드로 입장할
          수 있습니다.
        </p>
      ) : (
        <div className="ranking-table department-codes-list">
          {codes.map((item) => (
            <article key={item.id}>
              <span>
                <strong>{item.department}</strong>
              </span>
              <code>{item.code}</code>
              <span className="department-codes-actions">
                <button type="button" onClick={() => void copy(item)}>
                  복사
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={saving}
                  onClick={() => void remove(item)}
                >
                  삭제
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
