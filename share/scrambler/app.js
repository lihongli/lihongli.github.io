(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const svg = $('plot');
  const NS = 'http://www.w3.org/2000/svg';
  const fields = ['steering', 'aiming', 'crossing', 'distance', 'speed'].map($);
  const STORAGE_KEY = 'scrambler-calibration-v1';
  const STARTER_RUNS = [
    { angle: '', aiming: '', crossing: '50', distance: '700' },
    { angle: '', aiming: '', crossing: '75', distance: '850' },
    { angle: '', aiming: '', crossing: '85', distance: '1000' }
  ];
  let animation = 0;
  let timer;
  let lastValidModel;
  let calibration = null;
  let calibrationDirty = false;

  function node(tag, attributes = {}, text) {
    const item = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function add(tag, attributes, text, parent = svg) {
    const item = node(tag, attributes, text);
    parent.appendChild(item);
    return item;
  }
  function number(value, digits = 2) {
    if (Math.abs(value) < 1e-12) value = 0;
    if (Math.abs(value) >= 1e7) return value.toExponential(2);
    return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }
  function metric(id, value, unit) {
    $(id).replaceChildren(document.createTextNode(value));
    if (unit) {
      const small = document.createElement('small');
      small.textContent = unit;
      $(id).appendChild(small);
    }
  }
  function niceStep(span) {
    const rough = span / 9;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const n = rough / magnitude;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * magnitude;
  }
  function draw(model, mode) {
    cancelAnimationFrame(animation);
    const score = ScramblerModel.estimateRunScore(model);
    svg.replaceChildren();
    add('title', { id: 'plot-title' }, 'Scrambler trajectory');
    add('desc', { id: 'plot-description' }, `Green line follows the egg tip; gray dashed line follows the rear axle. C marks the intersection of halfway line L1 and centre line L2. Two cans are centered around X on L1; the outside can's inner edge is 100 centimetres left of C. L3 is the line through the target parallel to L1. The simulation ${model.l3Reached ? 'stops at its first L3 crossing' : 'cannot reach L3 and shows its farthest-forward point'}. The chassis starts aimed from the egg-tip start to the aiming box, then turns continuously with the circular path. The front axle has a fixed steering setting of ${number(model.steeringDegrees, 2)} degrees relative to the body. The vehicle has a 47 centimetre wheelbase and the egg tip is 8 centimetres ahead of the front axle. Aiming box offset ${number(model.aimingOffset * 100, 1)} centimetres. Crossing point X offset ${number(model.crossingOffset * 100, 1)} centimetres on line L1 halfway to the target. Total distance ${number(model.targetDistance * 100, 1)} centimetres. Calibration status is ${model.calibrationStatus}. Egg tip distance to target at the displayed stop ${number(model.error * 100)} centimetres. Closest egg tip distance to X ${number(model.crossingError * 100)} centimetres.`);
    const fractions = Array.from({ length: 721 }, (_, i) => i / 720);
    fractions.push(model.crossingFraction); // include the closest approach to X
    fractions.sort((a, b) => a - b);
    const points = fractions.map(f => model.pointAt(f));
    const bounds = [...points, ...points.map(p => p.rear), { x: 0, y: model.targetDistance }, { x: -1, y: model.targetDistance / 2 }, model.aimingBox, model.crossingPoint, score.cans.outsideCan, score.cans.insideCan];
    let xmin = Math.min(...bounds.map(p => p.x));
    let xmax = Math.max(...bounds.map(p => p.x));
    let ymin = Math.min(...bounds.map(p => p.y));
    let ymax = Math.max(...bounds.map(p => p.y));
    // Keep ordinary runs easy to compare; zoom out to fit unusual loops.
    xmin = Math.min(xmin, -1.25); xmax = Math.max(xmax, 1.25);
    ymin = Math.min(ymin, -0.35); ymax = Math.max(ymax, model.targetDistance + 0.35);
    const box = { x: 65, y: 30, w: 690, h: 460 };
    const scale = Math.min((box.w - 50) / (xmax - xmin), (box.h - 30) / (ymax - ymin));
    const xmid = (xmin + xmax) / 2;
    const ymid = (ymin + ymax) / 2;
    const map = p => ({ x: box.x + box.w / 2 + (p.x - xmid) * scale, y: box.y + box.h / 2 - (p.y - ymid) * scale });
    const worldLeft = xmid - box.w / (2 * scale);
    const worldRight = xmid + box.w / (2 * scale);
    const worldBottom = ymid - box.h / (2 * scale);
    const worldTop = ymid + box.h / (2 * scale);
    const step = niceStep(Math.max(worldRight - worldLeft, worldTop - worldBottom));
    const decimals = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
    const grid = add('g', { 'aria-hidden': 'true' });
    for (let x = Math.ceil(worldLeft / step) * step; x <= worldRight + step * 1e-8; x += step) {
      const a = map({ x, y: worldBottom });
      const b = map({ x, y: worldTop });
      add('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#e9eee7', 'stroke-width': 1 }, undefined, grid);
      add('text', { x: a.x, y: box.y + box.h + 21, 'text-anchor': 'middle', class: 'grid-label' }, number(x, decimals), grid);
    }
    for (let y = Math.ceil(worldBottom / step) * step; y <= worldTop + step * 1e-8; y += step) {
      const a = map({ x: worldLeft, y });
      const b = map({ x: worldRight, y });
      add('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#e9eee7', 'stroke-width': 1 }, undefined, grid);
      add('text', { x: box.x - 12, y: a.y + 4, 'text-anchor': 'end', class: 'grid-label' }, number(y, decimals), grid);
    }
    add('text', { x: box.x + box.w / 2, y: 546, 'text-anchor': 'middle', fill: '#70877a', 'font-size': 11 }, 'Left ← lateral position (metres) → Right');
    add('text', { transform: 'translate(18 260) rotate(-90)', 'text-anchor': 'middle', fill: '#70877a', 'font-size': 11 }, 'Forward distance (metres)');
    const start = map({ x: 0, y: 0 });
    const target = map({ x: 0, y: model.targetDistance });
    const stop = map(model.stop);
    const aim = map(model.aimingBox);
    const crossing = map(model.crossingPoint);
    const crossingClosest = map(model.crossingClosest);
    const middle = map({ x: 0, y: model.targetDistance / 2 });
    const canLimit = map({ x: -1, y: model.targetDistance / 2 });
    const outsideCan = map(score.cans.outsideCan);
    const insideCan = map(score.cans.insideCan);
    const aimingColor = '#8264a7';
    const crossingColor = '#2876a2';
    add('line', { x1: box.x, y1: middle.y, x2: box.x + box.w, y2: middle.y, stroke: '#cfbddf', 'stroke-width': 1.5, 'stroke-dasharray': '7 6' });
    add('line', { x1: box.x, y1: target.y, x2: box.x + box.w, y2: target.y, stroke: '#d7ab70', 'stroke-width': 1.5, 'stroke-dasharray': '7 6' });
    if (score.cans.valid) {
      const gapEnd = map({ x: score.cans.rightEdge, y: model.targetDistance / 2 });
      add('line', { x1: canLimit.x, y1: middle.y, x2: gapEnd.x, y2: middle.y, stroke: '#8dcbb3', 'stroke-width': 8, opacity: 0.4 });
    }
    add('line', { x1: start.x, y1: start.y, x2: target.x, y2: target.y, stroke: '#bdcfc0', 'stroke-width': 1.5, 'stroke-dasharray': '5 6' });
    add('line', { x1: start.x, y1: start.y, x2: aim.x, y2: aim.y, stroke: aimingColor, 'stroke-width': 1.8, 'stroke-dasharray': '4 5' });
    add('line', { x1: middle.x, y1: middle.y, x2: aim.x, y2: aim.y, stroke: aimingColor, 'stroke-width': 2 });
    add('path', { d: `M${middle.x + 9},${middle.y} v-9 h-9`, fill: 'none', stroke: '#b1a2be', 'stroke-width': 1 });
    add('circle', { cx: middle.x, cy: middle.y, r: 5, fill: '#fff', stroke: '#6b5683', 'stroke-width': 2 });
    add('line', { x1: canLimit.x, y1: canLimit.y - 9, x2: canLimit.x, y2: canLimit.y + 9, stroke: '#b04437', 'stroke-width': 3, 'stroke-linecap': 'round' });
    add('path', { d: `M${middle.x},${middle.y + 33} H${crossing.x} M${middle.x},${middle.y + 29} v8 M${crossing.x},${middle.y + 29} v8`, fill: 'none', stroke: crossingColor, 'stroke-width': 1 });
    const pathData = points.map((p, i) => { const q = map(p); return `${i ? 'L' : 'M'}${q.x.toFixed(4)},${q.y.toFixed(4)}`; }).join(' ');
    const rearData = points.map((p, i) => { const q = map(p.rear); return `${i ? 'L' : 'M'}${q.x.toFixed(4)},${q.y.toFixed(4)}`; }).join(' ');
    add('path', { d: rearData, fill: 'none', stroke: '#8c9990', 'stroke-width': 1.8, 'stroke-dasharray': '5 5' });
    add('path', { d: pathData, fill: 'none', stroke: '#d3e7db', 'stroke-width': 5, 'stroke-linecap': 'round' });
    add('line', { x1: crossing.x, y1: crossing.y, x2: crossingClosest.x, y2: crossingClosest.y, stroke: crossingColor, 'stroke-width': 1.8, 'stroke-dasharray': '3 4' });
    const trail = add('path', { d: pathData, fill: 'none', stroke: '#147364', 'stroke-width': 3, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 });
    add('line', { x1: stop.x, y1: stop.y, x2: target.x, y2: target.y, stroke: '#b47732', 'stroke-width': 2, 'stroke-dasharray': '5 5' });
    add('circle', { cx: target.x, cy: target.y, r: 10, fill: '#fff9ed', stroke: '#b47732', 'stroke-width': 1.5 });
    add('circle', { cx: target.x, cy: target.y, r: 3, fill: '#b47732' });
    add('circle', { cx: start.x, cy: start.y, r: 5, fill: '#fff', stroke: '#648773', 'stroke-width': 2 });
    add('circle', { cx: stop.x, cy: stop.y, r: 5, fill: '#147364', stroke: '#fff', 'stroke-width': 1.5 });
    const canMarkerSize = Math.max(8, 2 * score.cans.radius * scale);
    for (const can of [outsideCan, insideCan]) add('rect', { x: can.x - canMarkerSize / 2, y: can.y - canMarkerSize / 2, width: canMarkerSize, height: canMarkerSize, fill: '#000', 'data-marker': 'can' });
    if (score.demoCanLimitFail) {
      const failedCrossing = map(model.l1Crossings.find(p => p.x < -1 - 1e-9));
      add('circle', { cx: failedCrossing.x, cy: failedCrossing.y, r: 7, fill: '#b04437', stroke: '#fff', 'stroke-width': 2 });
    }
    // Labels go on opposite sides when stop and target are close together.
    const label = (text, p, dx, dy, color, anchor = 'start') => add('text', { x: Math.max(75, Math.min(745, p.x + dx)), y: Math.max(20, Math.min(510, p.y + dy)), class: 'point-label', fill: color, 'text-anchor': anchor }, text);
    label('Egg start', start, 14, 20, '#526f5d');
    label('Target', target, 16, -14, '#a16324');
    add('rect', { x: aim.x - 7, y: aim.y - 7, width: 14, height: 14, rx: 2, fill: '#f6f0fc', stroke: aimingColor, 'stroke-width': 2 });
    add('text', { x: crossing.x, y: crossing.y + 5, fill: crossingColor, 'font-size': 17, 'font-weight': 800, 'text-anchor': 'middle', 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': 3, 'data-marker': 'midpoint' }, 'x');
    label('Midpoint', crossing, 0, -14, crossingColor, 'middle');
    label('C', middle, 12, 18, '#6b5683');
    label('100 cm edge', canLimit, 0, -33, '#b04437', 'middle');
    label('Outside can', outsideCan, -8, -51, '#222', 'end');
    label('Inside can', insideCan, 8, 28, '#222');
    const aimLeft = model.aimingOffset > 0;
    label(model.calibrationApplied ? 'Effective aim' : 'Aiming box', aim, aimLeft ? -14 : 14, -14, aimingColor, aimLeft ? 'end' : 'start');
    label('L1 · halfway', { x: box.x + box.w, y: middle.y }, -5, -10, '#8e7c9d', 'end');
    label('L3 · target line', { x: box.x + box.w, y: target.y }, -5, -10, '#9b692d', 'end');
    label('L2', { x: middle.x, y: middle.y - 48 }, 12, 0, '#6a8575');
    label(`${number(Math.abs(model.crossingOffset * 100), 1)} cm to X`, { x: (crossing.x + middle.x) / 2, y: middle.y }, 0, 49, crossingColor, 'middle');
    const coincident = model.error < 1e-8;
    const stoppedAtStart = model.length < 1e-9;
    if (coincident) label('Stop = target', stop, -16, 20, '#147364', 'end');
    else if (stoppedAtStart) label('Stop = start', stop, -16, -15, '#147364', 'end');
    else label(model.l3Reached ? 'L3 stop' : 'Farthest forward', stop, -16, 19, '#147364', 'end');
    const car = add('g', { 'aria-hidden': 'true' });
    // Rear axle is the group origin. Axle spacing and egg offset use the plot's
    // metre scale; wheel thickness is merely a visible drawing convention.
    const b = model.wheelbase * scale;
    const a = model.eggFromRear * scale;
    const frontHalf = model.frontTrack * scale / 2;
    const rearHalf = model.rearTrack * scale / 2;
    const wheelLength = 0.08 * scale;
    const wheelWidth = Math.max(3, 0.025 * scale);
    add('line', { x1: 0, y1: 0, x2: 0, y2: -a, stroke: '#147364', 'stroke-width': 4, 'stroke-linecap': 'round' }, undefined, car);
    add('line', { x1: -rearHalf, y1: 0, x2: rearHalf, y2: 0, stroke: '#233b34', 'stroke-width': 2.5 }, undefined, car);
    for (const x of [-rearHalf, rearHalf]) {
      add('rect', { x: x - wheelWidth / 2, y: -wheelLength / 2, width: wheelWidth, height: wheelLength, rx: 1, fill: '#233b34' }, undefined, car);
    }
    const frontAxle = add('g', { transform: `translate(0,${-b}) rotate(${model.steeringDegrees})` }, undefined, car);
    add('line', { x1: -frontHalf, y1: 0, x2: frontHalf, y2: 0, stroke: '#233b34', 'stroke-width': 2.5 }, undefined, frontAxle);
    for (const x of [-frontHalf, frontHalf]) {
      add('rect', { x: x - wheelWidth / 2, y: -wheelLength / 2, width: wheelWidth, height: wheelLength, rx: 1, fill: '#233b34' }, undefined, frontAxle);
    }
    add('circle', { cx: 0, cy: -a, r: 4.5, fill: '#e5a448', stroke: '#fff', 'stroke-width': 1.5 }, undefined, car);
    add('circle', { cx: 0, cy: 0, r: 2, fill: '#fff', stroke: '#147364', 'stroke-width': 1 }, undefined, car);
    function position(f) {
      const p = model.pointAt(f);
      const q = map(p.rear);
      car.setAttribute('transform', `translate(${q.x},${q.y}) rotate(${-p.heading * 180 / Math.PI})`);
      trail.setAttribute('stroke-dashoffset', String(1 - f));
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (mode !== 'launch') position(0);
    else if (reduced || stoppedAtStart) position(1);
    else {
      let began;
      function frame(now) {
        if (began === undefined) began = now;
        const f = Math.min(1, (now - began) / 3200);
        position(f);
        if (f < 1) animation = requestAnimationFrame(frame);
      }
      position(0);
      animation = requestAnimationFrame(frame);
    }
    metric('miss-value', model.l3Reached ? number(model.error * 100, 1) : '—', model.l3Reached ? 'cm' : '');
    metric('x-miss-value', number(model.crossingError * 100, 2), 'cm');
    $('score-panel').classList.toggle('is-fail', score.demoCanLimitFail);
    $('score-panel').classList.toggle('is-unreachable', !model.l3Reached && !score.demoCanLimitFail);
    $('score-value').textContent = score.demoCanLimitFail ? 'FAIL' : !model.l3Reached ? 'NO L3' : number(score.totalScore, 2);
    $('score-unit').hidden = score.demoCanLimitFail || !model.l3Reached;
    $('score-breakdown').textContent = score.demoCanLimitFail
      ? `Egg tip crosses L1 ${number(score.failingCrossingCmLeft, 1)} cm left of C, beyond the 100 cm mark.`
      : !model.l3Reached
        ? 'The egg-tip arc never reaches L3, so this L3-based distance score is unavailable.'
        : `100 base + ${number(score.distanceScore, 2)} distance (2 × ${number(score.vehicleDistanceCm, 1)} cm at L3) + ${number(score.estimatedTimeSeconds, 2)} estimated time (${number(model.length * 100, 1)} cm ÷ ${number(score.estimatedSpeedCmPerSecond, 1)} cm/s) + ${number(score.canBonus, 2)} can bonus + 0 penalties.`;
    $('score-can-detail').textContent = `Inside can gap: ${number(score.cans.insideGapCm, 1)} cm. ${score.canStatus} ${score.canBonusEarned ? `Can bonus: ${number(score.canBonus, 2)} points.` : 'Can bonus: 0 points.'}`;
    const xText = model.crossingError <= 0.001 ? 'X reached within 0.1 cm.' : `X missed by ${number(model.crossingError * 100, 2)} cm at the closest approach.`;
    $('x-miss-detail').textContent = model.crossingError <= 0.001 ? 'Within 0.1 cm of X' : 'Adjust angle and aiming box';
    metric('length-value', number(model.length), 'm');
    metric('radius-value', Number.isFinite(model.radius) ? number(model.radius) : 'Straight', Number.isFinite(model.radius) ? 'm' : '');
    const side = Math.abs(model.lateral) < 0.00005 ? 'On the centre line' : `${number(Math.abs(model.lateral) * 100, 1)} cm ${model.lateral < 0 ? 'left' : 'right'}`;
    const end = Math.abs(model.longitudinal) < 0.00005 ? 'level with target' : `${number(Math.abs(model.longitudinal) * 100, 1)} cm ${model.longitudinal < 0 ? 'short' : 'past target'}`;
    $('miss-detail').textContent = model.l3Reached ? `${side}; ${end}.` : 'L3 unreachable; no L3-based distance score.';
    const calibrationText = model.curvature === 0 ? 'Straight setting' : ({ 'measured-range': 'Within measured 7°–15° range', mirrored: 'Mirrored from positive-angle tests', extrapolated: 'Outside measured 7°–15° range', 'mirrored-extrapolated': 'Mirrored estimate outside tested range' })[model.calibrationStatus];
    $('radius-detail').textContent = `${calibrationText} · ${model.curvature === 0 ? 'zero turn' : `${model.curvature > 0 ? 'left' : 'right'} turn`}`;
    const bodyText = Math.abs(model.bodyHeadingDegrees) < 1e-9
      ? 'The body starts along L2 and turns as it travels.'
      : `The body starts ${number(Math.abs(model.bodyHeadingDegrees), 2)}° ${model.bodyHeadingDegrees > 0 ? 'right' : 'left'} toward the box, then turns as it travels.`;
    const angleText = model.steeringDegrees === 0 ? 'Effective front-axle angle: 0°.' : `Effective front-axle angle: ${number(Math.abs(model.steeringDegrees), 2)}° ${model.steeringDegrees > 0 ? 'right' : 'left'} relative to the body.`;
    const stopText = model.l3Reached ? 'The egg tip stops at its first crossing of L3. Green = egg tip; gray = rear axle.' : 'The egg-tip arc cannot reach L3; the graph ends at its farthest-forward point, without a numerical score.';
    const calibrationNote = model.curvature === 0 ? '' : ({ 'measured-range': 'Angle is within the measured 7°–15° range.', mirrored: 'This left-curving path is mirrored from right-curving measurements.', extrapolated: 'Angle is outside the measured 7°–15° range; treat this radius as an estimate.', 'mirrored-extrapolated': 'This left-curving radius is both mirrored and outside the measured 7°–15° range.' })[model.calibrationStatus];
    $('aiming-value').textContent = `${number(Math.abs(model.bodyHeadingDegrees), 2)}° ${model.bodyHeadingDegrees > 1e-9 ? 'right' : model.bodyHeadingDegrees < -1e-9 ? 'left' : 'straight'}`;
    $('effective-settings').hidden = !model.calibrationApplied;
    if (model.calibrationApplied) $('effective-settings').textContent = `Calibration applied: entered angle ${number(model.commandedSteeringDegrees, 3)}° → effective ${number(model.steeringDegrees, 3)}°; entered box ${number(model.commandedAimingOffsetCm, 2)} cm → effective ${number(model.aimingOffset * 100, 2)} cm.`;
    const limitText = score.demoCanLimitFail
      ? `Practice FAIL: the egg crosses L1 ${number(score.failingCrossingCmLeft, 1)} cm left of C, beyond the 100 cm mark.`
      : 'C is the L1/L2 intersection; the red tick is the outside can’s 100 cm inner edge.';
    $('chart-note').textContent = `${limitText} ${bodyText} ${angleText} ${calibrationNote} ${xText} ${stopText}`;
    $('live').textContent = `${limitText} ${bodyText} ${angleText} ${xText} ${model.l3Reached ? `Egg-tip distance to target at L3 ${number(model.error * 100, 1)} centimetres.` : 'L3 is unreachable.'} ${score.demoCanLimitFail ? 'Displayed score FAIL.' : model.l3Reached ? `Estimated Run Score ${number(score.totalScore, 2)} points, including ${number(score.canBonus, 2)} can bonus.` : 'Displayed score NO L3.'}`;
  }
  function readNumber(input) {
    const value = input.value.trim().replace(/−/g, '-');
    return value === '' ? NaN : Number(value);
  }
  function updateRecommendations() {
    const result = ScramblerModel.recommendedSettings(readNumber($('crossing')), readNumber($('distance')), calibration);
    const angle = $('angle-recommendation');
    const box = $('box-recommendation');
    $('angle-recommendation-label').textContent = calibration ? 'Recommended calibrated setting' : 'Recommended for X and target';
    $('box-recommendation-label').textContent = calibration ? 'Recommended calibrated setting' : 'Recommended for X and target';
    angle.parentElement.classList.toggle('unavailable', !result.available);
    box.parentElement.classList.toggle('unavailable', !result.available);
    if (!result.available) {
      angle.textContent = result.reason;
      box.textContent = result.reason;
      return;
    }
    angle.textContent = `${number(result.angleDegrees, 5)}°`;
    box.textContent = `${number(result.aimingOffsetCm, 3)} cm`;
  }
  function applyRecommendedStartingSettings() {
    const result = ScramblerModel.recommendedSettings(readNumber($('crossing')), readNumber($('distance')), calibration);
    if (!result.available) return;
    $('steering').value = result.angleDegrees.toFixed(5);
    $('aiming').value = result.aimingOffsetCm.toFixed(3);
  }
  function update(mode = 'start') {
    updateRecommendations();
    const values = fields.map(readNumber);
    const ranges = [[-45, 45], [-Infinity, Infinity], [-Infinity, Infinity], [700, 1000], [Number.MIN_VALUE, Infinity]];
    fields.forEach((field, i) => field.setAttribute('aria-invalid', String(!Number.isFinite(values[i]) || values[i] < ranges[i][0] || values[i] > ranges[i][1])));
    try {
      if (fields.some(field => field.getAttribute('aria-invalid') === 'true')) throw new Error('Check the highlighted input. Angle must be within ±45°, total distance from 700 to 1000 cm, and speed greater than 0 cm/s.');
      const model = ScramblerModel.calculateFromInputs(...values, calibration);
      lastValidModel = model;
      $('error').textContent = '';
      $('launch').disabled = false;
      svg.style.opacity = '1';
      draw(model, mode);
    } catch (error) {
      cancelAnimationFrame(animation);
      $('error').textContent = `${error.message} The diagram shows the last valid settings.`;
      $('launch').disabled = true;
      if (mode === 'start' && lastValidModel) draw(lastValidModel, 'start');
      svg.style.opacity = '.45';
    }
  }
  function signed(value, digits, unit) {
    return `${value < -1e-12 ? '−' : '+'}${number(Math.abs(value), digits)}${unit}`;
  }
  function calibrationTableRows() {
    return Array.from($('calibration-rows').querySelectorAll('tr'));
  }
  function calibrationRowValues(row) {
    return Object.fromEntries(['angle', 'aiming', 'crossing', 'distance'].map(key => [key, row.querySelector(`[data-field="${key}"]`).value]));
  }
  function saveCalibrationState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: calibrationTableRows().map(calibrationRowValues), calibration, dirty: calibrationDirty }));
      $('calibration-storage').textContent = 'Saved in this browser for future visits.';
    } catch (_) {
      $('calibration-storage').textContent = 'Browser storage is unavailable; corrections last until this page closes.';
    }
  }
  function clearTrialResults() {
    for (const row of calibrationTableRows()) for (const cell of row.querySelectorAll('.fitted-cell')) cell.textContent = '—';
  }
  function showCalibrationResults() {
    if (!calibration) {
      $('angle-offset-result').textContent = 'Not calibrated';
      $('box-offset-result').textContent = 'Not calibrated';
      $('calibration-detail').textContent = 'Enter at least two successful runs, then press Calibrate.';
      return;
    }
    $('angle-offset-result').textContent = signed(calibration.angleOffsetDegrees, 3, '°');
    $('box-offset-result').textContent = signed(calibration.aimingOffsetCm, 2, ' cm');
    const spread = `Across ${calibration.runCount} runs, individual offsets span ${number(calibration.angleSpreadDegrees, 3)}° for angle and ${number(calibration.aimingSpreadCm, 2)} cm for the box.`;
    const caution = calibration.angleSpreadDegrees > 0.5 || calibration.aimingSpreadCm > 10
      ? ' The large spread suggests run variation, measurement error, or a curve model mismatch.' : '';
    const draft = calibrationDirty ? ' Table entries changed; press Calibrate to refit. The displayed corrections still use the previous fit.' : '';
    $('calibration-detail').textContent = `Corrections are active. ${spread}${caution}${draft}`;
  }
  function onCalibrationRowInput() {
    calibrationDirty = Boolean(calibration);
    clearTrialResults();
    $('calibration-error').textContent = '';
    showCalibrationResults();
    saveCalibrationState();
  }
  function renumberCalibrationRows() {
    calibrationTableRows().forEach((row, index) => {
      row.querySelector('.run-number').textContent = String(index + 1);
      for (const input of row.querySelectorAll('input')) input.setAttribute('aria-label', `Run ${index + 1} ${input.dataset.field}`);
    });
  }
  function addCalibrationRow(values = {}) {
    const row = document.createElement('tr');
    const runCell = document.createElement('td');
    runCell.className = 'run-number';
    row.appendChild(runCell);
    for (const key of ['angle', 'aiming', 'crossing', 'distance']) {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.dataset.field = key;
      input.value = String(values[key] ?? '');
      input.addEventListener('input', onCalibrationRowInput);
      cell.appendChild(input);
      row.appendChild(cell);
    }
    for (const key of ['angle', 'aiming']) {
      const cell = document.createElement('td');
      cell.className = 'fitted-cell';
      cell.dataset.result = key;
      cell.textContent = '—';
      row.appendChild(cell);
    }
    const removeCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-run';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', 'Remove calibration run');
    remove.addEventListener('click', () => { row.remove(); renumberCalibrationRows(); onCalibrationRowInput(); });
    removeCell.appendChild(remove);
    row.appendChild(removeCell);
    $('calibration-rows').appendChild(row);
    renumberCalibrationRows();
    return row;
  }
  function filledCalibrationRows() {
    const filled = [];
    for (const row of calibrationTableRows()) {
      const raw = calibrationRowValues(row);
      if (raw.angle.trim() === '' && raw.aiming.trim() === '') continue;
      const values = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value.trim() === '' ? NaN : Number(value.trim().replace(/−/g, '-'))]));
      filled.push({ row, run: {
        angleDegrees: values.angle, aimingOffsetCm: values.aiming,
        crossingOffsetCm: values.crossing, targetDistanceCm: values.distance
      } });
    }
    return filled;
  }
  function showTrialOffsets(filled, details) {
    clearTrialResults();
    filled.forEach(({ row }, index) => {
      row.querySelector('[data-result="angle"]').textContent = signed(details[index].angleOffsetDegrees, 3, '°');
      row.querySelector('[data-result="aiming"]').textContent = signed(details[index].aimingOffsetCm, 2, ' cm');
    });
  }
  function loadCalibrationState() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { saved = null; }
    const rows = Array.isArray(saved?.rows) && saved.rows.length ? saved.rows : STARTER_RUNS;
    rows.forEach(addCalibrationRow);
    if (Number.isFinite(saved?.calibration?.angleOffsetDegrees) && Number.isFinite(saved?.calibration?.aimingOffsetCm) &&
        Number.isFinite(saved?.calibration?.angleSpreadDegrees) && Number.isFinite(saved?.calibration?.aimingSpreadCm) && saved.calibration.runCount >= 2) {
      calibration = saved.calibration;
      calibrationDirty = Boolean(saved.dirty);
      if (!calibrationDirty && Array.isArray(calibration.details)) {
        const filled = filledCalibrationRows();
        if (filled.length === calibration.details.length) showTrialOffsets(filled, calibration.details);
      }
    }
    showCalibrationResults();
    saveCalibrationState();
  }
  $('add-calibration-run').addEventListener('click', () => { addCalibrationRow(); onCalibrationRowInput(); });
  $('calibrate').addEventListener('click', () => {
    try {
      const filled = filledCalibrationRows();
      const result = ScramblerModel.calibrateFromRuns(filled.map(item => item.run));
      calibration = result;
      calibrationDirty = false;
      showTrialOffsets(filled, result.details);
      $('calibration-error').textContent = '';
      showCalibrationResults();
      saveCalibrationState();
      update('start');
    } catch (error) {
      $('calibration-error').textContent = error.message;
    }
  });
  $('clear-calibration').addEventListener('click', () => {
    calibration = null;
    calibrationDirty = false;
    clearTrialResults();
    $('calibration-error').textContent = '';
    showCalibrationResults();
    saveCalibrationState();
    update('start');
  });
  fields.forEach(field => field.addEventListener('input', () => {
    if (field.id === 'crossing' || field.id === 'distance') updateRecommendations();
    clearTimeout(timer);
    timer = setTimeout(() => update('start'), 300);
  }));
  $('reset').addEventListener('click', () => { clearTimeout(timer); update('start'); });
  $('launch').addEventListener('click', () => { clearTimeout(timer); update('launch'); });
  $('settings').addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); update('launch'); });
  loadCalibrationState();
  applyRecommendedStartingSettings();
  update('start');
})();
