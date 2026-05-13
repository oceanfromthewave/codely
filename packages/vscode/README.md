# Codely

**English** · [한국어](#korean)

Codely is a **fully local** VS Code extension and CLI that turns JavaScript/TypeScript into a **structural report**: cyclomatic complexity, nesting depth, side-effect hints, fatigue-style scoring, and refactor prompts. **No AI APIs** — analysis uses `@babel/parser` and static heuristics on your machine.

---

## English

### Features

- **Webview report** — summary, intent guess, flow, structure breakdown, data-flow notes, readability/maintainability/fatigue scores, refactor list.
- **Problems panel** — warnings/information for hot functions (complexity, depth, nested loops, ternaries, length, side effects).
- **CodeLens** — per-function load hint; file-level lens opens the report.
- **Status bar** — file-level fatigue score (toggle in settings).
- **CLI** (`codely`) — same engine from the terminal (`--json` supported).

### Supported languages & extensions

VS Code activates on these language ids: **JavaScript**, **TypeScript**, **JavaScript React**, **TypeScript React**, **Vue**, **Svelte**, **Astro**, plus **C**, **C++** / `cuda-cpp`, **C#**, **Java**, **Kotlin**, **Scala**, **Groovy**, **Objective-C**, and **Objective-C++** (see *Native languages* below).

Common file extensions include `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.jsx`, `.tsx`, `.vue`, `.svelte`, and `.astro`.

For **Vue**, **Svelte**, and **Astro**, Codely parses the **largest inline `<script>`** (skipping `src=` and JSON `type=` blocks) or, in Astro, the **`---` frontmatter** when it is the richest chunk. Line numbers in Problems and CodeLens are **mapped back** to the original buffer. **Selection** analysis does not run SFC extraction; it treats the snippet as plain code while still using the host file’s path for TS/JSX hints.

### Native languages (IDE heuristic)

Codely also activates on **C**, **C++** (`cuda-cpp` uses the same path), **C#**, **Java**, **Kotlin**, **Scala**, **Groovy**, **Objective-C**, and **Objective-C++**.

These buffers are analyzed with a **local heuristic** (comment/string masking + `) {` region detection + keyword counts). It is **not** a compiler-grade AST: macros, templates, and unusual layout can confuse the scanner. Metrics still feed the same fatigue/readability models from `@codely/core`, and the report footer reminds you that numbers are directional.

CLI does **not** run this path (extension-only).

### Requirements

- Node.js **≥ 20** (for CLI / monorepo build and Vitest; CI uses Node 20).
- VS Code **≥ 1.80**.

### Monorepo layout

| Package | Role |
|--------|------|
| `packages/core` | `@codely/core` — parse, metrics, report JSON. |
| `packages/vscode` | `codelyLab` (npm package name) — extension UI, diagnostics, CodeLens. |

### Build and test

```bash
npm install
npm run build
npm test
```

### Run the CLI

```bash
npm run build:core
node packages/core/dist/cli.js examples/legacy.js
# or JSON:
node packages/core/dist/cli.js examples/legacy.js --json
```

### Package the VSIX (publish prep)

```bash
npm run package:vscode
```

Produces `packages/vscode/codelyLab-0.1.0.vsix` (file name follows the extension package `name`). Before publishing to the Marketplace, confirm `packages/vscode/package.json`:

- `publisher` — your verified publisher id.
- `repository` / `homepage` / `bugs` — replace `your-org/codely` with your real URLs.

The extension bundles `@codely/core` and Babel via esbuild (~1.6 MB JS); the VSIX is compressed (~270 KB typical).

### Settings (`codely.*`)

| Key | Meaning |
|-----|---------|
| `enableCodeLens` | Show inline Codely CodeLens. |
| `enableDiagnostics` | Publish diagnostics to Problems. |
| `enableStatusBar` | Show fatigue in the status bar. |
| `mode` | `standard` (concise), `deep` (full refactor list + longer structure list), `refactor` (more hints), `architect` (module-boundary style hints when the file is large). |

### Commands

- `Codely: Analyze Current File`
- `Codely: Analyze Selection`
- `Codely: Show Last Report as JSON`

### Limitations

- Heuristic “intent” and patterns are **hypotheses**, not proof.
- Unsupported syntax or non-JS/TS buffers may fail parse; the report explains the parser error.
- Time-complexity text is loop-based and approximate.

### License

MIT — see [LICENSE](./LICENSE).

---

<a id="korean"></a>

## 한국어

Codely는 **AI API 없이** 로컬에서 동작하는 VS Code 확장과 CLI입니다. JavaScript/TypeScript 코드를 AST 기반으로 분석해 **복잡도·중첩·부수효과·피로도 스타일 점수·리팩터 제안**이 담긴 구조화 리포트를 만듭니다. 분석은 `@babel/parser`와 정적 휴리스틱만 사용합니다.

### 주요 기능

- **웹뷰 리포트** — 요약, 의도 추정, 흐름, 구조 분해, 데이터 흐름, 가독성/유지보수/피로도 점수, 리팩터 목록.
- **문제(Problems) 패널** — 복잡도·깊이·중첩 루프·삼항 연산자·함수 길이·부수효과 등 진단.
- **CodeLens** — 함수별 부하 힌트, 파일 상단 렌즈로 전체 리포트 열기.
- **상태 표시줄** — 파일 단위 피로도(설정으로 끄기 가능).
- **CLI (`codely`)** — 터미널에서 동일 엔진 사용(`--json` 지원).

### 지원 언어 및 확장자

VS Code에서 다음 언어 ID로 활성화됩니다: **JavaScript**, **TypeScript**, **JavaScript React**, **TypeScript React**, **Vue**, **Svelte**, **Astro**와, **C**, **C++** / `cuda-cpp`, **C#**, **Java**, **Kotlin**, **Scala**, **Groovy**, **Objective-C**, **Objective-C++**(아래 *네이티브 언어* 참고).

일반적인 확장자는 `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro` 등입니다.

**Vue / Svelte / Astro**는 가장 큰 인라인 `<script>`(`src=`·JSON `type=` 블록은 제외) 또는 Astro의 **`---` 프론트매터**를 분석 대상으로 삼습니다. Problems·CodeLens의 **줄 번호는 원본 파일 기준으로 보정**됩니다. **선택 영역** 분석은 SFC 추출을 하지 않고 스니펫을 일반 코드로 다루며, 호스트 파일 경로만 TS/JSX 힌트에 사용합니다.

### 네이티브 언어 (IDE 휴리스틱)

**C**, **C++**(`cuda-cpp` 동일 처리), **C#**, **Java**, **Kotlin**, **Scala**, **Groovy**, **Objective-C**, **Objective-C++** 에서도 확장이 활성화됩니다.

이 언어들은 **로컬 휴리스틱**(주석·문자열 마스킹, `) {` 블록 탐지, 키워드 기반 복잡도)으로 분석합니다. **컴파일러 수준 AST가 아니며**, 매크로·템플릿·특이한 레이아웃에서 오탐이 날 수 있습니다. 그래도 `@codely/core`의 피로도/가독성 모델에 같은 형태로 넣고, 리포트 하단에 “방향성 지표”임을 안내합니다.

**CLI에는 이 경로를 넣지 않았습니다**(IDE 전용).

### 요구 사항

- Node.js **20 이상** (CLI·모노레포 빌드 및 Vitest; CI는 Node 20).
- VS Code **1.80 이상**.

### 모노레포 구성

| 패키지 | 역할 |
|--------|------|
| `packages/core` | `@codely/core` — 파싱, 메트릭, 리포트 JSON. |
| `packages/vscode` | `codelyLab`(npm 패키지 이름) — 확장 UI, 진단, CodeLens. |

### 빌드 및 테스트

```bash
npm install
npm run build
npm test
```

### CLI 실행

```bash
npm run build:core
node packages/core/dist/cli.js examples/legacy.js
node packages/core/dist/cli.js examples/legacy.js --json
```

### VSIX 패키징(배포 준비)

```bash
npm run package:vscode
```

결과물: `packages/vscode/codelyLab-0.1.0.vsix`(파일명은 확장 패키지 `name`과 동일). 마켓플레이스 배포 전 `packages/vscode/package.json`에서 다음을 확인하세요.

- `publisher` — 검증된 퍼블리셔 ID.
- `repository` / `homepage` / `bugs` — `your-org/codely`를 실제 저장소 URL로 교체.

확장은 esbuild로 코어와 Babel을 번들하므로 JS 약 1.6MB이며, VSIX는 압축 시 약 270KB 수준입니다.

### 설정 (`codely.*`)

| 키 | 설명 |
|----|------|
| `enableCodeLens` | CodeLens 표시 여부. |
| `enableDiagnostics` | Problems 진단 표시 여부. |
| `enableStatusBar` | 상태 표시줄 피로도 표시 여부. |
| `mode` | `standard`(간결), `deep`(전체 제안·긴 구조 목록), `refactor`(리팩터 힌트 많게), `architect`(대형 파일 시 모듈 경계 위주 힌트). |

### 명령

- `Codely: Analyze Current File` — 현재 파일 분석.
- `Codely: Analyze Selection` — 선택 영역 분석.
- `Codely: Show Last Report as JSON` — 마지막 리포트를 JSON으로 표시.

### 한계

- “의도”와 패턴 라벨은 **휴리스틱 추정**이며 정답이 아닙니다.
- JS/TS가 아니거나 파서가 못 읽는 문법은 오류 리포트로 대체됩니다.
- 시간 복잡도 문구는 루프 기반 근사입니다.

### 라이선스

MIT — [LICENSE](./LICENSE) 참고.
