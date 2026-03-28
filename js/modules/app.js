import { init as initRuntime, state, publicApi as runtimePublicApi } from "./runtime.js";
import { libraryModule } from "./library.js";
import { nfcModule } from "./nfc.js";

export async function init(){
  await initRuntime();
}

export { state };

export const publicApi = {
  ...runtimePublicApi,
  ...libraryModule,
  ...nfcModule
};
