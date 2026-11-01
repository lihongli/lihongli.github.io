# Scrambler trajectory demo

Open `index.html` in a browser. Keep `trajectory.js` and `app.js` next to it. No installation or internet connection is needed.

## Inputs and motion

1. **Launch angle θ (degrees)**, also called steering angle: the fixed front-axle angle relative to the body. It determines the measured-radius curve, not the body's heading. Positive turns right; negative turns left. Range −45° to +45°.
2. **Aiming box position A (cm)**: signed distance along perpendicular halfway line L1 from centre line L2. Positive is left; negative is right. The body points from the egg-tip start directly toward this box.
3. **X distance D (cm)**: signed distance on L1 from L2 to X. Positive is left; negative is right. Default 85 cm. X is the midpoint of the two can centers and a desired trajectory checkpoint.
4. **Total distance L (cm)**: from the egg tip's launch position to the target. Range 700–1000 cm; default **700 cm**.
5. **Speed v (cm/s)**: assumed constant speed of the egg tip along its path. Default **300 cm/s**; enter a positive number. Speed changes the estimated time score, not the trajectory.

The egg tip begins at (0, 0), 8 cm ahead of the front axle and 55 cm ahead of the rear axle. The aiming box sets the body's **initial** heading: `body heading = atan2(−A, L/2)`, with right positive. As the egg tip travels along its circular arc, the body's heading turns by the same swept angle. The front-axle setting stays fixed **relative to the body**. The green line is the egg tip's path; the gray dashed line is the rear axle's path. Changing an input redraws the vehicle at the start. **Reset to start** places it there without changing inputs; **Launch vehicle** animates the run. **Reset inputs** restores X = 85 cm, total distance = 700 cm, and speed = 300 cm/s, then fills the recommended angle and aiming-box readings, including any active calibration offsets.

The graph labels **C**, the intersection of L1 and L2. It draws the two bonus cans as solid black squares on L1 with a lowercase **x** at their midpoint, and a red tick at the outside can's inner edge 100 cm left of C. The demo checks the egg tip's actual crossing of L1 between launch and its stopping point. If any crossing is farther than 100 cm left of C, the displayed score reads **FAIL**. A crossing exactly at 100 cm passes this practice cutoff. Moving X alone does not trigger FAIL unless the simulated egg path crosses the limit.

## Calibration from successful runs

At the bottom of the page, enter at least two **real, successful practice runs**. Each row records four geometric values: the observed launch-angle setting, observed aiming-box setting, the egg tip's **measured** crossing position X on L1, and the total start-to-target distance. The run must have passed through that X point and stopped at the target. The table starts with three suggested X and distance pairs; the angle and box readings stay blank until you have real measurements. Speed does not enter the geometric fit.

For each row, the demo calculates the ideal angle and box position for a circular path through start, measured X, and target. It subtracts the observed knob readings to get an implied offset for each knob. The displayed systematic offsets are the **averages** across the successful runs. The table shows each run's implied offsets, and the result panel shows their spread. A wide spread means the constant-offset model may not fit those runs well, perhaps because of surface differences, measurement error, or a path that is not circular.

After pressing **Calibrate**, the simulated path uses `effective angle = entered angle + fitted angle offset` and `effective box = entered box + fitted box offset`. The recommended knob readings use `ideal setting − fitted offset`, so the user can enter those recommendations directly. The graph marks the effective aiming position and the controls show both entered and effective values. The offsets and trial table are saved in this browser; **Clear calibration** removes the active corrections while keeping the rows. Editing rows does not silently change an existing fit: press **Calibrate** again to refit.

These are corrections **relative to the demo's empirical angle-to-curve model**, not isolated measurements of instrument error. The original 7° and 15° radius fits already came from measured settings. Run the calibration on the same type of surface you expect to use, and verify corrected recommendations with new runs.

## Measured-radius calibration

Assuming the supplied trajectory coordinates are centimetres and track the egg tip, fitting circles gives an egg-tip radius of **3.184 m at 7°** and **1.614 m at 15°**. The demo directly interpolates circular-path curvature between these two readings. It uses zero curvature at 0° and estimates outside 7°–15°. Negative settings mirror the observed positive-angle curves; they have not been measured separately.

This is an **empirical geometric model**: the box fixes the body's starting orientation, while the measured front-axle angle sets the egg tip's path radius. It does not derive the turn from wheel-rolling mechanics. The body and axles rotate together as the vehicle moves; the front axle keeps its selected angle relative to the body. A real vehicle following this exact path may require sideways wheel slip.

## Recommended settings

Once X and total distance are entered, the demo recommends values under the angle and aiming-box inputs. With `a = L/2`, `D = X distance`, and all distances in the same units, the circle through egg start, X, and target needs signed curvature `κ = −2D/(a² + D²)` and aiming-box offset `A = 2a²D/(a² − D²)`. The demo converts that curvature to a steering setting using the measured angle-to-radius calibration. Positive D gives a box left of centre and a right-turning front-axle setting. On opening the page, the inputs start at `L = 700 cm`, `D = 85 cm`, and `v = 300 cm/s`, with the recommended angle **+2.92063°** and box position **+180.655 cm** filled in. If a saved calibration exists, those two starting readings use the calibrated recommendation instead. The settings make the egg-tip arc pass through X and end at the target in this model. Rounded displayed values can leave a tiny residual. If `|D| ≥ L/2`, there is no finite forward-pointing solution of this type, so the demo shows an explanation instead of values.

The two observed circles have diameters of 6.37 m and 3.23 m. If the vehicle stays on one of those circles, it cannot reach a target 7–10 m from the egg-tip start, regardless of launch heading. Smaller angles are outside the measured calibration range, so their displayed radii are estimates.

The demo runs the egg tip to its **first crossing of L3**, the line through the target parallel to L1. The distance score uses the egg tip's sideways distance from the target at that crossing. If the circle cannot reach L3, the graph ends at its farthest-forward point and shows **NO L3** instead of a numeric score. A real vehicle may stop elsewhere; launch repeatability, surface grip, wheel scrub, and braking matter. The displayed distances are not competition measurements.

## Approximate Run Score

The official 2027 B52 rule for a successful run is `100 + Distance Score + Time Score + Can Bonus + Run Penalties`, where `Distance Score = 2 × Vehicle Distance in cm`, `Time Score = Run Time in seconds`, and an earned can bonus is `−0.5 × (110 − Inside Can Distance in cm)`. The Vehicle Distance is measured from the foremost egg tip to the Target Point, to the nearest 0.1 cm. The lower of two Run Scores, plus any Final Score Penalties, determines the Final Score.

When the practice cutoff does not trigger and L3 is reached, the demo displays an **estimated single Run Score**: `100 + 2 × rounded egg-tip distance at L3 (cm) + estimated time (s) + earned can bonus + 0 penalties`. The score panel shows each term's calculation and points, then combines the numbers into one equation. With default inputs, it shows `100.00 + 0.00 + 2.42 − 40.00 + 0.00 = 62.42 points`. It estimates time as `egg-tip path length (cm) ÷ entered speed (cm/s)`, rounding the time to 0.01 s. The default speed is **300 cm/s**. The animation uses a fixed short playback time; the entered speed affects the estimated score. Real run time includes actuation, acceleration, braking, recoil, and oscillation. The demo assumes no penalties and does not calculate the better-of-two Final Score.

The official outside can has its **inner edge** 100 cm left of C; the demo assumes identical **7.5 cm diameter** cans (the midpoint of the official 7–8 cm range). It places the inner can so X is midway between the can centers. With X measured in centimetres left of C, the calculated inside can gap is `2 × (100 − X)` cm. A placement is valid for the bonus when this gap is from 0 to 100 cm (X from 50 to 100 cm). If the approximate entire-vehicle footprint clears that gap, the demo awards `−0.5 × (110 − gap)` points; otherwise the bonus is zero. It approximates the vehicle as a **22 cm-wide rectangle** based on the wider wheel track plus assumed 2.5 cm wheel thickness. The real vehicle may be wider or differently shaped, so this cannot guarantee official can clearance.

**FAIL is a user-requested practice flag, not an official scoring classification.** Under the official rules, missing the can passage loses the optional bonus; that alone is not an official Failed Run. The demo retains its separate egg-tip 100 cm cutoff. Actual can contact, barrier contact, egg breakage, and violations are not modeled.

The model entry point is `ScramblerModel.calculateFromInputs(angleDegrees, aimingOffsetCm, crossingOffsetCm, targetDistanceCm, speedCmPerSecond, calibration)`. The fifth argument defaults to 300 cm/s and the sixth to no calibration for existing callers. `ScramblerModel.calibrateFromRuns(runs)` computes the offsets, and `recommendedSettings(X, L, calibration)` returns corrected knob readings.
