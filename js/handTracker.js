/**
 * handTracker.js — Détection des mains (MediaPipe Hands).
 *
 * Rôles internes (position du poignet dans l'image) :
 *   playerLeft  → tir (pistolet : index+majeur, gâchette : pouce)
 *   playerRight → pilotage (main ouverte, direction des doigts)
 *
 * Note : les labels Gauche/Droite sont inversés côté UI dans main.js (miroir caméra).
 */
class HandTracker {
  static FINGERS = [[8, 6, 5], [12, 10, 9], [16, 14, 13], [20, 18, 17]];
  static PALM_IDS = [0, 5, 9, 13, 17];
  static STEER_TIPS = [8, 12, 16];

  constructor(videoElement, callbacks) {
    this.video = videoElement;
    this.callbacks = callbacks;

    this.smoothing = 0.14;
    this.smoothedDir = { x: 0, y: 0 };
    this.hasDirection = false;
    this.handVisible = false;
    this.lostFrames = 0;
    this.maxHoldFrames = 18;
    this.triggerReady = true;
    this.prevThumbDist = null;
  }

  async start() {
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => this.handleResults(results));

    const camera = new Camera(this.video, {
      onFrame: async () => hands.send({ image: this.video }),
      width: 640,
      height: 480,
    });

    await camera.start();
  }

  /** x faible dans l'image = main gauche du joueur (webcam frontale). */
  splitPlayerHands(allHands) {
    const sorted = allHands
      .map((lm) => ({ lm, x: lm[0].x }))
      .sort((a, b) => a.x - b.x);

    if (sorted.length === 2) {
      return { playerLeft: sorted[0].lm, playerRight: sorted[1].lm };
    }
    if (sorted.length === 1) {
      return sorted[0].x < 0.5
        ? { playerLeft: sorted[0].lm, playerRight: null }
        : { playerLeft: null, playerRight: sorted[0].lm };
    }
    return { playerLeft: null, playerRight: null };
  }

  handleResults(results) {
    const allHands = results.multiHandLandmarks;

    if (!allHands?.length) {
      this.lostFrames++;
      this.callbacks.onHandsUpdate({ left: false, right: false, leftMode: null, rightMode: null });

      if (this.lostFrames <= this.maxHoldFrames && this.hasDirection) {
        this.callbacks.onDirection(this.smoothedDir.x, this.smoothedDir.y);
        return;
      }
      if (this.lostFrames > 10 && this.handVisible) {
        this.handVisible = false;
        this.hasDirection = false;
        this.smoothedDir = { x: 0, y: 0 };
        this.callbacks.onStatusChange("lost");
        this.callbacks.onNeutral();
      }
      return;
    }

    this.lostFrames = 0;
    if (!this.handVisible) {
      this.handVisible = true;
      this.callbacks.onStatusChange("detected");
    }

    const { playerLeft, playerRight } = this.splitPlayerHands(allHands);
    const leftMode = playerLeft
      ? (this.isPistolBarrel(playerLeft) ? "pistolet" : "detectee")
      : null;
    const rightMode = playerRight
      ? (this.isHandOpen(playerRight) ? "direction" : "detectee")
      : null;

    this.callbacks.onHandsUpdate({
      left: !!playerLeft,
      right: !!playerRight,
      leftMode,
      rightMode,
    });

    if (playerLeft) {
      this.detectShoot(playerLeft);
    } else {
      this.resetTrigger();
    }

    if (playerRight && this.isHandOpen(playerRight)) {
      this.updateDirection(playerRight);
    } else if (this.hasDirection) {
      this.decayDirection();
    } else {
      this.callbacks.onNeutral();
    }
  }

  resetTrigger() {
    this.triggerReady = true;
    this.prevThumbDist = null;
  }

  dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  handScale(lm) {
    return this.dist(lm[9], lm[0]) || 0.1;
  }

  landmarkCenter(lm, ids) {
    let x = 0, y = 0;
    for (const id of ids) {
      x += lm[id].x;
      y += lm[id].y;
    }
    return { x: x / ids.length, y: y / ids.length };
  }

  isFingerExtended(lm, tip, pip, mcp) {
    const byMcp = this.dist(lm[tip], lm[mcp]) > this.dist(lm[pip], lm[mcp]) * 1.02;
    const byWrist = this.dist(lm[tip], lm[0]) > this.dist(lm[pip], lm[0]) * 1.02;
    return byMcp || byWrist;
  }

  countExtendedFingers(lm) {
    return HandTracker.FINGERS.reduce(
      (n, [tip, pip, mcp]) => n + (this.isFingerExtended(lm, tip, pip, mcp) ? 1 : 0),
      0
    );
  }

  isHandOpen(lm) {
    return this.countExtendedFingers(lm) >= 3;
  }

  /** Index + majeur tendus, pas paume ouverte. */
  isPistolBarrel(lm) {
    const scale = this.handScale(lm);
    const wrist = lm[0];
    const indexOut = this.dist(lm[8], wrist) > scale * 0.45;
    const middleOut = this.dist(lm[12], wrist) > scale * 0.45;
    return indexOut && middleOut && this.countExtendedFingers(lm) <= 3;
  }

  detectShoot(lm) {
    if (!this.isPistolBarrel(lm)) {
      this.resetTrigger();
      return;
    }

    const scale = this.handScale(lm);
    const palm = this.landmarkCenter(lm, HandTracker.PALM_IDS);
    const thumbIndexDist = this.dist(lm[4], lm[8]) / scale;
    const thumbPalmDist = this.dist(lm[4], palm) / scale;
    const thumbOpen = thumbIndexDist > 0.18 || thumbPalmDist > 0.32;

    const shouldFire =
      this.triggerReady &&
      (thumbIndexDist < 0.30 ||
        thumbPalmDist < 0.38 ||
        (this.prevThumbDist !== null && thumbIndexDist < this.prevThumbDist - 0.04));

    if (shouldFire) {
      this.callbacks.onShoot();
      this.triggerReady = false;
    }

    if (thumbOpen) this.triggerReady = true;
    this.prevThumbDist = thumbIndexDist;
  }

  updateDirection(lm) {
    const palm = this.landmarkCenter(lm, HandTracker.PALM_IDS);
    const tips = this.landmarkCenter(lm, HandTracker.STEER_TIPS);

    let dx = -(tips.x - palm.x);
    let dy = tips.y - palm.y;
    const len = Math.hypot(dx, dy);

    if (len < 0.06) {
      this.decayDirection();
      return;
    }

    dx /= len;
    dy /= len;
    const intensity = Math.min(1, (len - 0.06) / 0.18);
    dx *= intensity;
    dy *= intensity;

    if (!this.hasDirection) {
      this.smoothedDir.x = dx;
      this.smoothedDir.y = dy;
      this.hasDirection = true;
    } else {
      this.smoothedDir.x += (dx - this.smoothedDir.x) * this.smoothing;
      this.smoothedDir.y += (dy - this.smoothedDir.y) * this.smoothing;
    }

    this.callbacks.onDirection(this.smoothedDir.x, this.smoothedDir.y);
  }

  decayDirection() {
    if (!this.hasDirection) {
      this.callbacks.onNeutral();
      return;
    }

    this.smoothedDir.x *= 0.82;
    this.smoothedDir.y *= 0.82;

    if (Math.hypot(this.smoothedDir.x, this.smoothedDir.y) < 0.04) {
      this.hasDirection = false;
      this.smoothedDir = { x: 0, y: 0 };
      this.callbacks.onNeutral();
    } else {
      this.callbacks.onDirection(this.smoothedDir.x, this.smoothedDir.y);
    }
  }
}
