import type { DFAConfig, DfaPreset, SimulationResult } from './dfa';
import type { LR0AutomatonData } from './components/LR0Visualizer';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export type ScannerToken = {
  type: string;
  value: string;
};

export type ScannerResponse = {
  tokens: ScannerToken[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let errorMessage = '';
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === 'string') {
        errorMessage = parsed.error;
      }
    } catch {
      // Fall through to the raw response text below.
    }

    throw new Error(errorMessage || body || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchDfaPresets() {
  return request<{ presets: DfaPreset[] }>('/dfa/presets');
}

export function saveDfaPreset(preset: { id?: string; name: string; dfa: DFAConfig }) {
  return request<DfaPreset>('/dfa/presets', {
    method: 'POST',
    body: JSON.stringify(preset),
  });
}

export function deleteDfaPreset(id: string) {
  return request<{ success: boolean }>(`/dfa/presets/${id}`, {
    method: 'DELETE',
  });
}

export function validateDfaOnServer(dfa: DFAConfig) {
  return request<{ valid: boolean; errors: string[] }>('/dfa/validate', {
    method: 'POST',
    body: JSON.stringify(dfa),
  });
}

export function simulateDfa(dfa: DFAConfig, input: string) {
  return request<SimulationResult>('/dfa/simulate', {
    method: 'POST',
    body: JSON.stringify({ dfa, input }),
  });
}

export function scanSourceCode(source: string) {
  return request<ScannerResponse>('/scanner/tokens', {
    method: 'POST',
    body: JSON.stringify({ source }),
  });
}

export function fetchLR0Automaton() {
  return request<LR0AutomatonData>('/lr0/automaton');
}

export function generateLR0Automaton(grammar: string) {
  return request<LR0AutomatonData>('/lr0/automaton', {
    method: 'POST',
    body: JSON.stringify({ grammar }),
  });
}
