import { rk2Step, rk4Step, eulerStep } from '../physics/integrators';

type RequestMessage = {
  id: string;
  state: number[];
  dt: number;
  steps: number;
  method: 'rk4' | 'rk2' | 'euler';
};

function oscillatorRhs(state: Float64Array, out: Float64Array): void {
  out[0] = state[1] ?? 0;
  out[1] = -(state[0] ?? 0);
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const started = performance.now();
  const request = event.data as Partial<RequestMessage>;
  const valid =
    typeof request.id === 'string' &&
    request.id.length > 0 &&
    request.id.length <= 160 &&
    Array.isArray(request.state) &&
    request.state.length === 2 &&
    request.state.every((value, index) => Object.hasOwn(request.state!, index) && Number.isFinite(value)) &&
    Number.isFinite(request.dt) &&
    request.dt! > 0 &&
    request.dt! <= 1 &&
    Number.isSafeInteger(request.steps) &&
    request.steps! >= 1 &&
    request.steps! <= 100_000 &&
    (request.method === 'rk4' || request.method === 'rk2' || request.method === 'euler');
  if (!valid) {
    if (typeof request.id === 'string') {
      self.postMessage({ id: request.id, error: 'physics worker received a malformed or excessive request' });
    }
    return;
  }
  const state = new Float64Array(request.state as number[]);
  const out = new Float64Array(state.length);
  const step = request.method === 'euler' ? eulerStep : request.method === 'rk2' ? rk2Step : rk4Step;
  for (let i = 0; i < request.steps!; i += 1) {
    step(state, request.dt!, oscillatorRhs, out);
    state.set(out);
  }
  self.postMessage({ id: request.id, state: Array.from(state), elapsedMs: performance.now() - started });
});
