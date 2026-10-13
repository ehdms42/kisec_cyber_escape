import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
  createAdminAccount,
  listAdminAccounts,
  updateAdminAccount,
  type AdminAccount,
} from "../../admin/accountRepository"
import type { AdminRole } from "../../admin/serverApi"

interface RoleOption {
  value: AdminRole
  label: string
}

const ROLE_OPTIONS: RoleOption[] = [
  { value: "super", label: "최고 관리자" },
  { value: "content", label: "콘텐츠 관리자" },
  { value: "operations", label: "운영 관리자" },
  { value: "viewer", label: "조회 관리자" },
]

const ROLE_LABEL: Record<AdminRole, string> = {
  super: "최고",
  content: "콘텐츠",
  operations: "운영",
  viewer: "조회",
}

export default function AccountManagement() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<AdminAccount | null>(
    null,
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setAccounts(await listAdminAccounts())
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "관리자 계정을 불러오지 못했습니다.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => void refresh(), [refresh])

  const toggleActive = async (account: AdminAccount) => {
    try {
      await updateAdminAccount(account.id, { active: !account.active })
      setNotice(
        account.active
          ? `${account.displayName} 계정을 비활성화했습니다.`
          : `${account.displayName} 계정을 다시 활성화했습니다.`,
      )
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "계정을 변경하지 못했습니다.",
      )
    }
  }

  return (
    <main className="admin-content">
      <section className="admin-page-heading">
        <div>
          <h2>관리자 계정</h2>
          <p>
            역할(최고/콘텐츠/운영/조회)에 따라 접근 권한이 자동으로 제한됩니다.
          </p>
        </div>
        <div>
          <button
            className="admin-primary"
            type="button"
            onClick={() => {
              setEditingAccount(null)
              setFormOpen(true)
            }}
          >
            관리자 추가
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

      <section className="admin-question-section institution-list-panel">
        <header>
          <div>
            <h3>계정 목록</h3>
          </div>
        </header>
        {loading ? (
          <p className="admin-empty">불러오는 중…</p>
        ) : accounts.length === 0 ? (
          <p className="admin-empty">추가 관리자 계정이 없습니다.</p>
        ) : (
          accounts.map((account) => (
            <article key={account.id}>
              <span>
                <strong>{account.displayName}</strong>
                <small>
                  @{account.loginId} ·{" "}
                  {account.roles.map((role) => ROLE_LABEL[role]).join(", ")}
                </small>
              </span>
              <i className={account.active ? "active" : "inactive"}>
                {account.active ? "활성" : "비활성"}
              </i>
              <button
                type="button"
                onClick={() => {
                  setEditingAccount(account)
                  setFormOpen(true)
                }}
              >
                설정
              </button>
              <button type="button" onClick={() => toggleActive(account)}>
                {account.active ? "비활성화" : "활성화"}
              </button>
            </article>
          ))
        )}
      </section>

      {formOpen && (
        <AccountForm
          account={editingAccount}
          onClose={() => setFormOpen(false)}
          onSave={async (input) => {
            if (editingAccount) {
              await updateAdminAccount(editingAccount.id, input)
              setNotice("관리자 계정을 수정했습니다.")
            } else {
              await createAdminAccount({
                loginId: input.loginId!,
                displayName: input.displayName ?? "",
                roles: input.roles ?? [],
                password: input.password ?? "",
              })
              setNotice("관리자 계정을 추가했습니다.")
            }
            setFormOpen(false)
            await refresh()
          }}
        />
      )}
    </main>
  )
}

function AccountForm({
  account,
  onSave,
  onClose,
}: {
  account: AdminAccount | null
  onSave: (input: {
    loginId?: string
    displayName?: string
    roles?: AdminRole[]
    password?: string
  }) => Promise<void>
  onClose: () => void
}) {
  const [loginId, setLoginId] = useState(account?.loginId ?? "")
  const [displayName, setDisplayName] = useState(account?.displayName ?? "")
  const [roles, setRoles] = useState<AdminRole[]>(account?.roles ?? ["viewer"])
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const toggleRole = (role: AdminRole) => {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!account && loginId.trim().length < 3) {
      setError("관리자 아이디를 3자 이상 입력해 주세요.")
      return
    }
    if (!displayName.trim()) {
      setError("관리자 이름을 입력해 주세요.")
      return
    }
    if (roles.length === 0) {
      setError("권한을 하나 이상 선택해 주세요.")
      return
    }
    if (!account && password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.")
      return
    }
    if (account && password && password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.")
      return
    }
    setSaving(true)
    try {
      await onSave({
        loginId: account ? undefined : loginId.trim(),
        displayName: displayName.trim(),
        roles,
        password: password || undefined,
      })
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "저장하지 못했습니다.",
      )
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal" role="presentation" onMouseDown={onClose}>
      <form
        className="admin-editor compact-admin-form"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>{account ? "관리자 설정" : "관리자 추가"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <label>
          <span>관리자 아이디</span>
          <input
            value={loginId}
            disabled={Boolean(account)}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="로그인에 사용할 아이디"
            required
          />
        </label>
        <label>
          <span>이름</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </label>
        <fieldset className="admin-option-editor">
          <legend>권한 (복수 선택 가능)</legend>
          {ROLE_OPTIONS.map((option) => (
            <label className="admin-check-row" key={option.value}>
              <input
                type="checkbox"
                checked={roles.includes(option.value)}
                onChange={() => toggleRole(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
        <label>
          <span>{account ? "비밀번호 재설정 (선택)" : "비밀번호"}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={account ? "변경하지 않으려면 비워두세요" : ""}
          />
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
