/* TradingView markets widgets + economic calendar */
function getSymbols(){return S.symbols || DEFAULT_SYMBOLS.slice();}
function renderMarkets(){
  const host = document.getElementById('tv-widgets-host');
  host.innerHTML = '';
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const colorTheme = isDark ? 'dark' : 'light';
  getSymbols().forEach(sym=>{
    const wrap = document.createElement('div');
    wrap.className = 'tv-widget';
    if(getSymbols().length > 1){
      const removeBtn = document.createElement('button');
      removeBtn.className = 'tv-widget-remove';
      removeBtn.textContent = '×';
      removeBtn.onclick = ()=>removeSymbol(sym);
      wrap.appendChild(removeBtn);
    }
    const container = document.createElement('div');
    container.className = 'tradingview-widget-container';
    container.style.height = '72px';
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    container.appendChild(widget);
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js';
    script.innerHTML = JSON.stringify({symbol:sym,width:'100%',colorTheme:colorTheme,isTransparent:true,locale:'en'});
    container.appendChild(script);
    wrap.appendChild(container);
    host.appendChild(wrap);
  });
  renderMorePanel();
}
function addSymbol(sym){
  const current = getSymbols();
  if(current.includes(sym)) return;
  current.push(sym);
  S.symbols = current;
  saveLS('symbols', S.symbols);
  renderMarkets();
}
function removeSymbol(sym){
  const current = getSymbols();
  const idx = current.indexOf(sym);
  if(idx === -1 || current.length <= 1) return;
  current.splice(idx, 1);
  S.symbols = current;
  saveLS('symbols', S.symbols);
  renderMarkets();
}
function toggleSymbol(sym){
  if(getSymbols().includes(sym)){if(getSymbols().length > 1) removeSymbol(sym);}
  else addSymbol(sym);
}
function renderMorePanel(){
  const grid = document.getElementById('more-grid');
  const current = getSymbols();
  grid.innerHTML = SYMBOL_POOL.map(s=>{
    const added = current.includes(s.symbol);
    return `<div class="symbol-chip ${added?'added':''}" onclick="toggleSymbol('${s.symbol}')">
      <div><div>${s.name}</div><div class="symbol-chip-sub">${s.sub}</div></div>
      <span class="symbol-chip-check">✓</span>
    </div>`;
  }).join('');
}
function toggleMorePanel(){
  const p = document.getElementById('more-panel');
  p.classList.toggle('open');
  document.getElementById('more-btn').textContent = p.classList.contains('open') ? '− Close' : '+ More';
}

function renderCalendar(){
  const host = document.getElementById('calendar-host');
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const container = document.createElement('div');
  container.className = 'tradingview-widget-container';
  container.style.height = '100%';
  const widget = document.createElement('div');
  widget.className = 'tradingview-widget-container__widget';
  widget.style.height = '100%';
  container.appendChild(widget);
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.async = true;
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
  script.innerHTML = JSON.stringify({width:'100%',height:'100%',colorTheme:isDark?'dark':'light',isTransparent:true,locale:'en',importanceFilter:'0,1',countryFilter:'us,eu,jp,gb,cn'});
  container.appendChild(script);
  host.appendChild(container);
  calendarRendered = true;
}
