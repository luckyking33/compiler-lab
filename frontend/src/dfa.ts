export type DFAConfig = {
  states: string[];
  alphabet: string[];
  startState: string;
  acceptStates: string[];
  transitions: Record<string, Record<string, string>>;
};

export type DfaPreset = {
  id: string;
  name: string;
  dfa: DFAConfig;
  updatedAt: string;
};

export type SimulationStep = {
  index: number;
  symbol: string;
  from: string;
  to: string;
};

export type SimulationResult = {
  accepted: boolean;
  finalState: string;
  steps: SimulationStep[];
  error?: string;
};

export const defaultDfa: DFAConfig = {
  states: ['q0', 'q1', 'q2'],
  alphabet: ['a', 'b'],
  startState: 'q0',
  acceptStates: ['q2'],
  transitions: {
    q0: { a: 'q1', b: 'q0' },
    q1: { a: 'q1', b: 'q2' },
    q2: { a: 'q1', b: 'q0' },
  },
};

export function cloneDfa(dfa: DFAConfig): DFAConfig {
  return {
    states: [...dfa.states],
    alphabet: [...dfa.alphabet],
    startState: dfa.startState,
    acceptStates: [...dfa.acceptStates],
    transitions: Object.fromEntries(
      Object.entries(dfa.transitions).map(([state, table]) => [state, { ...table }]),
    ),
  };
}

export function splitTokenText(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n\r\t ]+/)
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );
}

export function joinTokens(tokens: string[]) {
  return tokens.join(', ');
}

export function isDfaEmpty(dfa: DFAConfig) {
  return (
    dfa.states.length === 0 &&
    dfa.alphabet.length === 0 &&
    !dfa.startState &&
    dfa.acceptStates.length === 0 &&
    Object.keys(dfa.transitions).length === 0
  );
}

export function normalizeDfa(dfa: DFAConfig) {
  if (isDfaEmpty(dfa)) {
    return cloneDfa(defaultDfa);
  }

  const states = Array.from(new Set(dfa.states.map((state) => state.trim()).filter(Boolean)));
  const alphabet = Array.from(new Set(dfa.alphabet.map((symbol) => symbol.trim()).filter(Boolean)));
  const acceptStateSet = new Set(dfa.acceptStates.map((state) => state.trim()).filter(Boolean));
  const transitions: Record<string, Record<string, string>> = {};

  states.forEach((state) => {
    transitions[state] = {};
    alphabet.forEach((symbol) => {
      transitions[state][symbol] = dfa.transitions[state]?.[symbol]?.trim() ?? '';
    });
  });

  return {
    states,
    alphabet,
    startState: dfa.startState.trim() || states[0] || '',
    acceptStates: states.filter((state) => acceptStateSet.has(state)),
    transitions,
  };
}

export function validateDfa(dfa: DFAConfig): string[] {
  const errors: string[] = [];

  if (dfa.states.length === 0) {
    errors.push('状态集 states 不能为空。');
  }

  if (dfa.alphabet.length === 0) {
    errors.push('字母表 alphabet 不能为空。');
  }

  const stateSet = new Set(dfa.states);
  const alphabetSet = new Set(dfa.alphabet);

  if (stateSet.size !== dfa.states.length) {
    errors.push('状态集 states 中存在重复状态。');
  }

  if (alphabetSet.size !== dfa.alphabet.length) {
    errors.push('字母表 alphabet 中存在重复符号。');
  }

  if (!dfa.startState || !stateSet.has(dfa.startState)) {
    errors.push('开始状态 startState 必须属于状态集。');
  }

  if (dfa.acceptStates.length === 0) {
    errors.push('接受状态集 acceptStates 不能为空。');
  } else {
    dfa.acceptStates.forEach((state) => {
      if (!stateSet.has(state)) {
        errors.push(`接受状态 ${state} 不属于状态集。`);
      }
    });
  }

  for (const state of dfa.states) {
    for (const symbol of dfa.alphabet) {
      const target = dfa.transitions[state]?.[symbol];
      if (!target) {
        errors.push(`缺少转移: ${state} --${symbol}--> ?`);
        continue;
      }

      if (!stateSet.has(target)) {
        errors.push(`转移目标 ${target} 不属于状态集。`);
      }
    }
  }

  return errors;
}

export function edgeId(from: string, to: string, label: string) {
  return `${from}__${to}__${label}`;
}
