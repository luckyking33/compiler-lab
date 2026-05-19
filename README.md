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
|-- backend/
|   |-- core/      # C++ Scanner, Grammar, LR(0) automaton, and compiler_core CLI
|   `-- api/       # Python same-origin API server for the web UI
|-- frontend/      # React + Vite visualization frontend
`-- docs/          # Grammar rules and source-code samples
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

### Frontend Backend Target

By default, the frontend calls `/api`, and Vite proxies that to the local backend at `http://127.0.0.1:55173`.

Create `frontend/.env.local` from `frontend/.env.example` when you need a different backend:

```bash
cd frontend
cp .env.example .env.local
```

Use a remote backend through the Vite proxy:

```env
VITE_API_BASE_URL=/api
VITE_PROXY_TARGET=http://10.181.9.70:5173
```

Or keep the default local proxy and reach the remote backend through SSH:

```bash
ssh -N -L 55173:127.0.0.1:5173 -p 2123 tfx@10.181.9.70
```

You can also bypass the Vite proxy and call a remote API directly if the backend is reachable from your browser:

```env
VITE_API_BASE_URL=http://10.181.9.70:5173/api
```

## Notes

- Generated files such as `tokens_out.txt` and `lr0_automaton.json` are ignored by Git.
- Large lab reports and demo videos are intentionally kept out of the repository.
- Future compiler labs should add new C++ modules under `backend/core` and new UI views under `frontend/src`.
