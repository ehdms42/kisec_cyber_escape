import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

const EMPTY_DATABASE = {
  questions: [],
  documents: [],
  institutions: [],
  campaigns: [],
  attempts: [],
  prizeAwards: [],
}

function now() {
  return new Date().toISOString()
}

function toQuestion(row) {
  return {
    id: row.id,
    ordinal: row.ordinal,
    category: row.category,
    prompt: row.prompt,
    options: row.options,
    correctAnswer: row.correct_answer,
    explanation: row.explanation,
    sourceReference: row.source_reference,
    status: row.status,
    sourceDocumentId: row.source_document_id ?? null,
    answerDocumentId: row.answer_document_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toDocument(row) {
  return {
    id: row.id,
    originalName: row.original_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    status: row.status,
    extractedCount: row.extracted_count,
    extractionError: row.extraction_error,
    documentRole: row.document_role ?? null,
    pairId: row.pair_id ?? null,
    createdAt: row.created_at,
  }
}

function toInstitution(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    active: row.active,
    createdAt: row.created_at,
  }
}

function toCampaign(row) {
  const relation = row.institutions
  return {
    id: row.id,
    institutionId: row.institution_id,
    institutionName:
      relation?.name ?? row.institution_name ?? "알 수 없는 기관",
    title: row.title,
    publicToken: row.public_token,
    active: row.active,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    requiredQuestionCount: row.required_question_count,
    createdAt: row.created_at,
  }
}

function toAttempt(row) {
  const participant = row.participants
  const campaign = row.campaigns
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignTitle: campaign?.title ?? row.campaign_title ?? "배포 종료",
    institutionName:
      campaign?.institutions?.name ?? row.institution_name ?? "알 수 없는 기관",
    nickname: participant?.nickname ?? row.nickname ?? "알 수 없음",
    department: participant?.department ?? row.department ?? "",
    status: row.status,
    answeredCount: row.answered_count,
    verifiedScore: row.verified_score,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    completedAt: row.completed_at,
    adjustmentReason: row.adjustment_reason,
  }
}

function toRanking(row) {
  return {
    rank: Number(row.rank),
    attemptId: row.attempt_id,
    campaignId: row.campaign_id,
    campaignTitle: row.campaign_title,
    institutionName: row.institution_name,
    nickname: row.nickname,
    department: row.department ?? "",
    verifiedScore: row.verified_score,
    answeredCount: row.answered_count,
    elapsedSeconds: row.elapsed_seconds,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

function toPrizeAward(row) {
  const campaign = row.campaigns
  const attempt = row.game_attempts
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignTitle: campaign?.title ?? row.campaign_title ?? "배포 종료",
    institutionName:
      campaign?.institutions?.name ?? row.institution_name ?? "알 수 없는 기관",
    attemptId: row.attempt_id,
    nickname: attempt?.participants?.nickname ?? row.nickname ?? "알 수 없음",
    department: attempt?.participants?.department ?? row.department ?? "",
    status: row.status,
    note: row.note,
    selectedAt: row.selected_at,
    deliveredAt: row.delivered_at,
  }
}

function toQuestionRow(input, current = null) {
  const timestamp = now()
  return {
    id: current?.id ?? input.id ?? randomUUID(),
    ordinal: input.ordinal,
    category: input.category,
    prompt: input.prompt,
    options: input.options,
    correct_answer: input.correctAnswer,
    explanation: input.explanation,
    source_reference: input.sourceReference,
    status: input.status,
    source_document_id: input.sourceDocumentId ?? null,
    answer_document_id: input.answerDocumentId ?? null,
    created_at: current?.created_at ?? timestamp,
    updated_at: timestamp,
  }
}

function sanitizeFilename(filename) {
  const safe = path
    .basename(filename)
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
  return safe.slice(0, 160) || "document"
}

function documentMimeType(filename, fallback) {
  const extension = path.extname(filename).toLowerCase()
  if (extension === ".pdf") return "application/pdf"
  if (extension === ".hwp") return "application/vnd.hancom.hwp"
  if (extension === ".hwpx") return "application/vnd.hancom.hwpx"
  return fallback || "application/octet-stream"
}

function validateQuestion(input) {
  if (!Number.isInteger(input?.ordinal) || input.ordinal < 1)
    throw new Error("문제 번호를 확인해 주세요.")
  if (typeof input.category !== "string" || !input.category.trim())
    throw new Error("문제 분류를 입력해 주세요.")
  if (typeof input.prompt !== "string" || !input.prompt.trim())
    throw new Error("문제 내용을 입력해 주세요.")
  if (
    !Array.isArray(input.options) ||
    input.options.length < 2 ||
    input.options.length > 8
  )
    throw new Error("보기는 2개 이상 8개 이하로 입력해 주세요.")
  if (
    !Number.isInteger(input.correctAnswer) ||
    input.correctAnswer < 0 ||
    input.correctAnswer >= input.options.length
  ) {
    throw new Error("정답 번호를 확인해 주세요.")
  }
  if (
    !input.options.every(
      (option) => typeof option === "string" && option.trim(),
    )
  )
    throw new Error("빈 보기가 있습니다.")
  if (!["draft", "published"].includes(input.status))
    throw new Error("문제 상태를 확인해 주세요.")
}

export function createDataStore({ supabase, allowLocalData, dataDirectory }) {
  const databasePath = path.join(dataDirectory, "admin-data.json")
  const uploadDirectory = path.join(dataDirectory, "uploads")
  let writeQueue = Promise.resolve()

  async function readLocal() {
    try {
      return {
        ...structuredClone(EMPTY_DATABASE),
        ...JSON.parse(await readFile(databasePath, "utf8")),
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      return structuredClone(EMPTY_DATABASE)
    }
  }

  async function writeLocal(database) {
    await mkdir(dataDirectory, { recursive: true })
    const temporaryPath = `${databasePath}.${process.pid}.tmp`
    await writeFile(temporaryPath, JSON.stringify(database, null, 2), {
      mode: 0o600,
    })
    await rename(temporaryPath, databasePath)
  }

  async function mutateLocal(callback) {
    let result
    const operation = writeQueue
      .catch(() => undefined)
      .then(async () => {
        const database = await readLocal()
        result = await callback(database)
        await writeLocal(database)
      })
    writeQueue = operation.catch(() => undefined)
    await operation
    return result
  }

  function requireBackend() {
    if (!supabase && !allowLocalData) {
      const error = new Error("관리자 데이터 서버가 설정되지 않았습니다.")
      error.status = 503
      throw error
    }
  }

  return {
    async listQuestions() {
      requireBackend()
      if (!supabase) {
        const database = await readLocal()
        return database.questions
          .map(toQuestion)
          .sort((left, right) => left.ordinal - right.ordinal)
      }
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .order("ordinal", { ascending: true })
      if (error) throw error
      return data.map(toQuestion)
    },

    async saveQuestion(input, id = null) {
      requireBackend()
      validateQuestion(input)
      if (!supabase) {
        return mutateLocal((database) => {
          const currentIndex = id
            ? database.questions.findIndex((question) => question.id === id)
            : -1
          if (id && currentIndex < 0) {
            const error = new Error("수정할 문제를 찾을 수 없습니다.")
            error.status = 404
            throw error
          }
          if (
            database.questions.some(
              (question, index) =>
                index !== currentIndex && question.ordinal === input.ordinal,
            )
          ) {
            const error = new Error("이미 사용 중인 문제 번호입니다.")
            error.status = 409
            throw error
          }
          const row = toQuestionRow(
            input,
            currentIndex >= 0 ? database.questions[currentIndex] : null,
          )
          if (currentIndex >= 0) database.questions[currentIndex] = row
          else database.questions.push(row)
          return toQuestion(row)
        })
      }

      const payload = toQuestionRow(input)
      delete payload.id
      delete payload.created_at
      delete payload.updated_at
      const query = id
        ? supabase.from("questions").update(payload).eq("id", id)
        : supabase.from("questions").insert(payload)
      const { data, error } = await query.select("*").single()
      if (error) throw error
      return toQuestion(data)
    },

    async createQuestions(inputs) {
      requireBackend()
      if (!Array.isArray(inputs) || inputs.length > 100)
        throw new Error("한 번에 등록할 문제 수를 확인해 주세요.")
      inputs.forEach(validateQuestion)
      if (!supabase) {
        return mutateLocal((database) => {
          const ordinals = new Set(
            database.questions.map(({ ordinal }) => ordinal),
          )
          const created = inputs.map((input) => {
            if (ordinals.has(input.ordinal)) {
              const error = new Error(
                "이미 사용 중인 문제 번호가 포함되어 있습니다.",
              )
              error.status = 409
              throw error
            }
            ordinals.add(input.ordinal)
            const row = toQuestionRow(input)
            database.questions.push(row)
            return toQuestion(row)
          })
          return created
        })
      }
      if (inputs.length === 0) return []
      const payload = inputs.map((input) => {
        const row = toQuestionRow(input)
        delete row.id
        delete row.created_at
        delete row.updated_at
        return row
      })
      const { data, error } = await supabase
        .from("questions")
        .insert(payload)
        .select("*")
      if (error) throw error
      return data.map(toQuestion)
    },

    async deleteQuestion(id) {
      requireBackend()
      if (!supabase) {
        await mutateLocal((database) => {
          database.questions = database.questions.filter(
            (question) => question.id !== id,
          )
        })
        return
      }
      const { error } = await supabase.from("questions").delete().eq("id", id)
      if (error) throw error
    },

    async registerDocument(file, metadata) {
      requireBackend()
      const id = randomUUID()
      const safeName = sanitizeFilename(file.originalname)
      const storagePath = `server-admin/${id}/${safeName}`
      const mimeType = documentMimeType(file.originalname, file.mimetype)
      let row

      if (!supabase) {
        const directory = path.join(uploadDirectory, id)
        await mkdir(directory, { recursive: true })
        await writeFile(path.join(directory, safeName), file.buffer, {
          mode: 0o600,
        })
        row = {
          id,
          original_name: file.originalname,
          storage_path: storagePath,
          mime_type: mimeType,
          status: "processing",
          extracted_count: 0,
          extraction_error: null,
          document_role: metadata.role,
          pair_id: metadata.pairId,
          extracted_text: "",
          created_at: now(),
        }
        await mutateLocal((database) => database.documents.unshift(row))
        return toDocument(row)
      }

      const { error: uploadError } = await supabase.storage
        .from("question-documents")
        .upload(storagePath, file.buffer, {
          contentType: mimeType,
          upsert: false,
        })
      if (uploadError) throw uploadError
      const { data, error } = await supabase
        .from("question_documents")
        .insert({
          id,
          original_name: file.originalname,
          storage_path: storagePath,
          mime_type: mimeType,
          status: "processing",
          document_role: metadata.role,
          pair_id: metadata.pairId,
        })
        .select("*")
        .single()
      if (error) {
        await supabase.storage.from("question-documents").remove([storagePath])
        throw error
      }
      return toDocument(data)
    },

    async updateDocument(id, input) {
      requireBackend()
      const allowedStatus = ["processing", "review", "completed", "failed"]
      if (!allowedStatus.includes(input.status))
        throw new Error("문서 상태를 확인해 주세요.")
      if (!supabase) {
        await mutateLocal((database) => {
          const document = database.documents.find((item) => item.id === id)
          if (!document) {
            const error = new Error("문서를 찾을 수 없습니다.")
            error.status = 404
            throw error
          }
          Object.assign(document, {
            status: input.status,
            extracted_text: String(input.extractedText ?? "").slice(
              0,
              2_000_000,
            ),
            extracted_count: Number(input.extractedCount) || 0,
            extraction_error: input.extractionError ?? null,
          })
        })
        return
      }
      const { error } = await supabase
        .from("question_documents")
        .update({
          status: input.status,
          extracted_text: String(input.extractedText ?? "").slice(0, 2_000_000),
          extracted_count: Number(input.extractedCount) || 0,
          extraction_error: input.extractionError ?? null,
        })
        .eq("id", id)
      if (error) throw error
    },

    async listInstitutions() {
      requireBackend()
      if (!supabase) {
        const database = await readLocal()
        return database.institutions
          .map(toInstitution)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      }
      const { data, error } = await supabase
        .from("institutions")
        .select("id, name, slug, active, created_at")
        .order("created_at", { ascending: false })
      if (error) throw error
      return data.map(toInstitution)
    },

    async saveInstitution(input, id = null) {
      requireBackend()
      const name = String(input?.name ?? "")
        .trim()
        .slice(0, 80)
      const slug = String(input?.slug ?? "")
        .trim()
        .toLowerCase()
      if (!name) throw new Error("기관명을 입력해 주세요.")
      if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) {
        throw new Error(
          "기관 식별자는 영문 소문자, 숫자, 하이픈으로 입력해 주세요.",
        )
      }
      if (!supabase) {
        return mutateLocal((database) => {
          const index = id
            ? database.institutions.findIndex((item) => item.id === id)
            : -1
          if (id && index < 0) {
            const error = new Error("기관을 찾을 수 없습니다.")
            error.status = 404
            throw error
          }
          if (
            database.institutions.some(
              (item, itemIndex) => itemIndex !== index && item.slug === slug,
            )
          ) {
            const error = new Error("이미 사용 중인 기관 식별자입니다.")
            error.status = 409
            throw error
          }
          const row = {
            id: id ?? randomUUID(),
            name,
            slug,
            active: Boolean(input.active),
            created_at:
              index >= 0 ? database.institutions[index].created_at : now(),
          }
          if (index >= 0) database.institutions[index] = row
          else database.institutions.unshift(row)
          return toInstitution(row)
        })
      }
      const payload = { name, slug, active: Boolean(input.active) }
      const query = id
        ? supabase.from("institutions").update(payload).eq("id", id)
        : supabase.from("institutions").insert(payload)
      const { data, error } = await query.select("*").single()
      if (error) throw error
      return toInstitution(data)
    },

    async deleteInstitution(id) {
      requireBackend()
      if (!supabase) {
        await mutateLocal((database) => {
          if (database.campaigns.some((item) => item.institution_id === id)) {
            const error = new Error("배포가 연결된 기관은 삭제할 수 없습니다.")
            error.status = 409
            throw error
          }
          database.institutions = database.institutions.filter(
            (item) => item.id !== id,
          )
        })
        return
      }
      const { error } = await supabase
        .from("institutions")
        .delete()
        .eq("id", id)
      if (error) throw error
    },

    async listCampaigns() {
      requireBackend()
      if (!supabase) {
        const database = await readLocal()
        return database.campaigns
          .map((row) =>
            toCampaign({
              ...row,
              institutions: database.institutions.find(
                (item) => item.id === row.institution_id,
              ),
            }),
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      }
      const { data, error } = await supabase
        .from("campaigns")
        .select(
          "id, institution_id, title, public_token, active, starts_at, ends_at, required_question_count, created_at, institutions(name)",
        )
        .order("created_at", { ascending: false })
      if (error) throw error
      return data.map(toCampaign)
    },

    async saveCampaign(input, id = null) {
      requireBackend()
      const institutionId = String(input?.institutionId ?? "")
      const title = String(input?.title ?? "")
        .trim()
        .slice(0, 100)
      const requiredQuestionCount = Number(input?.requiredQuestionCount)
      if (!institutionId || !title) {
        throw new Error("기관과 배포명을 입력해 주세요.")
      }
      if (
        !Number.isInteger(requiredQuestionCount) ||
        requiredQuestionCount < 1
      ) {
        throw new Error("출제 문항 수를 확인해 주세요.")
      }
      const payload = {
        institution_id: institutionId,
        title,
        active: Boolean(input.active),
        starts_at: input.startsAt || null,
        ends_at: input.endsAt || null,
        required_question_count: requiredQuestionCount,
      }
      if (!supabase) {
        return mutateLocal((database) => {
          if (
            !database.institutions.some((item) => item.id === institutionId)
          ) {
            const error = new Error("기관을 찾을 수 없습니다.")
            error.status = 404
            throw error
          }
          const index = id
            ? database.campaigns.findIndex((item) => item.id === id)
            : -1
          if (id && index < 0) {
            const error = new Error("배포를 찾을 수 없습니다.")
            error.status = 404
            throw error
          }
          const current = index >= 0 ? database.campaigns[index] : null
          const row = {
            ...payload,
            id: id ?? randomUUID(),
            public_token:
              current?.public_token ??
              randomUUID().replaceAll("-", "").slice(0, 24),
            created_at: current?.created_at ?? now(),
          }
          if (index >= 0) database.campaigns[index] = row
          else database.campaigns.unshift(row)
          const institution = database.institutions.find(
            (item) => item.id === institutionId,
          )
          return toCampaign({ ...row, institutions: institution })
        })
      }
      const query = id
        ? supabase.from("campaigns").update(payload).eq("id", id)
        : supabase.from("campaigns").insert(payload)
      const { data, error } = await query
        .select(
          "id, institution_id, title, public_token, active, starts_at, ends_at, required_question_count, created_at, institutions(name)",
        )
        .single()
      if (error) throw error
      return toCampaign(data)
    },

    async deleteCampaign(id) {
      requireBackend()
      if (!supabase) {
        await mutateLocal((database) => {
          if (database.attempts.some((item) => item.campaign_id === id)) {
            const error = new Error(
              "응시 기록이 있는 배포는 삭제할 수 없습니다.",
            )
            error.status = 409
            throw error
          }
          database.campaigns = database.campaigns.filter(
            (item) => item.id !== id,
          )
        })
        return
      }
      const { error } = await supabase.from("campaigns").delete().eq("id", id)
      if (error) throw error
    },

    async listAttempts() {
      requireBackend()
      if (!supabase) {
        const database = await readLocal()
        return database.attempts
          .map(toAttempt)
          .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      }
      const { data, error } = await supabase
        .from("game_attempts")
        .select(
          "id, campaign_id, status, answered_count, verified_score, started_at, last_seen_at, completed_at, adjustment_reason, participants(nickname, department), campaigns(title, institutions(name))",
        )
        .order("started_at", { ascending: false })
        .limit(500)
      if (error) throw error
      return data.map(toAttempt)
    },

    async adjustAttempt(id, input) {
      requireBackend()
      const action = String(input?.action ?? "")
      const reason = String(input?.reason ?? "")
        .trim()
        .slice(0, 500)
      if (!["resume", "void", "reset"].includes(action)) {
        throw new Error("응시 기록 조정 방법을 확인해 주세요.")
      }
      if (reason.length < 3) throw new Error("조정 사유를 입력해 주세요.")
      if (!supabase) {
        await mutateLocal((database) => {
          const attempt = database.attempts.find((item) => item.id === id)
          if (!attempt) {
            const error = new Error("응시 기록을 찾을 수 없습니다.")
            error.status = 404
            throw error
          }
          attempt.status = action === "void" ? "voided" : "in_progress"
          attempt.adjustment_reason = reason
          if (action !== "void") attempt.completed_at = null
          if (action === "reset") {
            attempt.answered_count = 0
            attempt.verified_score = 0
            attempt.started_at = now()
            attempt.last_seen_at = attempt.started_at
          }
        })
        return
      }
      const { error } = await supabase.rpc("admin_adjust_attempt", {
        p_attempt_id: id,
        p_action: action,
        p_reason: reason,
      })
      if (error) throw error
    },

    async listRankings(campaignId = null) {
      requireBackend()
      if (!supabase) {
        const database = await readLocal()
        const groups = new Map()
        for (const attempt of database.attempts.filter(
          (item) =>
            item.status === "completed" &&
            item.completed_at &&
            (!campaignId || item.campaign_id === campaignId),
        )) {
          const entries = groups.get(attempt.campaign_id) ?? []
          entries.push(attempt)
          groups.set(attempt.campaign_id, entries)
        }
        return [...groups.values()].flatMap((entries) =>
          entries
            .sort(
              (left, right) =>
                right.verified_score - left.verified_score ||
                new Date(left.completed_at).getTime() -
                  new Date(left.started_at).getTime() -
                  (new Date(right.completed_at).getTime() -
                    new Date(right.started_at).getTime()) ||
                left.completed_at.localeCompare(right.completed_at),
            )
            .map((attempt, index) =>
              toRanking({
                ...attempt,
                rank: index + 1,
                attempt_id: attempt.id,
                campaign_title: attempt.campaign_title,
                institution_name: attempt.institution_name,
                elapsed_seconds: Math.max(
                  0,
                  Math.floor(
                    (new Date(attempt.completed_at).getTime() -
                      new Date(attempt.started_at).getTime()) /
                      1000,
                  ),
                ),
              }),
            ),
        )
      }
      const { data, error } = await supabase.rpc("admin_get_rankings", {
        p_campaign_id: campaignId,
      })
      if (error) throw error
      return data.map(toRanking)
    },

    async listPrizeAwards() {
      requireBackend()
      if (!supabase) {
        const database = await readLocal()
        return database.prizeAwards.map(toPrizeAward)
      }
      const { data, error } = await supabase
        .from("prize_awards")
        .select(
          "id, campaign_id, attempt_id, status, note, selected_at, delivered_at, campaigns(title, institutions(name)), game_attempts(participants(nickname, department))",
        )
        .order("selected_at", { ascending: false })
      if (error) throw error
      return data.map(toPrizeAward)
    },

    async selectCampaignWinner(campaignId) {
      requireBackend()
      if (!supabase) {
        const rankings = await this.listRankings(campaignId)
        const winner = rankings[0]
        if (!winner)
          throw new Error("완료한 참여자가 없어 1위를 선정할 수 없습니다.")
        return mutateLocal((database) => {
          const current = database.prizeAwards.find(
            (item) => item.campaign_id === campaignId,
          )
          const row = {
            id: current?.id ?? randomUUID(),
            campaign_id: campaignId,
            campaign_title: winner.campaignTitle,
            institution_name: winner.institutionName,
            attempt_id: winner.attemptId,
            nickname: winner.nickname,
            department: winner.department,
            status: "selected",
            note: current?.note ?? "",
            selected_at: now(),
            delivered_at: null,
          }
          database.prizeAwards = [
            row,
            ...database.prizeAwards.filter(
              (item) => item.campaign_id !== campaignId,
            ),
          ]
          return toPrizeAward(row)
        })
      }
      const { error } = await supabase.rpc("select_campaign_winner", {
        p_campaign_id: campaignId,
      })
      if (error) throw error
      const awards = await this.listPrizeAwards()
      return awards.find((award) => award.campaignId === campaignId) ?? null
    },

    async updatePrizeAward(campaignId, input) {
      requireBackend()
      const status = String(input?.status ?? "")
      const note = String(input?.note ?? "")
        .trim()
        .slice(0, 1000)
      if (!["selected", "notified", "delivered"].includes(status)) {
        throw new Error("상품 지급 상태를 확인해 주세요.")
      }
      if (!supabase) {
        await mutateLocal((database) => {
          const award = database.prizeAwards.find(
            (item) => item.campaign_id === campaignId,
          )
          if (!award) {
            const error = new Error("먼저 1위를 선정해 주세요.")
            error.status = 404
            throw error
          }
          award.status = status
          award.note = note
          award.delivered_at = status === "delivered" ? now() : null
        })
        return
      }
      const { error } = await supabase.rpc("update_prize_award", {
        p_campaign_id: campaignId,
        p_status: status,
        p_note: note,
      })
      if (error) throw error
    },
  }
}
