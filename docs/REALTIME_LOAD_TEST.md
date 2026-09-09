# 실시간 순위 부하 테스트

이 스크립트는 실제 참가자와 답안 기록을 생성하므로 반드시 **테스트 전용 기관·배포**에서만 실행한다. 운영 배포 토큰을 사용하지 않는다.

## 사전 준비

1. Supabase에 최신 마이그레이션까지 적용한다.
2. 관리자 화면에서 부하 테스트 전용 기관과 배포를 만든다.
3. 공개 문제를 30개 준비한다.
4. 배포 링크의 `campaign` 값을 테스트 토큰으로 사용한다.

## 실행

```bash
LOAD_TEST_SUPABASE_URL="https://프로젝트.supabase.co" \
LOAD_TEST_SUPABASE_KEY="게시가능키" \
LOAD_TEST_CAMPAIGN_TOKEN="테스트전용배포토큰" \
LOAD_TEST_USERS=10 \
LOAD_TEST_ANSWERS=3 \
LOAD_TEST_CONFIRM=I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED \
npm run load-test:realtime
```

10명부터 시작해 20명, 30명 순으로 늘린다. 요청 실패가 0건인지, p95 응답 시간이 1초 안쪽인지, 기대한 실시간 이벤트가 수신되는지를 확인한다. Supabase 대시보드의 `Reports`에서 DB CPU·메모리·연결 수를, 조직의 `Usage`에서 실시간 연결과 메시지를 함께 확인한다.

무료 플랜은 실시간 연결 200개와 초당 메시지 100개의 제한이 있으므로 30명 이상을 시험할 때는 짧은 시간에 답안을 동시에 제출하지 않도록 단계적으로 높인다. 실제 행사 전에는 행사와 동일한 네트워크, 문제 수, 참가 속도로 한 번 더 측정한다.
