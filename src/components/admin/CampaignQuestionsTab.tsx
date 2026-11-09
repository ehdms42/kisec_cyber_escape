import { useCallback, useEffect, useMemo, useState } from "react"
import {
  countByCategory,
  pickBalancedQuestions,
} from "../../admin/campaignQuestionPicker"
import {
  listCampaignQuestions,
  saveCampaignQuestions,
} from "../../admin/institutionRepository"
import type { Campaign } from "../../admin/institutionTypes"
import { listQuestions } from "../../admin/questionRepository"
import type { AdminQuestion } from "../../admin/types"
import { puzzleQuestionCounts } from "../../game/config"

const DEFAULT_PICK_COUNT = 20

export default function CampaignQuestionsTab({
  campaign,
  onUpdated,
  setNotice,
}: {
  campaign: Campaign
  onUpdated: (campaign: Campaign) => void
  setNotice: (message: string) => void
}) {
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [pickCount, setPickCount] = useState(DEFAULT_PICK_COUNT)
  // 비어 있으면 모든 분야에서 뽑는다.
  const [chosenCategories, setChosenCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [allQuestions, campaignQuestions] = await Promise.all([
        listQuestions(),
        listCampaignQuestions(campaign.id),
      ])
      const ids = campaignQuestions.map((item) => item.questionId)
      setQuestions(allQuestions.filter((item) => item.status === "published"))
      setSelectedIds(ids)
      setSavedIds(ids)
      setChosenCategories([
        ...new Set(campaignQuestions.map((item) => item.category)),
      ])
      if (ids.length) setPickCount(ids.length)
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "세션 문항 구성을 불러오지 못했습니다.",
      )
    } finally {
      setLoading(false)
    }
  }, [campaign.id, setNotice])

  useEffect(() => void refresh(), [refresh])

  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  )
  const selectedQuestions = selectedIds.flatMap((id) => {
    const question = questionById.get(id)
    return question ? [question] : []
  })
  const selectedSet = new Set(selectedIds)
  const categoryCounts = useMemo(() => countByCategory(questions), [questions])
  const pool = questions
    .filter(
      (question) =>
        chosenCategories.length === 0 ||
        chosenCategories.includes(question.category),
    )
    .sort((left, right) => left.ordinal - right.ordinal)
  const changed =
    selectedIds.length !== savedIds.length ||
    selectedIds.some((id, index) => id !== savedIds[index])
  const perDevice = puzzleQuestionCounts(selectedQuestions.length || 30)

  const pickRandom = () => {
    const count = Math.max(1, Math.min(pickCount, pool.length))
    setSelectedIds(pickBalancedQuestions(pool, count).map((item) => item.id))
  }

  const toggleCategory = (category: string) => {
    setChosenCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    )
  }

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  const save = async (ids: string[]) => {
    setSaving(true)
    try {
      const result = await saveCampaignQuestions(campaign.id, ids)
      const savedQuestionIds = result.questions.map((item) => item.questionId)
      setSelectedIds(savedQuestionIds)
      setSavedIds(savedQuestionIds)
      onUpdated(result.campaign)
      setNotice(
        savedQuestionIds.length
          ? `세션 문항 ${savedQuestionIds.length}개를 저장했습니다.`
          : "문항 구성을 비웠습니다. 공개 문항 30개를 번호순으로 출제합니다.",
      )
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "세션 문항 구성을 저장하지 못했습니다.",
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="admin-empty">불러오는 중…</p>

  return (
    <section className="campaign-questions-tab">
      <p className="campaign-questions-help">
        {savedIds.length
          ? `이 세션은 저장된 ${savedIds.length}문항만 아래 순서대로 출제합니다.`
          : "문항 구성이 없으면 공개 문항 30개를 번호순으로 출제합니다."}{" "}
        응시 기록이 생긴 뒤에는 바꿀 수 없습니다.
      </p>

      <fieldset className="campaign-questions-step">
        <legend>1. 출제 분야</legend>
        <div className="campaign-questions-categories">
          {categoryCounts.map(([category, count]) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={chosenCategories.includes(category)}
                onChange={() => toggleCategory(category)}
              />
              <span>{category}</span>
              <em>{count}</em>
            </label>
          ))}
        </div>
        <small>
          {chosenCategories.length
            ? `선택한 분야의 공개 문항 ${pool.length}개 안에서 뽑습니다.`
            : `분야를 고르지 않으면 공개 문항 전체(${pool.length}개)에서 뽑습니다.`}
        </small>
      </fieldset>

      <div className="campaign-questions-picker">
        <label>
          <span>2. 문항 수</span>
          <input
            type="number"
            min={1}
            max={Math.min(100, pool.length)}
            value={pickCount}
            onChange={(event) => setPickCount(Number(event.target.value) || 1)}
          />
        </label>
        <button
          type="button"
          className="admin-primary"
          disabled={saving || pool.length === 0}
          onClick={pickRandom}
        >
          3. 분야별로 고르게 자동 선택
        </button>
        <button
          type="button"
          disabled={saving || selectedIds.length === 0}
          onClick={() => setSelectedIds([])}
        >
          선택 해제
        </button>
      </div>

      <div className="admin-import-summary">
        <span>
          선택 <b>{selectedQuestions.length}문항</b>
        </span>
        {countByCategory(selectedQuestions).map(([category, count]) => (
          <span key={category}>
            {category} <b>{count}</b>
          </span>
        ))}
        <span>
          장치별 <b>{perDevice.join(" · ")}</b>
        </span>
      </div>

      {selectedQuestions.length > 0 && (
        <ol className="campaign-questions-selected">
          {selectedQuestions.map((question) => (
            <li key={question.id}>
              <b>{question.ordinal}번</b>
              <em>{question.category}</em>
              <span>{question.prompt}</span>
              <button
                type="button"
                aria-label={`${question.ordinal}번 빼기`}
                onClick={() => toggle(question.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="campaign-questions-help">
        필요하면 아래 목록에서 문항을 직접 추가하거나 빼세요.
      </p>

      {pool.length === 0 ? (
        <p className="admin-empty">공개된 문항이 없습니다.</p>
      ) : (
        <div className="campaign-questions-list">
          {pool.map((question) => (
            <label key={question.id}>
              <input
                type="checkbox"
                checked={selectedSet.has(question.id)}
                onChange={() => toggle(question.id)}
              />
              <b>{question.ordinal}번</b>
              <em>{question.category}</em>
              <span>{question.prompt}</span>
            </label>
          ))}
        </div>
      )}

      <div className="campaign-questions-actions">
        {savedIds.length > 0 && (
          <button type="button" disabled={saving} onClick={() => save([])}>
            구성 비우기
          </button>
        )}
        <button
          type="button"
          className="admin-primary"
          disabled={saving || !changed || selectedIds.length === 0}
          onClick={() => save(selectedIds)}
        >
          {saving ? "저장 중…" : `${selectedIds.length}문항 저장`}
        </button>
      </div>
    </section>
  )
}
