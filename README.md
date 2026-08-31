# KISEC Cyber Escape

사이버보안 실태평가 문제를 방탈출 형식으로 풀어보는 모바일 웹 게임입니다.

## 실행

```bash
pnpm install
pnpm dev
```

## 품질 검사

```bash
pnpm check
```

## 관리자 화면

관리자 화면은 `/admin`에서 확인할 수 있습니다. 로컬에서 서버 연결 전 UI만 확인할 때는
`.env.example`을 참고해 `VITE_ADMIN_DEMO_MODE=true`를 설정합니다. 데모 모드는 개발 빌드에서만
동작하며 브라우저 저장소를 사용합니다.

실제 운영 환경에서는 Supabase 프로젝트를 연결해야 합니다.

```bash
cp .env.example .env.local
```

1. Supabase SQL Editor에서 `supabase/migrations/202608310001_admin_questions.sql`을 실행합니다.
2. Authentication에서 관리자 사용자를 생성합니다.
3. 생성한 사용자의 UUID를 관리자 목록에 등록합니다.

```sql
insert into public.admin_profiles (user_id, display_name)
values ('관리자 사용자 UUID', '관리자');
```

문제지 원문은 private Storage 버킷에 저장되고, 관리자 계정만 조회할 수 있습니다. PDF는
텍스트가 포함된 문서를 지원하며 스캔 PDF는 업로드 전에 OCR 처리가 필요합니다. HWP와 HWPX는
브라우저에서 텍스트를 추출합니다. 자동 추출 결과는 즉시 공개되지 않고 항상 `초안`으로 저장되므로
관리자가 문제·보기·정답을 확인한 뒤 공개해야 합니다.

## 구조

- `src/screens`: 화면 단위 컴포넌트
- `src/components`: 여러 화면에서 재사용할 수 있는 UI
- `src/game`: 게임 규칙, 설정, 질문 파싱 로직
- `src/data`: 보안 문제 데이터
- `src/admin`: 관리자 데이터 모델, 문서 추출, 저장소 접근 로직
- `public`: 앱에서 실제 사용하는 이미지와 아이콘
