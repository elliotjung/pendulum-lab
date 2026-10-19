import type { NetworkConfig, NetworkBasinSnapshot } from '../../adapters/physics/network';
import { createNetworkBasinClient, type NetworkBasinWorkerFactory } from '../../adapters/physics/network-client';

/** Each worker request is bounded; cancellation terminates the worker and invalidates queued replies. */
export function createNetworkBasinModel(onChange: () => void, workerFactory?: NetworkBasinWorkerFactory) {
  let snapshot: NetworkBasinSnapshot | undefined,
    status: 'ready' | 'running' | 'completed' | 'cancelled' | 'error' = 'ready',
    error = '',
    generation = 0,
    disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined, client: ReturnType<typeof createNetworkBasinClient> | undefined;
  function stop() {
    generation++;
    clearTimeout(timer);
    timer = undefined;
    client?.dispose();
    client = undefined;
  }
  return {
    get state() {
      return { snapshot, status, error };
    },
    run(config: NetworkConfig) {
      if (disposed || status === 'running') return;
      stop();
      snapshot = undefined;
      error = '';
      status = 'running';
      const current = generation;
      client = createNetworkBasinClient(
        config,
        (event) => {
          if (disposed || generation !== current) return;
          if (event.type === 'error') {
            if (event.snapshot) snapshot = event.snapshot.basin;
            stop();
            status = 'error';
            error = event.message;
          } else if (event.type === 'ready' || event.type === 'progress') {
            snapshot = event.basin;
            if (event.done) {
              stop();
              status = 'completed';
            } else
              timer = setTimeout(() => {
                timer = undefined;
                if (!disposed && generation === current) client?.advance(64);
              }, 0);
          }
          onChange();
        },
        workerFactory
      );
      onChange();
    },
    cancel() {
      if (!disposed && status === 'running') {
        stop();
        status = 'cancelled';
        onChange();
      }
    },
    reset() {
      if (disposed) return;
      stop();
      snapshot = undefined;
      status = 'ready';
      error = '';
      onChange();
    },
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
    }
  };
}

export function networkBasinCsv(config: NetworkConfig, snapshot: NetworkBasinSnapshot): string {
  const rows = ['x_normalized,y_normalized,magnet_id,magnet_index,converged_1,steps'];
  if (!config.basin || snapshot.cells.length > config.basin.size ** 2)
    throw new Error('유효한 자기 격자가 필요합니다.');
  for (const cell of snapshot.cells) {
    const index = config.graph.nodes.findIndex((node) => node.id === cell.magnetId);
    const values = [cell.x, cell.y, index, Number(cell.converged), cell.steps];
    if (
      !values.every(Number.isFinite) ||
      !Number.isInteger(cell.steps) ||
      cell.steps < 0 ||
      (cell.converged && index < 0)
    )
      throw new Error('유한한 격자 결과만 내보낼 수 있습니다.');
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(cell.magnetId)) throw new Error('안전한 자석 ID가 필요합니다.');
    rows.push([values[0], values[1], cell.magnetId, ...values.slice(2)].join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}
