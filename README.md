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

## 구조

- `src/screens`: 화면 단위 컴포넌트
- `src/components`: 여러 화면에서 재사용할 수 있는 UI
- `src/game`: 게임 규칙, 설정, 질문 파싱 로직
- `src/data`: 보안 문제 데이터
- `public`: 앱에서 실제 사용하는 이미지와 아이콘
