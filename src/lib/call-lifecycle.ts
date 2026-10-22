/** Permission prompts cannot be aborted; invalidate their result instead. */
export function createCallLifecycle() {
  let generation = 0;
  let mounted = true;
  return {
    begin: () => generation,
    current: (token: number) => mounted && token === generation,
    invalidate: () => { generation += 1; },
    mount: () => { mounted = true; },
    unmount: () => { mounted = false; generation += 1; },
    accept<T extends { getTracks: () => { stop: () => void }[] }>(token: number, stream: T): boolean {
      if (mounted && token === generation) return true;
      stream.getTracks().forEach((track) => track.stop());
      return false;
    },
  };
}