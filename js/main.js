/**
 * main.js — Point d'entrée : connecte le jeu 3D, la caméra et l'interface.
 */
(function () {
  const canvas = document.getElementById("game-canvas");
  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const statusEl = document.getElementById("camera-status");
  const gameOverEl = document.getElementById("game-over");
  const finalScoreEl = document.getElementById("final-score");
  const overMessageEl = document.getElementById("over-message");
  const restartBtn = document.getElementById("restart-btn");
  const videoEl = document.getElementById("webcam");
  const previewEl = document.getElementById("camera-preview");

  const STATUS = {
    waiting: ["Initialisation de la caméra…", "status-waiting"],
    lost: ["Aucune main visible — mode clavier actif", "status-lost"],
    error: ["Caméra indisponible — flèches + Espace", "status-lost"],
  };

  function renderLives(count) {
    livesEl.textContent = "♥".repeat(count) + "♡".repeat(3 - count);
  }

  function getOverMessage(score) {
    if (score >= 500) return "Commandant de flotte — performance légendaire !";
    if (score >= 300) return "Excellent pilotage, capitaine.";
    if (score >= 150) return "Belle mission, continuez comme ça.";
    if (score >= 50) return "Pas mal pour un premier vol.";
    return "Le vaisseau a été détruit. Retentez votre chance.";
  }

  function setStatus(text, className) {
    statusEl.textContent = text;
    statusEl.className = `status-badge ${className}`;
  }

  /** Labels Gauche/Droite inversés pour correspondre à l'affichage miroir de la caméra. */
  function formatHandsStatus({ left, right, leftMode, rightMode }) {
    const label = (side, detected, mode) => {
      if (!detected) return `${side} : inactive`;
      if (mode === "pistolet") return `${side} : 🔫 tir prêt`;
      if (mode === "direction") return `${side} : ✋ pilotage`;
      return `${side} : détectée`;
    };
    return [
      label("Droite", left, leftMode),
      label("Gauche", right, rightMode),
    ].join("  ·  ");
  }

  const game = new Game(canvas);

  game.onGameOver = (finalScore) => {
    finalScoreEl.textContent = finalScore;
    overMessageEl.textContent = getOverMessage(finalScore);
    gameOverEl.classList.remove("hidden");
  };

  game.onLivesChange = renderLives;

  restartBtn.addEventListener("click", () => {
    gameOverEl.classList.add("hidden");
    game.restart();
  });

  setInterval(() => {
    scoreEl.textContent = Math.floor(game.score);
  }, 100);

  renderLives(game.lives);
  game.start();

  const tracker = new HandTracker(videoEl, {
    onDirection: (dx, dy) => game.setDirection(dx, dy),
    onNeutral: () => game.clearDirection(),
    onShoot: () => game.fireBullet(true),
    onStatusChange: (status) => {
      if (status === "lost") {
        setStatus(...STATUS.lost);
        game.clearDirection();
      }
    },
    onHandsUpdate: (hands) => {
      if (!hands.left && !hands.right) return;
      setStatus(formatHandsStatus(hands), "status-detected");
    },
  });

  tracker.start().catch(() => {
    setStatus(...STATUS.error);
    previewEl.style.display = "none";
  });
})();
