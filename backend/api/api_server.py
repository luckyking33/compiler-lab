#!/usr/bin/env python3
"""Same-origin API server for the combined compiler lab frontend.

The server uses only Python standard library modules. It serves the built
frontend from frontend/dist and provides JSON APIs under /api for both:

- DFA validation, simulation, and preset storage
- Scanner and LR(0) execution backed by backend/core/compiler_core
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, FrozenSet, List, Tuple


HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "55173"))
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(ROOT_DIR, "..", ".."))
FRONTEND_DIR = os.path.join(REPO_ROOT, "frontend", "dist")
PRESETS_FILE = os.path.join(ROOT_DIR, "dfa_presets.json")
CORE_DIR = os.path.join(REPO_ROOT, "backend", "core")
CORE_BINARY = os.path.join(CORE_DIR, "compiler_core")
CORE_BINARY_EXE = CORE_BINARY + ".exe"
DEFAULT_GRAMMAR_FILE = os.path.join(REPO_ROOT, "docs", "rules", "expression_grammar.txt")
SPA_ROUTES = {"/", "/scanner", "/dfa", "/lr0"}

EPSILON_TOKENS = {"epsilon", "eps", "\u03b5"}

DEFAULT_DFA = {
    "states": ["q0", "q1", "q2"],
    "alphabet": ["a", "b"],
    "startState": "q0",
    "acceptStates": ["q2"],
    "transitions": {
        "q0": {"a": "q1", "b": "q0"},
        "q1": {"a": "q1", "b": "q2"},
        "q2": {"a": "q1", "b": "q0"},
    },
}

DEFAULT_PRESET = {
    "id": "dfa-001",
    "name": "Ends with ab",
    "updatedAt": "2026-05-03T08:30:00.000Z",
    "dfa": DEFAULT_DFA,
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def is_string_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def load_presets() -> List[Dict[str, Any]]:
    if not os.path.exists(PRESETS_FILE):
        return [DEFAULT_PRESET.copy()]

    try:
      with open(PRESETS_FILE, "r", encoding="utf-8") as fin:
          data = json.load(fin)
    except (OSError, json.JSONDecodeError):
        return [DEFAULT_PRESET.copy()]

    presets = data.get("presets") if isinstance(data, dict) else data
    if not isinstance(presets, list):
        return [DEFAULT_PRESET.copy()]

    return [item for item in presets if isinstance(item, dict)]


def save_presets(presets: List[Dict[str, Any]]) -> None:
    with open(PRESETS_FILE, "w", encoding="utf-8") as fout:
        json.dump({"presets": presets}, fout, ensure_ascii=False, indent=2)
        fout.write("\n")


def next_preset_id(presets: List[Dict[str, Any]]) -> str:
    max_number = 0
    for preset in presets:
        preset_id = str(preset.get("id", ""))
        if preset_id.startswith("dfa-"):
            suffix = preset_id[4:]
            if suffix.isdigit():
                max_number = max(max_number, int(suffix))

    return f"dfa-{max_number + 1:03d}"


def validate_dfa(dfa: Any) -> Tuple[bool, List[str]]:
    errors: List[str] = []

    if not isinstance(dfa, dict):
        return False, ["DFA must be a JSON object."]

    states = dfa.get("states")
    alphabet = dfa.get("alphabet")
    start_state = dfa.get("startState")
    accept_states = dfa.get("acceptStates")
    transitions = dfa.get("transitions")

    if not is_string_list(states) or len(states) == 0:
        errors.append("states must be a non-empty string array.")
        states = []

    if not is_string_list(alphabet) or len(alphabet) == 0:
        errors.append("alphabet must be a non-empty string array.")
        alphabet = []

    if len(set(states)) != len(states):
        errors.append("states contains duplicate values.")

    if len(set(alphabet)) != len(alphabet):
        errors.append("alphabet contains duplicate values.")

    state_set = set(states)

    if not isinstance(start_state, str) or start_state == "":
        errors.append("startState must be a non-empty string.")
    elif start_state not in state_set:
        errors.append("startState must belong to states.")

    if not is_string_list(accept_states) or len(accept_states) == 0:
        errors.append("acceptStates must be a non-empty string array.")
        accept_states = []
    else:
        for state in accept_states:
            if state not in state_set:
                errors.append(f"accept state {state} does not belong to states.")

    if not isinstance(transitions, dict):
        errors.append("transitions must be an object.")
        transitions = {}

    for state in states:
        row = transitions.get(state)
        if not isinstance(row, dict):
            for symbol in alphabet:
                errors.append(f"missing transition: {state} --{symbol}--> ?")
            continue

        for symbol in alphabet:
            target = row.get(symbol)
            if not isinstance(target, str) or target == "":
                errors.append(f"missing transition: {state} --{symbol}--> ?")
            elif target not in state_set:
                errors.append(f"transition target {target} does not belong to states.")

    return len(errors) == 0, errors


def simulate_dfa(dfa: Any, input_text: Any) -> Dict[str, Any]:
    valid, errors = validate_dfa(dfa)
    if not valid:
        return {
            "accepted": False,
            "finalState": dfa.get("startState", "") if isinstance(dfa, dict) else "",
            "steps": [],
            "error": "Invalid DFA: " + "; ".join(errors),
        }

    if not isinstance(input_text, str):
        input_text = ""

    alphabet = set(dfa["alphabet"])
    current_state = dfa["startState"]
    steps: List[Dict[str, Any]] = []

    for index, symbol in enumerate(input_text):
        if symbol not in alphabet:
            return {
                "accepted": False,
                "finalState": current_state,
                "steps": steps,
                "error": f"invalid symbol: {symbol}",
            }

        next_state = dfa["transitions"].get(current_state, {}).get(symbol)
        if not next_state:
            return {
                "accepted": False,
                "finalState": current_state,
                "steps": steps,
                "error": f"missing transition: {current_state} --{symbol}--> ?",
            }

        steps.append(
            {
                "index": index,
                "symbol": symbol,
                "from": current_state,
                "to": next_state,
            }
        )
        current_state = next_state

    return {
        "accepted": current_state in set(dfa["acceptStates"]),
        "finalState": current_state,
        "steps": steps,
        "error": "",
    }


def parse_token_stream(contents: str) -> List[Dict[str, str]]:
    tokens: List[Dict[str, str]] = []

    for line_number, raw_line in enumerate(contents.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue

        if not (line.startswith("(") and line.endswith(")")):
            raise ValueError(f"unexpected token line format at line {line_number}: {line}")

        inner = line[1:-1]
        comma_index = inner.find(",")
        if comma_index < 0:
            raise ValueError(f"missing comma in token line {line_number}: {line}")

        token_type = inner[:comma_index].strip()
        token_value = inner[comma_index + 1 :].strip()
        if not token_type:
            raise ValueError(f"missing token type in line {line_number}: {line}")

        tokens.append({"type": token_type, "value": token_value})

    return tokens


def compiler_core_path() -> str:
    if os.path.isfile(CORE_BINARY):
        return CORE_BINARY
    if os.path.isfile(CORE_BINARY_EXE):
        return CORE_BINARY_EXE
    raise FileNotFoundError(f"compiler_core binary not found. Build it first in {CORE_DIR}.")


def run_scanner(source: str) -> List[Dict[str, str]]:
    binary = compiler_core_path()
    temp_root = CORE_DIR if os.path.isdir(CORE_DIR) else None
    with tempfile.TemporaryDirectory(prefix="scanner_", dir=temp_root) as temp_dir:
        source_path = os.path.join(temp_dir, "temp.c")
        output_path = os.path.join(temp_dir, "tokens_out.txt")

        with open(source_path, "w", encoding="utf-8", newline="\n") as fout:
            fout.write(source)

        result = subprocess.run(
            [binary, "scan", source_path, output_path],
            text=True,
            capture_output=True,
            cwd=CORE_DIR,
            timeout=15,
            check=False,
        )

        if result.returncode != 0:
            raise RuntimeError(
                "compiler_core scan exited with code "
                f"{result.returncode}. stdout={result.stdout[-800:]} stderr={result.stderr[-800:]}"
            )

        if not os.path.exists(output_path):
            raise RuntimeError(
                "scanner did not produce tokens_out.txt. "
                f"stdout={result.stdout[-800:]} stderr={result.stderr[-800:]}"
            )

        with open(output_path, "r", encoding="utf-8") as fin:
            return parse_token_stream(fin.read())


def split_lr0_item(item: str) -> Tuple[str, List[str]]:
    if "->" not in item:
        return "", []

    lhs, rhs = item.split("->", 1)
    return lhs.strip(), rhs.strip().split()


def next_symbol_after_dot(item: str) -> str:
    _, rhs = split_lr0_item(item)
    for index, symbol in enumerate(rhs):
        if symbol == "." and index + 1 < len(rhs):
            return rhs[index + 1]
    return ""


def is_complete_lr0_item(item: str) -> bool:
    _, rhs = split_lr0_item(item)
    return bool(rhs) and rhs[-1] == "."


def is_accept_lr0_item(item: str) -> bool:
    lhs, _ = split_lr0_item(item)
    return lhs.endswith("'")


def infer_lr0_conflict(items: List[str], nonterminals: set[str]) -> bool:
    reduce_count = 0
    has_terminal_shift = False

    for item in items:
        if is_complete_lr0_item(item):
            if not is_accept_lr0_item(item):
                reduce_count += 1
            continue

        next_symbol = next_symbol_after_dot(item)
        if next_symbol and next_symbol not in nonterminals:
            has_terminal_shift = True

    return reduce_count >= 2 or (reduce_count >= 1 and has_terminal_shift)


@dataclass(frozen=True)
class LR0Production:
    lhs: str
    rhs: Tuple[str, ...]


@dataclass(frozen=True)
class LR0Item:
    production_index: int
    dot_pos: int


def extract_lr0_rules(body: Any) -> List[str]:
    if isinstance(body, dict):
        grammar_text = body.get("grammar", "")
        raw_rules = body.get("rules", [])
        rules: List[str] = []

        if isinstance(grammar_text, str):
            rules.extend(grammar_text.splitlines())
        elif grammar_text not in ("", None):
            raise ValueError("grammar must be a string.")

        if isinstance(raw_rules, list):
            if not all(isinstance(rule, str) for rule in raw_rules):
                raise ValueError("rules must be a string array.")
            rules.extend(raw_rules)
        elif raw_rules not in ([], None):
            raise ValueError("rules must be a string array.")
    elif isinstance(body, list):
        if not all(isinstance(rule, str) for rule in body):
            raise ValueError("request array must contain only strings.")
        rules = body
    else:
        raise ValueError("request body must be an object with grammar or rules.")

    cleaned = [rule.strip() for rule in rules if rule.strip()]
    if not cleaned:
        raise ValueError("Grammar rules cannot be empty.")
    return cleaned


def split_lr0_alternatives(text: str) -> List[str]:
    return [part.strip() for part in text.split("|")]


def parse_lr0_rules(rules: List[str]) -> Tuple[List[LR0Production], str, set[str], set[str]]:
    raw_rules: List[Tuple[str, str]] = []
    nonterminals: set[str] = set()
    start_symbol = ""

    for index, rule in enumerate(rules):
        if "->" not in rule:
            raise ValueError("Each rule must contain '->'.")

        lhs_text, rhs_text = rule.split("->", 1)
        lhs_tokens = lhs_text.strip().split()
        if len(lhs_tokens) != 1:
            raise ValueError("Production lhs must contain exactly one symbol.")

        lhs = lhs_tokens[0]
        if index == 0:
            start_symbol = lhs
        nonterminals.add(lhs)
        raw_rules.append((lhs, rhs_text))

    productions: List[LR0Production] = []
    terminals: set[str] = set()
    for lhs, rhs_text in raw_rules:
        for alternative in split_lr0_alternatives(rhs_text):
            if not alternative:
                raise ValueError("Empty production alternative is not allowed. Use epsilon explicitly.")

            rhs_tokens = alternative.split()
            is_epsilon = len(rhs_tokens) == 1 and rhs_tokens[0] in EPSILON_TOKENS
            if is_epsilon:
                productions.append(LR0Production(lhs, ()))
                continue

            rhs: List[str] = []
            for token in rhs_tokens:
                if token in EPSILON_TOKENS:
                    raise ValueError("epsilon/eps/the epsilon token must appear alone.")
                rhs.append(token)
                if token not in nonterminals:
                    terminals.add(token)

            productions.append(LR0Production(lhs, tuple(rhs)))

    if not productions:
        raise ValueError("Grammar must contain at least one production.")

    return productions, start_symbol, nonterminals, terminals


def augment_lr0_grammar(
    productions: List[LR0Production],
    start_symbol: str,
    nonterminals: set[str],
    terminals: set[str],
) -> Tuple[List[LR0Production], str, set[str], set[str]]:
    augmented_start = f"{start_symbol}'"
    used_symbols = nonterminals | terminals
    while augmented_start in used_symbols:
        augmented_start += "'"

    return (
        [LR0Production(augmented_start, (start_symbol,))] + productions,
        augmented_start,
        set(nonterminals) | {augmented_start},
        set(terminals),
    )


def format_lr0_item(item: LR0Item, productions: List[LR0Production]) -> str:
    production = productions[item.production_index]
    parts = [production.lhs, "->"]

    if not production.rhs:
        return f"{production.lhs} -> epsilon ."

    for index, symbol in enumerate(production.rhs):
        if index == item.dot_pos:
            parts.append(".")
        parts.append(symbol)

    if item.dot_pos == len(production.rhs):
        parts.append(".")

    return " ".join(parts)


def closure_lr0_items(
    items: FrozenSet[LR0Item],
    productions: List[LR0Production],
    productions_by_lhs: Dict[str, List[int]],
    nonterminals: set[str],
) -> FrozenSet[LR0Item]:
    result = set(items)
    pending = list(items)

    while pending:
        current = pending.pop(0)
        production = productions[current.production_index]
        if current.dot_pos >= len(production.rhs):
            continue

        next_symbol = production.rhs[current.dot_pos]
        if next_symbol not in nonterminals:
            continue

        for production_index in productions_by_lhs.get(next_symbol, []):
            new_item = LR0Item(production_index, 0)
            if new_item not in result:
                result.add(new_item)
                pending.append(new_item)

    return frozenset(result)


def goto_lr0_items(
    items: FrozenSet[LR0Item],
    symbol: str,
    productions: List[LR0Production],
    productions_by_lhs: Dict[str, List[int]],
    nonterminals: set[str],
) -> FrozenSet[LR0Item]:
    shifted = {
        LR0Item(item.production_index, item.dot_pos + 1)
        for item in items
        if item.dot_pos < len(productions[item.production_index].rhs)
        and productions[item.production_index].rhs[item.dot_pos] == symbol
    }
    if not shifted:
        return frozenset()
    return closure_lr0_items(frozenset(shifted), productions, productions_by_lhs, nonterminals)


def lr0_state_has_conflict(
    items: FrozenSet[LR0Item],
    productions: List[LR0Production],
    terminals: set[str],
) -> bool:
    reduce_count = 0
    has_terminal_shift = False

    for item in items:
        production = productions[item.production_index]
        if item.dot_pos == len(production.rhs):
            if item.production_index != 0:
                reduce_count += 1
            continue

        if production.rhs[item.dot_pos] in terminals:
            has_terminal_shift = True

    return reduce_count >= 2 or (reduce_count >= 1 and has_terminal_shift)


def build_lr0_automaton_from_rules(rules: List[str]) -> Dict[str, Any]:
    productions, start_symbol, nonterminals, terminals = parse_lr0_rules(rules)
    productions, augmented_start, nonterminals, terminals = augment_lr0_grammar(
        productions,
        start_symbol,
        nonterminals,
        terminals,
    )

    productions_by_lhs: Dict[str, List[int]] = {}
    for index, production in enumerate(productions):
        productions_by_lhs.setdefault(production.lhs, []).append(index)

    start_state = closure_lr0_items(frozenset({LR0Item(0, 0)}), productions, productions_by_lhs, nonterminals)
    states: List[FrozenSet[LR0Item]] = [start_state]
    transitions: List[Tuple[int, str, int]] = []
    pending = [0]

    while pending:
        state_index = pending.pop(0)
        state = states[state_index]
        candidate_symbols = sorted(
            {
                productions[item.production_index].rhs[item.dot_pos]
                for item in state
                if item.dot_pos < len(productions[item.production_index].rhs)
            },
            key=lambda symbol: (0 if symbol in terminals else 1, symbol),
        )

        for symbol in candidate_symbols:
            next_state = goto_lr0_items(state, symbol, productions, productions_by_lhs, nonterminals)
            if not next_state:
                continue

            try:
                next_index = states.index(next_state)
            except ValueError:
                states.append(next_state)
                next_index = len(states) - 1
                pending.append(next_index)

            transitions.append((state_index, symbol, next_index))

    nodes = [
        {
            "id": str(index),
            "items": [
                format_lr0_item(item, productions)
                for item in sorted(state, key=lambda item: format_lr0_item(item, productions))
            ],
            "hasConflict": lr0_state_has_conflict(state, productions, terminals),
        }
        for index, state in enumerate(states)
    ]
    edges = [
        {"source": str(source), "target": str(target), "label": symbol}
        for source, symbol, target in transitions
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "grammar": {
            "startSymbol": start_symbol,
            "augmentedStartSymbol": augmented_start,
            "rules": rules,
        },
    }


def normalize_lr0_automaton(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("LR(0) automaton JSON must be an object.")

    raw_nodes = raw.get("nodes")
    raw_edges = raw.get("edges")
    if not isinstance(raw_nodes, list) or not isinstance(raw_edges, list):
        raise ValueError("LR(0) automaton must contain nodes and edges arrays.")

    nonterminals: set[str] = set()
    for raw_node in raw_nodes:
        if not isinstance(raw_node, dict):
            continue

        raw_items = raw_node.get("items")
        if not isinstance(raw_items, list):
            continue

        for raw_item in raw_items:
            if isinstance(raw_item, str):
                lhs, _ = split_lr0_item(raw_item)
                if lhs:
                    nonterminals.add(lhs)

    nodes: List[Dict[str, Any]] = []
    for raw_node in raw_nodes:
        if not isinstance(raw_node, dict):
            continue

        node_id = raw_node.get("id")
        raw_items = raw_node.get("items")
        items = [item for item in raw_items if isinstance(item, str)] if isinstance(raw_items, list) else []
        has_conflict = raw_node.get("hasConflict")

        nodes.append(
            {
                "id": str(node_id),
                "items": items,
                "hasConflict": has_conflict if isinstance(has_conflict, bool) else infer_lr0_conflict(items, nonterminals),
            }
        )

    edges: List[Dict[str, str]] = []
    for raw_edge in raw_edges:
        if not isinstance(raw_edge, dict):
            continue

        source = raw_edge.get("source", raw_edge.get("from"))
        target = raw_edge.get("target", raw_edge.get("to"))
        label = raw_edge.get("label", raw_edge.get("symbol", ""))
        edges.append({"source": str(source), "target": str(target), "label": str(label)})

    return {"nodes": nodes, "edges": edges}


def load_lr0_automaton() -> Dict[str, Any]:
    with open(DEFAULT_GRAMMAR_FILE, "r", encoding="utf-8") as fin:
        return run_lr0(fin.read().splitlines())


def run_lr0(rules: List[str]) -> Dict[str, Any]:
    binary = compiler_core_path()
    temp_root = CORE_DIR if os.path.isdir(CORE_DIR) else None
    with tempfile.TemporaryDirectory(prefix="lr0_", dir=temp_root) as temp_dir:
        grammar_path = os.path.join(temp_dir, "grammar.txt")
        output_path = os.path.join(temp_dir, "lr0_automaton.json")

        with open(grammar_path, "w", encoding="utf-8", newline="\n") as fout:
            fout.write("\n".join(rules))
            fout.write("\n")

        result = subprocess.run(
            [binary, "lr0", grammar_path, output_path],
            text=True,
            capture_output=True,
            cwd=CORE_DIR,
            timeout=15,
            check=False,
        )

        if result.returncode != 0:
            raise RuntimeError(
                "compiler_core lr0 exited with code "
                f"{result.returncode}. stdout={result.stdout[-800:]} stderr={result.stderr[-800:]}"
            )

        with open(output_path, "r", encoding="utf-8") as fin:
            return normalize_lr0_automaton(json.load(fin))


class CombinedApiHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path_without_query()
        if path == "/api/dfa/presets":
            self.write_json({"presets": load_presets()})
            return

        if path == "/api/lr0/automaton":
            try:
                self.write_json(load_lr0_automaton())
            except FileNotFoundError:
                self.write_json({"error": f"LR(0) grammar or compiler_core not found: {DEFAULT_GRAMMAR_FILE}"}, status=404)
            except (OSError, json.JSONDecodeError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
                self.write_json({"error": str(exc)}, status=500)
            return

        if path in SPA_ROUTES:
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self) -> None:
        path = self.path_without_query()
        body, error = self.read_json_body()

        if path == "/api/dfa/presets":
            if error:
                self.write_json({"error": error}, status=400)
                return

            preset, preset_error = self.make_preset(body)
            if preset_error:
                self.write_json({"error": preset_error}, status=400)
                return

            presets = load_presets()
            replaced = False
            for index, existing in enumerate(presets):
                if existing.get("name") == preset["name"]:
                    preset["id"] = existing.get("id", preset["id"])
                    presets[index] = preset
                    replaced = True
                    break

            if not replaced:
                presets.append(preset)

            save_presets(presets)
            self.write_json(preset)
            return

        if path == "/api/lr0/automaton":
            if error:
                self.write_json({"error": error}, status=400)
                return

            try:
                self.write_json(run_lr0(extract_lr0_rules(body)))
            except ValueError as exc:
                self.write_json({"error": str(exc)}, status=400)
            except Exception as exc:
                self.write_json({"error": str(exc)}, status=500)
            return

        if path == "/api/dfa/validate":
            if error:
                self.write_json({"valid": False, "errors": [error]})
                return

            valid, errors = validate_dfa(body)
            self.write_json({"valid": valid, "errors": errors})
            return

        if path == "/api/dfa/simulate":
            if error:
                self.write_json(
                    {
                        "accepted": False,
                        "finalState": "",
                        "steps": [],
                        "error": error,
                    }
                )
                return

            if not isinstance(body, dict):
                self.write_json(
                    {
                        "accepted": False,
                        "finalState": "",
                        "steps": [],
                        "error": "request body must be a JSON object.",
                    }
                )
                return

            self.write_json(simulate_dfa(body.get("dfa"), body.get("input", "")))
            return

        if path == "/api/scanner/tokens":
            if error:
                self.write_json({"error": error}, status=400)
                return

            if not isinstance(body, dict):
                self.write_json({"error": "request body must be a JSON object."}, status=400)
                return

            source = body.get("source")
            if not isinstance(source, str):
                self.write_json({"error": "source must be a string."}, status=400)
                return

            try:
                tokens = run_scanner(source)
            except (FileNotFoundError, PermissionError, RuntimeError, ValueError, OSError, subprocess.TimeoutExpired) as exc:
                self.write_json({"error": str(exc)}, status=500)
                return

            self.write_json({"tokens": tokens})
            return

        self.send_error(404, "Not Found")

    def do_DELETE(self) -> None:
        path = self.path_without_query()
        prefix = "/api/dfa/presets/"

        if path.startswith(prefix):
            preset_id = path[len(prefix) :]
            presets = load_presets()
            remaining = [preset for preset in presets if preset.get("id") != preset_id]
            save_presets(remaining)
            self.write_json({"success": True})
            return

        self.send_error(404, "Not Found")

    def make_preset(self, body: Any) -> Tuple[Dict[str, Any], str]:
        if not isinstance(body, dict):
            return {}, "request body must be a JSON object."

        name = body.get("name")
        dfa = body.get("dfa")

        if not isinstance(name, str) or not name.strip():
            return {}, "name must be a non-empty string."

        valid, errors = validate_dfa(dfa)
        if not valid:
            return {}, "Invalid DFA: " + "; ".join(errors)

        presets = load_presets()
        return {
            "id": next_preset_id(presets),
            "name": name.strip(),
            "updatedAt": utc_now_iso(),
            "dfa": dfa,
        }, ""

    def path_without_query(self) -> str:
        return self.path.split("?", 1)[0]

    def read_json_body(self) -> Tuple[Any, str]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw_body = self.rfile.read(length)

        if not raw_body:
            return None, "request body must not be empty."

        try:
            return json.loads(raw_body.decode("utf-8")), ""
        except json.JSONDecodeError:
            return None, "request body is not valid JSON."

    def write_json(self, data: Dict[str, Any], status: int = 200) -> None:
        content = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format: str, *args: Any) -> None:
        print("%s - - [%s] %s" % (self.client_address[0], self.log_date_time_string(), format % args))


def main() -> None:
    if not os.path.isdir(FRONTEND_DIR):
        print(f"Warning: frontend dist directory does not exist: {FRONTEND_DIR}")

    server = ThreadingHTTPServer((HOST, PORT), CombinedApiHandler)
    print(f"Combined API server listening on http://{HOST}:{PORT}")
    print(f"Serving frontend from {FRONTEND_DIR}")
    print(f"compiler_core path: {compiler_core_path()}")
    print(f"Default LR(0) grammar path: {DEFAULT_GRAMMAR_FILE}")
    server.serve_forever()


if __name__ == "__main__":
    main()
