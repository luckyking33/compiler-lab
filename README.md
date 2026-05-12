# compiler-lab

A modern compiler principles lab project with a C++ compiler core and a React-based visualization frontend.

## Features

- DFA engine and visual simulator
- Lexical scanner based on explicit DFA-style state transitions
- LR(0) canonical collection builder
- Shift-reduce / reduce-reduce conflict detection
- React visualization for DFA and LR(0) automata

## Project Structure

```text
compiler-lab/
├─ backend/
│  ├─ core/      # C++ Scanner, Grammar, LR(0) automaton, and compiler_core CLI
│  └─ api/       # Python same-origin API server for the web UI
├─ frontend/     # React + Vite visualization frontend
└─ docs/         # Grammar rules and source-code samples
```

## Quick Start

### Build C++ Core

```bash
cd backend/core
make
./compiler_core scan ../../docs/samples/sample.src tokens_out.txt
./compiler_core lr0 ../../docs/rules/expression_grammar.txt lr0_automaton.json
```

On Windows, run `compiler_core.exe` if your compiler emits an `.exe` file.

### Start Frontend

```bash
cd frontend
npm install
npm run dev
```

### Start API Server

```bash
python backend/api/api_server.py
```

The API server listens on port `55173` by default. The frontend development server proxies `/api` requests there.
Set `PORT=5173` if you want the Python server to serve the built `frontend/dist` app directly.

## Notes

- Generated files such as `tokens_out.txt` and `lr0_automaton.json` are ignored by Git.
- Large lab reports and demo videos are intentionally kept out of the repository.
- Future compiler labs should add new C++ modules under `backend/core` and new UI views under `frontend/src`.
