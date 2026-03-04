#!/usr/bin/env bash
# Bun 1.2.19 + LanceDB 크래시 워크어라운드
# 테스트는 통과하지만 프로세스 종료 시 C++ exception 발생 (Bun 버그)
# 출력에서 pass/fail 카운트를 확인하여 실제 결과 판단

output=$(bun test "$@" 2>&1)
echo "$output"

if echo "$output" | grep -qE "^[[:space:]]+[0-9]+ pass" && \
   ! echo "$output" | grep -qE "^[[:space:]]+[1-9][0-9]* fail"; then
  exit 0
else
  exit 1
fi
