// Imported first by worker.ts, before any SDK loads. workerd rejects most RequestInit.cache modes
// ("Unsupported cache mode") that Node accepts, and axios's fetch adapter (used by the Allbridge,
// Blend and XOXNO SDKs in Workers) always sends cache: "default". Drop any mode the runtime
// can't take; "no-store", the only one our own code uses, passes through.
const SUPPORTED = new Set(["no-store"]);

function clean<T extends RequestInit | undefined>(init: T): T {
  if (init && init.cache !== undefined && !SUPPORTED.has(init.cache)) {
    const { cache: _dropped, ...rest } = init;
    return rest as T;
  }
  return init;
}

const NativeRequest = globalThis.Request;
class CompatRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, clean(init));
  }
}
globalThis.Request = CompatRequest as typeof Request;

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => nativeFetch(input, clean(init))) as typeof fetch;

export {};
