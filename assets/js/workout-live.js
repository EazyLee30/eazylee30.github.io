/* Public, minimized Whooper data. Credentials never enter this static site. */
(() => {
  const SLUGS = new Set('ab-wheel active-hang archer-push-up arm-circles arnold-press assault-bike assisted-chin-up assisted-dip assisted-pistol-squat assisted-pull-up back-extension band-pull-apart banded-clamshell banded-dead-bug banded-donkey-kick banded-face-pull banded-fire-hydrant banded-frog-pump banded-glute-bridge banded-hip-thrust banded-kickback banded-lat-pulldown banded-lateral-walk banded-monster-walk banded-pallof-press banded-row banded-seated-hip-abduction banded-squat banded-standing-hip-abduction banded-woodchop barbell-glute-bridge barbell-row battle-ropes bear-crawl bear-plank belt-squat bench-dip bench-press bent-over-rear-delt-raise bicep-curl bicycle-crunch bird-dog bodyweight-squat bulgarian-split-squat burpee butterfly-stretch cable-crunch cable-curl cable-fly cable-front-raise cable-kickback cable-lateral-raise cable-pallof-hold cable-pull-through cable-rear-delt-fly cable-standing-hip-abduction cable-standing-hip-adduction cable-woodchop calf-raise captains-chair-knee-raise cat-cow-stretch chair-dip chest-dip chest-supported-row childs-pose chin-up clamshell close-grip-bench-press close-grip-lat-pulldown commando-pull-up concentration-curl copenhagen-plank cossack-squat crab-walk cross-body-shoulder-stretch crunch curtsy-lunge cycling dead-bug dead-hang deadlift decline-bench-press decline-dumbbell-press decline-push-up decline-sit-up deficit-reverse-lunge diamond-push-up dip donkey-calf-raise donkey-kick doorway-chest-stretch doorway-row drag-curl dragon-flag dumbbell-bench-press dumbbell-bent-over-row dumbbell-curtsy-lunge dumbbell-fly dumbbell-glute-bridge dumbbell-hip-thrust dumbbell-lateral-lunge dumbbell-overhead-tricep-extension dumbbell-romanian-deadlift dumbbell-shrug dumbbell-side-bend dumbbell-skull-crusher dumbbell-sumo-deadlift dumbbell-sumo-squat elliptical explosive-push-up ez-bar-curl face-pull farmer-carry fast-feet feet-elevated-pike-push-up fire-hydrant flutter-kick forward-lunge frog-pump front-foot-elevated-split-squat front-raise front-squat glute-bridge glute-bridge-march glute-focused-back-extension goblet-squat good-morning hack-squat half-burpee half-kneeling-pallof-press hammer-curl hamstring-stretch handstand-push-up hanging-knee-raise hanging-leg-raise heel-elevated-goblet-squat heel-tap high-knees hiking hindu-push-up hip-abduction-machine hip-adduction-machine hip-airplane hip-thrust hollow-body-hold hollow-rock inchworm incline-bench-press incline-cable-fly incline-dumbbell-curl incline-dumbbell-press incline-push-up inverted-row jump-rope jump-squat jumping-jack kettlebell-romanian-deadlift kettlebell-swing knee-push-up kneeling-hip-flexor-stretch l-sit-hold l-sit-pull-up landmine-press landmine-romanian-deadlift landmine-squat lat-pulldown lateral-lunge lateral-raise lateral-shuffle leg-curl leg-extension leg-press leg-press-calf-raise leg-swings-stretch lying-hamstring-walkout lying-leg-curl lying-leg-raise machine-chest-press machine-glute-kickback machine-lateral-raise machine-row machine-shoulder-press meadows-row mountain-climber negative-pull-up neutral-grip-pull-up nordic-hamstring-curl one-arm-dumbbell-row overhead-press overhead-tricep-extension pallof-press pec-deck pendlay-row pike-push-up pistol-squat plank plank-jack plank-shoulder-tap plate-front-raise preacher-curl prone-t-raise prone-y-raise pull-up push-press push-up push-up-shoulder-tap rack-pull rear-delt-fly reverse-crunch reverse-curl reverse-hyperextension reverse-lunge reverse-pec-deck reverse-snow-angel romanian-deadlift rope-hammer-curl rope-tricep-pushdown rowing running russian-twist scapular-pull-up scapular-push-up seal-jack seated-calf-raise seated-dumbbell-press seated-forward-fold-stretch seated-knee-tuck seated-leg-curl seated-row shrimp-squat shrug side-lying-hip-abduction side-lying-leg-raise side-plank side-plank-hip-dip single-arm-cable-row single-arm-dumbbell-tricep-extension single-dumbbell-skullcrusher single-leg-box-squat single-leg-calf-raise single-leg-glute-bridge single-leg-romanian-deadlift sissy-squat skater-hop skater-squat skierg skull-crusher smith-machine-bench-press smith-machine-bulgarian-split-squat smith-machine-hip-thrust smith-machine-reverse-lunge smith-machine-romanian-deadlift smith-machine-split-squat smith-machine-squat spider-curl split-squat sprawl squat squat-thrust stability-ball-hamstring-curl stair-climber standing-calf-raise standing-dumbbell-press standing-quad-stretch step-down step-up straight-arm-pulldown sumo-deadlift superman superman-hold swimming t-bar-row toe-touch torso-twist-stretch towel-hamstring-curl towel-pull-up towel-row trap-bar-deadlift treadmill-incline-walk tricep-kickback tricep-pushdown typewriter-push-up upright-row v-up walking walking-lunge wall-calf-stretch wall-handstand-push-up wall-push-up wall-sit wall-walk weighted-chin-up weighted-crunch weighted-dip weighted-pull-up weighted-push-up weighted-russian-twist wide-grip-lat-pulldown wide-push-up worlds-greatest-stretch wrist-curl wrist-extension'.split(' '));
  const ALIASES = {
    OVERHANDGRIPPULLUPS: 'pull-up',
    UNDERHANDGRIPCHINUPS: 'chin-up',
    SEATEDROW_PULLEYMACHINE: 'seated-row',
    LATPULLDOWNFRONT_PULLEYMACHINE: 'lat-pulldown',
    NARROWGRIPLATPULLDOWNFRONT_PULLEYMACHINE: 'close-grip-lat-pulldown',
    WIDEGRIPLATPULLDOWNFRONT_PULLEYMACHINE: 'wide-grip-lat-pulldown',
    WIDEGRIPBENCHPRESS_BARBELL: 'bench-press',
    BENCHPRESS_BARBELL: 'bench-press',
    BENCHPRESS_PULLEYMACHINE: 'machine-chest-press',
    CHESTPRESS_MACHINE: 'machine-chest-press',
  };
  const slugify = text => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const has = (s, ...patterns) => patterns.every(re => re.test(s));
  const RULES = [
    // Chest
    [s => has(s, /\bmachine\b|\bpulley\b/, /\b(?:chest|bench)\s*press\b/), 'machine-chest-press'],
    [s => has(s, /\bsmith\b/, /\b(?:chest|bench)\s*press\b/), 'smith-machine-bench-press'],
    [s => has(s, /\bincline\b/, /\bdumbbell\b/, /\b(?:chest|bench)\s*press\b/), 'incline-dumbbell-press'],
    [s => has(s, /\bdecline\b/, /\bdumbbell\b/, /\b(?:chest|bench)\s*press\b/), 'decline-dumbbell-press'],
    [s => has(s, /\bincline\b/, /\b(?:chest|bench)\s*press\b/), 'incline-bench-press'],
    [s => has(s, /\bdecline\b/, /\b(?:chest|bench)\s*press\b/), 'decline-bench-press'],
    [s => has(s, /\b(?:close|narrow)\s*grip\b/, /\b(?:chest|bench)\s*press\b/), 'close-grip-bench-press'],
    [s => has(s, /\bdumbbell\b/, /\b(?:chest|bench)\s*press\b/), 'dumbbell-bench-press'],
    [s => /\b(?:chest|bench)\s*press\b/.test(s), 'bench-press'],
    // Rear delts before chest flyes
    [s => has(s, /\breverse\b|\brear\s*delt\b/, /\bpec\b|\bfly\b/, /\bmachine\b|\bpec\b/), 'reverse-pec-deck'],
    [s => has(s, /\brear\s*delt\b|\breverse\s*fly\b/, /\bcable\b/), 'cable-rear-delt-fly'],
    [s => has(s, /\brear\s*delt\b|\breverse\s*fly\b/, /\braise\b/), 'bent-over-rear-delt-raise'],
    [s => /\brear\s*delt\b|\breverse\s*(?:pec|fly)/.test(s), 'rear-delt-fly'],
    [s => /\bpec\s*deck\b|\bpec\s*fly\b/.test(s) || has(s, /\bmachine\b/, /\b(?:chest\s*)?flye?s?\b/), 'pec-deck'],
    [s => has(s, /\bincline\b/, /\bcable\b/, /\bflye?s?\b/), 'incline-cable-fly'],
    [s => has(s, /\bcable\b/, /\bflye?s?\b|\bcrossover\b/), 'cable-fly'],
    [s => /\b(?:chest\s*)?flye?s?\b/.test(s), 'dumbbell-fly'],
    [s => has(s, /\bincline\b/, /\bpushup\b/), 'incline-push-up'],
    [s => has(s, /\bdecline\b/, /\bpushup\b/), 'decline-push-up'],
    [s => has(s, /\bdiamond\b/, /\bpushup\b/), 'diamond-push-up'],
    [s => has(s, /\bwide\b/, /\bpushup\b/), 'wide-push-up'],
    [s => has(s, /\bpike\b/, /\bpushup\b/), 'pike-push-up'],
    [s => has(s, /\bknee\b/, /\bpushup\b/), 'knee-push-up'],
    [s => has(s, /\bweighted\b/, /\bpushup\b/), 'weighted-push-up'],
    [s => /\bpushup\b/.test(s), 'push-up'],
    [s => has(s, /\bassisted\b/, /\bdips?\b/), 'assisted-dip'],
    [s => has(s, /\bweighted\b/, /\bdips?\b/), 'weighted-dip'],
    [s => has(s, /\bbench\b/, /\bdips?\b/), 'bench-dip'],
    [s => has(s, /\bchest\b/, /\bdips?\b/), 'chest-dip'],
    [s => /\bdips?\b/.test(s), 'dip'],
    // Back
    [s => has(s, /\bstraight\s*arm\b/, /\bpulldown\b/), 'straight-arm-pulldown'],
    [s => has(s, /\b(?:close|narrow)\s*grip\b/, /\bpulldown\b/), 'close-grip-lat-pulldown'],
    [s => has(s, /\bwide\s*grip\b/, /\bpulldown\b/), 'wide-grip-lat-pulldown'],
    [s => has(s, /\bband(?:ed)?\b/, /\bpulldown\b/), 'banded-lat-pulldown'],
    [s => /\b(?:lat\s*)?pulldown\b/.test(s), 'lat-pulldown'],
    [s => has(s, /\bassisted\b/, /\bchinup\b/), 'assisted-chin-up'],
    [s => has(s, /\bweighted\b/, /\bchinup\b/), 'weighted-chin-up'],
    [s => /\bchinup\b/.test(s), 'chin-up'],
    [s => has(s, /\bassisted\b/, /\bpullup\b/), 'assisted-pull-up'],
    [s => has(s, /\bweighted\b/, /\bpullup\b/), 'weighted-pull-up'],
    [s => has(s, /\bneutral\b/, /\bpullup\b/), 'neutral-grip-pull-up'],
    [s => /\bpullup\b/.test(s), 'pull-up'],
    [s => /\bface\s*pull\b/.test(s), 'face-pull'],
    [s => /\bupright\s*row\b/.test(s), 'upright-row'],
    [s => has(s, /\bchest\s*supported\b/, /\brow\b/), 'chest-supported-row'],
    [s => /\bt\s*bar\s*row\b/.test(s), 't-bar-row'],
    [s => /\bpendlay\s*row\b/.test(s), 'pendlay-row'],
    [s => /\binverted\s*row\b/.test(s), 'inverted-row'],
    [s => has(s, /\b(?:single|one)\s*arm\b/, /\bcable\b/, /\brow\b/), 'single-arm-cable-row'],
    [s => has(s, /\b(?:single|one)\s*arm\b/, /\bdumbbell\b/, /\brow\b/), 'one-arm-dumbbell-row'],
    [s => has(s, /\bseated\b|\bcable\b|\bpulley\b/, /\brow\b/), 'seated-row'],
    [s => has(s, /\bmachine\b/, /\brow\b/), 'machine-row'],
    [s => has(s, /\bdumbbell\b/, /\brow\b/), 'dumbbell-bent-over-row'],
    [s => /\b(?:barbell|bent\s*over)\s*row\b|\brows?\b/.test(s), 'barbell-row'],
    [s => /\bback\s*extension\b|\bhyperextension\b/.test(s), 'back-extension'],
    [s => has(s, /\bdumbbell\b/, /\bshrugs?\b/), 'dumbbell-shrug'],
    [s => /\bshrugs?\b/.test(s), 'shrug'],
    // Shoulders
    [s => /\barnold\s*press\b/.test(s), 'arnold-press'],
    [s => has(s, /\bmachine\b/, /\b(?:shoulder|overhead)\s*press\b/), 'machine-shoulder-press'],
    [s => has(s, /\bstanding\b/, /\bdumbbell\b/, /\b(?:shoulder|overhead)\s*press\b/), 'standing-dumbbell-press'],
    [s => has(s, /\bdumbbell\b/, /\b(?:shoulder|overhead)\s*press\b/), 'seated-dumbbell-press'],
    [s => /\bpush\s*press\b/.test(s), 'push-press'],
    [s => /\blandmine\s*press\b/.test(s), 'landmine-press'],
    [s => /\b(?:overhead|shoulder|military)\s*press\b/.test(s), 'overhead-press'],
    [s => has(s, /\bcable\b/, /\blateral\s*raise\b/), 'cable-lateral-raise'],
    [s => has(s, /\bmachine\b/, /\blateral\s*raise\b/), 'machine-lateral-raise'],
    [s => /\blateral\s*raise\b/.test(s), 'lateral-raise'],
    [s => has(s, /\bcable\b/, /\bfront\s*raise\b/), 'cable-front-raise'],
    [s => has(s, /\bplate\b/, /\bfront\s*raise\b/), 'plate-front-raise'],
    [s => /\bfront\s*raise\b/.test(s), 'front-raise'],
    // Legs & glutes
    [s => has(s, /\bbulgarian\b/, /\bsquat\b/), 'bulgarian-split-squat'],
    [s => has(s, /\bsmith\b/, /\bsplit\s*squat\b/), 'smith-machine-split-squat'],
    [s => /\bsplit\s*squat\b/.test(s), 'split-squat'],
    [s => /\bhack\s*squat\b/.test(s), 'hack-squat'],
    [s => /\bfront\s*squat\b/.test(s), 'front-squat'],
    [s => /\bgoblet\s*squat\b/.test(s), 'goblet-squat'],
    [s => has(s, /\bsmith\b/, /\bsquat\b/), 'smith-machine-squat'],
    [s => /\bbelt\s*squat\b/.test(s), 'belt-squat'],
    [s => /\bpistol\s*squat\b/.test(s), 'pistol-squat'],
    [s => /\bsissy\s*squat\b/.test(s), 'sissy-squat'],
    [s => /\bjump\s*squat\b/.test(s), 'jump-squat'],
    [s => has(s, /\bbodyweight\b|\bair\b/, /\bsquat\b/), 'bodyweight-squat'],
    [s => /\bsquats?\b/.test(s), 'squat'],
    [s => has(s, /\bsingle\s*leg\b/, /\bromanian\b|\brdl\b/), 'single-leg-romanian-deadlift'],
    [s => has(s, /\bdumbbell\b/, /\bromanian\b|\brdl\b/), 'dumbbell-romanian-deadlift'],
    [s => has(s, /\bsmith\b/, /\bromanian\b|\brdl\b/), 'smith-machine-romanian-deadlift'],
    [s => has(s, /\bkettlebell\b/, /\bromanian\b|\brdl\b/), 'kettlebell-romanian-deadlift'],
    [s => /\bromanian\s*deadlift\b|\brdl\b/.test(s), 'romanian-deadlift'],
    [s => has(s, /\bsumo\b/, /\bdeadlift\b/), 'sumo-deadlift'],
    [s => has(s, /\b(?:trap|hex)\s*bar\b/, /\bdeadlift\b/), 'trap-bar-deadlift'],
    [s => /\brack\s*pull\b/.test(s), 'rack-pull'],
    [s => /\bdeadlifts?\b/.test(s), 'deadlift'],
    [s => has(s, /\bleg\s*press\b/, /\bcalf\b/), 'leg-press-calf-raise'],
    [s => /\bleg\s*press\b/.test(s), 'leg-press'],
    [s => /\bleg\s*extension\b/.test(s), 'leg-extension'],
    [s => has(s, /\bseated\b/, /\b(?:leg|hamstring)\s*curl\b/), 'seated-leg-curl'],
    [s => has(s, /\blying\b|\bprone\b/, /\b(?:leg|hamstring)\s*curl\b/), 'lying-leg-curl'],
    [s => /\bnordic\b/.test(s), 'nordic-hamstring-curl'],
    [s => /\b(?:leg|hamstring)\s*curl\b/.test(s), 'leg-curl'],
    [s => has(s, /\bwalking\b/, /\blunges?\b/), 'walking-lunge'],
    [s => has(s, /\breverse\b/, /\blunges?\b/), 'reverse-lunge'],
    [s => has(s, /\b(?:lateral|side)\b/, /\blunges?\b/), 'lateral-lunge'],
    [s => has(s, /\bcurtsy\b/, /\blunges?\b/), 'curtsy-lunge'],
    [s => /\blunges?\b/.test(s), 'forward-lunge'],
    [s => /\bstep\s*ups?\b/.test(s), 'step-up'],
    [s => has(s, /\bsmith\b/, /\bhip\s*thrust\b/), 'smith-machine-hip-thrust'],
    [s => has(s, /\bdumbbell\b/, /\bhip\s*thrust\b/), 'dumbbell-hip-thrust'],
    [s => /\bhip\s*thrust\b/.test(s), 'hip-thrust'],
    [s => has(s, /\bbarbell\b/, /\bglute\s*bridge\b/), 'barbell-glute-bridge'],
    [s => /\bglute\s*bridge\b/.test(s), 'glute-bridge'],
    [s => /\bgood\s*morning\b/.test(s), 'good-morning'],
    [s => /\bhip\s*abduction\b/.test(s), 'hip-abduction-machine'],
    [s => /\bhip\s*adduction\b/.test(s), 'hip-adduction-machine'],
    [s => has(s, /\bseated\b/, /\bcalf\s*raise\b/), 'seated-calf-raise'],
    [s => has(s, /\bdonkey\b/, /\bcalf\s*raise\b/), 'donkey-calf-raise'],
    [s => has(s, /\bsingle\s*leg\b/, /\bcalf\s*raise\b/), 'single-leg-calf-raise'],
    [s => /\bcalf\s*raise\b/.test(s), 'standing-calf-raise'],
    [s => /\bkettlebell\s*swing\b/.test(s), 'kettlebell-swing'],
    // Arms
    [s => has(s, /\brope\b/, /\bhammer\s*curl\b/), 'rope-hammer-curl'],
    [s => /\bhammer\s*curl\b/.test(s), 'hammer-curl'],
    [s => /\bpreacher\s*curl\b/.test(s), 'preacher-curl'],
    [s => /\bconcentration\s*curl\b/.test(s), 'concentration-curl'],
    [s => /\bspider\s*curl\b/.test(s), 'spider-curl'],
    [s => has(s, /\bincline\b/, /\bcurl\b/), 'incline-dumbbell-curl'],
    [s => /\bez\s*bar\s*curl\b/.test(s), 'ez-bar-curl'],
    [s => has(s, /\bcable\b/, /\bcurl\b/), 'cable-curl'],
    [s => /\breverse\s*curl\b/.test(s), 'reverse-curl'],
    [s => /\bdrag\s*curl\b/.test(s), 'drag-curl'],
    [s => /\bwrist\s*curl\b/.test(s), 'wrist-curl'],
    [s => /\bwrist\s*extension\b/.test(s), 'wrist-extension'],
    [s => /\b(?:bicep\s*)?curls?\b/.test(s), 'bicep-curl'],
    [s => has(s, /\brope\b/, /\bpushdown\b|\bpressdown\b/), 'rope-tricep-pushdown'],
    [s => /\b(?:tricep\s*)?(?:pushdown|pressdown)\b/.test(s), 'tricep-pushdown'],
    [s => /\bskull\s*crusher\b/.test(s), 'skull-crusher'],
    [s => has(s, /\btricep\b/, /\bkickback\b/), 'tricep-kickback'],
    [s => has(s, /\b(?:single|one)\s*arm\b/, /\btricep\b/, /\bextension\b/), 'single-arm-dumbbell-tricep-extension'],
    [s => has(s, /\bdumbbell\b/, /\boverhead\b/, /\btricep\b/), 'dumbbell-overhead-tricep-extension'],
    [s => has(s, /\btricep\b/, /\bextension\b/), 'overhead-tricep-extension'],
    // Core & conditioning
    [s => /\bab\s*wheel\b/.test(s), 'ab-wheel'],
    [s => /\bhanging\s*leg\s*raise\b/.test(s), 'hanging-leg-raise'],
    [s => /\bhanging\s*knee\s*raise\b/.test(s), 'hanging-knee-raise'],
    [s => /\blying\s*leg\s*raise\b/.test(s), 'lying-leg-raise'],
    [s => has(s, /\bcable\b/, /\bcrunch\b/), 'cable-crunch'],
    [s => /\bbicycle\s*crunch\b/.test(s), 'bicycle-crunch'],
    [s => /\breverse\s*crunch\b/.test(s), 'reverse-crunch'],
    [s => /\bcrunch\b|\bsit\s*ups?\b/.test(s), 'crunch'],
    [s => /\bside\s*plank\b/.test(s), 'side-plank'],
    [s => /\bplank\b/.test(s), 'plank'],
    [s => /\brussian\s*twist\b/.test(s), 'russian-twist'],
    [s => /\bpallof\s*press\b/.test(s), 'pallof-press'],
    [s => /\bwoodchop\b/.test(s), 'cable-woodchop'],
    [s => /\bdead\s*bug\b/.test(s), 'dead-bug'],
    [s => /\bbird\s*dog\b/.test(s), 'bird-dog'],
    [s => /\bmountain\s*climber\b/.test(s), 'mountain-climber'],
    [s => /\bburpee\b/.test(s), 'burpee'],
    [s => /\bfarmer\b/.test(s), 'farmer-carry'],
  ];

  function resolveArt(ex) {
    if (!ex) return null;
    if (ex.art && SLUGS.has(ex.art)) return ex.art;
    if (ex.id && ALIASES[ex.id] && SLUGS.has(ALIASES[ex.id])) return ALIASES[ex.id];
    const direct = slugify(ex.name);
    if (direct && SLUGS.has(direct)) return direct;
    // WHOOP often formats names as "Movement - Modifier - Equipment".
    const parts = String(ex.name ?? '').split(/\s*[-–—,]\s*/).map(slugify).filter(Boolean);
    if (parts.length > 1) {
      const [base, ...mods] = parts;
      const full = [...mods, base].join('-');
      if (SLUGS.has(full)) return full;
    }
    const norm = `${ex.name ?? ''} ${ex.id ?? ''}`
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\bpull\s+downs?\b/g, 'pulldown')
      .replace(/\bpush\s+ups?\b/g, 'pushup')
      .replace(/\bpull\s+ups?\b/g, 'pullup')
      .replace(/\bchin\s+ups?\b/g, 'chinup')
      .replace(/\bbiceps\b/g, 'bicep')
      .replace(/\btriceps\b/g, 'tricep')
      .replace(/\s+/g, ' ')
      .trim();
    for (const [match, slug] of RULES) if (match(norm) && SLUGS.has(slug)) return slug;
    if (parts.length > 1) {
      const [base, ...mods] = parts;
      for (const candidate of [...mods.map(m => `${m}-${base}`), base]) if (SLUGS.has(candidate)) return candidate;
    }
    return null;
  }

  // Expose resolver for unit tests without altering runtime behavior.
  if (typeof globalThis !== 'undefined') globalThis.__workoutResolveArt = resolveArt;

  const root = document.querySelector('[data-workout-views], [data-share-view]');
  if (!root) return;
  const shared = root.matches('[data-share-view]');
  const generic = root.hasAttribute('data-live-share');
  const params = new URLSearchParams(location.search);
  const locale = document.documentElement.lang;
  const zh = locale.startsWith('zh');
  const tw = locale === 'zh-TW';
  const words = zh ? {movement:tw?'動作示範':'动作演示',sheet:tw?'手寫訓練單':'手写训练单',body:tw?'自重':'自重',reps:tw?'次':'次',sets:tw?'組':'组',exercises:tw?'個動作':'个动作',min:tw?'分鐘':'分钟',volume:tw?'總量':'总量',unavailable:tw?'暫時無法更新訓練記錄。':'暂时无法更新训练记录。',retry:tw?'重新讀取':'重新读取',live:tw?'已與 WHOOP 同步':'已与 WHOOP 同步',empty:tw?'這一天沒有已完成的力量訓練。':'这一天没有已完成的力量训练。'} : {movement:'Movement',sheet:'Handwritten',body:'Bodyweight',reps:'reps',sets:'sets',exercises:'exercises',min:'min',volume:'volume',unavailable:'Unable to refresh training records.',retry:'Retry',live:'Synced with WHOOP',empty:'No completed strength session on this date.'};
  const prefix = locale === 'zh-CN' ? '/cn' : locale === 'zh-TW' ? '/tw' : '';
  const requestedDate = shared ? (generic ? params.get('date') : root.dataset.sessionDate) : null;
  const view = generic ? (params.get('view') === 'sheet' ? 'sheet' : 'movement') : root.dataset.shareView;
  if (shared) root.dataset.shareView = view;
  const escaped = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => value === null || value === undefined ? '—' : Number(value).toLocaleString(locale, {maximumFractionDigits:1});
  const sheetNameSize = name => Math.max(1.65, Math.min(3.25, Math.sqrt(145 / Math.max(String(name ?? '').length, 1)))).toFixed(2);
  const status = document.createElement('p'); status.className = 'workout-live-status'; status.setAttribute('role','status'); root.insertBefore(status, shared ? root.querySelector('.wcredit') : null);
  const shareURL = (w, type) => `${prefix}/workout/share/?${new URLSearchParams({date:w.date,workout:w.activity_id,view:type})}`;
  function source(w, paper) {
    return `<div class="workout-paper-source"><div><span>${num(w.duration_min)} MIN</span><span>${num(w.strain)} STRAIN</span><span>${num(w.total_volume_kg)} KG VOLUME</span>${paper?'<small>WEIGHT IN LBS · B.W. = BODYWEIGHT</small>':''}</div><div class="whoop-credit"><small>DATA FROM</small><img src="/assets/brand/whoop/wordmark-black.svg" width="90" height="24" alt="WHOOP"></div></div>`;
  }
  function movement(w) {
    const cards = w.exercises.map(ex => {
      const slug = resolveArt(ex);
      const fig = slug ? `<div class="wfig" data-art="${slug}" role="img" aria-label="${escaped(ex.name)}"><span class="wfig-loading" aria-hidden="true">…</span></div>` : '';
      return `<article class="wcard${slug ? '' : ' wcard-no-art'}"><div class="wcard-head"><h3>${escaped(ex.name)}</h3></div>${fig}<div class="wsets">${ex.sets.map((set,i)=>`<div class="wset"><span class="wset-n">SET ${String(i+1).padStart(2,'0')}</span><span class="wset-r">${num(set.reps)} ${words.reps}</span><span class="wset-w">${set.weight===null?'—':set.weight===0?words.body:`${num(set.weight)} ${escaped(set.units)}`}</span></div>`).join('')}</div></article>`;
    }).join('');
    return `<div class="wdetail-meta"><span>${escaped(w.date.replaceAll('-','.'))}</span><span>${num(w.duration_min)} ${words.min} · strain ${num(w.strain)}</span><span>${num(w.total_volume_kg)} kg ${words.volume} · ${w.set_count} ${words.sets} · ${w.exercise_count} ${words.exercises}</span></div><div class="wgrid">${cards}</div>${source(w,false)}`;
  }
  function paper(w) {
    const groups=[];
    for (const ex of w.exercises) for (const set of ex.sets) {
      const key=JSON.stringify([ex.id,set.weight,set.units,set.reps]);
      if(groups.length && groups.at(-1).key===key) groups.at(-1).count++;
      else groups.push({key,name:ex.name,...set,count:1});
    }
    const positions=[30.80,37.05,43.30,49.55,55.80,62,68,73.85,79.60,86.05];
    const date=new Date(`${w.date}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'2-digit',year:'numeric'}).toUpperCase();
    const pages=[];
    for(let offset=0;offset<groups.length;offset+=10){
      const rows=groups.slice(offset,offset+10).map((g,i)=>{
        const weight=g.weight===null?'—':g.weight===0?'B.W.':Number((g.units==='kg'?g.weight*2.2046226218:g.weight).toFixed(1)).toString();
        const size=sheetNameSize(g.name);
        return `<div class="sheet-entry" style="top:${positions[i]}%"><span style="font-size:${size}cqw">${escaped(g.name)}</span><span>${g.count}</span><span>${weight}</span><span>${num(g.reps)}</span><span style="font-size:${size}cqw">${escaped(g.name)}</span></div>`;
      }).join('');
      pages.push(`<figure class="training-sheet" aria-label="EazyLee · ${w.date} · Exercise list"><img class="sheet-original" src="/assets/art/workout/exercise-list-original.png" width="1086" height="1448" alt="Original exercise sheet · EAZY LEE"><time class="sheet-date hand" datetime="${w.date}">${date}</time><div class="sheet-entries hand">${rows}</div></figure>`);
    }
    return `<div class="training-sheets">${pages.join('')}</div>${source(w,true)}`;
  }
  let signature = '', loading = false;
  async function refresh() {
    if (loading || document.hidden) return;
    loading=true;
    try {
      const query = new URLSearchParams();
      if (requestedDate) query.set('date',requestedDate);
      if (shared && params.get('workout')) query.set('workout',params.get('workout'));
      const response = await fetch(`https://whooper.eazylee.si/api/public/workout/strength?${query}`,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(115000)});
      if(!response.ok) throw new Error(response.status===404?'empty':'unavailable');
      const {session:w}=await response.json();
      if (!w || !Array.isArray(w.exercises) || !/^\d{4}-\d{2}-\d{2}$/.test(w.date) || !/^[a-f0-9-]{36}$/i.test(w.activity_id)) throw new Error('invalid');
      if (requestedDate && w.date!==requestedDate) throw new Error('invalid date');
      const {fetched_at,...values}=w;
      if (signature!==JSON.stringify(values)) {
        signature=JSON.stringify(values);
        root.dataset.sessionDate=w.date;
        if(shared){
          root.querySelector('[data-share-content]').innerHTML = view==='sheet'?paper(w):`<div class="movement-share-content">${movement(w)}</div>`;
          root.querySelector('.share-date time').dateTime=w.date;root.querySelector('.share-date time').textContent=w.date;
          root.querySelector('.share-view-label strong').textContent=words[view];
          const other=root.querySelector('.share-view-label a');other.textContent=`${words[view==='sheet'?'movement':'sheet']} ↔`;other.href=shareURL(w,view==='sheet'?'movement':'sheet');
          root.dataset.loading='false';
          root.querySelectorAll('.share-toolbar button').forEach(b=>b.disabled=false);
          document.title=`${w.date} · ${words[view]} · EazyLee`;
        } else {
          root.querySelector('#motion-view').innerHTML=movement(w);
          root.querySelector('#sheet-view').innerHTML=paper(w);
          const link=root.querySelector('[data-view-share]');link.dataset.sheetUrl=shareURL(w,'sheet');link.dataset.movementUrl=shareURL(w,'movement');
          link.href=shareURL(w,root.querySelector('[aria-selected=true]').id==='sheet-tab'?'sheet':'movement');
          root.querySelector('.workout-data-note').textContent=`WHOOP · ${w.date}`;
        }
        document.dispatchEvent(new Event('workout:updated'));
      }
      status.textContent=`${words.live} · ${new Intl.DateTimeFormat(locale,{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}).format(new Date(fetched_at))}`;
    }catch(error){
      if(generic && !signature) {root.dataset.loading='false';root.querySelector('[data-share-content]').replaceChildren();root.querySelector('.share-date').style.visibility='hidden';root.querySelectorAll('.share-toolbar button').forEach(b=>b.disabled=true);}
      status.textContent=error.message==='empty'?words.empty:words.unavailable;
      const button=document.createElement('button');button.type='button';button.className='inline-link';button.textContent=words.retry;button.addEventListener('click',refresh);status.append(' ',button);
    }finally {loading=false;}
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(refresh,60000);
  refresh();
})();
