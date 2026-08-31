import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  adjustAttempt,
  listAttempts,
  listCampaigns,
  listInstitutions,
  saveCampaign,
  saveInstitution,
} from "../../admin/institutionRepository"
import type {
  AttemptStatus,
  AttemptSummary,
  Campaign,
  Institution,
} from "../../admin/institutionTypes"

const ATTEMPT_STATUS_LABEL: Record<AttemptStatus, string> = {
  in_progress: "진행 중",
  completed: "완료",
  voided: "무효",
}

function toDateInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : ""
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null
}

export default function InstitutionManagement() {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [attempts, setAttempts] = useState<AttemptSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [institutionFormOpen, setInstitutionFormOpen] = useState(false)
  const [campaignFormOpen, setCampaignFormOpen] = useState(false)
  const [editingInstitution, setEditingInstitution] =
    useState<Institution | null>(null)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [attemptFilter, setAttemptFilter] = useState<"all" | AttemptStatus>(
    "all",
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [nextInstitutions, nextCampaigns, nextAttempts] = await Promise.all(
        [listInstitutions(), listCampaigns(), listAttempts()],
      )
      setInstitutions(nextInstitutions)
      setCampaigns(nextCampaigns)
      setAttempts(nextAttempts)
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "기관 정보를 불러오지 못했습니다.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => void refresh(), [refresh])

  const visibleAttempts = useMemo(
    () =>
      attemptFilter === "all"
        ? attempts
        : attempts.filter((attempt) => attempt.status === attemptFilter),
    [attemptFilter, attempts],
  )

  const copyLink = async (campaign: Campaign) => {
    const link = `${window.location.origin}/?campaign=${campaign.publicToken}`
    try {
      await navigator.clipboard.writeText(link)
      setNotice(`${campaign.institutionName} 배포 링크를 복사했습니다.`)
    } catch {
      window.prompt("아래 배포 링크를 복사하세요.", link)
    }
  }

  const changeAttempt = async (
    attempt: AttemptSummary,
    action: "resume" | "void" | "reset",
  ) => {
    const actionLabel =
      action === "reset"
        ? "처음부터 재응시"
        : action === "void"
          ? "무효 처리"
          : "재개"
    const reason = window.prompt(
      `${actionLabel} 사유를 입력하세요.`,
      "운영자 확인",
    )
    if (!reason?.trim()) return
    if (
      action === "reset" &&
      !window.confirm("기존 답안과 점수가 삭제됩니다. 정말 초기화할까요?")
    ) {
      return
    }

    try {
      await adjustAttempt(attempt.id, action, reason.trim())
      setNotice(
        `${attempt.nickname}님의 기록을 ${actionLabel} 상태로 변경했습니다.`,
      )
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "응시 기록을 조정하지 못했습니다.",
      )
    }
  }

  return (
    <main className="admin-content institution-admin-content">
      <section className="admin-page-heading">
        <div>
          <small>DISTRIBUTION CONTROL</small>
          <h2>기관 · 응시 관리</h2>
          <p>기관별 배포 링크와 단일 응시 상태를 서버에서 관리합니다.</p>
        </div>
        <div>
          <button
            type="button"
            onClick={() => {
              setEditingInstitution(null)
              setInstitutionFormOpen(true)
            }}
          >
            기관 추가
          </button>
          <button
            className="admin-primary"
            type="button"
            disabled={institutions.length === 0}
            onClick={() => {
              setEditingCampaign(null)
              setCampaignFormOpen(true)
            }}
          >
            + 배포 만들기
          </button>
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

      <section className="institution-summary-grid">
        <article>
          <span>운영 기관</span>
          <strong>{institutions.filter((item) => item.active).length}</strong>
        </article>
        <article>
          <span>활성 배포</span>
          <strong>{campaigns.filter((item) => item.active).length}</strong>
        </article>
        <article>
          <span>진행 중</span>
          <strong>
            {attempts.filter((item) => item.status === "in_progress").length}
          </strong>
        </article>
        <article>
          <span>완료 기록</span>
          <strong>
            {attempts.filter((item) => item.status === "completed").length}
          </strong>
        </article>
      </section>

      <div className="institution-admin-grid">
        <section className="admin-question-section institution-list-panel">
          <header>
            <div>
              <small>INSTITUTIONS</small>
              <h3>기관 목록</h3>
            </div>
          </header>
          {loading ? (
            <p className="admin-empty">불러오는 중…</p>
          ) : institutions.length === 0 ? (
            <p className="admin-empty">등록된 기관이 없습니다.</p>
          ) : (
            institutions.map((institution) => (
              <article key={institution.id}>
                <span>
                  <strong>{institution.name}</strong>
                  <small>/{institution.slug}</small>
                </span>
                <i className={institution.active ? "active" : "inactive"}>
                  {institution.active ? "운영" : "중지"}
                </i>
                <button
                  type="button"
                  onClick={() => {
                    setEditingInstitution(institution)
                    setInstitutionFormOpen(true)
                  }}
                >
                  설정
                </button>
              </article>
            ))
          )}
        </section>

        <section className="admin-question-section campaign-list-panel">
          <header>
            <div>
              <small>DISTRIBUTION LINKS</small>
              <h3>배포 링크</h3>
            </div>
          </header>
          {campaigns.length === 0 ? (
            <p className="admin-empty">생성된 배포가 없습니다.</p>
          ) : (
            campaigns.map((campaign) => (
              <article key={campaign.id}>
                <span>
                  <small>{campaign.institutionName}</small>
                  <strong>{campaign.title}</strong>
                  <code>?campaign={campaign.publicToken}</code>
                </span>
                <i className={campaign.active ? "active" : "inactive"}>
                  {campaign.active ? "배포 중" : "중지"}
                </i>
                <div>
                  <button type="button" onClick={() => copyLink(campaign)}>
                    링크 복사
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCampaign(campaign)
                      setCampaignFormOpen(true)
                    }}
                  >
                    설정
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      <section className="admin-question-section attempt-admin-panel">
        <header>
          <div>
            <small>ATTEMPT CONTROL</small>
            <h3>응시 현황</h3>
          </div>
          <select
            value={attemptFilter}
            onChange={(event) =>
              setAttemptFilter(event.target.value as "all" | AttemptStatus)
            }
          >
            <option value="all">전체 상태</option>
            <option value="in_progress">진행 중</option>
            <option value="completed">완료</option>
            <option value="voided">무효</option>
          </select>
        </header>
        <div className="attempt-table">
          <div className="attempt-table-head" aria-hidden="true">
            <span>기관 / 참여자</span>
            <span>상태</span>
            <span>진행</span>
            <span>최근 접속</span>
            <span>예외 처리</span>
          </div>
          {visibleAttempts.length === 0 ? (
            <p className="admin-empty">표시할 응시 기록이 없습니다.</p>
          ) : (
            visibleAttempts.map((attempt) => (
              <article key={attempt.id}>
                <span>
                  <small>
                    {attempt.institutionName} · {attempt.campaignTitle}
                  </small>
                  <strong>{attempt.nickname}</strong>
                </span>
                <i className={attempt.status}>
                  {ATTEMPT_STATUS_LABEL[attempt.status]}
                </i>
                <b>
                  {attempt.verifiedScore}점 · {attempt.answeredCount}문항
                </b>
                <time dateTime={attempt.lastSeenAt}>
                  {new Date(attempt.lastSeenAt).toLocaleString("ko-KR")}
                </time>
                <div>
                  {attempt.status !== "in_progress" && (
                    <button
                      type="button"
                      onClick={() => changeAttempt(attempt, "resume")}
                    >
                      재개
                    </button>
                  )}
                  {attempt.status !== "voided" && (
                    <button
                      type="button"
                      onClick={() => changeAttempt(attempt, "void")}
                    >
                      무효
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => changeAttempt(attempt, "reset")}
                  >
                    초기화
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {institutionFormOpen && (
        <InstitutionForm
          institution={editingInstitution}
          onClose={() => setInstitutionFormOpen(false)}
          onSave={async (input) => {
            await saveInstitution(input)
            setInstitutionFormOpen(false)
            setNotice(
              input.id ? "기관 설정을 저장했습니다." : "기관을 추가했습니다.",
            )
            await refresh()
          }}
        />
      )}
      {campaignFormOpen && (
        <CampaignForm
          campaign={editingCampaign}
          institutions={institutions}
          onClose={() => setCampaignFormOpen(false)}
          onSave={async (input) => {
            await saveCampaign(input)
            setCampaignFormOpen(false)
            setNotice(
              input.id
                ? "배포 설정을 저장했습니다."
                : "배포 링크를 만들었습니다.",
            )
            await refresh()
          }}
        />
      )}
    </main>
  )
}

function InstitutionForm({
  institution,
  onSave,
  onClose,
}: {
  institution: Institution | null
  onSave: (input: {
    id?: string
    name: string
    slug: string
    active: boolean
  }) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(institution?.name ?? "")
  const [slug, setSlug] = useState(institution?.slug ?? "")
  const [active, setActive] = useState(institution?.active ?? true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) {
      setError("기관 식별자는 영문 소문자, 숫자, 하이픈으로 2~49자 입력하세요.")
      return
    }
    setSaving(true)
    try {
      await onSave({ id: institution?.id, name: name.trim(), slug, active })
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "저장하지 못했습니다.",
      )
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal">
      <form className="admin-editor compact-admin-form" onSubmit={submit}>
        <header>
          <div>
            <small>INSTITUTION</small>
            <h2>{institution ? "기관 설정" : "기관 추가"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <label>
          <span>기관명</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label>
          <span>기관 식별자</span>
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            placeholder="예: kisec-seoul"
            required
          />
        </label>
        <label className="admin-check-row">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span>운영 중</span>
        </label>
        {error && <p className="admin-form-error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button className="admin-primary" type="submit" disabled={saving}>
            저장
          </button>
        </footer>
      </form>
    </div>
  )
}

function CampaignForm({
  campaign,
  institutions,
  onSave,
  onClose,
}: {
  campaign: Campaign | null
  institutions: Institution[]
  onSave: (input: {
    id?: string
    institutionId: string
    institutionName?: string
    title: string
    active: boolean
    startsAt: string | null
    endsAt: string | null
    requiredQuestionCount: number
  }) => Promise<void>
  onClose: () => void
}) {
  const [institutionId, setInstitutionId] = useState(
    campaign?.institutionId ?? institutions[0]?.id ?? "",
  )
  const [title, setTitle] = useState(campaign?.title ?? "사이버보안 퀘스트")
  const [active, setActive] = useState(campaign?.active ?? true)
  const [startsAt, setStartsAt] = useState(
    toDateInput(campaign?.startsAt ?? null),
  )
  const [endsAt, setEndsAt] = useState(toDateInput(campaign?.endsAt ?? null))
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setError("종료 시각은 시작 시각보다 뒤여야 합니다.")
      return
    }
    setSaving(true)
    try {
      await onSave({
        id: campaign?.id,
        institutionId,
        institutionName: institutions.find((item) => item.id === institutionId)
          ?.name,
        title: title.trim(),
        active,
        startsAt: toIso(startsAt),
        endsAt: toIso(endsAt),
        requiredQuestionCount: 30,
      })
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "저장하지 못했습니다.",
      )
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal">
      <form className="admin-editor compact-admin-form" onSubmit={submit}>
        <header>
          <div>
            <small>DISTRIBUTION</small>
            <h2>{campaign ? "배포 설정" : "배포 링크 만들기"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <label>
          <span>기관</span>
          <select
            value={institutionId}
            onChange={(event) => setInstitutionId(event.target.value)}
          >
            {institutions.map((institution) => (
              <option value={institution.id} key={institution.id}>
                {institution.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>배포명</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <div className="admin-editor-grid">
          <label>
            <span>시작 일시 (선택)</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </label>
          <label>
            <span>종료 일시 (선택)</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </label>
        </div>
        <label className="admin-check-row">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span>배포 활성화</span>
        </label>
        {error && <p className="admin-form-error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button className="admin-primary" type="submit" disabled={saving}>
            저장
          </button>
        </footer>
      </form>
    </div>
  )
}
