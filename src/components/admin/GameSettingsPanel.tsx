import { useEffect, useState, type FormEvent } from "react"
import {
  getGameSettings,
  updateGameSettings,
  type GameDifficulty,
  type GameSettings,
} from "../../admin/gameSettingsRepository"

const DIFFICULTY_LABEL: Record<GameDifficulty, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
}

export default function GameSettingsPanel() {
  const [value, setValue] = useState<GameSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    getGameSettings()
      .then(setValue)
      .catch((error) =>
        setNotice(
          error instanceof Error
            ? error.message
            : "게임 설정을 불러오지 못했습니다.",
        ),
      )
      .finally(() => setLoading(false))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!value) return
    setSaving(true)
    try {
      const saved = await updateGameSettings(value)
      setValue(saved)
      setNotice("게임 설정을 저장했습니다.")
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "게임 설정을 저장하지 못했습니다.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-content dashboard-page">
      <section className="admin-page-heading">
        <div>
          <h2>게임 설정</h2>
          <p>참가자에게 노출되는 시나리오 기본 정보를 관리합니다.</p>
        </div>
      </section>

      {notice && (
        <button
          className="admin-notice"
          type="button"
          onClick={() => setNotice("")}
        >
          {notice}
          <span>닫기</span>
        </button>
      )}

      {loading || !value ? (
        <p className="dashboard-empty-row">불러오는 중…</p>
      ) : (
        <form className="dashboard-card game-settings-form" onSubmit={submit}>
          <label>
            <span>시나리오 이름</span>
            <input
              value={value.title}
              onChange={(event) =>
                setValue({ ...value, title: event.target.value })
              }
              required
            />
          </label>
          <label>
            <span>시나리오 설명</span>
            <textarea
              rows={4}
              value={value.description}
              onChange={(event) =>
                setValue({ ...value, description: event.target.value })
              }
            />
          </label>
          <label>
            <span>대표 이미지 URL</span>
            <input
              value={value.coverImageUrl}
              onChange={(event) =>
                setValue({ ...value, coverImageUrl: event.target.value })
              }
              placeholder="https://..."
            />
          </label>
          <label>
            <span>교육 주제</span>
            <input
              value={value.educationTopic}
              onChange={(event) =>
                setValue({ ...value, educationTopic: event.target.value })
              }
              placeholder="예: 피싱 대응, 비밀번호 관리"
            />
          </label>
          <div className="admin-editor-grid">
            <label>
              <span>난이도</span>
              <select
                value={value.difficulty}
                onChange={(event) =>
                  setValue({
                    ...value,
                    difficulty: event.target.value as GameDifficulty,
                  })
                }
              >
                {(Object.keys(DIFFICULTY_LABEL) as GameDifficulty[]).map(
                  (difficulty) => (
                    <option value={difficulty} key={difficulty}>
                      {DIFFICULTY_LABEL[difficulty]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              <span>예상 소요 시간 (분)</span>
              <input
                type="number"
                min={1}
                value={value.estimatedMinutes}
                onChange={(event) =>
                  setValue({
                    ...value,
                    estimatedMinutes: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              <span>기본 제한 시간 (분)</span>
              <input
                type="number"
                min={1}
                value={value.defaultTimeLimitMinutes}
                onChange={(event) =>
                  setValue({
                    ...value,
                    defaultTimeLimitMinutes: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <label className="admin-check-row">
            <input
              type="checkbox"
              checked={value.public}
              onChange={(event) =>
                setValue({ ...value, public: event.target.checked })
              }
            />
            <span>공개 상태 (참가자가 접속할 수 있음)</span>
          </label>
          {value.updatedAt && (
            <p className="dashboard-neutral-note">
              마지막 수정: {new Date(value.updatedAt).toLocaleString("ko-KR")}
              {value.updatedByLoginId && ` · ${value.updatedByLoginId}`}
            </p>
          )}
          <footer>
            <button className="admin-primary" type="submit" disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </footer>
        </form>
      )}
    </main>
  )
}
