import { init as initRuntime, state, publicApi } from "./runtime.js";

export { state, publicApi };

export async function init() {
  await initRuntime();
}
