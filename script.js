import { init, state, publicApi } from "./js/ui.js";

window.state = state;
Object.assign(window, publicApi);

init();
