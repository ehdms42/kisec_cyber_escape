import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react"

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: "default" | "danger"
}

interface PromptOptions {
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  minLength?: number
  readOnly?: boolean
}

interface AdminDialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  prompt: (options: PromptOptions) => Promise<string | null>
}

interface ConfirmRequest {
  kind: "confirm"
  options: ConfirmOptions
}

interface PromptRequest {
  kind: "prompt"
  options: PromptOptions
}

type DialogRequest = ConfirmRequest | PromptRequest

const AdminDialogContext = createContext<AdminDialogContextValue | null>(null)

export function useAdminDialog(): AdminDialogContextValue {
  const context = useContext(AdminDialogContext)
  if (!context) {
    throw new Error(
      "useAdminDialog은 AdminDialogProvider 내부에서만 사용할 수 있습니다.",
    )
  }
  return context
}

export default function AdminDialogProvider({
  children,
}: {
  children: ReactNode
}) {
  const [request, setRequest] = useState<DialogRequest | null>(null)
  const resolverRef = useRef<((value: boolean | string | null) => void) | null>(
    null,
  )

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = (value) => resolve(Boolean(value))
      setRequest({ kind: "confirm", options })
    })
  }, [])

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = (value) =>
        resolve(typeof value === "string" ? value : null)
      setRequest({ kind: "prompt", options })
    })
  }, [])

  const settle = useCallback((value: boolean | string | null) => {
    resolverRef.current?.(value as never)
    resolverRef.current = null
    setRequest(null)
  }, [])

  return (
    <AdminDialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {request && <AdminDialogModal request={request} onSettle={settle} />}
    </AdminDialogContext.Provider>
  )
}

function AdminDialogModal({
  request,
  onSettle,
}: {
  request: DialogRequest
  onSettle: (value: boolean | string | null) => void
}) {
  const isPrompt = request.kind === "prompt"
  const options = request.options
  const [value, setValue] = useState(
    isPrompt ? ((options as PromptOptions).defaultValue ?? "") : "",
  )
  const confirmLabel = options.confirmLabel ?? "확인"
  const cancelLabel = options.cancelLabel ?? "취소"
  const danger =
    request.kind === "confirm" && (options as ConfirmOptions).tone === "danger"
  const minLength = isPrompt ? ((options as PromptOptions).minLength ?? 0) : 0
  const trimmed = value.trim()
  const canConfirm = !isPrompt || trimmed.length >= minLength
  const cancelValue = isPrompt ? null : false

  const submit = () => {
    if (!canConfirm) return
    onSettle(isPrompt ? trimmed : true)
  }

  return (
    <div
      className="admin-modal"
      role="presentation"
      onMouseDown={() => onSettle(cancelValue)}
    >
      <div
        className="admin-dialog"
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{options.title}</h2>
        {options.message && <p>{options.message}</p>}
        {isPrompt && (
          <input
            autoFocus
            value={value}
            readOnly={(options as PromptOptions).readOnly}
            placeholder={(options as PromptOptions).placeholder}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit()
            }}
            onFocus={(event) => {
              if ((options as PromptOptions).readOnly) event.target.select()
            }}
          />
        )}
        <div className="admin-dialog-actions">
          <button
            type="button"
            className="admin-dialog-cancel"
            onClick={() => onSettle(cancelValue)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus={!isPrompt}
            className={`admin-dialog-confirm ${danger ? "is-danger" : ""}`}
            disabled={!canConfirm}
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
