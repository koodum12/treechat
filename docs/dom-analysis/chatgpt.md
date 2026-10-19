# chatgpt.com DOM 분석 (로그인 기준)

> 분석일: 2026-10-19 · 방법: 별도 프로필로 실행한 Chrome에 사용자가 직접 로그인한 뒤, CDP로 연결해 DOM과 계산된 스타일을 읽음
> 읽기 전용 분석이었음: 기존 대화 하나를 열고 메뉴를 열었다 닫기만 했고, 메시지는 보내지 않음.
> 대화 내용은 이 문서에 넣지 않았음.

## 1. 앱 셸

- `<html class="chatgpt-theme">`. 다크/라이트는 html 클래스로 구분되지 않고, `color-scheme`과 계산된 배경색으로만 구분됨
- 클래스는 Tailwind 유틸리티라 **선택자로 쓰지 않는다**. `data-*`, `aria-*`, `role`, `id`만 사용
- `aria-label`은 UI 언어를 따라 바뀜(한국어: "공유", "추가 액션"). **식별 기준으로 쓰지 않는다**. 대신 SVG 스프라이트 아이콘 이름(`use[href$="#…"]`)이 언어와 무관하게 유지됨

| 영역 | 선택자 | 관찰 내용 |
| --- | --- | --- |
| 사이드바 | `#app-shell-sidebar` | 폭 340px(`--codex-sidebar-preferred-width`) |
| 사이드바 대화 행 | `[data-sidebar-chatgpt-conversation-key="chatgpt:conversation:<id>"]` | `role="listitem"` |
| 대화 링크 | `a[data-interactive-row-link][href*="/c/<id>"]` | `aria-label` = 제목 |
| 현재 대화 | `[data-sidebar-cycle-item][aria-current="page"]` | |
| 메인 | `main[data-app-shell-main-surface]` | |
| 헤더 | `header[data-app-shell-titlebar]` › `[data-app-shell-main-titlebar]` | |
| 헤더 오른쪽 | `[data-app-shell-main-titlebar] [data-app-shell-header-obstacle]` (마지막 요소) | 공유 버튼, ⋯ 버튼 |
| 스크롤 영역 | `[data-app-action-timeline-scroll][role="region"]` | |
| 입력창 | `form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]` | `#prompt-textarea`는 없음 |

### URL

- 일반 대화: `/c/<uuid>`
- 프로젝트 대화: `/g/g-p-<hex>[-slug]/c/<uuid>`
- 새 채팅: `/`

## 2. 대화 / 메시지

```
[data-app-action-timeline-scroll]
 └ [data-thread-find-target="conversation"]
    └ div[data-turn-key="<user message id>"]          ← 턴 1개 = 사용자 질문 + 어시스턴트 답변
       └ div[data-content-search-turn-key]
          ├ div[role=separator] > time[datetime]
          └ div[data-talvt-turn-state="complete"]     ← 스트리밍이 끝나면 complete
             ├ [data-chatgpt-search-unit-key$=":user"]
             │   └ [data-user-message-bubble]          + 액션(복사/공유/편집)
             └ [data-chatgpt-search-unit-key$=":assistant"]
                 ├ h4[data-conversation-role="assistant"]
                 └ [data-chatgpt-selection-conversation-id][data-chatgpt-selection-message-id="<assistant id>"]
             └ 액션 바 div (복사, 응답 평가, 공유, …, 다시 생성, 추가 액션)
```

- 사용자 메시지 ID = `data-turn-key`
- 어시스턴트 메시지 ID = `data-chatgpt-selection-message-id`
- 대화 ID = `data-chatgpt-selection-conversation-id` (URL과 같은 값)

### 어시스턴트 액션 바

- 마지막 버튼: "추가 액션", `button[aria-haspopup="menu"]`이고 아이콘은 `#ellipsis-horizontal-light-16`
- 액션 바 = 그 버튼의 부모 요소
- 버튼 스타일: 32×32, radius 8px, 색 `rgb(93,93,93)`

## 3. 네이티브 분기 (확인함)

"추가 액션" 메뉴(Radix `[role="menu"]`) 구성:

1. 시간 표시 항목
2. 소스 보기
3. **대화 브랜치**: `[role="menuitem"][aria-haspopup="menu"]`, 아이콘 `#branch-light-16` → 하위 메뉴(`[role="menu"][aria-labelledby=<항목 id>]`)
   - "Work 모드로 분기"
   - **"새 채팅으로 브랜치"** ← TreeChat이 쓰는 항목

### 분기 관련 ChatGPT 동작 (직접 확인)

- "새 채팅으로 브랜치"는 저장되지 않은 임시 대화 `/c/local-chatgpt:<uuid>`를 연다. 제목은 "브랜치 · <원래 제목>". 첫 메시지를 보내야 `/c/<uuid>`로 저장된다
- 임시 분기는 새로고침하면 사라지고 `/`로 이동한다. 같은 페이지 세션 안에서는 뒤로 가기로 돌아갈 수 있다
- 한 번 분기하면, 새로고침 전까지 그 화면의 **모든 답변**에서 "대화 브랜치"가 비활성화된다(`aria-disabled="true"`, `data-disabled`). 분기를 저장한 뒤 돌아와도 마찬가지다. 저장된 분기 대화 안에서는 활성 상태다
- 임시 분기 화면에는 "추가 액션(⋯)"이 없어서, 저장 전 분기에서 다시 분기할 수 없다
- 이전에 본 화면이 숨겨진 채 DOM에 남아 있고, 분기 화면은 부모의 메시지를 **같은 메시지 ID로** 복사해 둔다. 메시지를 ID로 찾을 때는 보이는 사본(`checkVisibility()`)을 골라야 한다

메뉴 스타일: radius 16px, padding 10px, 배경 반투명 흰색(`/0.9`), 그림자 `0 0 0 .5px rgba(0,0,0,.1), 0 8px 16px -4px rgba(0,0,0,.12)`. 항목은 높이 36px, padding 6px 10px, radius 12px, 14px.

## 4. 스타일 값

| 항목 | Light | Dark (prefers-color-scheme 에뮬레이션) |
| --- | --- | --- |
| 페이지/사이드바 배경 | `rgb(252,252,252)` | `rgb(0,0,0)` |
| 본문 텍스트 | `rgb(13,13,13)` | `rgb(237,237,237)` |
| 보조 텍스트 | `rgb(93,93,93)` / 3차 `rgb(143,143,143)` | |
| 사이드바 행 | 36px · radius 8px · padding 6px 6px 6px 10px · 14px | |
| 행 hover / 현재 | `rgba(0,0,0,.05)` | |
| 헤더 버튼 | 36px · radius 8px · padding 0 12px · 14px | |
| 폰트 | `ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, …` | |

## 5. 로그아웃 셸(octane)은 별개

로그아웃 상태는 `li[data-message-role][id]`를 쓰는 완전히 다른 셸이다. 트리 기능은 저장된 대화(`/c/`)가 필요하므로 **로그인 앱만 지원한다**.

## 6. 구현에 반영한 결정

1. 선택자는 전부 `extension/src/providers/chatgpt/selectors.js` 한 곳에 둔다
2. 사용자가 ChatGPT 메뉴에서 직접 "새 채팅으로 브랜치"를 눌러도 트리에 기록한다(capture 단계 클릭 감지). 네이티브 UX를 그대로 둔다
3. 확장 프로그램이 ChatGPT DOM에 넣는 것은 두 가지뿐이다: 액션 바의 분기 버튼, 헤더의 트리 토글 버튼. 패널은 Shadow DOM 안에 둔다
4. 네이티브 분기 메뉴를 못 찾으면 실패를 그대로 알린다. 가짜 분기는 만들지 않는다

## 7. 재검증

UI가 바뀌었다고 의심되면, 로그인 상태에서 `docs/dom-analysis/probe-chatgpt.js`를 DevTools 콘솔에 붙여 넣으세요. 선택자별 매칭 개수를 출력합니다.
