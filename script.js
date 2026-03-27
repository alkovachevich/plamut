import { init, state, publicApi } from "./js/ui/ui.js";

window.state = state;
Object.assign(window, publicApi);

init();
