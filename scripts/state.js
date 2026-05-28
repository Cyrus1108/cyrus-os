/* Constants + global state + localStorage helpers */
const TODAY = new Date().toLocaleDateString('sv-SE');
const STORAGE_PREFIX = 'cyrus_dashboard_v6_';

const MR_DEFAULT=[
  {id:'mr1',t:'Drink water',mins:2,d:false},
  {id:'mr2',t:"Man's work",mins:15,d:false},
  {id:'mr3',t:'Meditation',mins:10,d:false},
  {id:'mr5',t:'Walk',mins:10,d:false},
  {id:'mr6',t:'Breakfast',mins:20,d:false},
  {id:'mr7',t:'Calisthenics',mins:60,d:false},
  {id:'mr8',t:'Bath',mins:6,d:false},
];

/* Migration: strip the removed "Prep meals" item from any loaded morning list
   (existing Supabase/LS rows still carry it). Returns true if anything changed. */
function cleanMorning(){
  if(!S.mr || !Array.isArray(S.mr.list)) return false;
  const before = S.mr.list.length;
  S.mr.list = S.mr.list.filter(i => i.id !== 'mr4' && i.t !== 'Prep meals');
  return S.mr.list.length !== before;
}
const DEF_JP=[
  {id:'j1',t:'Anki 词汇 20张',d:false},
  {id:'j2',t:'语法练习 1课',d:false},
  {id:'j3',t:'听力 1段',d:false},
  {id:'j4',t:'汉字 10个',d:false},
];
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

const CREED_VARIANTS = [
  {id:'anger',body:`如果你今天没有把时间花在这四件事的任何一件上 ——
    <div class="creed-pillars">篮球 &nbsp;·&nbsp; 交易 &nbsp;·&nbsp; 日本語 &nbsp;·&nbsp; 健身</div>
    那你在花时间，成为谁？
    <span class="creed-close">No one accidentally becomes who they want to be.</span>`},
  {id:'contract',body:`Four pillars. Nothing else earns your time.
    <div class="creed-pillars">篮球 &nbsp;·&nbsp; 交易 &nbsp;·&nbsp; 日本語 &nbsp;·&nbsp; 健身</div>
    不是爱好。是通往你想成为的那个人的四条路。
    空闲时间 = 默认投入其中之一。
    <span class="creed-close">如果你在做其他事，问一句：这件事为什么值得偷走我的未来？</span>`}
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
  jp:{streak:0,last:null,log:{},note:'',list:JSON.parse(JSON.stringify(DEF_JP))},
  tr:{date:TODAY,bias:'',list:JSON.parse(JSON.stringify(DEF_TR))},
  todos:[],
  hermes:[],   /* Hermes notices — read/dismiss only; written server-side by the assistant */
  cats:JSON.parse(JSON.stringify(DEFAULT_CATS)),
  activeCat:'all',
  notifiedIds:[],
  symbols:null,
  subjects:null,  /* Preset academic subjects — populated from settings.subjects */
};

let editingAC=null, editingJP=null, editingTR=null, editingTD=null;
let currentCreedIdx=0, calendarRendered=false;
let showDone = false;

function loadLS(key,fallback){try{const raw=localStorage.getItem(STORAGE_PREFIX+key);if(raw)return JSON.parse(raw);}catch(e){}return fallback;}
/* saveLSRaw: pure local write, used by sync layer when mirroring DB → LS (no re-sync). */
function saveLSRaw(key,val){try{localStorage.setItem(STORAGE_PREFIX+key,JSON.stringify(val));}catch(e){}}
/* saveLS: local write + auto-sync if the key is a settings field. */
const SETTINGS_KEYS = ['creed_idx','creed_open','show_done','symbols','subjects','notif_banner_dismissed'];
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
  the90Meta: false, the90Daily: false,
};

function saveMR(){saveLSRaw('mr',S.mr); dirty.morning=true; if(typeof syncPushMorning==='function') syncPushMorning();}
function saveAC(){saveLSRaw('ac',S.ac); dirty.academics=true; if(typeof syncPushAcademics==='function') syncPushAcademics();}
function saveTR(){saveLSRaw('tr',S.tr); dirty.trading=true; if(typeof syncPushTrading==='function') syncPushTrading();}
function saveJP(){saveLSRaw('jp',S.jp); dirty.japanese=true; if(typeof syncPushJP==='function') syncPushJP();}
function saveTodos(){saveLSRaw('todos', S.todos); dirty.todos=true; if(typeof syncPushTodos==='function') syncPushTodos();}
function saveCats(){saveLSRaw('cats', S.cats); dirty.categories=true; if(typeof syncPushCategories==='function') syncPushCategories();}
function saveThe90Meta(){saveLSRaw('the90_meta', S.the90?.meta); dirty.the90Meta=true; if(typeof syncPushThe90Meta==='function') syncPushThe90Meta();}
function saveThe90Daily(){saveLSRaw('the90_daily', S.the90?.daily); dirty.the90Daily=true; if(typeof syncPushThe90Daily==='function') syncPushThe90Daily();}
