import { initReveal } from './reveal.js';
import { initProgress, initSpotlight, initParallax, initTabs, initCopy } from './fx.js';
import { startMarket } from './market.js';
import { ui } from './board.js';

ui.init();
initProgress();
initSpotlight();
initParallax();
initTabs();
initCopy();
initReveal();
startMarket({
  onLoading: (has) => ui.loading(has),
  onData: (rows) => ui.data(rows),
  onError: (has, rows) => ui.error(has, rows),
});
