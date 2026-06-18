/* Constants + global state + localStorage helpers */
const TODAY = new Date().toLocaleDateString('sv-SE');
const STORAGE_PREFIX = 'cyrus_dashboard_v6_';

/* 身心灵 morning ritual (v7.7) — body + spirit only; Walk & Breakfast retired.
   Two Baths: a 3-min state-switch, then a 10-15 min proper wash. */
const MR_DEFAULT=[
  {id:'mr1',t:'Water',mins:1,d:false},
  {id:'mr3',t:'Meditation',mins:10,d:false},
  {id:'mr8',t:'Bath · 切换',mins:3,d:false},
  {id:'mr7',t:'Calisthenics',mins:30,d:false},
  {id:'mr9',t:'Bath · 洗净',mins:13,d:false},
  {id:'mr2',t:"Men's work",mins:3,d:false},
];

/* Migration: normalize any loaded morning list to the current ritual. Legacy
   lists (Walk/Breakfast/Prep meals, old durations, missing the 2nd bath mr9)
   are rebuilt from MR_DEFAULT, carrying over the done-state of surviving ids —
   morning resets daily anyway, so a lost tick is cheap. Idempotent: a list
   that already matches only gets a defensive de-dup. */
function cleanMorning(){
  if(!S.mr || !Array.isArray(S.mr.list)) return false;
  const ids = S.mr.list.map(i => i.id);
  const legacy = S.mr.list.some(i => i.t === 'Walk' || i.t === 'Breakfast' || i.id === 'mr4' || i.t === 'Prep meals')
    || !ids.includes('mr9')
    || S.mr.list.length !== MR_DEFAULT.length;
  if(legacy){
    const metaById = {};
    S.mr.list.forEach(i => { metaById[i.id] = { d: i.d, detail: i.detail }; });
    S.mr.list = MR_DEFAULT.map(d => ({ ...d,
      d: !!(metaById[d.id] && metaById[d.id].d),
      detail: (metaById[d.id] && metaById[d.id].detail) || '' }));
    return true;
  }
  const before = S.mr.list.length;
  const seen = new Set();
  S.mr.list = S.mr.list.filter(i => { if(seen.has(i.id)) return false; seen.add(i.id); return true; });
  return S.mr.list.length !== before;
}
/* N2 practice list — user-owned (like todos/trading). No imposed presets: the
   list starts empty and the user adds their own items. The old Anki/语法/听力/汉字
   seed (ids j1–j4) is retired on load by cleanJapanese(). */
const DEF_JP=[];
/* one-time migration: drop the legacy seeded N2 presets the user doesn't use.
   Removes an item ONLY if BOTH its id and text still match the original seed,
   so a preset the user renamed/repurposed is preserved. Idempotent. */
const JP_LEGACY_DEFAULTS = { j1:'Anki 词汇 20张', j2:'语法练习 1课', j3:'听力 1段', j4:'汉字 10个' };
function cleanJapanese(){
  if(!S.jp || !Array.isArray(S.jp.list)) return false;
  const before = S.jp.list.length;
  S.jp.list = S.jp.list.filter(i => !(JP_LEGACY_DEFAULTS[i.id] && i.t === JP_LEGACY_DEFAULTS[i.id]));
  return S.jp.list.length !== before;
}
const DEF_TR=[
  {id:'t1',t:'宏观背景确认(油/金/BTC联动)',d:false},
  {id:'t2',t:'BTC 日线市场结构',d:false},
  {id:'t3',t:'黄金 关键流动性位',d:false},
  {id:'t4',t:'原油 趋势方向',d:false},
  {id:'t5',t:'设置关键价位提醒',d:false},
  {id:'t6',t:'记录今日交易偏向',d:false},
];
const DEFAULT_CATS = [
  {id:'c1',name:'生活'},
  {id:'c2',name:'财务'},
  {id:'c3',name:'健康'},
  {id:'c4',name:'联络'},
];

/* ════════════ Finance module (Phase 1) ════════════ */
const FIN_CURRENCIES = ['TWD','USD','MYR'];          // base = TWD; net worth converts to it
const FIN_ACCT_TYPES = [
  {id:'cash',     name:'现金',     icon:'💵'},
  {id:'bank',     name:'银行',     icon:'🏦'},
  {id:'credit',   name:'信用卡',   icon:'💳'},
  {id:'ewallet',  name:'电子支付', icon:'📱'},
  {id:'exchange', name:'交易所',   icon:'📊'},
];
const FIN_ACCT_STATUS = { INACTIVE:0, ACTIVE:1, EXCLUDED:2 };
/* Seeded only if the user has no categories yet (pushed on first edit). */
const DEF_FIN_CATS = [
  {name:'餐饮',   kind:'expense', icon:'🍜', color:'#E5704B'},
  {name:'交通',   kind:'expense', icon:'🚌', color:'#4B89E5'},
  {name:'购物',   kind:'expense', icon:'🛍️', color:'#E54B9A'},
  {name:'居住',   kind:'expense', icon:'🏠', color:'#8A6E4B'},
  {name:'娱乐',   kind:'expense', icon:'🎮', color:'#9A4BE5'},
  {name:'医疗',   kind:'expense', icon:'💊', color:'#3FB7A0'},
  {name:'学习',   kind:'expense', icon:'📚', color:'#C9A227'},
  {name:'其他',   kind:'expense', icon:'📦', color:'#888888'},
  {name:'工资',   kind:'income',  icon:'💰', color:'#3FAE6B'},
  {name:'外快',   kind:'income',  icon:'✨', color:'#3FAE9A'},
  {name:'投资',   kind:'income',  icon:'📈', color:'#6BAE3F'},
  {name:'其他收入',kind:'income',  icon:'🎁', color:'#AE9A3F'},
];

/* ════════════ Fitness module (v7.11) ════════════
   Calisthenics-first. Preset exercise library seeded on first open (like
   DEF_FIN_CATS). kind: 'reps' (count) | 'time' (held seconds, e.g. plank). */
const FIT_PRESET = [
  {name:'引体向上',    kind:'reps'},
  {name:'俯卧撑',      kind:'reps'},
  {name:'双杠臂屈伸',  kind:'reps'},
  {name:'深蹲',        kind:'reps'},
  {name:'平板支撑',    kind:'time'},
];
/* weekday keys for fit.plan.week — Mon-first to match the planner UI */
const FIT_WEEK_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
function fitWeekdayKey(dateStr){
  // getDay(): 0=Sun..6=Sat → map to Mon-first index
  const d = new Date((dateStr||TODAY)+'T00:00:00+08:00');
  return FIT_WEEK_KEYS[(d.getDay()+6)%7];
}

const CREED_VARIANTS = [
  {id:'anger',body:`如果你今天没有把时间花在这五件事的任何一件上 ——
    <div class="creed-pillars">睡眠 &nbsp;·&nbsp; 冥想 &nbsp;·&nbsp; AI Automation &nbsp;·&nbsp; 健身 &nbsp;·&nbsp; 性能量</div>
    那你在花时间，成为谁？
    <span class="creed-close">No one accidentally becomes who they want to be.</span>`},
  {id:'contract',body:`Five pillars. Nothing else earns your time.
    <div class="creed-pillars">睡眠 &nbsp;·&nbsp; 冥想 &nbsp;·&nbsp; AI Automation &nbsp;·&nbsp; 健身 &nbsp;·&nbsp; 性能量</div>
    不是爱好。是通往你想成为的那个人的五条路。
    空闲时间 = 默认投入其中之一。
    <span class="creed-close">如果你在做其他事，问一句：这件事为什么值得偷走我的未来？</span>`},
  {id:'inertia',body:`底线永远留在最低，只让天花板往上长 —— 靠惯性拉，不靠自律推。
    <div class="creed-pillars">睡眠 &nbsp;·&nbsp; 冥想 &nbsp;·&nbsp; AI Automation &nbsp;·&nbsp; 健身 &nbsp;·&nbsp; 性能量</div>
    系统靠横向加新的小习惯长大，不靠把一个习惯纵向拔高。
    <span class="creed-close">Raise the ceiling. Never the floor.</span>`}
];

const DEFAULT_SYMBOLS = ['BINANCE:BTCUSDT', 'OANDA:XAUUSD', 'TVC:USOIL'];
const SYMBOL_POOL = [
  {symbol:'BINANCE:BTCUSDT', name:'BTC', sub:'Bitcoin'},
  {symbol:'BINANCE:ETHUSDT', name:'ETH', sub:'Ethereum'},
  {symbol:'BINANCE:SOLUSDT', name:'SOL', sub:'Solana'},
  {symbol:'OANDA:XAUUSD', name:'XAU', sub:'Gold spot'},
  {symbol:'OANDA:XAGUSD', name:'XAG', sub:'Silver spot'},
  {symbol:'TVC:USOIL', name:'WTI', sub:'Crude oil'},
  {symbol:'TVC:UKOIL', name:'BRENT', sub:'Brent oil'},
  {symbol:'TVC:DXY', name:'DXY', sub:'Dollar index'},
  {symbol:'TVC:SPX', name:'SPX', sub:'S&P 500'},
  {symbol:'TVC:NDX', name:'NDX', sub:'Nasdaq 100'},
  {symbol:'FX:USDJPY', name:'USD/JPY', sub:'Dollar yen'},
  {symbol:'FX:EURUSD', name:'EUR/USD', sub:'Euro dollar'},
  {symbol:'TVC:US10Y', name:'US10Y', sub:'10Y yield'},
  {symbol:'TVC:VIX', name:'VIX', sub:'Volatility'},
];

const SESH=[
  {n:'Asian', r:'07:00-16:00',s:7*60,    e:16*60, over:false},
  {n:'London',r:'15:00-00:00',s:15*60,   e:24*60, over:false},
  {n:'NY',    r:'21:30-06:00',s:21*60+30,e:6*60,  over:true},
];
function isOn(ss,m){return ss.over?(m>=ss.s||m<ss.e):(m>=ss.s&&m<ss.e);}

let S={
  mr:{date:TODAY,list:JSON.parse(JSON.stringify(MR_DEFAULT))},
  ac:[],
  jp:{date:TODAY,streak:0,last:null,log:{},note:'',list:JSON.parse(JSON.stringify(DEF_JP))},
  tr:{date:TODAY,bias:'',list:JSON.parse(JSON.stringify(DEF_TR)),sealed:false,sealedAt:null,broke:false},
  todos:[],
  hermes:[],   /* Hermes notices — read/dismiss only; written server-side by the assistant */
  cats:JSON.parse(JSON.stringify(DEFAULT_CATS)),
  activeCat:'all',
  notifiedIds:[],
  symbols:null,
  subjects:null,  /* Preset academic subjects — populated from settings.subjects */
  /* Finance module — accounts/categories/transactions pulled from fin_* tables.
     baseCurrency + fxRates come from settings; net worth aggregates into baseCurrency. */
  fin:{ accounts:[], categories:[], transactions:[], budgets:[], goals:[], recurring:[], snapshots:{}, baseCurrency:'TWD', fxRates:{TWD:1,USD:31.5,MYR:7.1} },
  /* Motivation Center — YouTube (unlisted) videos. Each: {id, videoId, title, position} */
  motiv:{ videos:[] },
  /* RPG "System" layer — only the non-derivable bits are stored; everything else
     (level/exp/attrs/rank) is computed from real data by computeRPG().
     seenLevel = highest level already celebrated (de-dupes the LEVEL UP modal).
     achievements = { achievementId: unlockedAtISO } */
  rpg:{ seenLevel:1, achievements:{}, bonusExp:0, daily:{} },
  /* 信条与原则 — items: [{id, kind:'creed'|'principle', text, why, position, active}]
     daily: { 'YYYY-MM-DD': { checks:{itemId:'kept'|'broke'|'na'}, revise:{itemId:true}, note:'' } } */
  principles:{ items:[], daily:{} },
  /* 健身 Fitness — exercises: library [{id,name,kind,isPreset,sort,archived}]
     plan: { week:{mon:[{exId,sets,target}],...}, restDefault } (single row)
     log:  { 'YYYY-MM-DD': { entries:[{exId,name,kind,target,sets,done:[reps...]}], done, durationSec, note } }
     body: { 'YYYY-MM-DD': { weight, metrics:{waist,chest,arm,thigh,...} } }
     diet: { 'YYYY-MM-DD': { meals:[{name,kcal,time,note}] } } */
  fit:{ exercises:[], plan:{ week:{}, restDefault:90 }, log:{}, body:{}, diet:{} },
  /* 专属日历 — 行程 events (archetype C replace-all list). Each:
     {id, title, date:'YYYY-MM-DD', start:'HH:MM'|'', end:'HH:MM'|'', loc, notes, position}
     当日事项 (todos/academics by date) are aggregated read-only at render time, not stored here. */
  cal:[],
  /* AI Automation — 产出/交付日志 (archetype C replace-all list). Each:
     {id, date:'YYYY-MM-DD', title, kind:'built'|'learned'|'shipped', notes, link, position}
     Phase 1: standalone signal source (streak/active-days/total); wired into RPG in Phase 2. */
  ai:[],
  /* 心愿单 · Wishlist (archetype C replace-all list). Each:
     {id, name, description, price, currency, image_path, link, category,
      priority:0|1|2, status:'want'|'bought', bought_at, actual_paid, position} */
  store:[],
};

let editingAC=null, editingJP=null, editingTR=null, editingTD=null;
let currentCreedIdx=0, calendarRendered=false;
let showDone = false;

function loadLS(key,fallback){try{const raw=localStorage.getItem(STORAGE_PREFIX+key);if(raw)return JSON.parse(raw);}catch(e){}return fallback;}
/* saveLSRaw: pure local write, used by sync layer when mirroring DB → LS (no re-sync). */
function saveLSRaw(key,val){try{localStorage.setItem(STORAGE_PREFIX+key,JSON.stringify(val));}catch(e){}}
/* saveLS: local write + auto-sync if the key is a settings field. */
const SETTINGS_KEYS = ['creed_idx','creed_open','show_done','symbols','subjects','notif_banner_dismissed','theme','principles_last_shown','principles_review_prompted'];
function saveLS(key,val){
  saveLSRaw(key,val);
  if(SETTINGS_KEYS.includes(key)){
    dirty.settings = true;
    if(typeof syncPushSettings==='function') syncPushSettings();
  }
}

/* Dirty flags — set when a local save happens, cleared when push succeeds.
   On visibility return, sync.js checks these and replays unsynced writes from offline. */
const dirty = {
  morning: false, academics: false, japanese: false,
  trading: false, categories: false, todos: false, settings: false,
  the90Meta: false, the90Daily: false, motiv: false, rpg: false,
  principles: false, principlesDaily: false,
  fitExercises: false, fitPlan: false, fitLog: false, fitBody: false, fitDiet: false,
  calEvents: false, aiOutputs: false, store: false,
  finAccounts: false, finCategories: false, finBudgets: false, finGoals: false, finRecurring: false,
};

function saveMR(){saveLSRaw('mr',S.mr); dirty.morning=true; if(typeof syncPushMorning==='function') syncPushMorning();}
function saveAC(){saveLSRaw('ac',S.ac); dirty.academics=true; if(typeof syncPushAcademics==='function') syncPushAcademics();}
function saveTR(){saveLSRaw('tr',S.tr); dirty.trading=true; if(typeof syncPushTrading==='function') syncPushTrading();}
function saveJP(){saveLSRaw('jp',S.jp); dirty.japanese=true; if(typeof syncPushJP==='function') syncPushJP();}
function saveTodos(){saveLSRaw('todos', S.todos); dirty.todos=true; if(typeof syncPushTodos==='function') syncPushTodos();}
function saveCats(){saveLSRaw('cats', S.cats); dirty.categories=true; if(typeof syncPushCategories==='function') syncPushCategories();}
function saveThe90Meta(){saveLSRaw('the90_meta', S.the90?.meta); dirty.the90Meta=true; if(typeof syncPushThe90Meta==='function') syncPushThe90Meta();}
function saveThe90Daily(){saveLSRaw('the90_daily', S.the90?.daily); dirty.the90Daily=true; if(typeof syncPushThe90Daily==='function') syncPushThe90Daily();}
function saveMotiv(){saveLSRaw('motiv', S.motiv); dirty.motiv=true; if(typeof syncPushMotiv==='function') syncPushMotiv();}
function saveRPG(){saveLSRaw('rpg', S.rpg); dirty.rpg=true; if(typeof syncPushRPG==='function') syncPushRPG();}
function savePrinciples(){saveLSRaw('principles', S.principles.items); dirty.principles=true; if(typeof syncPushPrinciples==='function') syncPushPrinciples();}
function savePrinciplesDaily(){saveLSRaw('principles_daily', S.principles.daily); dirty.principlesDaily=true; if(typeof syncPushPrinciplesDaily==='function') syncPushPrinciplesDaily();}
/* Fitness — date-keyed saves take the date so the push upserts just that row. */
function saveFitExercises(){saveLSRaw('fit_exercises', S.fit.exercises); dirty.fitExercises=true; if(typeof syncPushFitExercises==='function') syncPushFitExercises();}
function saveFitPlan(){saveLSRaw('fit_plan', S.fit.plan); dirty.fitPlan=true; if(typeof syncPushFitPlan==='function') syncPushFitPlan();}
function saveFitLog(date){saveLSRaw('fit_log', S.fit.log); dirty.fitLog=true; if(typeof syncPushFitLog==='function') syncPushFitLog(date||TODAY);}
function saveFitBody(date){saveLSRaw('fit_body', S.fit.body); dirty.fitBody=true; if(typeof syncPushFitBody==='function') syncPushFitBody(date||TODAY);}
function saveFitDiet(date){saveLSRaw('fit_diet', S.fit.diet); dirty.fitDiet=true; if(typeof syncPushFitDiet==='function') syncPushFitDiet(date||TODAY);}
function saveCalEvents(){saveLSRaw('cal_events', S.cal); dirty.calEvents=true; if(typeof syncPushCalEvents==='function') syncPushCalEvents();}
function saveAiOutputs(){saveLSRaw('ai_outputs', S.ai); dirty.aiOutputs=true; if(typeof syncPushAiOutputs==='function') syncPushAiOutputs();}
function saveStore(){saveLSRaw('wishlist', S.store); dirty.store=true; if(typeof syncPushStore==='function') syncPushStore();}
