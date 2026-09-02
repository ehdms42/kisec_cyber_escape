export type AdminIconName = "questions" | "institutions" | "ranking" | "game" | "logout" | "upload" | "plus" | "sync" | "edit" | "delete" | "campaign" | "download" | "award"

export default function AdminIcon({ name }: { name: AdminIconName }) {
  return (
    <svg className="admin-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === "questions" && (
        <>
          <path d="M6 3.5h9l3 3V20H6zM15 3.5V7h3M9 11h6M9 15h6" />
        </>
      )}
      {name === "institutions" && (
        <>
          <path d="M4 20h16M6 20V8h12v12M9 11h2M13 11h2M9 15h2M13 15h2M9 8V5h6v3" />
        </>
      )}
      {name === "ranking" && (
        <>
          <path d="M8 4h8v3.5a4 4 0 0 1-8 0zM8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11M12 12v4M8.5 20h7M10 16h4v4" />
        </>
      )}
      {name === "game" && (
        <>
          <path d="M7.5 7h9a4 4 0 0 1 3.8 5.2l-1.2 3.7a2.3 2.3 0 0 1-3.8 1l-1.2-1.2H9.9l-1.2 1.2a2.3 2.3 0 0 1-3.8-1l-1.2-3.7A4 4 0 0 1 7.5 7Z" />
          <path d="M8 10v4M6 12h4M15.5 11.2h.01M17.5 13h.01" />
        </>
      )}
      {name === "logout" && (
        <path d="M10 5H5.8A1.8 1.8 0 0 0 4 6.8v10.4A1.8 1.8 0 0 0 5.8 19H10M14.5 8l4 4-4 4M9 12h9" />
      )}
      {name === "upload" && <path d="M12 15V4M8 8l4-4 4 4M5 14v5h14v-5" />}
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
      {name === "sync" && (
        <path d="M19 8a7 7 0 0 0-12-2L5 8M5 4v4h4M5 16a7 7 0 0 0 12 2l2-2M19 20v-4h-4" />
      )}
      {name === "edit" && (
        <path d="m14.5 5.5 4 4M5 19l1-4 9.5-9.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L9 18z" />
      )}
      {name === "delete" && (
        <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
      )}
      {name === "campaign" && (
        <path d="M9.5 14.5 7 17a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0M14.5 9.5 17 7a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0M8.5 15.5l7-7" />
      )}
      {name === "download" && <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />}
      {name === "award" && (
        <path d="m8 3 4 7 4-7M9 9l-1 4 4 2 4-2-1-4M12 15v5M8.5 20h7" />
      )}
    </svg>
  )
}
