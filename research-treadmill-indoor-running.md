# Treadmill & Indoor Running: Comprehensive Research for Tortoise

**Date:** 2026-03-18
**Purpose:** Inform Tortoise marathon training app's treadmill/indoor running feature strategy

---

## 1. How Major Running Apps Handle Treadmill/Indoor Runs

### Strava
- **No native real-time indoor recording** on the mobile app — cannot record treadmill runs with distance tracking from phone sensors
- **Manual entry** is the primary method: after your run, tap "+", select Run, enter time/distance/HR manually
- **Apple Watch app** uses the watch's pedometer to estimate distance during indoor runs
- **Cannot edit distance** on treadmill activities after upload — a top-voted feature request in their community hub
- Third-party workarounds: RunGap iOS app can correct activity data before import; "Indoor Run Fixer" tool exists
- Indoor runs show on feed but without maps/routes; they count toward weekly mileage totals
- **Pain point:** ~33% of some users' runs are treadmill — losing HR and pace data for manual entries is frustrating

### Nike Run Club (NRC)
- **Manual indoor/outdoor toggle** required — tap gear icon on run tab to switch to indoor mode before starting
- Uses phone/watch **accelerometer** to detect movement and estimate stride length + distance
- Phone must stay **on your body** (pocket, armband) — placing on treadmill console causes tracking to pause/fail
- No auto-detection of indoor vs outdoor — user must remember to switch modes
- Accuracy concerns: relies entirely on arm swing correlation to stride, no calibration workflow exposed to users
- No structured treadmill workouts or incline guidance

### Garmin Connect
- **Indoor Run activity type** built into all Garmin watches
- Uses **internal accelerometer** to estimate stride and distance without GPS
- **Post-run calibration**: After running 1.5+ miles on treadmill, enter actual distance from treadmill display — watch adjusts its stride model
- Calibration data persists and improves accuracy on future indoor runs
- **Footpod support**: Garmin Running Dynamics Pod or third-party footpods provide direct stride measurement for better accuracy
- All metrics (HR, cadence, running dynamics) still collected during indoor runs
- Distance splits available but may not match treadmill exactly until calibrated

### Runna
- **First-of-its-kind treadmill connectivity** via Bluetooth FTMS
- Two modes:
  - **Smart Treadmill**: Connects via Bluetooth FTMS — app automatically controls speed and incline on compatible treadmills
  - **Manual Treadmill**: App displays target speeds/inclines; user adjusts manually
- Compatible brands: Horizon, Xterra, NoblePro, Spirit, BH (expanding)
- **All training plan workouts** available as treadmill versions
- Hill sessions translate to specific incline percentages on treadmill
- **Training Preferences**: Toggle Challenging/Balanced/Comfortable difficulty
- The gold standard for structured treadmill integration in a training app

### Apple Fitness / Apple Watch Workout App
- **Indoor Run** workout type uses accelerometer only (no GPS)
- **Calibration system**: 20-minute outdoor walk/run teaches watch stride-speed relationship; continuously recalibrates on subsequent outdoor workouts
- **Running form metrics** (watchOS 9+, Series 6+): stride length, ground contact time, vertical oscillation, running power — available for indoor runs
- **GymKit integration**: NFC tap-to-pair with compatible gym treadmills syncs speed, distance, incline, pace bidirectionally
- GymKit partners: Life Fitness, Cybex, Matrix, Technogym, Schwinn, Star Trac, Peloton, Nautilus
- **Known accuracy issue**: Watch consistently 10-15% below treadmill distance for uncalibrated users

### Zwift Run
- **Virtual world running**: Avatar runs through virtual environments (Watopia) while user is on treadmill
- **Runn sensor** ($85-100): Optical sensor on treadmill rail tracks belt speed via reflective stickers; broadcasts via BLE + ANT+
- Accuracy within 0.1 km/h; ~2.5 second delay between speed change and display
- Also supports footpods (Stryd, Milestone) and smart treadmills via FTMS
- Structured workout plans up to 18 weeks; custom workout builder
- Competitive/social: run with other users globally, events, races
- The entertainment/engagement leader for indoor running

### Peloton
- **Guided treadmill classes** with instructor-led speed/incline cues
- **Virtual Running Track Mode** on Peloton Tread hardware
- **FTMS support** added: pairs with third-party Bluetooth treadmills to display real-time stats
- Content-first approach: entertainment and coaching, less training plan structure
- Walled garden: best experience on Peloton hardware

### Coros
- **Post-run distance correction**: After saving indoor run, enter actual treadmill distance
- Watch recalculates pace using cadence-pace model — correction improves all future indoor runs
- Calibration supported up to +/- 25% of recorded distance
- **Standout feature**: Average pace, splits all retroactively updated after distance correction
- Garmin does not retroactively adjust splits — Coros's approach is more useful

---

## 2. Technical Approaches to Indoor Distance Tracking

### Accelerometer-Based Step Counting (All Watches)
- **How it works**: Accelerometer detects periodic acceleration patterns in wrist motion → noise filtering → ML classification → step count
- **Distance formula**: Steps x Estimated Stride Length = Distance
- **Stride estimation**: Learned from outdoor runs where GPS provides ground truth; stored as stride-speed lookup table
- **Accuracy**: Typically within 5-15% after calibration; uncalibrated can be 20%+ off
- **Failure modes**: Holding treadmill handrails (no arm swing), unusual gait, speed changes

### Apple Watch Calibration System
- **Process**: 20-min outdoor walk/run in flat, open area with good GPS
- **What it learns**: Maps arm swing patterns to stride lengths at different speeds
- **Continuous improvement**: Every outdoor walk/run further refines the accelerometer model
- **Reset option**: Settings → Privacy → Motion & Fitness → Reset Fitness Calibration Data
- **Technical stack**: Core Motion framework, CMPedometer API, ML models trained on diverse walking/running datasets
- **Adaptation**: Watch adjusts to user-specific motion signatures over time

### Core Motion Technical Details (WWDC 2016 Session 713)
- CMPedometer provides steps, distance, floors climbed
- Stride estimation algorithms run on both iPhone and Apple Watch
- Pedometer Events API detects start/stop transitions during workouts using predictive algorithm trained on user data
- CM Sensor Recorder: 36-hour raw accelerometer retrieval window, 3-second sample delay
- Device Motion API: attitude (orientation), gravity, rotation rate, user acceleration (gravity-compensated)
- Sensor fusion combines accelerometer + gyroscope data

### Footpod Sensors
- **Stryd** (~$230): Running power meter + pace/distance sensor
  - Within 1% accuracy, usually no calibration needed
  - Measures power output (watts) in addition to pace/distance/cadence
  - Separate treadmill profile for indoor running
  - Gold standard for indoor pace accuracy
  - Guided incline workouts via Apple Watch app
- **Garmin Running Dynamics Pod** (~$50): Clips to waistband
  - Cadence, stride length, ground contact time, vertical oscillation
  - Less accurate for pure distance than Stryd
- **Milestone Pod** (~$30): Budget shoe-clip option
  - Basic pace/distance tracking

### Smart Treadmill Bluetooth (FTMS Protocol)
- **FTMS** (Fitness Machine Service): Open Bluetooth standard by Bluetooth SIG
- **Data transmitted**: Speed, incline %, distance, cadence, pace — in real time
- **Control capabilities**: Apps can set speed and incline targets on compatible treadmills
- **Limitation**: Most major fitness apps only implement automatic incline control, not speed control
- **Compatible apps**: Zwift, Kinomap, Runna, Peloton, iCardio, Wahoo
- **Retrofit options**: ESP32-based DIY bridges can add FTMS to non-smart treadmills ($15-30 in parts)

### Zwift Runn Sensor
- Optical sensor on treadmill side rail
- Reflective stickers on belt (3-4 recommended)
- Measures belt rotation speed
- Broadcasts via BLE + ANT+
- Speed accuracy within 0.1 km/h
- Also detects incline and cadence
- $85-100 price point
- Works with any treadmill with accessible side rail

### Apple GymKit
- NFC tap-to-pair between Apple Watch and compatible gym equipment
- Bidirectional data sync: watch metrics → machine display, machine data → watch
- Data synced: calories, distance, speed, floors climbed, incline, pace
- Supported by: Life Fitness, Cybex, Matrix, Technogym, Schwinn, Star Trac, Peloton, Nautilus
- Availability growing but not universal — mostly in commercial gyms

### HealthKit Indoor Workout Data Model
- **Available data for indoor runs**:
  - Heart rate (HKQuantityType heartRate)
  - Active energy burned
  - Distance (accelerometer-estimated)
  - Running cadence (steps per minute)
  - Running power (watts, Series 6+)
  - Stride length (Series 6+)
  - Ground contact time (Series 6+)
  - Vertical oscillation (Series 6+)
  - Step count
- **NOT available for indoor runs**:
  - GPS route (HKWorkoutRoute)
  - Elevation gained/lost
  - Location samples
  - Map visualization
- **Configuration**: `HKWorkoutActivityType.running` + `HKWorkoutSessionLocationType.indoor`
- Indoor workouts still contribute to Activity rings, VO2 max estimates (with sufficient data), and training load

---

## 3. Training Plan Implications: Treadmill vs Outdoor

### Pace Conversion
- **The 1% incline rule**: Classic 1996 Jones & Doust study showed 1% treadmill grade ≈ outdoor flat effort
- **Reality is speed-dependent**:
  - Accurate at ~7:00/mile pace
  - Too much incline compensation for slower paces (>8:00/mile)
  - Too little compensation for faster paces (<6:00/mile)
- **2019 meta-analysis** challenged the rule: at most recreational paces, 0% treadmill only trivially underestimates oxygen cost — difference not statistically significant
- **Practical recommendation**: 0.5-1% incline for most marathon trainers; adjust by feel

### Heart Rate Response Pattern
- **Easy paces**: HR reads lower on treadmill than outdoor equivalent (favorable)
- **Tempo/threshold paces**: HR inverts — reads higher on treadmill (due to heat buildup, lack of airflow)
- **Speed work**: Significantly higher HR on treadmill due to heat + psychological stress of fast belt
- **Implication for apps**: Heart rate zone targets may need indoor/outdoor adjustment

### RPE (Rate of Perceived Exertion) Differences
- **U-shaped difficulty curve**:
  - Slow paces: Treadmill feels easier (RPE lower)
  - Moderate paces (8:45-6:50/mile): RPE roughly equal
  - Fast paces: Treadmill feels harder (RPE higher)
- **Contributing factors**: No wind cooling, heat buildup, belt speed anxiety, monotony
- **App implication**: An app should recommend effort-based targets (HR zones or RPE) rather than strict pace targets for treadmill runs

### How Apps Should Handle Indoor Plan Substitutions
- **Current gap**: Most apps don't intelligently adjust when user does a treadmill run instead of outdoor
- **Runna's approach**: All plan workouts available as treadmill versions with adjusted guidance
- **Recommended adjustments**:
  - Convert pace targets to effort/HR zone targets
  - Add 0.5-1% incline recommendation for easy/moderate runs
  - Reduce pace targets by 10-15 sec/mile for tempo and faster work (to match outdoor effort)
  - For hill workouts: convert grade % directly to treadmill incline %
  - Flag that long runs (16+ miles) ideally include some outdoor running for race specificity

### Wind Resistance, Terrain, Heat Factors
- **Wind resistance**: 2-10% of energy cost outdoors depending on speed; absent on treadmill
- **Flat terrain**: Treadmill is perfectly flat unless incline set; outdoor courses have micro-variations
- **Heat**: Indoor environments typically warmer; no evaporative cooling from headwind; body temperature rises faster
- **Surface**: Treadmill belt has slight give, reducing impact vs concrete/asphalt — some biomechanical differences
- **Muscle activation**: Slightly different hamstring/glute engagement due to belt assistance

---

## 4. Treadmill-Specific Features in Apps

### Incline Simulation for Hill Workouts
- **Runna**: Converts outdoor hill workouts to specific incline percentages
- **Stryd**: Guided incline workouts on Apple Watch (e.g., 4-min intervals at 3% incline)
- **Zwift**: Virtual terrain changes incline on smart treadmills automatically
- **Wahoo KICKR RUN**: -3% to +15% grade range; simulates real-world routes with real-time elevation changes
- **Race course simulation**: Look up actual race elevation profile, manually adjust treadmill incline to match — underused but powerful training strategy

### Virtual Running Environments
- **Zwift**: Full 3D virtual world (Watopia), multiplayer, races, events
- **Kinomap**: Real-world video routes with auto-speed/incline adjustment
- **iFIT**: Google Maps street view integration, trainer-led routes
- **Peloton**: Virtual running track mode, scenic runs
- **Treadmill Buddy**: AR technology for realistic indoor running

### Structured Interval Workouts
- Treadmills are ideal for precise interval work — exact speed/incline control
- **Advantage over outdoor**: No traffic lights, exact pacing, immediate recovery by pressing stop
- **Stryd Mobile App**: Treadmill-specific workout library with power-based targets
- **Runna**: Full training plan workouts adapted for treadmill with manual or auto speed/incline

### Entertainment Integrations
- **Peloton**: Music-driven classes, leaderboards, instructor motivation
- **Zwift**: Gamification, avatars, virtual racing
- **iFIT**: Trainer-led scenic routes worldwide
- **Netflix/streaming**: Many runners watch shows during easy/long runs — apps should support background operation
- **Key user need**: Apps that pause or lose data when user switches to entertainment app are dealbreakers

### Gym/Treadmill Brand Partnerships
- **Peloton Tread**: Fully integrated hardware + software ecosystem
- **NordicTrack/ProForm**: iFIT integration (subscription)
- **Wahoo KICKR RUN**: Open FTMS, works with Zwift, Kinomap, Wahoo app
- **Woodway**: Premium treadmills, limited app integration
- **NoblePro**: Primary Runna partner for FTMS testing
- **Life Fitness / Technogym**: GymKit support in commercial gym installations

---

## 5. The Treadmill Running Market

### Market Size
- **Global treadmill market**: $5.75 billion (2024) → projected $9.08 billion by 2032 (5.96% CAGR)
- **Smart treadmill segment**: $1.2-1.5 billion (2024) → projected $2.5-4.3 billion by 2032-2033 (9.2-12.3% CAGR)
- **Smart treadmills growing 2x faster** than overall treadmill market

### User Statistics
- **53 million** people use treadmills for running/walking/jogging workouts
- **~50 million** people run in the United States (15% of population)
- **Roughly half** of treadmill runners also identify as runners/joggers — the other half are walkers/casual exercisers
- North America: 39.47% of global treadmill market share
- Residential segment: 63% of market share; 38% of new installations are residential

### COVID Impact
- **Treadmill sales jumped 170% in 2020** during pandemic
- Home fitness equipment demand surged — lasting behavioral shift
- Post-COVID normalization but sustained growth vs pre-pandemic baseline
- 36% of treadmill companies introduced AI-powered smart devices post-2020
- 35% of new treadmill installations include touchscreen and virtual running environments

### Treadmill Owner Motivation
- 39.3% "very motivated" to train on treadmill
- 39.3% "somewhat motivated"
- 14% "extremely motivated"
- 7.1% "not at all or slightly motivated"
- **Implication**: Most treadmill owners need motivation help — app opportunity

### Indoor Running Growth in England
- Treadmill use increased by approximately one-third in 2-3 years
- Driven by weather avoidance, safety concerns, convenience

### Regional Trends
- **North America**: 39.47% market share; largest installed base
- **Europe**: 35.81% market share; strong gym culture
- **Asia-Pacific**: Fastest growing region; urbanization driving demand
- **Electric treadmills**: 84.93% of market (manual/curved treadmills are niche)

---

## 6. Pain Points and Gaps

### Top User Complaints (from Reddit, forums, app reviews)

#### Distance Accuracy
- "Apple Watch is consistently 10-15% below the treadmill distance"
- Watches rely on arm swing → users who hold handrails get zero distance
- No standard calibration workflow — every app/watch does it differently
- After fixing distance, splits/pace aren't recalculated (except Coros)

#### Data Loss on Manual Entry
- Strava doesn't record HR/pace for manually entered treadmill runs
- "Roughly 33% of my runs are on treadmills — I lose all that data"
- Double-counting when using workarounds (record on watch + manual entry)

#### App Pauses When Backgrounded
- Many apps pause tracking when user switches to Netflix/YouTube/music
- "All running accomplished while out of the app counts for nothing — huge disappointment"
- Users WILL watch entertainment during long treadmill runs — apps must handle this

#### No Distance Editing
- Strava: Cannot edit distance on treadmill activities (top feature request)
- Many apps lock in the accelerometer-estimated distance with no correction option

#### Indoor Runs Feel Like Second-Class Citizens
- Missing from leaderboards, challenges, segments
- No kudos or social features for indoor activities
- No route/map to share — less engaging social posts
- "Best Efforts" sometimes don't update from treadmill runs

#### Training Plans Assume Outdoor
- Most training plans don't offer treadmill-specific workout versions
- No pace adjustment guidance for indoor vs outdoor
- Hill workouts: "do hill repeats" without treadmill incline translation
- No weather-based suggestion to move workout indoors

#### Boring / No Engagement
- "The hardest part about marathon training on a treadmill is fighting the boredom"
- Most training apps offer zero entertainment or engagement features for indoor runs
- Zwift is engaging but not a training plan app; Runna has plans but limited engagement

#### Heat Issues
- No airflow coaching or fan recommendations
- HR drifts higher indoors — apps don't account for this in targets
- "A small fan placed 2-3 feet away can reduce fatigue by 15-20%"

### Identified Gaps (Opportunities for Tortoise)

1. **Weather-based indoor/outdoor suggestions** — No major app does this; check forecast, suggest treadmill when dangerous cold/heat/ice/storms
2. **Automatic pace adjustment for indoor runs** — Convert pace targets to HR zone targets when workout mode is indoor
3. **Post-run distance correction with split recalculation** — Only Coros does this; huge opportunity
4. **Background operation** — Must work while user watches entertainment
5. **Treadmill-specific long run strategies** — Mental chunking, incline variation, fan reminders, entertainment suggestions
6. **Race course simulation mode** — Import race elevation profile, generate treadmill incline schedule
7. **Indoor run social features** — Make treadmill runs shareable and engaging (effort-based comparisons, not route-based)
8. **Hybrid indoor/outdoor training intelligence** — Track what % of training is indoor vs outdoor, suggest balance adjustments as race approaches

---

## 7. Apple Watch / watchOS Technical Details

### Indoor Run Configuration
```swift
let configuration = HKWorkoutConfiguration()
configuration.activityType = .running
configuration.locationType = .indoor
// No GPS activated — watch uses accelerometer only
```

### Available Data Types for Indoor Runs
| Data Type | Available Indoor? | HK Identifier | Notes |
|-----------|:---:|---|---|
| Heart Rate | Yes | `heartRate` | Optical sensor, unaffected by location |
| Active Calories | Yes | `activeEnergyBurned` | Derived from HR + motion |
| Distance | Yes* | `distanceWalkingRunning` | Accelerometer-estimated, less accurate |
| Cadence | Yes | `runningStepCount` | Steps per minute, highly accurate |
| Running Power | Yes | `runningPower` | Watts, Series 6+ |
| Stride Length | Yes | `runningStrideLength` | Series 6+, accelerometer-based |
| Ground Contact Time | Yes | `runningGroundContactTime` | Series 6+, ms |
| Vertical Oscillation | Yes | `runningVerticalOscillation` | Series 6+, cm |
| GPS Route | **No** | `HKWorkoutRoute` | No GPS data collected |
| Elevation | **No** | `elevationAscended` | No barometer data used |
| Location Samples | **No** | `CLLocation` | Not recorded |
| VO2 Max | **Partial** | `vo2Max` | May estimate if sufficient indoor data |

### Accelerometer Distance Algorithm
1. **Raw accelerometer data** → noise filtering → step detection
2. **ML classification**: Determines if motion is step vs. non-step
3. **Stride estimation**: Lookup table mapping cadence/speed to stride length (learned from outdoor GPS-validated runs)
4. **Distance**: Sum of (stride length × step count) over workout duration
5. **Continuous learning**: Each outdoor workout refines the model

### Calibration Best Practices for Users
- Walk/run outdoors for 20+ minutes in flat, open area with good GPS
- Run at multiple speeds to calibrate across pace range
- Wear watch snugly on wrist (loose watch = poor accelerometer data)
- Can reset calibration: Settings → Privacy → Motion & Fitness → Reset
- More outdoor runs = better indoor accuracy over time

### GymKit (NFC Pairing with Gym Equipment)
- Tap Apple Watch on NFC reader on compatible treadmill
- Bidirectional sync eliminates accelerometer estimation errors
- Machine distance/speed becomes ground truth
- Limited to commercial gym equipment from participating brands
- Not available on home treadmills (typically)

### Running Metrics Requirements
| Metric | Minimum Watch | Minimum watchOS |
|--------|:---:|:---:|
| Heart Rate | All | Any |
| Cadence | Series 5+ | watchOS 9 |
| Running Power | Series 6+ | watchOS 9 |
| Stride Length | Series 6+ | watchOS 9 |
| Ground Contact Time | Series 6+ | watchOS 9 |
| Vertical Oscillation | Series 6+ | watchOS 9 |

---

## 8. Marathon Training on Treadmills: Unique Considerations

### Long Runs (16-20 Miles)
- **Pacing**: Set treadmill 1-2 min/mile slower than goal marathon pace for long runs
- **Incline**: 1-3% grade simulates outdoor metabolic cost
- **Mental strategies**:
  - Break into segments (e.g., 4 x 5 miles with brief stops)
  - Cover distance display with towel — focus on time/effort
  - Entertainment: TV shows, podcasts, music playlists
  - Visualize race course or favorite outdoor route
  - Vary speed/incline every few miles to reduce monotony
  - Run with friends on adjacent treadmills
- **Hydration**: More critical indoors — no wind cooling, higher sweat rate
- **Fueling**: Practice race-day nutrition during treadmill long runs (same stomach conditions)
- **Treadmill auto-shutoff**: Many treadmills stop at 60 minutes — plan for restart during 20-mile runs

### Pacing Differences
- **General rule**: Treadmill paces feel 10-30 seconds harder per mile than the same outdoor pace
- **Speed-dependent**:
  - Easy pace (<9:00/mile): Treadmill feels easier — less wind resistance matters less
  - Moderate (8:45-6:50/mile): Roughly equivalent effort
  - Fast (>6:50/mile): Treadmill feels harder — heat buildup, belt anxiety
- **Recommendation**: Use RPE or HR zones instead of pace targets for treadmill work

### Heat Management
- **Problem**: No headwind means no evaporative cooling; body temperature rises faster
- **Fan positioning**: 2-3 feet from treadmill; reduces fatigue by 15-20%
- **Ideal temperature**: 50-63.5°F (10-17.5°C) for peak endurance performance
- **Clothing**: Dress lighter than outdoor equivalent — less moisture-wicking advantage without airflow
- **HR drift**: Expect cardiac drift (HR increases at same pace) during long indoor runs — this is normal

### When to Recommend Treadmill vs Outdoor
**Suggest treadmill when:**
- Temperature < 20°F (-7°C) or > 90°F (32°C)
- Icy/snowy conditions
- Poor air quality (AQI > 150)
- Lightning/thunderstorm
- Very early morning / late night (safety)
- Specific interval workout (precise pace control)
- Recovery from injury (softer surface)
- Hill simulation when flat terrain locally

**Suggest outdoor when:**
- Within 4-6 weeks of race day (race specificity)
- Long runs > 16 miles (mental preparation)
- When runner hasn't been outdoors in > 1 week
- Moderate weather conditions
- Route/terrain familiarity for upcoming race

### Weather-Based Auto-Suggestions (Opportunity)
- **No major running app currently does this**
- Could integrate weather API to check:
  - Temperature extremes
  - Wind chill / heat index
  - Precipitation
  - Air quality index
  - UV index
  - Lightning risk
- Display: "Weather alert: 95°F with high humidity forecast. Consider moving today's long run to the treadmill. Here's your adjusted workout."
- Apps like RunWeather and OutSider (Weather Channel) provide weather-running data but don't integrate with training plans

### Race Course Simulation
- **Powerful training tool**: Import race elevation profile → generate treadmill incline schedule
- **Process**:
  1. Get race course GPX file or elevation data
  2. Map elevation changes to treadmill incline percentages
  3. Create mile-by-mile incline profile
  4. User follows incline cues during long run
- **Only partially available** in some apps (iFIT, Wahoo) — no training plan app does this well

### Indoor/Outdoor Training Balance
- **Recommended**: No more than 50-60% of training on treadmill during marathon prep
- **Final 4-6 weeks**: Increase outdoor percentage for race specificity
- **Track ratio**: App should monitor indoor/outdoor split and nudge toward outdoor as race approaches
- **Terrain adaptation**: Treadmill doesn't prepare for lateral forces, uneven surfaces, curbs, wind gusts
- **Mental preparation**: Long outdoor runs build mental toughness for race-day conditions

---

## 9. Recommendations for Tortoise

### Must-Have Features (MVP)
1. **Indoor Run workout type** — HKWorkoutConfiguration with `.indoor` location
2. **Accelerometer-based distance** with post-run correction option (a la Coros)
3. **All training plan workouts available as treadmill versions** with adjusted targets
4. **Effort-based targeting** — Show HR zones and RPE instead of pure pace for indoor runs
5. **Background operation** — Must track workout while user is in other apps
6. **Incline guidance** — Convert plan's hill workouts to specific incline percentages

### Differentiating Features
1. **Weather-based indoor/outdoor suggestions** — Unique; no competitor does this
2. **Race course simulation mode** — Import elevation profile → treadmill incline schedule
3. **Smart pace adjustment** — Auto-convert outdoor pace targets to indoor equivalents based on user's historical indoor/outdoor ratio
4. **Indoor/outdoor balance tracking** — Dashboard showing training split; nudges toward outdoor as race approaches
5. **Post-run distance correction with full recalculation** — Recalculate all splits, not just total

### Nice-to-Have Features
1. **FTMS treadmill connectivity** — Direct speed/incline control for smart treadmills
2. **Treadmill workout entertainment tips** — Suggest shows, podcasts, playlists based on run duration
3. **Heat/fan coaching** — Remind users about fan positioning, hydration for long indoor runs
4. **Long run mental strategies** — Mile-chunking, visualization prompts, progress celebrations at milestones
5. **Social features for indoor runs** — Effort-based comparisons, streak counting, indoor run challenges

### Technical Implementation Notes
- Use `HKWorkoutActivityType.running` with `HKWorkoutSessionLocationType.indoor`
- Collect: heartRate, activeEnergyBurned, distanceWalkingRunning, runningStepCount, runningPower, runningStrideLength, runningGroundContactTime, runningVerticalOscillation
- Skip: HKWorkoutRoute (no GPS data to save)
- Consider CMPedometer for step/distance on watch
- For weather integration: OpenWeatherMap API or Apple WeatherKit
- For race course elevation: Parse GPX files or use elevation APIs

---

## Sources

### App Features & Behavior
- [Strava Indoor Activities Support](https://support.strava.com/hc/en-us/articles/216919417-Indoor-Treadmill-and-Bike-Trainer-Activities)
- [Nike Run Club Indoor Run Help](https://www.nike.com/help/a/nrc-indoor-run)
- [Runna Treadmill Recording](https://support.runna.com/en/articles/7945823-using-record-on-treadmill-and-how-to-get-the-most-out-of-it)
- [Runna Smart Treadmill Compatibility](https://support.runna.com/en/articles/8307654-smart-treadmills-compatible-with-the-runna-app)
- [Coros Indoor Run/Treadmill Help](https://support.coros.com/hc/en-us/articles/360039841712-Indoor-Run-Treadmills)
- [Coros Distance Editing](https://support.coros.com/hc/en-us/articles/43720992472212-Edit-the-Distance-of-Your-COROS-Activity)
- [Garmin Treadmill Calibration](https://www8.garmin.com/manuals-apac/webhelp/venusq/EN-SG/GUID-9D72BB50-2218-4143-86B8-7E3904A28F5A-2737.html)

### Apple Watch & HealthKit
- [Apple Watch Calibration Guide](https://support.apple.com/en-us/105048)
- [Apple Watch Running Metrics](https://support.apple.com/guide/watch/workout-views-and-running-metrics-apd1f24d4d35/watchos)
- [HKWorkoutActivityType.running](https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype/running)
- [Running Workout Sessions](https://developer.apple.com/documentation/healthkit/workouts_and_activity_rings/running_workout_sessions)
- [WWDC 2016 Session 713: Core Motion](https://asciiwwdc.com/2016/sessions/713)
- [Apple GymKit Overview](https://appleinsider.com/articles/19/06/12/apples-gymkit-what-it-is-who-supports-it-and-where-you-can-find-it)

### Market & Statistics
- [Treadmill Market Size (Fortune Business Insights)](https://www.fortunebusinessinsights.com/treadmill-market-110438)
- [Treadmill Statistics 2026](https://www.news.market.us/treadmill-statistics/)
- [Smart Treadmill Market Report](https://dataintelo.com/report/global-smart-treadmill-market)
- [Running Statistics & Facts](https://www.garagegymreviews.com/running-statistics-and-facts)
- [Treadmill Owner Motivation Study](https://runningmagazine.ca/the-scene/just-14-per-cent-of-treadmill-owners-extremely-motivated-to-train-study-finds/)

### Pace & Science
- [1% Incline Rule Analysis](https://www.therunningweek.com/post/the-truth-about-treadmill-1-inclines)
- [Treadmill vs Outdoor: Science](https://runnersconnect.net/treadmills-vs-outdoor-running-heres-what-the-latest-science-says/)
- [RPE Treadmill vs Outdoor](https://www.runningexplained.com/post/treadmill-vs-outdoor-running-why-pace-and-perceived-effort-can-differ-slower-on-the-treadmill)
- [Treadmill Pace Conversions](https://www.hillrunner.com/calculators/treadmill-pace-conversions/)

### Training
- [Marathon Training on Treadmill](https://marathonhandbook.com/marathon-training-on-a-treadmill/)
- [Surviving Long Treadmill Runs](https://runtothefinish.com/survive-long-runs-treadmill/)
- [Treadmill Long Run Tips](https://marathonhandbook.com/long-run-on-a-treadmill/)

### Technology
- [Bluetooth FTMS Integration](https://www.fitscope.com/blog/bluetooth-ftms-integration-for-fitness-apps)
- [Zwift Runn Sensor](https://us.zwift.com/products/runn)
- [Stryd Treadmill FAQ](https://help.stryd.com/en/articles/8961322-treadmill-stryd-common-questions)
- [Stryd Pace Accuracy](https://help.stryd.com/en/articles/6879062-pace-distance-accuracy-how-to-understand-test-and-fine-tune-stryd-s-pace-distance)
- [ESP32 FTMS Treadmill Bridge](https://github.com/lefty01/ESP32_TTGO_FTMS)

### User Pain Points
- [Strava: Allow Distance Editing](https://communityhub.strava.com/general-chat-2/allow-changing-of-distance-on-treadmill-activities-8917)
- [Apple Watch Indoor Run Accuracy](https://discussions.apple.com/thread/255027337)
- [Coros Distance Correction Feature (Tom's Guide)](https://www.tomsguide.com/wellness/smartwatches/i-use-this-clever-coros-feature-on-all-my-treadmill-runs-to-correct-inaccurate-data-heres-why-garmin-should-copy-it)

### Weather Integration
- [RunWeather App](https://runweather.app/)
- [OutSider by Weather Channel](https://outsider-running-jogging-walking-and-cycling-app-exercise-an.appstor.io/)
- [Klimat Weather Training Data](https://klimat.app)
