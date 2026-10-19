# TreeChat

ChatGPT(chatgpt.com) 대화를 트리로 분기하고 정리하는 크롬 확장 프로그램(Manifest V3)입니다.
ChatGPT 화면은 그대로 두고, 필요한 버튼 두 개와 오른쪽 패널만 추가합니다.

## 설치 (개발 모드)

1. Chrome에서 `chrome://extensions` 열기
2. 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** → 이 저장소의 `extension/` 폴더 선택
4. chatgpt.com에 로그인한 상태로 대화 하나 열기

빌드 단계는 없습니다. 파일을 고친 뒤 `chrome://extensions`에서 새로고침(↻)하고 ChatGPT 탭도 새로고침하면 반영됩니다.

## 사용법

| 동작 | 방법 |
| --- | --- |
| 트리 패널 열기/닫기 | 헤더의 트리 아이콘(공유 버튼 왼쪽), 또는 툴바의 TreeChat 아이콘 |
| 분기 만들기 | 답변 액션 바 끝의 분기 아이콘 → ChatGPT의 분기 메뉴가 열림 → `Work 모드로 분기` / `새 채팅으로 브랜치` 중 선택 |
| ChatGPT 메뉴로 분기해도 기록됨 | `⋯ → 대화 브랜치`에서 직접 골라도 같은 방식으로 트리에 연결됩니다 |
| 정렬 | 패널 헤더의 ⇅ 버튼 → 기준(최근 사용순 / 생성순 / 이름순)과 순서 선택. 모든 단계에 적용되고 기억됩니다 |
| 패널 너비 | 패널 왼쪽 가장자리 드래그(260–720px). 더블클릭하면 기본 너비, 포커스 후 ←/→로도 조절. 기억됩니다 |
| 대화 열기 | 트리 노드 클릭 또는 Enter |
| 분기 지점으로 이동 | 노드 `⋯` → 분기 지점으로 이동 (부모 대화의 해당 답변으로 스크롤) |
| 정리 | 드래그 앤 드롭으로 다른 노드 아래로 이동, `⋯` → 이름 변경 / 최상위로 이동 / 트리에서 제거 |
| 검색 | 패널 상단 검색창. 제목과 분기 지점 문구를 찾고, 상위 노드는 펼쳐서 보여 줍니다 |
| 키보드 | ↑↓ 이동, ←→ 접기/펼치기, Enter 열기, F2 이름 변경, Esc 닫기 |

**분기 동작 방식:** ChatGPT의 분기는 첫 메시지를 보내기 전까지 저장되지 않는 임시 대화(`/c/local-chatgpt:…`)입니다.
TreeChat은 이것을 "저장 전" 노드로 바로 연결하고, 첫 메시지를 보내 실제 대화 ID가 생기면 그 ID로 바꿉니다. ChatGPT는 새로고침하면 저장 전 분기를 버리므로, TreeChat도 페이지를 새로 불러올 때 그 노드를 정리합니다.

**분기는 몇 번이든 가능:** ChatGPT는 한 번 분기하면 새로고침 전까지 그 화면에서 분기 메뉴를 비활성화합니다. TreeChat 분기 버튼은 이 상태를 감지하면 페이지를 새로고침한 뒤 같은 답변의 분기 메뉴를 자동으로 다시 엽니다. 이때 저장하지 않은 이전 분기는 ChatGPT가 버리므로 트리에서도 사라집니다.

## 폴더 구조

```
extension/
├─ manifest.json                 MV3. 권한은 storage 하나, 실행 사이트는 chatgpt.com만
└─ src/
   ├─ content/
   │  ├─ loader.js               콘텐츠 스크립트 진입점 (ES 모듈 그래프 로드)
   │  └─ main.js                 사이트 어댑터 + 트리 + UI를 연결하는 조립부 (사이트 무관)
   ├─ background/
   │  └─ service-worker.js       툴바 아이콘 → 패널 토글
   ├─ core/                      사이트와 무관한 로직
   │  ├─ tree-store.js           트리 모델·영속화·분기 연결 규칙 (순수 로직, 테스트 대상)
   │  ├─ storage.js              chrome.storage.local / 메모리 백엔드
   │  ├─ search.js               트리 검색·하이라이트
   │  ├─ sort.js                 정렬(최근 사용 / 생성 / 이름)
   │  ├─ settings.js             패널 너비·정렬 설정 저장
   │  └─ dom.js                  DOM 관찰, URL 변경 감지, 유틸
   ├─ providers/                 ★ 사이트별 코드는 여기에만
   │  ├─ base-adapter.js         모든 어댑터가 구현하는 인터페이스
   │  ├─ registry.js             호스트 → 어댑터 선택
   │  ├─ chatgpt/  selectors.js · adapter.js    구현 완료 (로그인 DOM 기준)
   │  ├─ claude/   selectors.js · adapter.js    자리만 있음 (status: 'planned')
   │  └─ gemini/   selectors.js · adapter.js    자리만 있음 (status: 'planned')
   └─ ui/
      ├─ panel.js                트리 패널 (Shadow DOM)
      ├─ page-controls.js        사이트 DOM에 넣는 버튼 2개 (토글, 분기)
      ├─ theme.js                라이트/다크 감지
      ├─ icons.js
      └─ styles/
         ├─ panel.css            패널 스타일 (ChatGPT에서 측정한 값)
         └─ inject.css           사이트 문서에 들어가는 유일한 CSS
docs/dom-analysis/
├─ chatgpt.md                    로그인 chatgpt.com DOM 분석 결과
└─ probe-chatgpt.js              DOM이 바뀌었는지 콘솔에서 확인하는 스크립트
tests/                           트리·정렬·설정 단위 테스트
```

### 새 사이트 추가하기 (claude.ai, gemini.google.com)

1. 로그인 상태에서 해당 사이트 DOM을 분석해 `docs/dom-analysis/<site>.md`로 정리
2. `providers/<site>/selectors.js`를 채우고, `adapter.js`에서 `BaseAdapter` 메서드 구현
   (`getConversationId`, `getAssistantMessages`, `openBranchMenu`, `onNativeBranch`, `getHeaderMountPoint` 등)
3. `status = 'ready'`로 변경
4. `manifest.json`의 `content_scripts.matches`와 `web_accessible_resources.matches`에 호스트 추가

`core/`와 `ui/`는 손대지 않아도 됩니다. 트리는 사이트별로 따로 저장됩니다(`treechat:v1:<adapterId>`).

## 데이터

- 저장 위치: `chrome.storage.local`, 이 브라우저에만 저장됨. 외부 전송 없음
- 저장 항목: 대화 ID·경로, 제목(사이드바에 보이는 것), 분기 지점 메시지 ID와 80자 이내 발췌. 메시지 본문 전체는 저장하지 않음
- 삭제: 패널 `⋯` → 트리 데이터 모두 지우기. ChatGPT 대화 자체는 지워지지 않음

## 테스트

```bash
npm test
```

## 알려진 제약

- 로그인한 chatgpt.com만 지원합니다. 로그아웃 화면은 DOM이 완전히 다른 별도 셸입니다
- 패널이 열리면 ChatGPT 화면을 패널 너비만큼 줄여 대화를 가리지 않습니다(어댑터의 `getLayoutPushCss`). 창이 좁아 남는 폭이 480px 미만이면 덮는 방식으로 바뀝니다
- Context 노드(맥락 선택 연결)는 아직 구현하지 않았습니다(agent.md에서 미확정)
