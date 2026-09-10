(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = 1000;
  const H = 700;
  const GOAL = 3;
  const coinSize = 54;
  let previous = 0;
  let time = 0;
  let status = 'ready';
  let holdTime = 0;
  let toast = 'レモンの上をタップして 100円を置こう';
  let toastUntil = 5;
  let activeCoin = null;
  let hintUntil = 0;
  let hints = 2;
  let soundOn = true;
  // Typical masses/energy used for the game's dynamic-stability model.
  const COIN_MASS_KG = 0.0048;
  const LEMON_MASS_KG = 0.11;
  const DROP_HEIGHT_M = 0.16;
  const IMPACT_ENERGY_J = COIN_MASS_KG * 9.81 * DROP_HEIGHT_M;
  const RECOVERY_PER_SECOND = 0.018; // 1.8 percentage points / second, linear.
  let impactDisturbance = 0;
  let missStreak = 0;
  let usedCoins = 0;
  let axialAngle = 0;
  let axialVelocity = 0;
  let successPulse = 0;
  let clearFxAge = -1;
  let celebrationCount = 0;
  const landedCoins = [];
  const bottomCoins = [];
  const fallingBottomCoins = [];
  const bottomBubbleBursts = [];
  const successBursts = [];
  const landingEffects = [];
  let viewScale = 1;
  let viewOffsetX = 0;
  let viewOffsetY = 0;
  let compactPortrait = false;
  let logicalFrameHeight = H;

  const glass = new Image(); glass.decoding = 'async'; glass.src = 'assets/glass-user-transparent.png';
  const waterGlass = new Image(); waterGlass.decoding = 'async'; waterGlass.src = 'assets/glass-water-clean.png';
  const lemon = new Image(); lemon.decoding = 'async'; lemon.src = 'assets/lemon-photoreal-smooth.png';
  const yenCoin = new Image(); yenCoin.decoding = 'async'; yenCoin.src = 'assets/yen-coin-real.png';
  const crushHand = new Image(); crushHand.decoding = 'async'; crushHand.src = 'assets/woman-hand-crush-lemon.png';
  const crushHandTwo = new Image(); crushHandTwo.decoding = 'async'; crushHandTwo.src = 'assets/woman-hand-crush-2-lemons.png';

  function aimAssistFactor() { return time < hintUntil ? .5 : 1; }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    compactPortrait = rect.height > rect.width * 1.15;
    logicalFrameHeight = compactPortrait ? 940 : H;
    viewScale = compactPortrait
      ? Math.min(rect.width / 480, rect.height / logicalFrameHeight)
      : Math.min(rect.width / W, rect.height / H);
    viewOffsetX = (rect.width - W * viewScale) / 2;
    viewOffsetY = (rect.height - logicalFrameHeight * viewScale) / 2;
    ctx.setTransform(viewScale * dpr, 0, 0, viewScale * dpr, viewOffsetX * dpr, viewOffsetY * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  function uiLayout() {
    if (!compactPortrait) {
      return {
        scoreX: 26, scoreY: 24, controlsY: 25,
        controls: [{ x: 710, width: 100 }, { x: 820, width: 78 }, { x: 910, width: 64 }],
        analysisX: 28, analysisY: 104, tabX: 28, tabY: 176,
      };
    }
    return {
      scoreX: 374, scoreY: 690, controlsY: 758,
      controls: [{ x: 369, width: 100 }, { x: 479, width: 78 }, { x: 567, width: 64 }],
      analysisX: 330, analysisY: 806, tabX: 505, tabY: 806,
    };
  }

  function baseLemonPose() {
    const calm = aimAssistFactor();
    return {
      x: 500 + (Math.sin(time * .88) * 4.2 + Math.sin(time * 2.07 + .6) * 1.1) * calm,
      y: 166 + (Math.sin(time * 1.15 + .5) * 3.2 + Math.sin(time * 3.2) * .7) * calm,
    };
  }

  function lemonPose() {
    const base = baseLemonPose(); const balance = targetPoint();
    const calm = aimAssistFactor();
    // Keep the enlarged fruit within the narrow bowl; the saturation reads as
    // a soft rebound against the glass rather than an abrupt stop.
    const wantedX = (base.x - 500) + balance.roll * .92;
    const wantedY = (base.y - 166) + balance.pitch * .55;
    const loadRoll = coinLoadRoll(base);
    const axialRoll = axialAngle * calm + balance.roll * .25 + loadRoll * .35;
    return {
      x: 500 + 21 * Math.tanh(wantedX / 21),
      y: 166 + 11 * Math.tanh(wantedY / 11),
      tilt: Math.max(-6, Math.min(6, balance.roll + loadRoll * .42)) * Math.PI / 180 + Math.sin(time * .72) * .004,
      axialRoll,
    };
  }

  function coinLoadRoll(base) {
    const ratio = COIN_MASS_KG / LEMON_MASS_KG;
    let roll = 0;
    landedCoins.forEach((coin) => { roll += ((coin.x - base.x) / 202.5) * ratio * 80; });
    if (status === 'holding' && activeCoin) roll += ((activeCoin.x - base.x) / 202.5) * ratio * 68;
    return roll;
  }

  function kickAxialRoll(coin, strength = 1) {
    const base = baseLemonPose();
    const lateral = (coin.x - base.x) / 202.5;
    // A downward impact on the visible upper surface starts a short roll;
    // lateral placement determines how strongly it twists.
    axialVelocity += (34 + lateral * 32) * strength;
  }

  function bowlPath() {
    ctx.beginPath();
    ctx.moveTo(382, 118); ctx.bezierCurveTo(402, 57, 598, 57, 618, 118);
    ctx.bezierCurveTo(652, 218, 638, 345, 584, 414);
    ctx.bezierCurveTo(558, 447, 530, 461, 500, 465);
    ctx.bezierCurveTo(470, 461, 442, 447, 416, 414);
    ctx.bezierCurveTo(362, 345, 348, 218, 382, 118); ctx.closePath();
  }

  function chime(kind) {
    if (!soundOn) return;
    try {
      const audio = new AudioContext(); const osc = audio.createOscillator(); const gain = audio.createGain();
      osc.frequency.value = kind === 'fail' ? 165 : kind === 'land' ? 480 : 760;
      gain.gain.setValueAtTime(.055, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .22);
      osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + .23);
    } catch (_) { /* Sound is optional. */ }
  }

  function drawBackground() {
    const bg = ctx.createRadialGradient(500, 275, 20, 500, 330, 650);
    bg.addColorStop(0, '#1b3b38'); bg.addColorStop(.45, '#0d2425'); bg.addColorStop(1, '#050e11');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, logicalFrameHeight);
    const glow = ctx.createRadialGradient(500, 355, 5, 500, 355, 270);
    glow.addColorStop(0, 'rgba(208,255,211,.17)'); glow.addColorStop(.55, 'rgba(131,235,200,.045)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, logicalFrameHeight);
  }

  function drawCoin(coin, size = coinSize) {
    if (!yenCoin.complete || !yenCoin.naturalWidth) return;
    ctx.save(); ctx.translate(coin.x, coin.y); ctx.rotate(coin.rotation || 0);
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 6;
    ctx.drawImage(yenCoin, -size / 2, -size / 2, size, size); ctx.restore();
  }

  function drawFallingBottomCoins() {
    fallingBottomCoins.forEach((coin) => {
      const alpha = Math.max(.12, 1 - coin.progress * .55);
      ctx.save(); ctx.globalAlpha = alpha;
      // Bubbles only appear as the coin reaches the bowl floor, not throughout its fall.
      const nearFloor = Math.max(0, (coin.progress - .72) / .28);
      for (let i = 0; i < (nearFloor > 0 ? 3 : 0); i++) {
        const wobble = Math.sin(time * (2.1 + i * .24) + coin.bubbleSeed + i) * (6 + i * 3);
        const rise = 7 + i * 10 + nearFloor * 10;
        ctx.strokeStyle = 'rgba(231,255,251,.66)'; ctx.lineWidth = 1.15;
        ctx.beginPath(); ctx.arc(coin.x + wobble, coin.y - rise, 2.2 + (i % 2), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore(); drawCoin(coin, coin.size);
    });
  }

  function drawBottomBubbleBursts() {
    bottomBubbleBursts.forEach((burst) => {
      const life = 1 - burst.age / .8;
      ctx.save(); ctx.globalAlpha = Math.max(0, life);
      for (let i = 0; i < 7; i++) {
        const angle = burst.seed + i * .897;
        const distance = 6 + burst.age * (19 + i * 2);
        ctx.strokeStyle = 'rgba(229,255,250,.72)'; ctx.lineWidth = 1.05;
        ctx.beginPath(); ctx.arc(burst.x + Math.cos(angle) * distance, burst.y - 4 - burst.age * 28 - Math.sin(angle) * distance * .35, 1.7 + (i % 3), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawLemon() {
    if (!lemon.complete || !lemon.naturalWidth) return;
    const p = lemonPose();
    const squeeze = clearFxAge < 0 ? 0 : Math.max(0, Math.min(1, (clearFxAge - .72) / .5));
    const handCover = clearFxAge < 0 ? 1 : Math.max(0, 1 - clearFxAge / .78);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.tilt * .28); ctx.scale(1 + squeeze * .08, 1 - squeeze * .48); ctx.globalAlpha = handCover * (1 - squeeze * .82);
    ctx.shadowColor = 'rgba(0,0,0,.34)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 14; ctx.filter = 'blur(.7px)';
    // Keep the silhouette fixed and slide the lemon image within it. This reads
    // as a front/back roll while never letting the fruit spill outside its shape.
    ctx.beginPath(); ctx.ellipse(0, 0, 202, 132, 0, 0, Math.PI * 2); ctx.clip();
    const slide = Math.max(-18, Math.min(18, p.axialRoll * 1.8));
    ctx.drawImage(lemon, -202.5, -133.5 + slide, 405, 267); ctx.restore();
  }

  function drawSuccessEffects() {
    successBursts.forEach((burst) => {
      const life = 1 - burst.age / 1.25;
      const radius = 24 + burst.age * 72;
      ctx.save(); ctx.globalAlpha = Math.max(0, life);
      ctx.strokeStyle = '#f8dc77'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(burst.x, burst.y, radius, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI * 2 / 10 + burst.age * .8;
        const inner = radius + 5; const outer = inner + 13 * life;
        ctx.strokeStyle = i % 2 ? '#fff9d7' : '#f2c957'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(burst.x + Math.cos(angle) * inner, burst.y + Math.sin(angle) * inner); ctx.lineTo(burst.x + Math.cos(angle) * outer, burst.y + Math.sin(angle) * outer); ctx.stroke();
      }
      ctx.fillStyle = '#fff4b3'; ctx.font = '800 17px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('ON!', burst.x, burst.y - radius - 12); ctx.textAlign = 'left';
      ctx.restore();
    });
  }

  function drawLandingEffects() {
    landingEffects.forEach((effect) => {
      const age = effect.age;
      const life = Math.max(0, 1 - age / 1.45);
      const x = effect.coin ? effect.coin.x : effect.x;
      const y = effect.coin ? effect.coin.y : effect.y;
      const pop = Math.min(1, age / .16);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const halo = ctx.createRadialGradient(x, y, 4, x, y, 62 + age * 28);
      halo.addColorStop(0, `rgba(255,250,194,${.75 * life})`);
      halo.addColorStop(.35, `rgba(246,205,86,${.34 * life})`);
      halo.addColorStop(1, 'rgba(246,205,86,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 82, 0, Math.PI * 2); ctx.fill();
      for (let ring = 0; ring < 2; ring++) {
        const radius = 25 + age * (48 + ring * 19);
        ctx.globalAlpha = life * (ring ? .48 : .9);
        ctx.strokeStyle = ring ? '#fff4bd' : '#e9bd4f'; ctx.lineWidth = ring ? 1.2 : 2.4;
        ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .56, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = life;
      for (let i = 0; i < 14; i++) {
        const angle = effect.seed + i * Math.PI * 2 / 14;
        const distance = 26 + age * (38 + (i % 4) * 8);
        const sparkleX = x + Math.cos(angle) * distance;
        const sparkleY = y + Math.sin(angle) * distance * .58;
        const size = (i % 3 === 0 ? 3.4 : 1.8) * life;
        ctx.fillStyle = i % 2 ? '#fff8cf' : '#e9bd4f';
        ctx.beginPath(); ctx.arc(sparkleX, sparkleY, size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = Math.min(1, pop * 1.4) * life;
      ctx.translate(x, y - 62 - age * 8); ctx.scale(.82 + pop * .18, .82 + pop * .18);
      ctx.shadowColor = '#d8a83e'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#fff4bd'; ctx.font = '900 17px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('NICE LANDING!', 0, 0);
      ctx.fillStyle = 'rgba(255,248,215,.9)'; ctx.font = '700 10px system-ui, sans-serif';
      ctx.fillText('3秒キープ', 0, 17);
      ctx.restore();
    });
  }

  function drawClearCelebration() {
    if (clearFxAge < 0) return;
    const arrival = Math.min(1, clearFxAge / .72);
    const eased = 1 - Math.pow(1 - arrival, 3);
    const squeeze = Math.max(0, Math.min(1, (clearFxAge - .72) / .5));
    const fade = clearFxAge > 2.05 ? Math.max(0, 1 - (clearFxAge - 2.05) / .6) : 1;
    ctx.save(); ctx.globalAlpha = fade;
    const handSprite = celebrationCount === 1 ? crushHand : crushHandTwo;
    if (handSprite.complete && handSprite.naturalWidth) {
      const handY = -930 + 500 * eased;
      // On the final success the floating lemon remains visible behind the
      // two-lemon grip, making the hand gather and squeeze three at once.
      if (celebrationCount === 3 && lemon.complete && lemon.naturalWidth) {
        ctx.save();
        ctx.translate(560, 175); ctx.rotate(-.28 + squeeze * .08);
        ctx.scale(1 + squeeze * .06, 1 - squeeze * .36);
        ctx.shadowColor = 'rgba(0,0,0,.38)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 12;
        ctx.drawImage(lemon, -118, -78, 236, 156);
        ctx.restore();
      }
      ctx.translate(500, 166); ctx.scale(1 + squeeze * .035, 1 - squeeze * .055); ctx.translate(-500, -166);
      ctx.shadowColor = 'rgba(0,0,0,.48)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 16;
      ctx.drawImage(handSprite, 120, handY, 760, 912);
    }
    if (squeeze > 0) {
      ctx.globalAlpha = fade * Math.min(1, squeeze * 2);
      for (let i = 0; i < 18; i++) {
        const angle = -2.75 + i * .324;
        const distance = 40 + squeeze * (44 + (i % 5) * 10);
        const x = 500 + Math.cos(angle) * distance;
        const y = 190 + Math.sin(angle) * distance * .55;
        ctx.fillStyle = i % 3 ? '#ffe56c' : '#fff9c7';
        ctx.beginPath(); ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#fff1a6'; ctx.shadowColor = '#f7c94b'; ctx.shadowBlur = 24;
      ctx.font = '900 27px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(celebrationCount === GOAL ? 'PERFECT!  DRINK GET' : `${celebrationCount}枚目 SUCCESS!`, 500, 545); ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function drawHud() {
    const layout = uiLayout();
    const scoreX = layout.scoreX; const scoreY = layout.scoreY;
    ctx.save();
    ctx.fillStyle = 'rgba(2,11,13,.66)'; ctx.strokeStyle = 'rgba(226,255,240,.2)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(scoreX, scoreY, 252, 64, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9fff0'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText('100円レモン  ·  3枚チャレンジ', scoreX + 18, scoreY + 25);
    ctx.fillStyle = '#a9d8ca'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText(`成功 ${landedCoins.length} / ${GOAL}`, scoreX + 18, scoreY + 48);
    for (let i = 0; i < GOAL; i++) {
      ctx.fillStyle = i < landedCoins.length ? '#f7d66d' : 'rgba(230,255,241,.18)';
      ctx.beginPath(); ctx.arc(scoreX + 202 + i * 15, scoreY + 43, 5.5, 0, Math.PI * 2); ctx.fill();
    }
    if (successPulse > 0) {
      const scale = 1 + Math.sin((1 - successPulse) * 22) * .12 * successPulse;
      ctx.save(); ctx.translate(scoreX + 127, scoreY + 30); ctx.scale(scale, scale); ctx.translate(-(scoreX + 127), -(scoreY + 30));
      ctx.shadowColor = '#f4cf61'; ctx.shadowBlur = 20 * successPulse;
      ctx.fillStyle = '#fff0a8'; ctx.font = '900 23px system-ui, sans-serif'; ctx.textAlign = 'center';
      const pulseY = compactPortrait ? scoreY - 12 : scoreY + 87;
      ctx.fillText(`+1  100円 ON!`, scoreX + 127, pulseY); ctx.textAlign = 'left'; ctx.restore();
    }
    const controls = layout.controls.map((control, i) => ({
      ...control,
      label: i === 0 ? (time < hintUntil ? `安定化 ${(hintUntil - time).toFixed(1)}s` : `狙い目 ${hints}`) : i === 1 ? (soundOn ? '音 ON' : '音 OFF') : 'RESET',
      enabled: i !== 0 || hints > 0 || time < hintUntil,
    }));
    controls.forEach((control, i) => {
      const width = control.width;
      ctx.fillStyle = control.enabled ? 'rgba(2,11,13,.66)' : 'rgba(2,11,13,.34)';
      ctx.strokeStyle = control.enabled ? 'rgba(226,255,240,.2)' : 'rgba(226,255,240,.08)';
      ctx.beginPath(); ctx.roundRect(control.x, layout.controlsY, width, 34, 13); ctx.fill(); ctx.stroke();
      ctx.fillStyle = control.enabled ? '#d9fff0' : 'rgba(217,255,240,.4)'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(control.label, control.x + width / 2, layout.controlsY + 22); ctx.textAlign = 'left';
    });

    if (status === 'holding') {
      const w = 180; const progress = holdTime / 3;
      const holdY = compactPortrait ? 642 : 28;
      ctx.fillStyle = 'rgba(2,11,13,.68)'; ctx.beginPath(); ctx.roundRect(410, holdY, w, 34, 17); ctx.fill();
      ctx.fillStyle = '#eafdf3'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.max(0, 3 - holdTime).toFixed(1)} 秒キープ！`, 500, holdY + 22); ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(420, holdY + 37, 160, 4);
      ctx.fillStyle = '#e5c36c'; ctx.fillRect(420, holdY + 37, 160 * Math.max(0, Math.min(1, progress)), 4);
    }
    if (toast && time < toastUntil) {
      const toastY = compactPortrait ? 886 : 635;
      ctx.globalAlpha = Math.min(1, (toastUntil - time) * 1.4);
      ctx.fillStyle = 'rgba(3,12,14,.76)'; ctx.beginPath(); ctx.roundRect(300, toastY, 400, 38, 19); ctx.fill();
      ctx.fillStyle = '#f2fff9'; ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(toast, 500, toastY + 25); ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function targetPoint() {
    // Simplified hydrostatic model: surface waves impose a roll/pitch torque,
    // while buoyancy supplies a restoring moment. Coins shift the combined CG.
    const p = baseLemonPose(); const n = landedCoins.length;
    const agitation = (1 + impactDisturbance * 3.1) * aimAssistFactor();
    const waveRoll = (Math.sin(time * 1.31) * 13 + Math.sin(time * 2.63 + .8) * 5) * agitation;
    const wavePitch = (Math.cos(time * 1.07 + .5) * 5 + Math.sin(time * 3.17) * 2) * agitation;
    const restoring = Math.max(.22, .90 - n * .13 - impactDisturbance);
    const surfaceY = p.y - 42; // Visible upper face of the floating lemon.
    let previousX = 0; let previousY = 0;
    landedCoins.forEach((coin) => { previousX += (coin.x - p.x) * .92; previousY += (coin.y - surfaceY) * 1.16; });
    return {
      x: p.x - (waveRoll + previousX) / restoring,
      y: surfaceY - (wavePitch + previousY) / (1.22 * restoring),
      radius: [34, 22, 12][n] || 10,
      roll: (waveRoll + previousX * .18) / (8.2 * restoring),
      pitch: (wavePitch + previousY * .08) / (3.4 * restoring),
      restoring,
    };
  }

  function drawBalanceGuide() {
    const target = targetPoint(); const p = lemonPose();
    const layout = uiLayout();
    const analysisX = layout.analysisX; const analysisY = layout.analysisY;
    const tabX = layout.tabX; const tabY = layout.tabY;
    ctx.save();
    // The faint vector is always visible: it describes the current centre of
    // buoyancy rather than giving the full precision of the skill hint.
    ctx.strokeStyle = 'rgba(205, 255, 229, .32)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(target.x, target.y); ctx.stroke();
    ctx.fillStyle = 'rgba(212,255,233,.38)'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
    const displayRadius = target.radius + 6;
    ctx.strokeStyle = 'rgba(239, 255, 158, .82)'; ctx.fillStyle = 'rgba(245, 255, 160, .12)'; ctx.lineWidth = 2.2; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.ellipse(target.x, target.y, displayRadius, displayRadius * .68, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,249,183,.95)'; ctx.beginPath(); ctx.arc(target.x, target.y, 4.2, 0, Math.PI * 2); ctx.fill();
    if (!compactPortrait) {
      ctx.fillStyle = 'rgba(225,255,239,.68)'; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('浮力中心', target.x, target.y - target.radius - 8); ctx.textAlign = 'left';
    }

    ctx.fillStyle = 'rgba(2,11,13,.58)'; ctx.strokeStyle = 'rgba(226,255,240,.16)';
    ctx.beginPath(); ctx.roundRect(analysisX, analysisY, 165, 58, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#acd9ca'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillText('HYDROSTATIC ANALYSIS', analysisX + 13, analysisY + 20);
    ctx.fillStyle = '#e5fff5'; ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(`ROLL ${target.roll >= 0 ? '+' : ''}${target.roll.toFixed(1)}°`, analysisX + 13, analysisY + 41);
    ctx.fillText(`復元力 ${(target.restoring * 100).toFixed(0)}%`, analysisX + 88, analysisY + 41);
    ctx.fillStyle = 'rgba(224,255,238,.7)'; ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillText(`軸回転 ${axialAngle >= 0 ? '+' : ''}${axialAngle.toFixed(1)}°  ·  攪乱 ${(impactDisturbance * 100).toFixed(0)}%`, analysisX + 13, analysisY + 55);

    const tab = ctx.createLinearGradient(tabX, tabY, tabX + 165, tabY + 68);
    tab.addColorStop(0, 'rgba(22,19,12,.94)'); tab.addColorStop(1, 'rgba(5,13,14,.9)');
    ctx.fillStyle = tab; ctx.strokeStyle = 'rgba(205,168,91,.52)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(tabX, tabY, 165, 66, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#cfae64'; ctx.font = '700 9px system-ui, sans-serif'; ctx.fillText('BAR TAB  ·  USED COINS', tabX + 13, tabY + 21);
    ctx.fillStyle = '#fff2cb'; ctx.font = '700 25px Georgia, serif'; ctx.fillText(`${usedCoins}`, tabX + 13, tabY + 48);
    ctx.fillStyle = '#cdb985'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText('枚  /  ¥' + (usedCoins * 100), tabX + 49, tabY + 46);
    ctx.restore();
  }

  function drawHint() {
    if (time >= hintUntil || status !== 'ready') return;
    const target = targetPoint();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,241,164,.95)'; ctx.fillStyle = 'rgba(255,229,86,.15)'; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.ellipse(target.x, target.y, target.radius, target.radius * .68, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = '#fff1a8'; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('狙い目', target.x, target.y - target.radius - 10); ctx.restore();
  }

  function stableAt(x, y) {
    const target = targetPoint();
    return Math.hypot(x - target.x, (y - target.y) * 1.22) < target.radius;
  }

  function failCoin(coin) {
    status = 'ready'; activeCoin = null; holdTime = 0;
    kickAxialRoll(coin, .55);
    // A 4.8 g coin dropped ~16 cm has about 0.0075 J of impact energy.
    // Map its dissipated wave energy to a temporary, capped stability loss.
    const penalty = IMPACT_ENERGY_J * 7.2 + Math.min(.03, missStreak * .006);
    impactDisturbance = Math.min(.52, impactDisturbance + penalty);
    missStreak++;
    const pileIndex = bottomCoins.length + fallingBottomCoins.length;
    const ring = pileIndex === 0 ? 0 : Math.min(74, 17 + Math.floor((pileIndex - 1) / 7) * 17);
    const angle = pileIndex * 2.39996 + (Math.random() - .5) * .18;
    const targetX = 500 + Math.cos(angle) * ring;
    const targetY = 365 + Math.sin(angle) * ring * .36 - Math.floor(pileIndex / 7) * 3;
    fallingBottomCoins.push({
      x: coin.x, y: coin.y, startX: coin.x, startY: coin.y,
      targetX, targetY, progress: 0, rotation: coin.rotation || 0,
      spin: (Math.random() - .5) * 4.2, size: 42 + Math.random() * 5,
      bubbleSeed: Math.random() * Math.PI * 2,
    });
    toast = `チャリン！ 攪乱 +${(penalty * 100).toFixed(0)}%  ·  復元力低下`; toastUntil = time + 2.8; chime('fail');
  }

  function resetGame() {
    landedCoins.length = 0; bottomCoins.length = 0; fallingBottomCoins.length = 0; bottomBubbleBursts.length = 0; successBursts.length = 0; landingEffects.length = 0; activeCoin = null; status = 'ready'; holdTime = 0; hints = 2; hintUntil = 0; impactDisturbance = 0; missStreak = 0; usedCoins = 0; axialAngle = 0; axialVelocity = 0; successPulse = 0; clearFxAge = -1; celebrationCount = 0;
    toast = 'リセットしました。レモンの上をタップ'; toastUntil = time + 2.5;
  }

  function settleCoin() {
    if (!activeCoin) return;
    kickAxialRoll(activeCoin);
    if (!stableAt(activeCoin.x, activeCoin.targetY)) { failCoin(activeCoin); return; }
    activeCoin.y = activeCoin.targetY; activeCoin.rotation = (Math.random() - .5) * .12;
    landingEffects.push({ coin: activeCoin, x: activeCoin.x, y: activeCoin.y, age: 0, seed: Math.random() * Math.PI * 2 });
    status = 'holding'; holdTime = 0; toast = 'おっと…そのまま耐えろ！'; toastUntil = time + 1.6; chime('land');
  }

  function update(dt) {
    // Recovery is deliberately linear with elapsed time, not exponential.
    impactDisturbance = Math.max(0, impactDisturbance - RECOVERY_PER_SECOND * dt);
    successPulse = Math.max(0, successPulse - dt * .8);
    if (clearFxAge >= 0) clearFxAge = Math.min(2.7, clearFxAge + dt);
    if (status === 'celebrating' && clearFxAge >= 2.66) {
      if (landedCoins.length < GOAL) {
        clearFxAge = -1; status = 'ready';
        toast = '次の100円を置こう'; toastUntil = time + 2;
      } else {
        status = 'complete';
      }
    }
    if (impactDisturbance === 0) missStreak = 0;
    // Buoyancy acts as a torsional spring; water drag damps it back to zero.
    axialVelocity += (-24 * axialAngle - 7.2 * axialVelocity) * dt;
    axialAngle += axialVelocity * dt;
    axialAngle = Math.max(-11, Math.min(11, axialAngle));
    for (let index = bottomBubbleBursts.length - 1; index >= 0; index--) {
      bottomBubbleBursts[index].age += dt;
      if (bottomBubbleBursts[index].age >= .8) bottomBubbleBursts.splice(index, 1);
    }
    for (let index = successBursts.length - 1; index >= 0; index--) {
      successBursts[index].age += dt;
      if (successBursts[index].age >= 1.25) successBursts.splice(index, 1);
    }
    for (let index = landingEffects.length - 1; index >= 0; index--) {
      landingEffects[index].age += dt;
      if (landingEffects[index].age >= 1.45) landingEffects.splice(index, 1);
    }
    for (let index = fallingBottomCoins.length - 1; index >= 0; index--) {
      const coin = fallingBottomCoins[index];
      coin.progress = Math.min(1, coin.progress + dt * .42);
      const eased = coin.progress * coin.progress * (3 - 2 * coin.progress);
      coin.x = coin.startX + (coin.targetX - coin.startX) * eased + Math.sin(time * 6.2 + coin.bubbleSeed) * 13 * (1 - coin.progress);
      coin.y = coin.startY + (coin.targetY - coin.startY) * eased + Math.sin(time * 9.1 + coin.bubbleSeed) * 4 * (1 - coin.progress);
      coin.rotation += coin.spin * dt * 1.8;
      if (coin.progress === 1) {
        bottomCoins.push(coin); bottomBubbleBursts.push({ x: coin.targetX, y: coin.targetY, age: 0, seed: coin.bubbleSeed }); fallingBottomCoins.splice(index, 1);
      }
    }
    if (status === 'falling' && activeCoin) {
      activeCoin.progress = Math.min(1, activeCoin.progress + dt * 1.8);
      const q = activeCoin.progress; activeCoin.y = 22 + (activeCoin.targetY - 22) * (1 - (1 - q) * (1 - q));
      activeCoin.x += (activeCoin.targetX - activeCoin.x) * Math.min(1, dt * 5);
      activeCoin.rotation += dt * 7;
      if (q >= 1) settleCoin();
    }
    if (status === 'holding' && activeCoin) {
      const wobble = Math.sin(time * 9) * (1.3 + landedCoins.length * .55);
      activeCoin.x += wobble * dt * 2.3;
      if (!stableAt(activeCoin.x, activeCoin.y)) { failCoin(activeCoin); return; }
      holdTime += dt;
      if (holdTime >= 3) {
        const successCoin = activeCoin;
        landedCoins.push(successCoin); successBursts.push({ x: successCoin.x, y: successCoin.y, age: 0 }); successPulse = 1;
        activeCoin = null; status = 'celebrating'; holdTime = 0; missStreak = 0; chime('success');
        celebrationCount = landedCoins.length; clearFxAge = 0;
        if (landedCoins.length === GOAL) { toast = 'DRINK GET！ 3個まとめてクラッシュ！'; toastUntil = time + 5; }
        else { toast = `${landedCoins.length} 枚目成功！ レモン${landedCoins.length}個をクラッシュ！`; toastUntil = time + 2.6; }
      }
    }
  }

  function drawGlass() { if (waterGlass.complete && waterGlass.naturalWidth) ctx.drawImage(waterGlass, 270, 0, 460, 665); }
  function drawGlassFront() { if (glass.complete && glass.naturalWidth) { ctx.save(); ctx.globalAlpha = .64; ctx.drawImage(glass, 270, 0, 460, 665); ctx.restore(); } }

  function render(stamp) {
    const dt = Math.min(.05, Math.max(0, (stamp - previous) / 1000 || 0)); previous = stamp; time += dt; update(dt);
    ctx.clearRect(0, 0, W, logicalFrameHeight); drawBackground(); drawGlass();
    ctx.save(); bowlPath(); ctx.clip(); bottomCoins.forEach((coin) => drawCoin(coin, coin.size)); ctx.restore();
    drawLemon();
    ctx.save(); bowlPath(); ctx.clip(); drawFallingBottomCoins(); drawBottomBubbleBursts(); ctx.restore();
    drawBalanceGuide(); drawHint(); landedCoins.forEach(drawCoin); if (activeCoin) drawCoin(activeCoin); drawLandingEffects(); drawSuccessEffects();
    drawGlassFront(); drawClearCelebration(); drawHud(); requestAnimationFrame(render);
  }

  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - viewOffsetX) / viewScale;
    const y = (event.clientY - rect.top - viewOffsetY) / viewScale;
    const layout = uiLayout();
    if (y >= layout.controlsY && y <= layout.controlsY + 34) {
      const [hintControl, soundControl, resetControl] = layout.controls;
      if (x >= hintControl.x && x <= hintControl.x + hintControl.width && hints > 0 && status === 'ready') { hints--; hintUntil = time + 2; toast = '狙い目：2秒間、揺れ幅50%'; toastUntil = time + 2; return; }
      if (x >= soundControl.x && x <= soundControl.x + soundControl.width) { soundOn = !soundOn; return; }
      if (x >= resetControl.x && x <= resetControl.x + resetControl.width) { resetGame(); return; }
    }
    if (status !== 'ready' || landedCoins.length >= GOAL) return;
    const p = lemonPose();
    // Aim for the visible upper surface, so it reads as placing a coin on top.
    const inTopSurface = ((x - p.x) / 170) ** 2 + ((y - (p.y - 42)) / 62) ** 2 < 1;
    if (!inTopSurface) { toast = 'レモンの上面（上側）を狙って置いてください'; toastUntil = time + 1.8; return; }
    usedCoins++;
    activeCoin = { x, y: 22, targetX: x, targetY: y, rotation: (Math.random() - .5) * .2, progress: 0 };
    status = 'falling'; toast = '100円投入！'; toastUntil = time + 1.2;
  });
  window.addEventListener('resize', resize); resize(); requestAnimationFrame(render);
})();
