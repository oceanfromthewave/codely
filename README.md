# 🚀 Codely: Your Local Code Health Companion

**English** · [한국어](#korean)

**Codely** is a powerful, **fully local** static analysis tool that turns JavaScript/TypeScript (and more) into structural insights you can act on. It runs **entirely on your machine** using AST parsing and static heuristics. No cloud APIs, no data leaks.

---

## ✨ Key Features

- 📊 **Deep structural reports** – Intent, flow, data boundaries, and a readable webview summary.
- 📉 **Complexity metrics** – Cyclomatic complexity, nesting depth, readability / maintainability-style scores.
- 🧠 **Code fatigue scoring** – Surfaces hotspots that are hard to reason about.
- 🛠️ **Refactoring hints** – Suggestions driven by metrics (not auto-fixes unless you opt in on the CLI).
- ⚡ **VS Code integration** – Problems diagnostics, CodeLens, status bar, Quick Fixes to add suppression comments, and a command to summarize **git-changed files** vs a ref.
- 💻 **CLI** – Project-wide summaries, HTML/JSON export, and **`--git-base`** to analyze only files changed vs a branch.
- 🔕 **Noise control** – `// codely-disable-next-line`, `// codely-disable-line`, `// codely-disable-file`, plus **`.codelyrc` path overrides** (globs) for tests or generated code.
- 🧪 **Quality tooling** – Vitest smoke tests, ESLint + Prettier, and a GitHub Actions workflow that runs build, test, lint, format check, and a maintainability gate.

---

## 🌐 Supported Languages

| Engine          | Languages                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------- |
| **AST (Babel)** | JavaScript (`.js`, `.mjs`, `.cjs`), TypeScript (`.ts`, `.mts`, `.cts`), JSX/TSX, Vue, Svelte, Astro |
| **Heuristic**   | C, C++, C#, Java, Kotlin, Scala, Groovy, Objective-C                                                |

> **Native / C-family buffers:** Metrics use a **masked-text heuristic**, not a compiler front-end. Treat numbers as directional; the webview explains this briefly.

---

## 🛠️ Getting Started

### Prerequisites

- **Node.js** ≥ 20 (Vitest 4 and the toolchain require `util.styleText`, available from Node 20 onward.)
- **VS Code** ≥ 1.80 (for the extension)

### Install and build

```bash
npm install
npm run build
```

### Scripts (monorepo root)

| Script                   | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `npm test`               | Runs Vitest in `@codely/core`.                           |
| `npm run lint`           | ESLint on `packages/core` and `packages/vscode` sources. |
| `npm run format`         | Prettier write on tracked TS/config files.               |
| `npm run format:check`   | Prettier check (used in CI).                             |
| `npm run package:vscode` | Build and produce a `.vsix`.                             |

### CLI examples

```bash
# Single file
node packages/core/dist/cli.js path/to/file.ts

# Whole tree (project summary + hotspots)
node packages/core/dist/cli.js .

# Only files changed vs a git ref (working tree + staged)
node packages/core/dist/cli.js . --git-base main --json

# HTML report
node packages/core/dist/cli.js src/app.ts --html report.html

# Optional magic-number fix (interactive) on a single file
node packages/core/dist/cli.js src/app.ts --fix
```

---

## 🏗️ Project structure

- `packages/core` – Engine (`@codely/core`): parsing, metrics, CLI, git-change listing, suppression helpers.
- `packages/vscode` – Extension (`codelyLab`): diagnostics, CodeLens, webview, Quick Fixes, git-summary command.
- `scripts/` – Helper scripts (e.g. CI maintainability check).

---

## ⚙️ VS Code settings (`codely.*`)

| Setting              | Description                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `enableCodeLens`     | Function-level hints and file-level lens.                                                              |
| `enableDiagnostics`  | Problems panel entries from Codely.                                                                    |
| `enableStatusBar`    | File-level fatigue in the status bar.                                                                  |
| `mode`               | `standard` \| `deep` \| `refactor` \| `architect` – report depth.                                      |
| `analyzeWhileTyping` | Default `true`. Set `false` to refresh on save / open / tab switch only (lighter while editing).       |
| `gitCompareRef`      | Default `main`. Used by **Codely: Analyze Git Changes vs Ref…** with `git diff` / `git diff --cached`. |

**Commands:** Analyze current file, selection, show last report JSON, and **Analyze Git Changes** (workspace folder must be a git repo).

**Quick Fix:** On a Codely diagnostic, choose _Insert `// codely-disable-next-line` above_ or _Insert `// codely-disable-file` at top_.

---

## 📄 Workspace config: `.codelyrc` (JSON)

Placed at the **workspace root** (same folder you open in VS Code). Merged on top of sensible defaults.

| Field           | Description                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `thresholds`    | Optional: `cyclomatic`, `maxDepth`, `functionLength`, `fatigueScore` – used by the engine and VS Code diagnostic thresholds.               |
| `exclude`       | Extra directory names to skip when walking the tree (CLI project mode).                                                                    |
| `history`       | Optional `.codely/history.json` fatigue deltas.                                                                                            |
| `pathOverrides` | Array of `{ "pattern": "<minimatch>", "thresholds"?: {...}, "diagnostics"?: false, "codeLens"?: false }`. **First matching pattern wins.** |

Example:

```json
{
  "pathOverrides": [
    { "pattern": "**/*.{test,spec}.{ts,tsx}", "diagnostics": false },
    { "pattern": "**/generated/**", "codeLens": false, "thresholds": { "cyclomatic": 25 } }
  ]
}
```

---

## 🔕 Inline suppression (in source)

| Directive                                                     | Effect                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `// codely-disable-next-line`                                 | Suppresses **all** Codely diagnostics on the **next** line. |
| `// codely-disable-line` (or block variant on the same line)  | Suppresses diagnostics tied to **that** line.               |
| `// codely-disable-file` (or block) in the **first 40 lines** | Suppresses Codely diagnostics for the **whole file**.       |

---

## 🤖 CI

`.github/workflows/codely-analysis.yml` runs install, build, `npm test`, `npm run lint`, `npm run format:check`, then `node packages/core/dist/cli.js . --json` and `scripts/ci-check-maintainability.mjs` (threshold override: env `CODELY_MIN_MAINTAINABILITY`, default `5`).

---

## 📄 License

MIT — see [LICENSE](./LICENSE).

---

<a id="korean"></a>

# 🚀 Codely: 로컬 기반 코드 건강 검진 도구

Codely는 JavaScript/TypeScript 등을 분석해 **복잡도, 중첩, 피로도, 리팩터 힌트**를 제공하는 **완전 로컬** 도구입니다. **외부 AI API 없이** `@babel/parser`와 정적 휴리스틱만 사용합니다.

---

## ✨ 주요 기능

- 📊 **구조 리포트** – 의도·흐름·데이터 경계, 웹뷰 요약.
- 📉 **복잡도·가독성 지표** – 순환 복잡도, 중첩 깊이 등.
- 🧠 **코드 피로도** – 이해하기 어려운 구간을 점수화.
- 🛠️ **리팩터 힌트** – 메트릭 기반 제안 (CLI `--fix`는 선택 사항).
- ⚡ **VS Code** – Problems, CodeLens, 상태 표시줄, 진단용 **Quick Fix**(억제 주석 삽입), **Git 변경 파일 요약** 명령.
- 💻 **CLI** – 프로젝트 요약, HTML/JSON, **`--git-base`**로 특정 ref 대비 변경 파일만 분석.
- 🔕 **소음 줄이기** – 소스 내 억제 주석, **`.codelyrc`의 `pathOverrides`**(glob).
- 🧪 **개발 품질** – Vitest, ESLint, Prettier, GitHub Actions.

---

## 🌐 지원 언어

| 엔진            | 지원 언어                                            |
| --------------- | ---------------------------------------------------- |
| **AST (Babel)** | JavaScript, TypeScript, JSX/TSX, Vue, Svelte, Astro  |
| **휴리스틱**    | C, C++, C#, Java, Kotlin, Scala, Groovy, Objective-C |

> **네이티브 계열:** 컴파일러 수준이 아니라 **마스킹·휴리스틱** 기준이며, 수치는 방향성으로 해석하는 것이 좋습니다.

---

## 🛠️ 시작하기

### 요구 사항

- **Node.js** 20 이상 (Vitest 4 등이 Node 20의 `util.styleText`에 의존합니다.)
- **VS Code** 1.80 이상 (확장 사용 시)

### 설치 및 빌드

```bash
npm install
npm run build
```

### 루트 스크립트

| 스크립트                          | 설명                       |
| --------------------------------- | -------------------------- |
| `npm test`                        | `@codely/core` Vitest 실행 |
| `npm run lint`                    | ESLint                     |
| `npm run format` / `format:check` | Prettier                   |

### CLI 예시

```bash
node packages/core/dist/cli.js path/to/file.ts
node packages/core/dist/cli.js .
node packages/core/dist/cli.js . --git-base main --json
node packages/core/dist/cli.js src/app.ts --html report.html
```

---

## 🏗️ 프로젝트 구조

- `packages/core` – 엔진 (`@codely/core`)
- `packages/vscode` – 확장 (`codelyLab`)
- `scripts/` – CI 등 보조 스크립트

---

## ⚙️ VS Code 설정 (`codely.*`)

| 설정 키              | 설명                                                 |
| -------------------- | ---------------------------------------------------- |
| `enableCodeLens`     | CodeLens 표시                                        |
| `enableDiagnostics`  | Problems 패널                                        |
| `enableStatusBar`    | 상태 표시줄 피로도                                   |
| `mode`               | `standard` / `deep` / `refactor` / `architect`       |
| `analyzeWhileTyping` | 기본 `true`. `false`면 저장·열기·탭 전환 시에만 갱신 |
| `gitCompareRef`      | 기본 `main`. Git 변경 분석 명령에 사용               |

**명령:** 현재 파일 분석, 선택 영역 분석, 마지막 리포트 JSON, **Git 변경 분석**(워크스페이스가 git 저장소여야 함).

**Quick Fix:** `// codely-disable-next-line` 또는 파일 상단 `// codely-disable-file` 삽입.

---

## 📄 워크스페이스 설정 `.codelyrc` (JSON)

VS Code에서 연 **프로젝트 루트**에 두면 됩니다.

| 필드            | 설명                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| `thresholds`    | `cyclomatic`, `maxDepth`, `functionLength`, `fatigueScore` (선택)      |
| `exclude`       | 디렉터리 분석 시 제외할 폴더 이름 추가                                 |
| `history`       | `.codely/history.json` 사용 여부 등                                    |
| `pathOverrides` | `{ "pattern": "minimatch 패턴", ... }` 배열. **먼저 맞는 패턴만** 적용 |

```json
{
  "pathOverrides": [{ "pattern": "**/*.{test,spec}.{ts,tsx}", "diagnostics": false }]
}
```

---

## 🔕 소스 내 억제 주석

| 지시문                                           | 효과                           |
| ------------------------------------------------ | ------------------------------ |
| `// codely-disable-next-line`                    | **다음 줄**의 Codely 진단 생략 |
| `// codely-disable-line` 등                      | **해당 줄** 진단 생략          |
| `// codely-disable-file` (파일 **처음 40줄** 안) | **파일 전체** 진단 생략        |

---

## 🤖 CI

`.github/workflows/codely-analysis.yml`에서 빌드, 테스트, 린트, 포맷 검사 후 프로젝트 JSON 분석 및 `scripts/ci-check-maintainability.mjs`로 평균 유지보수 점수를 검사합니다. 임계값은 환경 변수 `CODELY_MIN_MAINTAINABILITY`(기본 `5`)로 조정할 수 있습니다.

---

## 📄 라이선스

MIT — [LICENSE](./LICENSE) 참고.
