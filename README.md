# 🚀 Codely: Your Local Code Health Companion

**English** · [한국어](#korean)

**Codely** is a powerful, **fully local** static analysis tool that transforms your JavaScript/TypeScript (and more!) into actionable structural insights. Unlike modern AI tools, Codely runs **entirely on your machine** using AST parsing and static heuristics. No APIs, no data leaks, just pure code analysis.

---

## ✨ Key Features

- 📊 **Deep Structural Reports** – Understand code intent, flow, and data boundaries.
- 📉 **Complexity Metrics** – Real-time Cyclomatic Complexity, Nesting Depth, and Maintainability scores.
- 🧠 **Cognitive Fatigue Scoring** – Identifies "hotspots" that are hard for humans to reason about.
- 🛠️ **Refactoring Suggestions** – Get instant prompts for better code organization.
- ⚡ **VS Code Integration** – Problems panel diagnostics, CodeLens hints, and an interactive Webview.
- 💻 **CLI Power User Features** – Directory-wide analysis, "Hotspot" detection, and HTML report exporting.
- 🤖 **CI/CD Ready** – GitHub Actions example for automated code health checks.

---

## 🌐 Supported Languages

| Engine | Languages |
|--------|-----------|
| **AST (Babel)** | JavaScript (`.js`, `.mjs`, `.cjs`), TypeScript (`.ts`, `.mts`), JSX/TSX, Vue, Svelte, Astro |
| **Heuristic** | C, C++, C#, Java, Kotlin, Scala, Groovy, Objective-C |

> **Note on Native Languages:** Analysis for C/Java-like languages uses a local heuristic. Both CLI and VS Code now share this engine.

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js** ≥ 18
- **VS Code** ≥ 1.80

### Installation
```bash
# Install dependencies
npm install

# Build the project
npm run build
```

### Running the CLI
```bash
# Analyze a single file
node packages/core/dist/cli.js path/to/file.js

# Analyze an entire project directory
node packages/core/dist/cli.js .

# Export a visual HTML report
node packages/core/dist/cli.js file.ts --html report.html

# Export as JSON for tooling
node packages/core/dist/cli.js . --json
```

---

## 🏗️ Project Structure

- `packages/core`: The analysis engine (`@codely/core`). Logic for parsing, metrics, and report generation.
- `packages/vscode`: The VS Code extension (`codelyLab`). UI, diagnostics, and IDE integration.

---

## ⚙️ Configuration (`codely.*`)

| Setting | Description |
|---------|-------------|
| `enableCodeLens` | Show/hide function-level complexity hints. |
| `enableDiagnostics` | Show/hide warnings in the Problems panel. |
| `enableStatusBar` | Show/hide the fatigue score in the status bar. |
| `mode` | Analysis depth: `standard`, `deep`, `refactor`, or `architect`. |

---

<a id="korean"></a>

# 🚀 Codely: 로컬 기반 코드 건강 검진 도구

Codely는 JavaScript/TypeScript 코드를 분석하여 **복잡도, 중첩 깊이, 부수 효과, 피로도 점수** 등을 포함한 구조화된 리포트를 제공하는 **완전 로컬** 분석 도구입니다.

**AI API를 전혀 사용하지 않습니다.** 모든 분석은 사용자의 PC에서 `@babel/parser`와 정적 휴리스틱만을 사용하여 수행되므로 보안과 속도 면에서 강력합니다.

---

## ✨ 주요 기능

- 📊 **심층 구조 리포트** – 코드의 의도, 흐름, 데이터 경계를 시각화합니다.
- 📉 **복잡도 지표** – 순환 복잡도(Cyclomatic Complexity), 중첩 깊이, 유지보수성 점수를 제공합니다.
- 🧠 **인지 피로도 점수** – 사람이 이해하기 어려운 "위험 지점"을 수치화합니다.
- 🛠️ **리팩토링 제안** – 코드 구조 개선을 위한 즉각적인 힌트를 제공합니다.
- ⚡ **VS Code 통합** – 문제(Problems) 패널 진단, CodeLens 힌트, 대화형 웹뷰 리포트.
- 💻 **CLI 파워 유저 기능** – 디렉토리 단위 분석, "핫스팟" 감지, 시각화된 HTML 리포트 내보내기.
- 🤖 **CI/CD 지원** – 자동화된 코드 건강 검진을 위한 GitHub Actions 워크플로우 예시 제공.

---

## 🌐 지원 언어

| 엔진 | 지원 언어 |
|--------|-----------|
| **AST (Babel)** | JavaScript, TypeScript, JSX/TSX, Vue, Svelte, Astro |
| **휴리스틱** | C, C++, C#, Java, Kotlin, Scala, Groovy, Objective-C |

> **네이티브 언어 참고:** C/Java 계열 언어는 정규표현식 기반의 휴리스틱 엔진을 사용합니다. 이제 CLI와 VS Code 확장 모두 동일한 분석 엔진을 공유합니다.

---

## 🛠️ 시작하기

### 요구 사항
- **Node.js** 18 이상
- **VS Code** 1.80 이상

### 빌드 방법
```bash
# 의존성 설치
npm install

# 전체 빌드
npm run build
```

### CLI 실행
```bash
# 단일 파일 분석
node packages/core/dist/cli.js path/to/file.js

# 디렉토리 전체 분석 (프로젝트 요약)
node packages/core/dist/cli.js .

# 시각화된 HTML 리포트 저장
node packages/core/dist/cli.js file.ts --html report.html

# 도구 활용을 위한 JSON 출력
node packages/core/dist/cli.js . --json
```

---

## 🏗️ 프로젝트 구조

- `packages/core`: 분석 엔진 핵심 로직 (`@codely/core`).
- `packages/vscode`: VS Code 확장 프로그램 (`codelyLab`).

---

## ⚙️ 설정 (`codely.*`)

| 설정 키 | 설명 |
|---------|-------------|
| `enableCodeLens` | 함수 단위 복잡도 힌트 표시 여부. |
| `enableDiagnostics` | 문제(Problems) 패널 경고 표시 여부. |
| `enableStatusBar` | 상태 표시줄 피로도 점수 표시 여부. |
| `mode` | 분석 모드 설정: `standard`, `deep`, `refactor`, `architect`. |

---

## 📄 라이선스
MIT — [LICENSE](./LICENSE) 참고.
