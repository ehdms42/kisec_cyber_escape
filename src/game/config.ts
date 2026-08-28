export const QUIZ_LENGTH = 30
export const DOOR_CODE = [7, 2, 9, 4] as const
export const COINS_PER_CORRECT_ANSWER = 10

export type PuzzleId = "console" | "patch" | "backup" | "ups"
export type GamePhase = "room" | "quiz" | "reveal" | "keypad"

export interface Puzzle {
  id: PuzzleId
  title: string
  shortTitle: string
  clue: string
  questions: readonly number[]
  digit: typeof DOOR_CODE[number]
  closeImage: string
  solvedImage: string
  hotspot: {
    left: string
    top: string
  }
  outline: {
    left: string
    top: string
    width: string
    height: string
    clipPath: string
  }
  tracePath: string
}

export const PUZZLES: readonly Puzzle[] = [
  {
    id: "console",
    title: "관리자 콘솔",
    shortTitle: "관리 콘솔",
    clue: "콘솔 인증이 완료되자\n첫 번째 코드 숫자가 나타났다.",
    questions: [0, 1, 2, 3, 4, 5, 6, 7],
    digit: DOOR_CODE[0],
    closeImage: "/server-console-v2-close.jpg",
    solvedImage: "/server-console-v2-solved.jpg",
    hotspot: { left: "10.2%", top: "50%" },
    outline: {
      left: "1.2%",
      top: "36.5%",
      width: "18%",
      height: "27%",
      clipPath:
        "polygon(9% 0, 87% 2%, 96% 10%, 100% 75%, 94% 90%, 72% 100%, 13% 96%, 4% 86%, 0 17%)",
    },
    tracePath:
      "M 48 327 L 64 326 L 75 331 L 80 337 L 238 348 L 250 350 L 260 356 L 265 366 L 285 507 L 283 524 L 275 540 L 294 549 L 322 558 L 348 565 L 368 570 L 378 575 L 372 582 L 361 587 L 176 625 L 162 626 L 147 622 L 101 613 L 94 609 L 91 602 L 93 590 L 96 580 L 68 575 L 56 568 L 48 558 L 43 547 L 38 530 L 18 377 L 15 360 L 21 344 L 34 332 Z",
  },
  {
    id: "patch",
    title: "네트워크 패치 패널",
    shortTitle: "패치 패널",
    clue: "정상 포트가 연결되며\n두 번째 코드 숫자가 전송됐다.",
    questions: [8, 9, 10, 11, 12, 13, 14],
    digit: DOOR_CODE[1],
    closeImage: "/server-patch-v2-close.jpg",
    solvedImage: "/server-patch-v2-solved.jpg",
    hotspot: { left: "27.7%", top: "38.45%" },
    outline: {
      left: "18.3%",
      top: "18.2%",
      width: "18.8%",
      height: "40.5%",
      clipPath:
        "polygon(3% 0, 94% 0, 100% 5%, 100% 94%, 96% 100%, 4% 100%, 0 95%, 0 5%)",
    },
    tracePath:
      "M 305 165 L 565 165 Q 583 165 585 182 L 585 509 Q 585 526 568 529 L 309 529 Q 292 527 292 511 L 292 183 Q 292 167 305 165 Z",
  },
  {
    id: "backup",
    title: "백업 테이프 장치",
    shortTitle: "백업 장치",
    clue: "백업 카트리지에서\n세 번째 코드 숫자를 확인했다.",
    questions: [15, 16, 17, 18, 19, 20, 21, 22],
    digit: DOOR_CODE[2],
    closeImage: "/server-backup-v2-close.jpg",
    solvedImage: "/server-backup-v2-solved.jpg",
    hotspot: { left: "73.5%", top: "53.05%" },
    outline: {
      left: "65.8%",
      top: "21.3%",
      width: "15.4%",
      height: "63.5%",
      clipPath:
        "polygon(7% 0, 94% 0, 100% 5%, 100% 98%, 96% 100%, 5% 100%, 0 96%, 0 5%)",
    },
    tracePath:
      "M 1078 193 L 1279 193 Q 1296 194 1298 210 L 1298 742 Q 1297 759 1280 761 L 1073 761 Q 1057 759 1056 742 L 1056 213 Q 1057 198 1078 193 Z",
  },
  {
    id: "ups",
    title: "UPS 제어반",
    shortTitle: "UPS 제어반",
    clue: "점검 모듈이 열리며\n마지막 코드 숫자가 표시됐다.",
    questions: [23, 24, 25, 26, 27, 28, 29],
    digit: DOOR_CODE[3],
    closeImage: "/server-ups-v2-close.jpg",
    solvedImage: "/server-ups-v2-solved.jpg",
    hotspot: { left: "93.5%", top: "57.5%" },
    outline: {
      left: "85.8%",
      top: "29.6%",
      width: "13.2%",
      height: "55.8%",
      clipPath:
        "polygon(5% 0, 95% 0, 100% 4%, 100% 97%, 96% 100%, 4% 100%, 0 97%, 0 4%)",
    },
    tracePath:
      "M 1392 268 L 1566 268 Q 1581 269 1583 284 L 1583 747 Q 1582 764 1565 766 L 1390 766 Q 1377 764 1376 749 L 1376 284 Q 1378 270 1392 268 Z",
  },
]

export const ROOM_STAGES = [
  "/server-room-v2-main.jpg",
  "/server-room-v2-stage1.jpg",
  "/server-room-v2-stage2.jpg",
  "/server-room-v2-stage3.jpg",
  "/server-room-v2-stage4.jpg",
] as const

interface PrologueLine {
  scene: 0 | 1 | 2 | 3
  speaker: "player" | "보안 시스템"
  text: string
  state?: "input" | "denied" | "booting" | "briefing"
}

export const PROLOGUE: readonly PrologueLine[] = [
  { scene: 0, speaker: "player", text: "……으음. 눈이 잘 떠지지 않아." },
  {
    scene: 0,
    speaker: "player",
    text: "차가운 바닥, 서버 돌아가는 소리… 여긴 어디지?",
  },
  {
    scene: 1,
    speaker: "player",
    text: "저 앞에 문이 있다. 그런데 키패드에 네 자리 코드를 입력해야 열리는 것 같은데..",
  },
  {
    scene: 3,
    speaker: "player",
    text: "가까이 가서 확인해 보자. 일단 아무 번호나 눌러보면…!",
    state: "input",
  },
  {
    scene: 3,
    speaker: "보안 시스템",
    text: "비밀번호가 일치하지 않습니다. 접근이 거부되었습니다.",
    state: "denied",
  },
  {
    scene: 2,
    speaker: "player",
    text: "옆의 단말기가 켜졌어. 화면에 뭔가 떠 있는데…",
    state: "booting",
  },
  {
    scene: 2,
    speaker: "player",
    text: "보안 문제의 정답을 모으면 탈출 코드 숫자를 얻을 수 있다는 것 같아.",
    state: "briefing",
  },
  {
    scene: 2,
    speaker: "player",
    text: "좋아. 문제를 풀고 네 자리 코드를 완성해서 이 방을 탈출해야겠어!",
  },
]
