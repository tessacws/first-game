import './style.css';
import { Game, initPhysics } from './game/Game.js';
import { UI } from './ui/UI.js';

async function main() {
  const canvas = document.getElementById('scene');
  const root = document.getElementById('ui');
  root.innerHTML = '<div class="screen"><div class="spinner"></div></div>';

  await initPhysics();
  const game = new Game(canvas);
  const ui = new UI(root, game);
  ui.showMenu();

  // Handy for debugging from the console
  if (import.meta.env.DEV) Object.assign(window, { game, ui });
}

main().catch((err) => {
  console.error(err);
  document.getElementById('ui').innerHTML =
    `<div class="screen"><div class="panel"><h2>Oops</h2><p class="sub">${String(err.message || err)}</p></div></div>`;
});
