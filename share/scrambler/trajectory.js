/* Fixed front-axle setting; body follows the measured circular egg-tip path. */
(function (root) {
  'use strict';
  const WHEELBASE = 0.47;
  const FRONT_TRACK = 0.18;
  const REAR_TRACK = 0.195;
  const EGG_OVERHANG = 0.08;
  const EGG_FROM_REAR = WHEELBASE + EGG_OVERHANG;
  const TAU = 2 * Math.PI;
  // Circle fits to the supplied egg-tip coordinates, assuming centimetres.
  const CALIBRATION = [
    { angle: 7, eggRadius: 3.183860030390388 },
    { angle: 15, eggRadius: 1.6143622993273352 }
  ];
  const K7 = 1 / CALIBRATION[0].eggRadius;
  const K15 = 1 / CALIBRATION[1].eggRadius;
  const DEFAULT_SPEED_CM_PER_SECOND = 300;
  const PRACTICE_CAN_LIMIT_M = 1;
  const CAN_DIAMETER_M = 0.075; // midpoint of the official 7–8 cm range
  const APPROX_WHEEL_WIDTH_M = 0.025;

  function calibrationOffsets(calibration) {
    return {
      angleOffsetDegrees: Number.isFinite(calibration?.angleOffsetDegrees) ? calibration.angleOffsetDegrees : 0,
      aimingOffsetCm: Number.isFinite(calibration?.aimingOffsetCm) ? calibration.aimingOffsetCm : 0
    };
  }

  function pathCurvature(angleDegrees) {
    const angle = Math.abs(angleDegrees);
    if (angle === 0) return 0;
    // Zero angle is straight. Interpolation passes through both observed radii;
    // negative angles are mirrored, and values outside 7–15 are estimates.
    const magnitude = angle <= 7
      ? K7 * angle / 7
      : K7 + (K15 - K7) * (angle - 7) / 8;
    return -Math.sign(angleDegrees) * magnitude; // positive angle curves right
  }

  function recommendedSettings(crossingOffsetCm, targetDistanceCm, calibration = null) {
    if (!Number.isFinite(crossingOffsetCm) || !Number.isFinite(targetDistanceCm) ||
        targetDistanceCm < 700 || targetDistanceCm > 1000) {
      return { available: false, reason: 'Enter X and a total distance from 700 to 1000 cm.' };
    }
    const half = targetDistanceCm / 200; // metres
    const x = crossingOffsetCm / 100; // positive is left
    const offsets = calibrationOffsets(calibration);
    if (Math.abs(x) >= half) {
      return { available: false, reason: 'No finite, forward-pointing circular arc reaches X and the target.' };
    }
    if (x === 0) return { available: true, angleDegrees: -offsets.angleOffsetDegrees, aimingOffsetCm: -offsets.aimingOffsetCm };
    // The circle through Start, X=(-x,L/2), and Target has signed curvature
    // -2x / ((L/2)^2+x^2). Its tangent at Start sets the aiming-box offset.
    const magnitude = 2 * Math.abs(x) / (half * half + x * x);
    const angleMagnitude = magnitude <= K7
      ? 7 * magnitude / K7
      : 7 + 8 * (magnitude - K7) / (K15 - K7);
    return {
      available: true,
      angleDegrees: Math.sign(x) * angleMagnitude - offsets.angleOffsetDegrees,
      aimingOffsetCm: 100 * (2 * half * half * x / (half * half - x * x)) - offsets.aimingOffsetCm
    };
  }

  function calibrateFromRuns(runs) {
    if (!Array.isArray(runs) || runs.length < 2) {
      throw new Error('Enter at least two successful runs to calibrate.');
    }
    const details = runs.map((run, index) => {
      const { angleDegrees, aimingOffsetCm, crossingOffsetCm, targetDistanceCm } = run;
      if (![angleDegrees, aimingOffsetCm, crossingOffsetCm, targetDistanceCm].every(Number.isFinite) ||
          angleDegrees < -45 || angleDegrees > 45) {
        throw new Error(`Run ${index + 1}: enter a valid launch angle, aiming box, X, and total distance.`);
      }
      const ideal = recommendedSettings(crossingOffsetCm, targetDistanceCm);
      if (!ideal.available) throw new Error(`Run ${index + 1}: ${ideal.reason}`);
      return {
        angleOffsetDegrees: ideal.angleDegrees - angleDegrees,
        aimingOffsetCm: ideal.aimingOffsetCm - aimingOffsetCm,
        idealAngleDegrees: ideal.angleDegrees,
        idealAimingOffsetCm: ideal.aimingOffsetCm
      };
    });
    const angleValues = details.map(row => row.angleOffsetDegrees);
    const aimingValues = details.map(row => row.aimingOffsetCm);
    return {
      angleOffsetDegrees: angleValues.reduce((sum, value) => sum + value, 0) / details.length,
      aimingOffsetCm: aimingValues.reduce((sum, value) => sum + value, 0) / details.length,
      angleSpreadDegrees: Math.max(...angleValues) - Math.min(...angleValues),
      aimingSpreadCm: Math.max(...aimingValues) - Math.min(...aimingValues),
      runCount: details.length,
      details
    };
  }

  function calculateFromInputs(angleDegrees, aimingOffsetCm, crossingOffsetCm, targetDistanceCm, speedCmPerSecond = DEFAULT_SPEED_CM_PER_SECOND, calibration = null) {
    if (![angleDegrees, aimingOffsetCm, crossingOffsetCm, targetDistanceCm, speedCmPerSecond].every(Number.isFinite)) {
      throw new Error('Enter a number in all five boxes.');
    }
    if (angleDegrees < -45 || angleDegrees > 45) {
      throw new Error('The steering / launch angle must be from −45° to 45°.');
    }
    if (targetDistanceCm < 700 || targetDistanceCm > 1000) {
      throw new Error('Total distance must be from 700 to 1000 centimetres.');
    }
    if (speedCmPerSecond <= 0) {
      throw new Error('Speed must be greater than 0 cm/s.');
    }
    const offsets = calibrationOffsets(calibration);
    const effectiveAngleDegrees = angleDegrees + offsets.angleOffsetDegrees;
    const effectiveAimingOffsetCm = aimingOffsetCm + offsets.aimingOffsetCm;
    const aimingOffset = effectiveAimingOffsetCm / 100;
    const crossingOffset = crossingOffsetCm / 100;
    const targetDistance = targetDistanceCm / 100;
    // The chassis initially points from the egg-tip start to the aiming box.
    const aimingBox = { x: -aimingOffset, y: targetDistance / 2 };
    const alpha = Math.atan2(aimingOffset, targetDistance / 2);
    const forward = { x: -Math.sin(alpha), y: Math.cos(alpha) };
    const left = { x: -Math.cos(alpha), y: -Math.sin(alpha) };
    // The entered front-axle setting determines empirical curvature.
    const curvature = pathCurvature(effectiveAngleDegrees);
    const crossingPoint = { x: -crossingOffset, y: targetDistance / 2 };
    let sweep = 0;
    let length = 0;
    let l3Reached = false;

    function forwardPhase(along, across) {
      let phase = Math.atan2(curvature * along, 1 - curvature * across);
      if (curvature > 0 && phase < 0) phase += TAU;
      if (curvature < 0 && phase > 0) phase -= TAU;
      return phase;
    }

    function horizontalCrossings(y) {
      if (curvature === 0) {
        const travel = y / forward.y;
        return travel > 0 ? [{ x: forward.x * travel, y, travel }] : [];
      }
      const center = { x: left.x / curvature, y: left.y / curvature };
      const radius = Math.abs(1 / curvature);
      const horizontalSquared = radius * radius - (y - center.y) ** 2;
      if (horizontalSquared < -1e-10) return [];
      const offset = Math.sqrt(Math.max(0, horizontalSquared));
      const results = [];
      for (const x of [center.x - offset, center.x + offset]) {
        const along = x * forward.x + y * forward.y;
        const across = x * left.x + y * left.y;
        const travel = forwardPhase(along, across) / curvature;
        if (travel > 1e-9 && !results.some(p => Math.abs(p.travel - travel) < 1e-9)) {
          results.push({ x, y, travel });
        }
      }
      return results.sort((a, b) => a.travel - b.travel);
    }

    const l3Crossings = horizontalCrossings(targetDistance);
    if (l3Crossings.length) {
      length = l3Crossings[0].travel;
      l3Reached = true;
    } else {
      // If the circle cannot reach L3, show its first farthest-forward point.
      const center = { x: left.x / curvature, y: left.y / curvature };
      const top = { x: center.x, y: center.y + Math.abs(1 / curvature) };
      const along = top.x * forward.x + top.y * forward.y;
      const across = top.x * left.x + top.y * left.y;
      length = forwardPhase(along, across) / curvature;
    }
    sweep = curvature * length;

    function pointAt(fraction) {
      const f = Math.max(0, Math.min(1, fraction));
      const phase = sweep * f;
      const along = curvature === 0 ? length * f : Math.sin(phase) / curvature;
      const across = curvature === 0 ? 0 : 2 * Math.sin(phase / 2) ** 2 / curvature;
      const egg = {
        x: forward.x * along + left.x * across,
        y: forward.y * along + left.y * across
      };
      const heading = alpha + phase;
      const facing = { x: -Math.sin(heading), y: Math.cos(heading) };
      return {
        x: egg.x, y: egg.y, heading,
        front: { x: egg.x - EGG_OVERHANG * facing.x, y: egg.y - EGG_OVERHANG * facing.y },
        rear: { x: egg.x - EGG_FROM_REAR * facing.x, y: egg.y - EGG_FROM_REAR * facing.y }
      };
    }

    // Include every egg-tip crossing of L1 before the simulated stop.
    const halfway = targetDistance / 2;
    const l1Crossings = horizontalCrossings(halfway)
      .filter(p => p.travel <= length + 1e-9)
      .map(p => ({ x: p.x, y: halfway, fraction: length > 0 ? Math.min(1, p.travel / length) : 0 }));

    const stop = pointAt(1);
    // The closest approach to X is measured only between Start and Stop.
    const xAlong = crossingPoint.x * forward.x + crossingPoint.y * forward.y;
    const xAcross = crossingPoint.x * left.x + crossingPoint.y * left.y;
    const fractions = [0, 1];
    if (length > 0) {
      if (curvature === 0) fractions.push(Math.max(0, Math.min(1, xAlong / length)));
      else {
        const fraction = forwardPhase(xAlong, xAcross) / curvature / length;
        if (fraction >= 0 && fraction <= 1) fractions.push(fraction);
      }
    }
    let crossingFraction = 0;
    let crossingClosest = pointAt(0);
    let crossingError = Infinity;
    for (const fraction of fractions) {
      const p = pointAt(fraction);
      const error = Math.hypot(p.x - crossingPoint.x, p.y - crossingPoint.y);
      if (error < crossingError) {
        crossingError = error;
        crossingClosest = p;
        crossingFraction = fraction;
      }
    }

    const radius = curvature === 0 ? Infinity : Math.abs(1 / curvature);
    const magnitude = Math.abs(effectiveAngleDegrees);
    const calibrationStatus = effectiveAngleDegrees === 0 ? 'straight' : effectiveAngleDegrees < 0
      ? (magnitude >= 7 && magnitude <= 15 ? 'mirrored' : 'mirrored-extrapolated')
      : (magnitude >= 7 && magnitude <= 15 ? 'measured-range' : 'extrapolated');
    return {
      aimingOffset, aimingBox, bodyHeadingDegrees: -alpha * 180 / Math.PI,
      steeringDegrees: effectiveAngleDegrees,
      commandedSteeringDegrees: angleDegrees, commandedAimingOffsetCm: aimingOffsetCm,
      calibrationAngleOffsetDegrees: offsets.angleOffsetDegrees,
      calibrationAimingOffsetCm: offsets.aimingOffsetCm,
      calibrationApplied: calibration !== null,
      targetDistance, speedCmPerSecond, wheelbase: WHEELBASE, frontTrack: FRONT_TRACK, rearTrack: REAR_TRACK,
      eggOverhang: EGG_OVERHANG, eggFromRear: EGG_FROM_REAR,
      crossingOffset, crossingPoint, crossingClosest, crossingFraction, crossingError, l1Crossings,
      curvature, radius,
      rearRadius: Number.isFinite(radius) ? Math.hypot(radius, EGG_FROM_REAR) : Infinity,
      rearLength: curvature === 0 ? length : Math.hypot(radius, EGG_FROM_REAR) * Math.abs(sweep),
      length,
      sweep, l3Reached, stop, pointAt, calibrationStatus,
      error: Math.hypot(stop.x, stop.y - targetDistance),
      lateral: stop.x, longitudinal: stop.y - targetDistance,
      loops: Math.abs(sweep) > Math.PI
    };
  }

  function canGeometry(model) {
    const radius = CAN_DIAMETER_M / 2;
    const y = model.targetDistance / 2;
    // B53 places the OUTSIDE can's inner edge, not its center, 100 cm left of C.
    const outsideCan = { x: -PRACTICE_CAN_LIMIT_M - radius, y };
    const insideCan = { x: 2 * model.crossingPoint.x - outsideCan.x, y };
    const insideGapCm = (insideCan.x - radius + PRACTICE_CAN_LIMIT_M) * 100;
    return {
      outsideCan, insideCan, radius,
      insideGapCm,
      valid: insideGapCm >= -1e-8 && insideGapCm <= 100 + 1e-8,
      leftEdge: -PRACTICE_CAN_LIMIT_M,
      rightEdge: insideCan.x - radius
    };
  }

  function approximateCanClearance(model, cans) {
    // Conservatively represent the vehicle as a long rectangle. Its half-width
    // is the wider wheel track plus an assumed 2.5 cm wheel thickness.
    const halfWidth = Math.max(model.frontTrack, model.rearTrack) / 2 + APPROX_WHEEL_WIDTH_M / 2;
    const steps = Math.max(500, Math.min(5000, Math.ceil(model.length / 0.005)));
    let minX = Infinity;
    let maxX = -Infinity;
    let minCanClearance = Infinity;
    const y = cans.outsideCan.y;
    for (let i = 0; i <= steps; i++) {
      const p = model.pointAt(i / steps);
      const right = { x: Math.cos(p.heading) * halfWidth, y: Math.sin(p.heading) * halfWidth };
      const forward = { x: -Math.sin(p.heading), y: Math.cos(p.heading) };
      const rearEnd = { x: p.rear.x - 0.04 * forward.x, y: p.rear.y - 0.04 * forward.y };
      const bodyLength = Math.hypot(p.x - rearEnd.x, p.y - rearEnd.y);
      for (const can of [cans.outsideCan, cans.insideCan]) {
        const dx = can.x - rearEnd.x, dy = can.y - rearEnd.y;
        const along = dx * forward.x + dy * forward.y;
        const across = dx * Math.cos(p.heading) + dy * Math.sin(p.heading);
        const longitudinalGap = Math.max(0, -along, along - bodyLength);
        const lateralGap = Math.max(0, Math.abs(across) - halfWidth);
        minCanClearance = Math.min(minCanClearance, Math.hypot(longitudinalGap, lateralGap) - cans.radius);
      }
      const corners = [
        { x: rearEnd.x - right.x, y: rearEnd.y - right.y },
        { x: rearEnd.x + right.x, y: rearEnd.y + right.y },
        { x: p.x + right.x, y: p.y + right.y },
        { x: p.x - right.x, y: p.y - right.y }
      ];
      for (let j = 0; j < corners.length; j++) {
        const a = corners[j], b = corners[(j + 1) % corners.length];
        if (Math.abs(b.y - a.y) < 1e-12) {
          if (Math.abs(a.y - y) < 1e-9) {
            minX = Math.min(minX, a.x, b.x);
            maxX = Math.max(maxX, a.x, b.x);
          }
        } else {
          const t = (y - a.y) / (b.y - a.y);
          if (t >= 0 && t <= 1) {
            const x = a.x + t * (b.x - a.x);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
          }
        }
      }
    }
    return { crossed: Number.isFinite(minX), minX, maxX, minCanClearance, assumedWidthCm: 2 * halfWidth * 100 };
  }

  function estimateRunScore(model) {
    // B52: successful Run Score = 100 + 2 points/cm of measured Vehicle
    // Distance + Run Time + earned Can Bonus + Run Penalties. This demo uses
    // estimated timing and footprint clearance, and assumes no penalties.
    const cans = canGeometry(model);
    const clearance = approximateCanClearance(model, cans);
    const fullyPassedL1 = model.pointAt(1).rear.y > cans.outsideCan.y;
    const canBonusEarned = cans.valid && clearance.crossed && fullyPassedL1 &&
      clearance.minX > cans.leftEdge + 1e-6 && clearance.maxX < cans.rightEdge - 1e-6 &&
      clearance.minCanClearance > 1e-6;
    const canBonus = canBonusEarned ? -0.5 * (110 - cans.insideGapCm) : 0;
    const vehicleDistanceCm = Math.round(model.error * 1000) / 10;
    const distanceScore = 2 * vehicleDistanceCm;
    const estimatedTimeSeconds = Math.round(model.length * 100 / model.speedCmPerSecond * 100) / 100;
    const noCanScore = Math.round((100 + distanceScore + estimatedTimeSeconds) * 100) / 100;
    const totalScore = model.l3Reached ? Math.round((noCanScore + canBonus) * 100) / 100 : null;
    const failingCrossing = model.l1Crossings.find(p => p.x < -PRACTICE_CAN_LIMIT_M - 1e-9);
    const canStatus = !cans.valid ? 'Can placement is outside the official 0–100 cm gap range.'
      : !clearance.crossed ? 'The vehicle does not cross L1.'
      : !fullyPassedL1 ? 'The rear of the vehicle has not fully passed L1.'
      : canBonusEarned ? 'Estimated vehicle footprint clears the gap.'
      : 'Estimated vehicle footprint does not clear both cans.';
    return {
      vehicleDistanceCm, distanceScore, estimatedTimeSeconds, noCanScore, totalScore,
      demoCanLimitFail: Boolean(failingCrossing),
      failingCrossingCmLeft: failingCrossing ? -failingCrossing.x * 100 : null,
      cans, clearance, canStatus, canBonusEarned, canBonus,
      estimatedSpeedCmPerSecond: model.speedCmPerSecond
    };
  }

  root.ScramblerModel = { calculateFromInputs, recommendedSettings, calibrateFromRuns, canGeometry, estimateRunScore, pathCurvature, CALIBRATION, WHEELBASE, FRONT_TRACK, REAR_TRACK, EGG_OVERHANG, EGG_FROM_REAR };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ScramblerModel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
