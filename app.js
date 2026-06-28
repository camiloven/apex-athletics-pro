/* ===== Apex Athletics Pro — App Principal ===== */

const SPORT_ICONS = { soccer: "⚽", tennis: "🎾", basketball: "🏀", hockey: "🏒", volleyball: "🏐", handball: "🤾" };
const LEAGUE_COLORS = ['#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#f97316','#06b6d4','#84cc16','#ec4899','#14b8a6'];

// ===== Estado =====
let allData = {}, currentSport = null, currentView = 'pronos';
let leagueColorMap = {}, resultsCache = {}, authToken = null;
let betminesImgs = [], forebetImgs = [], wordContents = {};
let countdownInterval = null;
let autoRefreshInterval = null;
let currentTheme = localStorage.getItem("theme") || "dark";
let userTimezone = localStorage.getItem('userTimezone') || 'auto';
const DETECTED_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// ===== Audio click =====
const clickAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playClick() {
    try {
        const osc = clickAudioCtx.createOscillator();
        const gain = clickAudioCtx.createGain();
        osc.connect(gain); gain.connect(clickAudioCtx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.05;
        gain.gain.exponentialRampToValueAtTime(0.001, clickAudioCtx.currentTime + 0.08);
        osc.start(); osc.stop(clickAudioCtx.currentTime + 0.08);
    } catch {}
}

// Click sound en toda la app
document.addEventListener('click', e => {
    if (e.target.closest('button, .card, a, .filter-chip, .nav-tab')) playClick();
});

// ===== TZ helper =====
function getActiveTZ() {
    if (userTimezone === 'chile') return 'America/Santiago';
    return DETECTED_TZ;
}

function getTZ() { return getActiveTZ(); }

// ===== Utilidades =====
function showToast(msg, isError = false) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' toast-error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function parseDate(str) {
    if (!str) return null;
    const m = String(str).trim().match(/^(\d+)\.(\d+)\.(\d{4})(?:\s+(\d+):(\d+))?/);
    if (!m) return null;
    return new Date(Date.UTC(+m[3], +m[2]-1, +m[1], +m[4]||0, +m[5]||0));
}

function getLocalTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:getTZ() });
}

function getLocalDayKey(date) {
    if (!date) return 'sin-fecha';
    return date.toLocaleDateString('es-CL', { timeZone:getTZ() });
}

function getLocalDayLabel(date) {
    if (!date) return 'Sin fecha';
    const today = new Date(), tomorrow = new Date(today);
    tomorrow.setDate(today.getDate()+1);
    const opts = { timeZone:getTZ(), weekday:'short', day:'numeric', month:'short' };
    const todayKey = today.toLocaleDateString('es-CL', { timeZone:getTZ() });
    const tomorrowKey = tomorrow.toLocaleDateString('es-CL', { timeZone:getTZ() });
    const dateKey = date.toLocaleDateString('es-CL', { timeZone:getTZ() });
    const label = date.toLocaleDateString('es-CL', opts);
    if (dateKey === todayKey) return '📅 Hoy — '+label;
    if (dateKey === tomorrowKey) return '📅 Mañana — '+label;
    return '📅 '+label;
}

function pct(val) { return Math.round((parseFloat(val)||0)*100); }
function normalize(str) { return String(str||'').toLowerCase().replace(/[^a-z0-9]/g,'').trim(); }

function pctClass(v) {
    if (v >= 65) return 'pct-high';
    if (v >= 50) return 'pct-mid';
    return 'pct-low';
}

function dynamicPill(valuePct, label) {
    const cls = pctClass(valuePct);
    return `<div class="stat-pill bg-zinc-800"><div class="${cls} text-lg font-bold">${valuePct}%</div><div class="text-zinc-500 text-xs mt-0.5">${label}</div></div>`;
}

function donutChart(value, size=80, stroke=8) {
    const r = (size-stroke)/2, c = 2*Math.PI*r, off = c-(value/100)*c;
    const color = value>=70?'#4ade80':value>=50?'#fbbf24':'#f87171';
    return `<div class="donut-chart" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#27272a" stroke-width="${stroke}"/><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${off}" stroke-linecap="round" style="transition:stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)"/></svg><span class="donut-value" style="color:${color}">${value}%</span></div>`;
}

// ===== Countdown =====
function getCountdown(date) {
    if (!date) return null;
    const now = Date.now();
    const diff = date.getTime() - now;
    if (diff < -7200000) return null; // más de 2h después → no mostrar
    if (diff < 0) return { text: '🔴 EN JUEGO', cls: 'live' };
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 12) return null;
    const cls = h < 1 ? 'urgent' : '';
    const text = h > 0 ? `⏳ ${h}h ${m}m` : `⏳ ${m}m`;
    return { text, cls };
}

// ===== Auth =====
async function authenticate() {
    try {
        // Intentar auth via backend
        const res = await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({}) });
        if (res.ok) {
            const data = await res.json();
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            return true;
        }
    } catch {}
    // Fallback: generar token localmente
    authToken = btoa(JSON.stringify({ auth:true, exp:Date.now()+24*60*60*1000 }));
    localStorage.setItem('authToken', authToken);
    return true;
}

function isTokenValid() {
    if (!authToken) return false;
    try { const d = JSON.parse(atob(authToken)); return d.auth && d.exp > Date.now(); } catch { return false; }
}

// ===== Navegación =====
function goToNext() {
    document.getElementById('introScreen').style.display = 'none';
    if (Object.keys(allData).length > 0) {
        if (!isTokenValid()) authenticate().catch(()=>{});
        showApp(Object.keys(allData));
    } else {
        authenticate().then(()=>loadExcel()).catch(()=>{
            document.getElementById('uploadScreen').classList.remove('hidden');
        });
    }
}

function goToUpload() {
    playClick();
    document.getElementById('appScreen').classList.add('hidden');
    document.getElementById('uploadScreen').classList.remove('hidden');
    const btn = document.getElementById('btnUsarGuardado');
    const info = document.getElementById('uploadInfo');
    if (Object.keys(allData).length > 0) {
        const dep = Object.keys(allData).join(', ');
        const total = Object.values(allData).reduce((a,r)=>a+r.length,0);
        info.textContent = `Datos guardados: ${dep} (${total} partidos)`;
        btn.classList.remove('hidden');
    } else {
        info.textContent = 'Sube tu archivo Excel (.xlsx) para comenzar';
        btn.classList.add('hidden');
    }
}

// ===== Excel =====
function loadExcel() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xlsx';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 10*1024*1024) { showToast('Archivo muy grande (máx 10MB)', true); return; }
        const reader = new FileReader();
        reader.onerror = () => showToast('Error al leer el archivo', true);
        reader.onload = function(ev) {
            try {
                const data = new Uint8Array(ev.target.result);
                const wb = XLSX.read(data, { type:'array' });
                allData = {};
                wb.SheetNames.forEach(name => {
                    try {
                        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name]);
                        if (rows.length > 0) {
                            // Normalizar columnas
                            const normalized = rows.map(row => normalizeRow(row));
                            allData[name] = normalized;
                        }
                    } catch (sheetErr) {
                        console.warn('Error en hoja ' + name + ':', sheetErr);
                    }
                });
                if (!Object.keys(allData).length) {
                    showToast('No se encontraron datos válidos en el archivo', true);
                    return;
                }
                localStorage.setItem('apexData', JSON.stringify(allData));
                resultsCache = {};
                showToast(`✅ ${Object.keys(allData).length} deporte(s) cargado(s)`);
                showApp(Object.keys(allData));
            } catch (err) {
                console.error('Error parsing Excel:', err);
                showToast('Error al leer Excel: ' + (err.message || 'formato inválido'), true);
            }
        };
        reader.readAsArrayBuffer(file);
    };
    input.click();
}

/** Normaliza nombres de columnas del Excel a los que espera la app */
function normalizeRow(row) {
    const out = {};
    const keys = Object.keys(row);
    keys.forEach(k => {
        // Limpiar espacios y normalizar
        const lk = k.toLowerCase().trim();
        if (!lk) return; // Ignorar columnas sin nombre (None)

        // Equipo local
        if (['home','local','equipo local','home team','team 1','equipo1','home_team'].includes(lk)) {
            out.home = row[k];
        }
        // Equipo visita
        else if (['away','visitor','visita','equipo visita','away team','team 2','equipo2','away_team'].includes(lk)) {
            out.away = row[k];
        }
        // Fecha
        else if (['date','fecha','match date','game date','dia'].includes(lk)) {
            out.date = row[k];
        }
        // Liga
        else if (['league','liga','competition','torneo','campeonato','tournament','country'].includes(lk)) {
            out.league = row[k];
        }
        // ID
        else if (['id','match id','match_id','game_id','partido_id'].includes(lk)) {
            out.id = row[k];
        }
        // 1X2 Home
        else if (['1x2_h','1x2 home','home win','local win','p_home','ph','prob_home','home_%','local_%','h%'].includes(lk)) {
            out['1x2_h'] = row[k];
        }
        // 1X2 Draw
        else if (['1x2_d','1x2 draw','draw','empate','p_draw','pd','prob_draw','draw_%','empate_%','d%'].includes(lk)) {
            out['1x2_d'] = row[k];
        }
        // 1X2 Away
        else if (['1x2_a','1x2 away','away win','visita win','p_away','pa','prob_away','away_%','visita_%','a%'].includes(lk)) {
            out['1x2_a'] = row[k];
        }
        // Mercados de goles (o_/u_) — solo los más comunes
        else if (lk.startsWith('o_') || lk.startsWith('u_')) {
            // Solo guardar mercados redondos más usados
            const keep = ['o_1.5','o_2.5','o_3.5','u_1.5','u_2.5','u_3.5'];
            if (keep.includes(lk)) {
                out[lk] = row[k];
            }
        }
        // Asian Handicap — guardar limpio (sin espacios)
        else if (lk.startsWith('ah_')) {
            out[lk] = row[k];
        }
        // Cualquier otra columna
        else {
            out[k] = row[k];
        }
    });
    return out;
}

// ===== App =====
function showApp(sports) {
    document.getElementById('uploadScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    buildLeagueColors(sports);
    buildTabs(sports);
    switchSport(sports[0]);
    // Mostrar botón notif
    if ('Notification' in window) document.getElementById('btnNotif').classList.remove('hidden');
}

function buildLeagueColors(sports) {
    leagueColorMap = {}; let i = 0;
    sports.forEach(s => { (allData[s]||[]).forEach(r => { const lg = r.league||'Sin liga'; if (!leagueColorMap[lg]) { leagueColorMap[lg] = LEAGUE_COLORS[i%LEAGUE_COLORS.length]; i++; } }); });
}

function buildTabs(sports) {
    document.getElementById('sportTabs').innerHTML = sports.map(s =>
        `<button id="tab-${s}" onclick="switchSport('${s}')" class="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold bg-zinc-800 text-zinc-300 transition-all">${SPORT_ICONS[s]||'🏟'} ${s.charAt(0).toUpperCase()+s.slice(1)} <span class="ml-1 text-xs opacity-60">${allData[s]?.length||0}</span></button>`
    ).join('');
}

function switchSport(sport) {
    if (currentSport) { const p = document.getElementById('tab-'+currentSport); if (p) p.classList.remove('tab-active'); }
    currentSport = sport;
    const c = document.getElementById('tab-'+sport); if (c) c.classList.add('tab-active');
    if (currentView==='pronos') renderPronos(sport, allData[sport]||[]);
    else if (currentView==='analisis') renderAnalisis();
    else if (currentView==='historial') renderHistorial();
    else if (currentView==='fuentes') renderFuentes();
    else if (currentView==='config') renderConfig();
    else if (currentView==='word') renderWord();
    window.scrollTo(0,0);
}

function switchView(view) {
    currentView = view;
    const views = ['pronos','resultados','analisis','historial','standings','fuentes','config','word'];
    views.forEach(v => {
        const btn = document.getElementById('nav'+v.charAt(0).toUpperCase()+v.slice(1));
        if (btn) { btn.classList.toggle('active', v===view); btn.classList.toggle('text-yellow-400', v===view); btn.classList.toggle('text-zinc-400', v!==view); }
    });
    const st = document.getElementById('sportTabs').parentElement;
    const mc = document.getElementById('mainContent');
    mc.classList.add('view-fade-enter');
    setTimeout(()=>mc.classList.remove('view-fade-enter'),300);
    // Detener auto-refresh si no estamos en resultados
    if (view !== 'resultados' && autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; }
    if (view==='pronos') { st.style.display=''; if(currentSport) renderPronos(currentSport, allData[currentSport]||[]); else if(Object.keys(allData).length) switchSport(Object.keys(allData)[0]); }
    else { st.style.display='none'; if(view==='resultados'&&currentSport) renderResultados(currentSport); else if(view==='analisis') renderAnalisis(); else if(view==='historial') renderHistorial(); else if(view==='standings') renderStandings(); else if(view==='fuentes') renderFuentes(); else if(view==='config') renderConfig(); else if(view==='word') renderWord(); }
    window.scrollTo(0,0);
}

// ===== Skeleton =====
function skeletonCards(n=5) {
    return Array.from({length:n}, ()=>'<div class="skeleton skeleton-card"></div>').join('');
}

// ===== Intersection Observer para cards =====
const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            cardObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });

function observeCards() {
    document.querySelectorAll('.card:not(.visible)').forEach(c => cardObserver.observe(c));
}

// ===== Vista Pronos =====
function renderPronos(sport, data) {
    const container = document.getElementById('mainContent');
    container.innerHTML = '';
    if (!data||!data.length) { container.innerHTML='<p class="text-zinc-500 text-center mt-16">Sin datos</p>'; return; }

    // Barra de búsqueda y filtros
    const leagues = [...new Set(data.map(r=>r.league||'Sin liga'))];
    const searchHTML = `
        <div class="px-4 pt-4 space-y-3">
            <div class="search-bar">
                <span class="search-icon">🔍</span>
                <input type="text" id="searchInput" placeholder="Buscar equipo..." oninput="filterPronos()">
            </div>
            <div class="flex gap-2 overflow-x-auto pb-1" id="leagueFilters">
                <span class="filter-chip active" onclick="filterByLeague('all', this)">Todos</span>
                ${leagues.map(l=>`<span class="filter-chip" onclick="filterByLeague('${l.replace(/'/g,"\\'")}', this)">${l}</span>`).join('')}
            </div>
        </div>`;
    container.innerHTML = searchHTML + renderDailySummary();

    const contentDiv = document.createElement('div');
    contentDiv.id = 'pronosContent';
    container.appendChild(contentDiv);

    renderPronosContent(sport, data);
    // Countdown timer
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(()=>updateCountdowns(), 30000);
}

function renderPronosContent(sport, data, filterLeague='all', searchQuery='') {
    const container = document.getElementById('pronosContent');
    if (!container) return;
    container.innerHTML = '';

    try {
    // Filtrar
    let filtered = data;
    if (filterLeague !== 'all') filtered = filtered.filter(r => (r.league||'Sin liga') === filterLeague);
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(r => (r.home||'').toLowerCase().includes(q) || (r.away||'').toLowerCase().includes(q));
    }

    if (!filtered.length) {
        container.innerHTML = '<p class="text-zinc-500 text-center mt-16">Sin resultados</p>';
        return;
    }

    // Botón IA
    const todayKey = new Date().toLocaleDateString('es-CL',{timeZone:getTZ()});
    let matches = filtered.filter(r=>{ const d=parseDate(r.date); return d&&getLocalDayKey(d)===todayKey; });
    if (!matches.length) {
        const days = [...new Set(filtered.map(r=>{ const d=parseDate(r.date); return d?getLocalDayKey(d):null; }).filter(Boolean))];
        if (days.length) matches = filtered.filter(r=>{ const d=parseDate(r.date); return d&&getLocalDayKey(d)===days[0]; });
    }
    const matchCount = matches.length;
    if (matchCount>0 && sport==='soccer') {
        const bw = document.createElement('div'); bw.className='px-4 pt-4';
        bw.innerHTML=`<button id="btnAnalizarHoy" class="shimmer w-full py-4 bg-yellow-400 text-black font-extrabold rounded-2xl text-base">🤖 Analizar Hoy con IA (${matchCount} partidos)</button><div id="analisisHoyResult" class="mt-3"></div>`;
        container.appendChild(bw);
        document.getElementById('btnAnalizarHoy').onclick=function(){
            const checks=document.querySelectorAll('.match-check:checked');
            let seleccion=filtered;
            if(checks.length){ const ids=Array.from(checks).map(ch=>ch.getAttribute('data-match-id')); seleccion=filtered.filter(r=>ids.includes((r.home||'')+'|'+(r.away||'')+'|'+(r.date||''))); }
            analizarHoy(sport, seleccion, checks.length>0);
        };
    }

    // Agrupar
    const parsed = filtered.map(r=>({...r,_date:parseDate(r.date)}));
    parsed.sort((a,b)=>{ const da=a._date?.getTime()||0,db=b._date?.getTime()||0; return da!==db?da-db:(a.league||'').localeCompare(b.league||''); });
    const byDay={};
    parsed.forEach(r=>{ const dk=getLocalDayKey(r._date); if(!byDay[dk]) byDay[dk]={label:getLocalDayLabel(r._date),leagues:{}}; const lg=r.league||'Sin liga'; if(!byDay[dk].leagues[lg]) byDay[dk].leagues[lg]=[]; byDay[dk].leagues[lg].push(r); });

    const wrap=document.createElement('div'); wrap.className='p-4';
    let cardIdx=0;
    Object.values(byDay).forEach(dg=>{
        const dd=document.createElement('div'); dd.className='day-header rounded-xl px-4 py-3 mb-4 mt-2'; dd.innerHTML=`<span class="font-bold text-yellow-400">${dg.label}</span>`; wrap.appendChild(dd);
        Object.entries(dg.leagues).forEach(([ln,lm])=>{
            const color=leagueColorMap[ln]||'#eab308';
            const lg=document.createElement('div'); lg.className='flex items-center gap-2 mb-3 ml-1 px-2';
            lg.innerHTML=`<span class="league-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${ln}</span><span class="text-zinc-600 text-xs">${lm.length} partidos</span>`;
            wrap.appendChild(lg);
            lm.forEach(r=>{
                try {
                    const mid=(r.home||'')+'|'+(r.away||'')+'|'+(r.date||'');
                    wrap.appendChild(buildCard(sport,r,color,mid,cardIdx));
                    cardIdx++;
                } catch (cardErr) {
                    console.error('Error en card:', r, cardErr);
                    const errDiv = document.createElement('div');
                    errDiv.className = 'bg-red-900/20 border border-red-800 rounded-xl p-3 mb-2 text-xs text-red-400';
                    errDiv.textContent = `Error: ${r.home||'?'} vs ${r.away||'?'} — ${cardErr.message}`;
                    wrap.appendChild(errDiv);
                }
            });
        });
    });

    if (!filtered.length) wrap.innerHTML='<p class="text-zinc-500 text-center mt-16">Sin resultados</p>';
    container.appendChild(wrap);
    requestAnimationFrame(observeCards);

    } catch (err) {
        console.error('Error renderizando partidos:', err);
        container.innerHTML = `<div class="p-4 text-center mt-16"><p class="text-red-400 mb-2">Error al mostrar los partidos</p><p class="text-zinc-500 text-xs">${err.message}</p><button onclick="localStorage.removeItem('apexData');location.reload()" class="mt-4 bg-zinc-800 text-yellow-400 px-4 py-2 rounded-xl text-sm">Limpiar datos y recargar</button></div>`;
    }
}

function filterPronos() {
    const q = document.getElementById('searchInput')?.value || '';
    const activeChip = document.querySelector('#leagueFilters .filter-chip.active');
    const league = activeChip?.textContent || 'Todos';
    const filterLeague = league === 'Todos' ? 'all' : league;
    renderPronosContent(currentSport, allData[currentSport]||[], filterLeague, q);
}

function filterByLeague(league, chip) {
    document.querySelectorAll('#leagueFilters .filter-chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    const q = document.getElementById('searchInput')?.value || '';
    renderPronosContent(currentSport, allData[currentSport]||[], league, q);
}

function buildCard(sport, row, leagueColor, matchId, index) {
    const div=document.createElement('div');
    div.className='card bg-zinc-900 rounded-2xl p-4 mb-3 border border-zinc-800';
    div.style.transitionDelay=(index*0.03)+'s';
    // H2H click para soccer
    if (sport === 'soccer' && row.home && row.away) {
        div.style.cursor = 'pointer';
        div.addEventListener('click', (e) => {
            if (e.target.classList.contains('match-check')) return; // No activar al checkear
            showH2H(row.home, row.away);
        });
    }
    const timeStr=getLocalTime(row._date);
    const h=pct(row['1x2_h']),a=pct(row['1x2_a']);
    const cd=getCountdown(row._date);
    const cdHTML=cd?`<span class="countdown ${cd.cls}">${cd.text}</span>`:'';

    if (sport==='soccer') {
        const d=pct(row['1x2_d']);
        const o15=pct(row['o_1.5']), o25=pct(row['o_2.5']), o35=pct(row['o_3.5']);
        const u15=pct(row['u_1.5']), u25=pct(row['u_2.5']), u35=pct(row['u_3.5']);
        const best=Math.max(u25,u35);
        if(best>55) div.classList.add('best');
        const hot=best>55?'<span class="badge-hot ml-2">🔥 HOT</span>':'';

        div.innerHTML=`
            <div class="flex justify-between items-start">
                <div class="flex items-start gap-2 flex-1 pr-2">
                    <input type="checkbox" class="match-check mt-1 w-5 h-5 accent-yellow-400 flex-shrink-0" data-match-id="${matchId}">
                    <div><p class="font-bold text-sm leading-tight">${row.home||'?'} <span class="text-zinc-500">vs</span> ${row.away||'?'}</p>${hot}${cdHTML}</div>
                </div>
                ${timeStr?`<span class="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0" style="background:${leagueColor}22;color:${leagueColor}">${timeStr}</span>`:''}
            </div>
            <div class="grid grid-cols-3 gap-2 mt-3">${dynamicPill(h,'Local')}${dynamicPill(d,'Empate')}${dynamicPill(a,'Visita')}</div>
            <div class="grid grid-cols-3 gap-2 mt-2">${dynamicPill(o25,'Más 2.5')}${dynamicPill(u25,'Menos 2.5')}${dynamicPill(u35,'Menos 3.5')}</div>`;
    } else if (sport==='tennis') {
        div.innerHTML=`<div class="flex justify-between items-start mb-2"><p class="font-bold text-sm">${row.home||'?'} <span class="text-zinc-500">vs</span> ${row.away||'?'}</p>${timeStr?`<span class="text-xs font-bold px-2 py-1 rounded-lg" style="background:${leagueColor}22;color:${leagueColor}">${timeStr}</span>`:''}</div>${cdHTML}<div class="grid grid-cols-2 gap-2 mt-3">${dynamicPill(h,'Local')}${dynamicPill(a,'Visita')}</div><div class="grid grid-cols-2 gap-2 mt-2">${dynamicPill(pct(row['o_2.5']),'Más 2.5')}${dynamicPill(pct(row['u_2.5']),'Menos 2.5')}</div>`;
    } else {
        div.innerHTML=`<div class="flex justify-between items-start mb-2"><p class="font-bold text-sm">${row.home||'?'} <span class="text-zinc-500">vs</span> ${row.away||'?'}</p>${timeStr?`<span class="text-xs font-bold px-2 py-1 rounded-lg" style="background:${leagueColor}22;color:${leagueColor}">${timeStr}</span>`:''}</div>${cdHTML}<div class="grid grid-cols-2 gap-2 mt-3">${dynamicPill(h,'Local')}${dynamicPill(a,'Visita')}</div>`;
    }
    return div;
}

function updateCountdowns() {
    document.querySelectorAll('.countdown[data-date]').forEach(el => {
        const date = new Date(parseInt(el.dataset.date));
        const cd = getCountdown(date);
        if (cd) { el.textContent = cd.text; el.className = 'countdown ' + cd.cls; }
    });
}

// ===== API =====
async function fetchRealResults(sport, dates) {
    const apiKey = localStorage.getItem('sportsKey') || '';
    if (!apiKey) return { games: [], debug: 'Sin API key. Configúrala en ⚙️ Config' };
    if (!dates?.length) return { games: [], debug: 'Sin fechas' };

    // Filtrar fechas: plan free solo permite hoy ±2 días
    const today = new Date();
    const minDate = new Date(today); minDate.setDate(today.getDate() - 2);
    const maxDate = new Date(today); maxDate.setDate(today.getDate() + 2);
    const validDates = dates.filter(d => {
        const parts = d.split('-');
        const dt = new Date(+parts[0], +parts[1]-1, +parts[2]);
        return dt >= minDate && dt <= maxDate;
    });

    if (!validDates.length) {
        return { games: [], debug: 'Fechas fuera de rango (plan free: hoy ±2 días). Fechas en Excel: ' + dates.join(', ') };
    }

    const endpoints = {
        soccer: 'https://v3.football.api-sports.io/fixtures?date=',
        basketball: 'https://v1.basketball.api-sports.io/games?date=',
        hockey: 'https://v1.hockey.api-sports.io/games?date=',
        volleyball: 'https://v1.volleyball.api-sports.io/games?date=',
        handball: 'https://v1.handball.api-sports.io/games?date=',
        tennis: 'https://v1.tennis.api-sports.io/games?date='
    };

    let allGames = [];
    for (const date of validDates) {
        const url = (endpoints[sport] || endpoints.soccer) + date;
        try {
            const res = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
            const data = await res.json();
            if (data.errors && Object.keys(data.errors).length) {
                return { games: [], debug: 'API error: ' + JSON.stringify(data.errors) };
            }
            if (data.response) allGames = allGames.concat(data.response);
        } catch (err) {
            return { games: [], debug: 'Error: ' + err.message };
        }
    }

    return { games: allGames, debug: allGames.length + ' resultados de ' + validDates.length + ' fecha(s)' };
}

function findMatch(row, apiGames) {
    const h=normalize(row.home),a=normalize(row.away);
    for(const g of apiGames){ const gh=normalize(g.teams?.home?.name||''),ga=normalize(g.teams?.away?.name||''); if((gh.includes(h)||h.includes(gh))&&(ga.includes(a)||a.includes(ga))) return g; }
    return null;
}

// ===== Resultados =====
async function renderResultados(sport) {
    const container=document.getElementById('mainContent'), data=allData[sport]||[];
    if(!data.length){container.innerHTML='<p class="text-zinc-500 text-center mt-16">Sin datos</p>';return;}
    container.innerHTML=`<div class="loading-overlay"><div class="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full spinner"></div><p class="text-zinc-400">Buscando resultados...</p></div>`;
    const cacheKey=sport+'_'+(data[0]?.date||'');
    if(resultsCache[cacheKey]){renderResultadosUI(sport,data,resultsCache[cacheKey]);return;}
    const dates=[...new Set(data.slice(0,20).map(r=>{const m=String(r.date||'').match(/(\d+)\.(\d+)\.(\d{4})/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):'';}).filter(Boolean))];
    
    if (!dates.length) {
        container.innerHTML='<p class="text-zinc-500 text-center mt-16">No se encontraron fechas válidas</p>';
        return;
    }

    const apiResult = await fetchRealResults(sport, dates);
    const apiGames = apiResult.games || [];
    
    // Debug info si no hay resultados
    if (!apiGames.length) {
        const debugInfo = apiResult.debug;
        const debugStr = typeof debugInfo === 'object' ? JSON.stringify(debugInfo) : (debugInfo || 'Sin info');
        container.innerHTML=`<div class="p-4 text-center mt-16">
            <p class="text-zinc-400 mb-2">Sin resultados de la API</p>
            <p class="text-zinc-600 text-xs mb-1">Deporte: ${sport}</p>
            <p class="text-zinc-600 text-xs mb-1">Fechas: ${dates.join(', ')}</p>
            <p class="text-zinc-600 text-xs mb-4">Debug: ${debugStr}</p>
            <button onclick="resultsCache={};renderResultados('${sport}')" class="bg-yellow-400 text-black px-6 py-3 rounded-2xl font-bold">🔄 Reintentar</button>
        </div>`;
        return;
    }

    const resultados=data.slice(0,20).map(row=>{
        const g=findMatch(row,apiGames);
        if(!g)return{marcador:'?',estado:'pendiente'};
        const sc=sport==='soccer'?g.goals:g.scores;
        const score=sport==='soccer'?(sc?.home!==null&&sc?.away!==null?sc.home+'-'+sc.away:null):(sc?.home?.total!==undefined?sc.home.total+'-'+sc.away.total:null);
        const finished=g.fixture?.status?.short==='FT'||g.status?.short==='FT';
        return{marcador:score||'?',estado:finished&&score?'finalizado':'pendiente'};
    });
    resultsCache[cacheKey]=resultados;
    renderResultadosUI(sport,data,resultados);
}

function renderResultadosUI(sport,data,resultados) {
    const container=document.getElementById('mainContent'); container.innerHTML='';
    let aciertos=0,errores=0,pendientes=0;
    const wrap=document.createElement('div'); wrap.className='p-4';
    const cards=data.slice(0,20).map((row,i)=>{
        const res=resultados[i]||{marcador:'?',estado:'pendiente'};
        const fin=res.estado==='finalizado'&&res.marcador!=='?';
        let acierto=null,pron='';
        if(fin){const p=res.marcador.split('-').map(Number);const g1=p[0]||0,g2=p[1]||0;const gan=g1>g2?'local':g2>g1?'visita':'empate';const pH=parseFloat(row['1x2_h']||0),pD=parseFloat(row['1x2_d']||0),pA=parseFloat(row['1x2_a']||0);const mx=Math.max(pH,pD||0,pA);let pg=mx===pH?'local':mx===pD?'empate':'visita';if(sport!=='soccer'&&!row['1x2_d'])pg=pH>pA?'local':'visita';acierto=pg===gan;pron='Pronó: '+(pg==='local'?row.home:pg==='visita'?row.away:'Empate');}
        if(acierto===true)aciertos++;else if(acierto===false)errores++;else pendientes++;
        const color=leagueColorMap[row.league||'']||'#eab308';
        const timeStr=getLocalTime(parseDate(row.date));
        const chk=acierto===true?`<span class="check-animate" style="animation-delay:${i*0.05}s">✅</span>`:acierto===false?`<span class="check-animate" style="animation-delay:${i*0.05}s">❌</span>`:'⏳';
        return`<div class="card bg-zinc-900 rounded-2xl p-4 mb-3 border ${acierto===true?'border-green-500':acierto===false?'border-red-500':'border-zinc-800'}" style="transition-delay:${i*0.05}s"><div class="flex justify-between items-start mb-2"><div class="flex-1 pr-2"><p class="font-bold text-sm">${row.home||'?'} <span class="text-zinc-500">vs</span> ${row.away||'?'}</p><p class="text-xs mt-0.5" style="color:${color}">${row.league||''}</p></div><div class="text-right flex-shrink-0">${timeStr?`<p class="text-xs text-zinc-500">${timeStr}</p>`:''}<p class="text-2xl font-bold mt-1 ${fin?'text-white':'text-zinc-600'}">${res.marcador}</p></div></div><div class="flex justify-between items-center mt-2 pt-2 border-t border-zinc-800"><span class="text-xs text-zinc-500">${pron}</span>${chk}</div></div>`;
    }).join('');
    const total=aciertos+errores,pct_ac=total>0?Math.round(aciertos/total*100):0;
    wrap.innerHTML=`<div class="bg-zinc-900 rounded-2xl p-4 mb-4 border border-yellow-500/30"><p class="text-yellow-400 font-bold text-center mb-3">📊 Resumen</p><div class="flex items-center justify-center gap-6 mb-4">${donutChart(pct_ac,90,10)}<div class="space-y-2"><div class="flex items-center gap-2"><span class="text-green-400 text-xl font-bold">${aciertos}</span><span class="text-xs text-zinc-400">✅ Aciertos</span></div><div class="flex items-center gap-2"><span class="text-red-400 text-xl font-bold">${errores}</span><span class="text-xs text-zinc-400">❌ Errores</span></div><div class="flex items-center gap-2"><span class="text-zinc-300 text-xl font-bold">${pendientes}</span><span class="text-xs text-zinc-400">⏳ Pendientes</span></div></div></div>${total>0?`<div class="progress-bar-animated bg-zinc-800 rounded-full h-3 overflow-hidden"><div class="progress-fill bg-gradient-to-r from-green-500 to-emerald-400" style="width:0%" id="progressFill"></div></div><p class="text-center text-sm mt-2 font-bold text-green-400">${pct_ac}% de acierto</p>`:''}</div><button onclick="resultsCache={};renderResultados('${sport}')" class="shimmer w-full py-3 bg-zinc-800 text-yellow-400 rounded-2xl text-sm font-bold mb-4 hover:bg-zinc-700 transition">🔄 Actualizar</button>${cards}`;
    container.appendChild(wrap);
    // Auto-refresh cada 60s
    startAutoRefresh(sport);
    // Guardar historial
    saveHistory(pct_ac, aciertos, errores, pendientes);
    requestAnimationFrame(()=>{const f=document.getElementById('progressFill');if(f)setTimeout(()=>f.style.width=pct_ac+'%',100);});
    requestAnimationFrame(observeCards);
}

// ===== Historial =====
function saveHistory(pct, wins, losses, pending) {
    const today = new Date().toLocaleDateString('es-CL',{timeZone:getTZ()});
    let history = JSON.parse(localStorage.getItem('pronosHistory')||'[]');
    const existing = history.findIndex(h=>h.date===today);
    const entry = { date:today, pct, wins, losses, pending, timestamp:Date.now() };
    if (existing >= 0) history[existing] = entry;
    else history.push(entry);
    // Mantener últimos 30 días
    if (history.length > 30) history = history.slice(-30);
    localStorage.setItem('pronosHistory', JSON.stringify(history));
}

function renderHistorial() {
    const container = document.getElementById('mainContent');
    const history = JSON.parse(localStorage.getItem('pronosHistory')||'[]');

    if (!history.length) {
        container.innerHTML = `<div class="p-4 view-fade-enter"><div class="flex flex-col items-center justify-center mt-24"><span class="text-5xl mb-4">📈</span><p class="text-zinc-400 text-center">Sin historial todavía</p><p class="text-zinc-600 text-xs text-center mt-2">Los resultados se guardan automáticamente</p></div></div>`;
        return;
    }

    const totalWins = history.reduce((a,h)=>a+h.wins, 0);
    const totalLosses = history.reduce((a,h)=>a+h.losses, 0);
    const total = totalWins + totalLosses;
    const avgPct = total > 0 ? Math.round(totalWins/total*100) : 0;
    const last7 = history.slice(-7);
    const avg7 = last7.length ? Math.round(last7.reduce((a,h)=>a+h.pct,0)/last7.length) : 0;
    const bestDay = history.reduce((best,h) => h.pct > best.pct ? h : best, history[0]);

    // Gráfico de barras
    const maxPct = Math.max(...history.map(h=>h.pct), 1);
    const barsHTML = history.slice(-15).map(h => {
        const height = Math.max((h.pct / maxPct) * 50, 2);
        const color = h.pct >= 70 ? '#4ade80' : h.pct >= 50 ? '#fbbf24' : '#f87171';
        const dayLabel = h.date.split('/').slice(0,2).join('/');
        return `<div class="history-bar" style="height:${height}px;background:${color}" data-label="${dayLabel}"></div>`;
    }).join('');

    container.innerHTML = `
        <div class="p-4 view-fade-enter">
            <h2 class="text-xl font-extrabold text-yellow-400 mb-4">📈 Historial de Rendimiento</h2>

            <div class="bg-zinc-900 rounded-2xl p-4 mb-4 border border-yellow-500/30">
                <div class="flex items-center justify-center gap-6 mb-4">
                    ${donutChart(avgPct, 90, 10)}
                    <div class="space-y-2">
                        <div><span class="text-2xl font-bold text-white">${total}</span><span class="text-xs text-zinc-400 ml-2">partidos analizados</span></div>
                        <div><span class="text-green-400 font-bold">${totalWins}</span><span class="text-xs text-zinc-500 ml-1">aciertos</span></div>
                        <div><span class="text-red-400 font-bold">${totalLosses}</span><span class="text-xs text-zinc-500 ml-1">errores</span></div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-zinc-900 rounded-2xl p-3 text-center border border-zinc-800">
                    <p class="text-xs text-zinc-500 mb-1">Últimos 7 días</p>
                    <p class="text-xl font-bold ${pctClass(avg7)}">${avg7}%</p>
                </div>
                <div class="bg-zinc-900 rounded-2xl p-3 text-center border border-zinc-800">
                    <p class="text-xs text-zinc-500 mb-1">Mejor día</p>
                    <p class="text-xl font-bold text-green-400">${bestDay.pct}%</p>
                    <p class="text-[9px] text-zinc-600">${bestDay.date}</p>
                </div>
                <div class="bg-zinc-900 rounded-2xl p-3 text-center border border-zinc-800">
                    <p class="text-xs text-zinc-500 mb-1">Días registrados</p>
                    <p class="text-xl font-bold text-yellow-400">${history.length}</p>
                </div>
            </div>

            <div class="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                <p class="text-xs text-zinc-500 mb-3 font-bold">Últimos ${Math.min(history.length,15)} días</p>
                <div class="history-chart">${barsHTML}</div>
                <div class="mt-5"></div>
            </div>

            <div class="mt-4 space-y-2">
                ${history.slice(-7).reverse().map(h=>`
                    <div class="flex items-center justify-between bg-zinc-900 rounded-xl px-4 py-3 border border-zinc-800">
                        <div><p class="text-sm font-bold">${h.date}</p><p class="text-xs text-zinc-500">${h.wins}W ${h.losses}L ${h.pending}P</p></div>
                        <span class="text-lg font-bold ${pctClass(h.pct)}">${h.pct}%</span>
                    </div>
                `).join('')}
            </div>

            <button onclick="if(confirm('¿Borrar historial?')){localStorage.removeItem('pronosHistory');renderHistorial();}"
                class="w-full py-3 bg-zinc-800 text-red-400 rounded-2xl text-sm font-bold mt-4 hover:bg-zinc-700 transition">
                🗑️ Borrar historial
            </button>
        </div>`;
}

// ===== IA =====
async function geminiCall(imageBase64, prompt) {
    const key=localStorage.getItem('geminiKey')||'';
    if(!key) throw new Error('Sin clave Gemini');
    const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{inline_data:{mime_type:'image/jpeg',data:imageBase64}},{text:prompt}]}]})});
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||`Error Gemini: ${res.status}`);}
    return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text||'';
}

async function groqCall(content, maxTokens) {
    const key=localStorage.getItem('groqKey')||'';
    if(!key) throw new Error('Sin clave Groq');
    const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'***'+key},body:JSON.stringify({model:typeof content==='string'?'llama-3.3-70b-versatile':'llama-3.2-11b-vision-preview',max_tokens:maxTokens,messages:[{role:'user',content}]})});
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||`Error Groq: ${res.status}`);}
    return (await res.json()).choices?.[0]?.message?.content||'';
}

function renderAnalisis() {
    document.getElementById('mainContent').innerHTML=`<div class="p-4 view-fade-enter"><h2 class="text-xl font-extrabold text-yellow-400 mb-4">🎯 Análisis Combinado</h2><div class="bg-zinc-900 rounded-2xl p-4 mb-4 border border-yellow-500/30"><p class="text-sm text-zinc-400 mb-3">Sube capturas de pronósticos</p><div class="grid grid-cols-2 gap-3"><div><p class="text-xs text-zinc-500 mb-2 font-bold">📸 BETMINES</p><label class="block w-full py-4 bg-zinc-800 rounded-2xl text-center text-sm cursor-pointer hover:bg-zinc-700 transition">${betminesImgs.length?betminesImgs.length+' foto(s) ✅':'Seleccionar'}<input type="file" accept="image/*" multiple class="hidden" onchange="loadImgs(event,'betmines')"></label></div><div><p class="text-xs text-zinc-500 mb-2 font-bold">📸 FOREBET</p><label class="block w-full py-4 bg-zinc-800 rounded-2xl text-center text-sm cursor-pointer hover:bg-zinc-700 transition">${forebetImgs.length?forebetImgs.length+' foto(s) ✅':'Seleccionar'}<input type="file" accept="image/*" multiple class="hidden" onchange="loadImgs(event,'forebet')"></label></div></div></div><button onclick="runAnalisis()" class="shimmer w-full py-5 bg-yellow-400 text-black font-extrabold rounded-3xl text-xl mb-4 hover:bg-yellow-300 transition">🤖 Generar Análisis</button><div id="analisisResult"></div></div>`;
}

function loadImgs(event,source){
    const files=Array.from(event.target.files),arr=source==='betmines'?betminesImgs:forebetImgs;arr.length=0;let loaded=0;
    files.forEach(f=>{if(f.size>5*1024*1024){showToast(f.name+' muy grande',true);return;}const r=new FileReader();r.onload=e=>{arr.push(e.target.result.split(',')[1]);loaded++;if(loaded===files.length)renderAnalisis();};r.readAsDataURL(f);});
}

async function runAnalisis(){
    const result=document.getElementById('analisisResult');
    if(!betminesImgs.length&&!forebetImgs.length){showToast('Sube al menos una captura',true);return;}
    if(!localStorage.getItem('groqKey')){showToast('Configura Groq en Config',true);return;}
    try{
        result.innerHTML=`<div class="loading-overlay"><div class="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full spinner"></div><p class="text-zinc-400 text-sm">Paso 1: Leyendo Betmines...</p></div>`;
        let betTxt='Sin datos';
        if(betminesImgs.length){const r=[];for(const img of betminesImgs.slice(0,2))r.push(await geminiCall(img.replace(/^data:image\/[a-z]+;base64,/,''),'Lee esta imagen de BETMINES. Lista SOLO los partidos visibles: EquipoLocal vs EquipoVisita: PREDICCION (LOCAL/EMPATE/VISITA).'));betTxt=r.join('\n');}
        result.innerHTML=`<div class="loading-overlay"><div class="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full spinner"></div><p class="text-zinc-400 text-sm">Paso 2: Leyendo Forebet...</p></div>`;
        let foreTxt='Sin datos';
        if(forebetImgs.length){const r=[];for(const img of forebetImgs.slice(0,2))r.push(await geminiCall(img.replace(/^data:image\/[a-z]+;base64,/,''),'Lee esta imagen de FOREBET. Lista SOLO los partidos: EquipoLocal vs EquipoVisita: PREDICCION PORCENTAJE%.'));foreTxt=r.join('\n');}
        result.innerHTML=`<div class="loading-overlay"><div class="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full spinner"></div><p class="text-zinc-400 text-sm">Paso 3: Generando veredictos...</p></div>`;
        const resp=await groqCall('BETMINES:\n'+betTxt+'\n\nFOREBET:\n'+foreTxt+'\n\nCruza datos y genera veredicto por partido:\nPartido: Local vs Visita | Betmines: PRED | Forebet: PRED% | Veredicto: LOCAL/EMPATE/VISITA | Confianza: 50-95 | Razon: corto',1000);
        const partidos=resp.split('\n').filter(l=>l.trim().length>5).map(l=>{const g=k=>{const i=l.indexOf(k);if(i<0)return'—';const v=l.slice(i+k.length);const j=v.indexOf(' | ');return(j>=0?v.slice(0,j):v).trim();};return{partido:g('Partido:'),betmines:g('Betmines:'),forebet:g('Forebet:'),veredicto:g('Veredicto:').toUpperCase(),confianza:parseInt(g('Confianza:'))||70,razon:g('Razon:')};});
        renderAnalisisResult(partidos);
    }catch(e){result.innerHTML=`<div class="text-center mt-8"><p class="text-red-400 text-sm mb-4">${e.message}</p><button onclick="runAnalisis()" class="bg-yellow-400 text-black px-6 py-3 rounded-2xl font-bold">Reintentar</button></div>`;}
}

function renderAnalisisResult(partidos){
    const result=document.getElementById('analisisResult');
    if(!partidos.length){result.innerHTML='<p class="text-zinc-500 text-center mt-8">Sin partidos</p>';return;}
    const colores={LOCAL:'border-green-500',EMPATE:'border-yellow-500',VISITA:'border-blue-500'},iconos={LOCAL:'🏠',EMPATE:'🤝',VISITA:'✈️'};
    const total=partidos.length,altas=partidos.filter(p=>p.confianza>=70).length,avg=Math.round(partidos.reduce((a,p)=>a+p.confianza,0)/total);
    result.innerHTML=`<div class="bg-zinc-900 rounded-2xl p-4 mb-4 border border-yellow-500/30"><div class="flex justify-between items-center mb-3"><p class="text-yellow-400 font-bold text-sm uppercase">📊 Resumen</p><span class="text-zinc-500 text-xs">${total} partidos</span></div><div class="flex items-center justify-center gap-6 mb-3">${donutChart(avg,80,8)}<div class="grid grid-cols-2 gap-3 text-center"><div class="bg-zinc-800 rounded-xl p-2"><p class="text-xl font-bold text-green-400">${altas}</p><p class="text-zinc-500 text-xs">Alta conf.</p></div><div class="bg-zinc-800 rounded-xl p-2"><p class="text-xl font-bold text-yellow-400">${total-altas}</p><p class="text-zinc-500 text-xs">Media/baja</p></div></div></div></div>`+
    partidos.map((p,i)=>{const c=p.confianza||0,ct=c>=70?'text-green-400':c>=50?'text-yellow-400':'text-zinc-400',b=colores[p.veredicto]||'border-zinc-700';return`<div class="card bg-zinc-900 rounded-2xl p-4 mb-3 border ${b}" style="transition-delay:${i*0.05}s"><p class="font-bold text-sm mb-3">${p.partido}</p><div class="space-y-1 mb-3"><div class="flex justify-between text-xs"><span class="text-zinc-500">🔨 Betmines</span><span class="text-zinc-300">${p.betmines||'−'}</span></div><div class="flex justify-between text-xs"><span class="text-zinc-500">📈 Forebet</span><span class="text-zinc-300">${p.forebet||'−'}</span></div></div><div class="bg-zinc-800 rounded-xl p-3 flex justify-between items-center"><div><p class="text-xs text-zinc-500 mb-1">🎯 Veredicto</p><p class="font-bold text-lg">${iconos[p.veredicto]||''} ${p.veredicto||'−'}</p><p class="text-zinc-500 text-xs mt-1">${p.razon||''}</p></div><div class="text-right"><p class="${ct} text-3xl font-bold">${c}%</p><p class="text-zinc-600 text-xs">confianza</p></div></div></div>`;}).join('');
    requestAnimationFrame(observeCards);
}

// ===== Analizar hoy =====
async function analizarHoy(sport,data,sel){
    if(!localStorage.getItem('groqKey')){showToast('Configura Groq',true);return;}
    let hoy,totalDia;
    if(sel){hoy=data;totalDia=data.length;}else{
        const tk=new Date().toLocaleDateString('es-CL',{timeZone:getTZ()});
        hoy=data.filter(r=>{const d=parseDate(r.date);return d&&getLocalDayKey(d)===tk;});
        if(!hoy.length){const dias=[...new Set(data.map(r=>{const d=parseDate(r.date);return d?getLocalDayKey(d):null;}).filter(Boolean))];if(dias.length)hoy=data.filter(r=>{const d=parseDate(r.date);return d&&getLocalDayKey(d)===dias[0];});}
        totalDia=hoy.length;hoy=hoy.slice(0,40);
    }
    if(sport!=='soccer'){showToast('Solo disponible para Fútbol',true);return;}
    if(!hoy.length){showToast('No hay partidos hoy',true);return;}
    const rd=document.getElementById('analisisHoyResult'),bt=document.getElementById('btnAnalizarHoy');
    bt.disabled=true;bt.textContent='⏳ Analizando...';
    rd.innerHTML=`<div class="flex items-center gap-3 p-4 bg-zinc-900 rounded-2xl border border-yellow-500/30"><div class="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full spinner"></div><p class="text-zinc-400 text-sm">Analizando ${hoy.length} partidos...</p></div>`;
    const lista=hoy.map((r,i)=>{
        const h=Math.round((parseFloat(r['1x2_h']||0))*100),d=Math.round((parseFloat(r['1x2_d']||0))*100),a=Math.round((parseFloat(r['1x2_a']||0))*100);
        const o25=Math.round((parseFloat(r['o_2.5']||0))*100),u25=Math.round((parseFloat(r['u_2.5']||0))*100),u35=Math.round((parseFloat(r['u_3.5']||0))*100);
        return(i+1)+'. '+(r.home||'?')+' vs '+(r.away||'?')+' ['+(r.league||'')+']\n   1X2 -> Local:'+h+'% Empate:'+d+'% Visita:'+a+'%\n   Goles -> Más2.5:'+o25+'% Menos2.5:'+u25+'% Menos3.5:'+u35+'%';
    }).join('\n\n');
    try{
        const texto=await groqCall('Eres analista experto. Analiza:\n\n'+lista+'\n\nPara CADA partido:\n---\nPartido: Local vs Visita\nVeredicto: resultado 1x2\nGoles: Over/Under\nConfianza: Alta/Media/Baja\nRazonamiento: 4-6 lineas\n---',4000);
        const partes=texto.split('---').filter(p=>p.trim()&&p.includes('Partido:'));
        const html=partes.map(p=>{const l=p.trim().split('\n').filter(x=>x.trim());const c=p.includes('Alta')?'border-green-500 bg-green-500/5':p.includes('Media')?'border-yellow-500 bg-yellow-500/5':'border-zinc-700 bg-zinc-900';return`<div class="card rounded-2xl p-4 mb-3 border ${c}">${l.map(x=>`<p class="text-sm mb-1">${x}</p>`).join('')}</div>`;}).join('');
        rd.innerHTML=`<p class="text-yellow-400 font-bold text-sm mb-3">🤖 ${partes.length} analizados${totalDia>40?' (de '+totalDia+')':''}</p>`+(html||`<p class="text-zinc-400 text-sm p-4 bg-zinc-900 rounded-2xl">${texto}</p>`);
        requestAnimationFrame(observeCards);
    }catch(e){rd.innerHTML=`<p class="text-red-400 text-sm p-4">Error: ${e.message}</p>`;}
    bt.disabled=false;bt.textContent='🔄 Re-analizar';
}

// ===== Fuentes =====
function renderFuentes() {
    document.getElementById('mainContent').innerHTML=`<div class="p-4 view-fade-enter"><p class="text-zinc-500 text-xs text-center mb-4 uppercase tracking-widest font-bold">Otras Fuentes</p><div class="space-y-3">${[{icon:'⛏️',name:'Betmines',desc:'Estadísticas y pronósticos',url:'https://betmines.com'},{icon:'📊',name:'Forebet',desc:'Predicciones matemáticas',url:'https://forebet.com'},{icon:'🔢',name:'AdamChoi',desc:'Datos históricos',url:'https://adamchoi.co.uk'},{icon:'⚡',name:'SofaScore',desc:'Resultados en vivo',url:'https://sofascore.com'}].map((s,i)=>`<a href="${s.url}" target="_blank" class="card flex items-center gap-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800 hover:border-zinc-600 transition" style="transition-delay:${i*0.08}s"><span class="text-2xl">${s.icon}</span><div><p class="font-bold">${s.name}</p><p class="text-zinc-500 text-xs">${s.desc}</p></div><span class="ml-auto text-zinc-600">→</span></a>`).join('')}</div><div class="mt-6"><button onclick="shareApp()" class="w-full py-4 bg-zinc-800 text-yellow-400 rounded-2xl font-bold hover:bg-zinc-700 transition">📤 Compartir App</button></div></div>`;
    requestAnimationFrame(observeCards);
}

// ===== Share =====
function shareApp() {
    const text = '🏆 Mira Pronos Camiloven — pronósticos deportivos con IA\nhttps://apex-athletics-pro.vercel.app';
    if (navigator.share) {
        navigator.share({ title:'Pronos Camiloven', text, url:'https://apex-athletics-pro.vercel.app' }).catch(()=>{});
    } else {
        navigator.clipboard.writeText(text).then(()=>showToast('📋 Link copiado')).catch(()=>showToast('No se pudo copiar', true));
    }
}

// ===== Notificaciones =====
function requestNotifPermission() {
    if (!('Notification' in window)) { showToast('Tu navegador no soporta notificaciones', true); return; }
    Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
            showToast('🔔 Notificaciones activadas');
            scheduleMatchNotifications();
        } else {
            showToast('Notificaciones bloqueadas', true);
        }
    });
}

function scheduleMatchNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const data = allData[currentSport] || [];
    const now = Date.now();
    data.forEach(row => {
        const date = parseDate(row.date);
        if (!date) return;
        const diff = date.getTime() - now;
        if (diff > 0 && diff < 86400000) { // próximas 24h
            const notifyAt = Math.max(diff - 1800000, 5000); // 30 min antes
            setTimeout(() => {
                new Notification('⚽ Partido próximo', {
                    body: `${row.home} vs ${row.away} empieza en 30 min`,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚽</text></svg>'
                });
            }, notifyAt);
        }
    });
}

// ===== Config =====
function renderConfig() {
    const tz = getActiveTZ();
    const tzLabel = userTimezone === 'chile' ? '🇨🇱 Chile (America/Santiago)' : `📱 Celular (${DETECTED_TZ})`;

    // Debug info de columnas
    let debugHTML = '';
    if (Object.keys(allData).length) {
        const cols = {};
        Object.entries(allData).forEach(([sport, rows]) => {
            if (rows.length > 0) cols[sport] = Object.keys(rows[0]).join(', ');
        });
        debugHTML = `<div class="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700 mt-2">
            <p class="text-xs text-yellow-400 font-bold mb-2">🔍 Columnas detectadas</p>
            ${Object.entries(cols).map(([s,c])=>`<p class="text-[10px] text-zinc-400 mb-1"><span class="text-yellow-400">${s}:</span> ${c}</p>`).join('')}
        </div>`;
    }

    document.getElementById('mainContent').innerHTML=`<div class="p-4 view-fade-enter"><h2 class="text-xl font-extrabold text-yellow-400 mb-4">⚙️ Configuración</h2><div class="bg-zinc-900 rounded-2xl p-4 mb-4 border border-yellow-500/30 space-y-4"><div><p class="text-xs text-zinc-500 mb-2 font-bold">🔑 GROQ API KEY</p><input type="password" id="inputGroq" placeholder="gsk_..." value="${localStorage.getItem('groqKey')||''}" class="w-full bg-zinc-800 text-white px-4 py-3 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 transition"></div><div><p class="text-xs text-zinc-500 mb-2 font-bold">🔑 GEMINI API KEY</p><input type="password" id="inputGemini" placeholder="AIza..." value="${localStorage.getItem('geminiKey')||''}" class="w-full bg-zinc-800 text-white px-4 py-3 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 transition"></div><div><p class="text-xs text-zinc-500 mb-2 font-bold">🌍 ZONA HORARIA</p><p class="text-xs text-zinc-400 mb-2">Actual: ${tzLabel}</p><select id="inputTimezone" class="w-full bg-zinc-800 text-white px-4 py-3 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 transition"><option value="auto" ${userTimezone==='auto'?'selected':''}>📱 Hora del celular (${DETECTED_TZ})</option><option value="chile" ${userTimezone==='chile'?'selected':''}>🇨🇱 Hora de Chile (America/Santiago)</option></select></div><div><p class="text-xs text-zinc-500 mb-2 font-bold">⚽ API-SPORTS KEY (resultados)</p><input type="password" id="inputSports" placeholder="Tu clave de api-sports.io" value="${localStorage.getItem('sportsKey')||''}" class="w-full bg-zinc-800 text-white px-4 py-3 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 transition"></div>${debugHTML}<div class="flex items-center justify-between bg-zinc-800/50 rounded-xl p-3 border border-zinc-700"><div><p class="text-xs text-yellow-400 font-bold mb-1">🎨 Modo Claro</p><p class="text-xs text-zinc-500">Cambia la apariencia</p></div><div class="theme-toggle" onclick="toggleTheme()"><div class="toggle-dot"></div></div></div></div><button onclick="saveConfig()" class="btn-glow w-full py-5 bg-yellow-400 text-black font-extrabold rounded-3xl text-xl hover:bg-yellow-300 transition">💾 Guardar</button></div>`;
}

function saveConfig() {
    localStorage.setItem('groqKey',document.getElementById('inputGroq').value.trim());
    localStorage.setItem('geminiKey',document.getElementById('inputGemini').value.trim());
    localStorage.setItem('sportsKey',document.getElementById('inputSports').value.trim());
    const newTz = document.getElementById('inputTimezone').value;
    if (newTz !== userTimezone) {
        userTimezone = newTz;
        localStorage.setItem('userTimezone', userTimezone);
        resultsCache = {};
    }
    showToast('✅ Configuración guardada');
    switchView('pronos');
}

// ===== Word =====
function renderWord() {
    const container=document.getElementById('mainContent');
    const sports=Object.keys(allData).length?Object.keys(allData):['soccer','tennis','basketball','hockey','volleyball','handball'];
    let sel='<select id="wordSportSelect" class="bg-zinc-800 text-white px-4 py-3 rounded-2xl text-sm border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-yellow-400">';
    sports.forEach(s=>{sel+=`<option value="${s}">${SPORT_ICONS[s]||'🏟'} ${s.charAt(0).toUpperCase()+s.slice(1)}${wordContents[s]?' ✅':''}</option>`;});sel+='</select>';
    container.innerHTML=`<div class="p-4 view-fade-enter"><div class="bg-zinc-900 rounded-2xl p-6 mb-4 border border-zinc-800"><div class="flex flex-wrap gap-4 items-center mb-4"><div class="flex items-center gap-2"><span class="text-zinc-400 text-sm">Deporte:</span>${sel}</div><button id="wordUploadBtn" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-2xl font-bold text-white text-sm transition">📂 Cargar Word</button><input type="file" id="wordFileInput" accept=".docx" style="display:none;"><span id="wordFileName" class="text-zinc-400 text-sm">Ningún archivo</span><span id="wordStatus" class="text-zinc-500 text-xs"></span></div></div><div id="wordContent" class="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 min-h-[300px] text-zinc-300 text-sm leading-relaxed"><div class="flex flex-col items-center justify-center h-64 text-zinc-600"><span class="text-5xl mb-4">📄</span><p>Selecciona un deporte y carga su archivo Word</p></div></div></div>`;
    const select=document.getElementById('wordSportSelect');
    select.addEventListener('change',function(){const s=this.value;if(wordContents[s]){document.getElementById('wordContent').innerHTML=wordContents[s];document.getElementById('wordFileName').innerHTML=`📄 ${s} (cargado)`;}else{document.getElementById('wordContent').innerHTML=`<div class="flex flex-col items-center justify-center h-64 text-zinc-600"><span class="text-5xl mb-4">📄</span><p>No hay archivo para ${s}</p></div>`;}document.getElementById('wordStatus').innerHTML='';});
    document.getElementById('wordUploadBtn').onclick=()=>document.getElementById('wordFileInput').click();
    document.getElementById('wordFileInput').onchange=function(e){const file=e.target.files[0];if(!file)return;const cs=select.value;document.getElementById('wordStatus').innerHTML='⏳ Procesando...';const r=new FileReader();r.onload=function(ev){mammoth.convertToHtml({arrayBuffer:ev.target.result}).then(res=>{wordContents[cs]=res.value;document.getElementById('wordContent').innerHTML=res.value;document.getElementById('wordFileName').innerHTML=`📄 ${file.name} (${cs})`;document.getElementById('wordStatus').innerHTML='✅';const opt=select.querySelector(`option[value="${cs}"]`);if(opt){const l=opt.textContent.replace(' ✅','');opt.textContent=l+' ✅';}}).catch(err=>{document.getElementById('wordContent').innerHTML=`<div class="text-red-400 p-8 text-center">❌ ${err.message}</div>`;});};r.readAsArrayBuffer(file);};
    const init=select?select.value:(sports[0]||'soccer');
    if(wordContents[init]){document.getElementById('wordContent').innerHTML=wordContents[init];document.getElementById('wordFileName').innerHTML=`📄 ${init} (cargado)`;}
}

// ===== Init =====
window.onload=()=>{
    authToken=localStorage.getItem('authToken')||null;
    userTimezone=localStorage.getItem('userTimezone')||'auto';
    // Aplicar tema guardado
    if (currentTheme === 'light') document.body.classList.add('light-mode');
    try {
        const s = localStorage.getItem('apexData');
        if (s) {
            allData = JSON.parse(s);
            if (typeof allData !== 'object' || Array.isArray(allData)) {
                allData = {};
                localStorage.removeItem('apexData');
            }
        }
    } catch (err) {
        console.error('Error cargando datos guardados:', err);
        allData = {};
        localStorage.removeItem('apexData');
    }
    // Mostrar resumen diario si hay datos
    if (Object.keys(allData).length > 0) showDailySummary();
};

// ===== Theme Toggle =====
function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', currentTheme);
    document.body.classList.toggle('light-mode');
    playClick();
}

// ===== Daily Summary =====
function showDailySummary() {
    const data = allData[currentSport || Object.keys(allData)[0]] || [];
    if (!data.length) return;
    const todayKey = new Date().toLocaleDateString('es-CL', { timeZone: getTZ() });
    const todayMatches = data.filter(r => { const d = parseDate(r.date); return d && getLocalDayKey(d) === todayKey; });
    if (!todayMatches.length) return;
    // Guardar para mostrar después de goToNext
    window._dailyMatches = todayMatches;
}

function renderDailySummary() {
    const matches = window._dailyMatches;
    if (!matches || !matches.length) return '';
    const leagues = [...new Set(matches.map(r => r.league || 'Sin liga'))];
    return `<div class="daily-summary">
        <div class="flex items-center gap-2 mb-2">
            <span class="text-lg">📅</span>
            <p class="font-extrabold text-sm">Resumen de hoy</p>
        </div>
        <p class="text-xs text-zinc-400 mb-2">${matches.length} partidos en ${leagues.length} liga(s)</p>
        <div class="flex flex-wrap gap-1">
            ${leagues.slice(0,5).map(l => `<span class="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-400">${l}</span>`).join('')}
            ${leagues.length > 5 ? `<span class="text-[10px] text-zinc-500">+${leagues.length - 5} más</span>` : ''}
        </div>
    </div>`;
}

// ===== Auto-refresh resultados en vivo =====
function startAutoRefresh(sport) {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        if (currentView === 'resultados' && currentSport === sport) {
            resultsCache = {}; // Limpiar cache para datos frescos
            renderResultados(sport);
        }
    }, 60000); // Cada 60 segundos
}

// ===== H2H (Head to Head) =====
async function showH2H(home, away) {
    const apiKey = localStorage.getItem('sportsKey') || '';
    if (!apiKey) { showToast('Configura API-SPORTS KEY en Config', true); return; }

    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'h2h-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `<div class="h2h-popup">
        <div class="flex justify-between items-center mb-4">
            <p class="font-extrabold text-sm">⚔️ ${home} vs ${away}</p>
            <button onclick="this.closest('.h2h-overlay').remove()" class="text-zinc-500 text-xl">✕</button>
        </div>
        <div class="flex items-center gap-3 p-4 bg-zinc-800 rounded-xl">
            <div class="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full spinner"></div>
            <p class="text-zinc-400 text-sm">Buscando historial...</p>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    try {
        // Buscar IDs de equipos
        const searchRes = await fetch(`https://v3.football.api-sports.io/teams?search=${encodeURIComponent(home)}`, { headers: { 'x-apisports-key': apiKey } });
        const searchData = await searchRes.json();
        const homeTeam = searchData.response?.[0]?.team;

        const searchRes2 = await fetch(`https://v3.football.api-sports.io/teams?search=${encodeURIComponent(away)}`, { headers: { 'x-apisports-key': apiKey } });
        const searchData2 = await searchRes2.json();
        const awayTeam = searchData2.response?.[0]?.team;

        if (!homeTeam || !awayTeam) {
            overlay.querySelector('.h2h-popup').innerHTML = `<p class="text-zinc-400 text-center p-4">No se encontró historial H2H</p>`;
            return;
        }

        // Buscar H2H
        const h2hRes = await fetch(`https://v3.football.api-sports.io/fixtures/headtohead?h2h=${homeTeam.id}-${awayTeam.id}&last=5`, { headers: { 'x-apisports-key': apiKey } });
        const h2hData = await h2hRes.json();
        const fixtures = h2hData.response || [];

        if (!fixtures.length) {
            overlay.querySelector('.h2h-popup').innerHTML = `<div class="flex justify-between items-center mb-4"><p class="font-extrabold text-sm">⚔️ ${home} vs ${away}</p><button onclick="this.closest('.h2h-overlay').remove()" class="text-zinc-500 text-xl">✕</button></div><p class="text-zinc-400 text-center p-4">Sin enfrentamientos previos</p>`;
            return;
        }

        let homeWins = 0, draws = 0, awayWins = 0;
        const matchesHTML = fixtures.map(f => {
            const gH = f.goals?.home ?? '?';
            const gA = f.goals?.away ?? '?';
            const date = f.fixture?.date ? new Date(f.fixture.date).toLocaleDateString('es-CL', { timeZone: getTZ() }) : '';
            const league = f.league?.name || '';
            const isHomeWinner = typeof gH === 'number' && typeof gA === 'number' && gH > gA;
            const isDraw = typeof gH === 'number' && typeof gA === 'number' && gH === gA;
            const isAwayWinner = typeof gH === 'number' && typeof gA === 'number' && gA > gH;

            if (f.teams?.home?.name === home) {
                if (isHomeWinner) homeWins++;
                else if (isDraw) draws++;
                else awayWins++;
            } else {
                if (isAwayWinner) homeWins++;
                else if (isDraw) draws++;
                else awayWins++;
            }

            return `<div class="flex items-center justify-between py-2 border-b border-zinc-800 text-xs">
                <div class="flex-1">
                    <p class="font-bold">${f.teams?.home?.name || '?'} <span class="text-zinc-500">${gH}-${gA}</span> ${f.teams?.away?.name || '?'}</p>
                    <p class="text-zinc-500">${league} · ${date}</p>
                </div>
            </div>`;
        }).join('');

        const total = fixtures.length;
        const hPct = Math.round(homeWins / total * 100);
        const dPct = Math.round(draws / total * 100);
        const aPct = Math.round(awayWins / total * 100);

        overlay.querySelector('.h2h-popup').innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <p class="font-extrabold text-sm">⚔️ ${home} vs ${away}</p>
                <button onclick="this.closest('.h2h-overlay').remove()" class="text-zinc-500 text-xl">✕</button>
            </div>
            <div class="grid grid-cols-3 gap-2 mb-4">
                <div class="text-center bg-green-500/10 rounded-xl p-2 border border-green-500/20">
                    <p class="text-lg font-bold text-green-400">${homeWins}</p>
                    <p class="text-[9px] text-zinc-400">${home}</p>
                </div>
                <div class="text-center bg-yellow-500/10 rounded-xl p-2 border border-yellow-500/20">
                    <p class="text-lg font-bold text-yellow-400">${draws}</p>
                    <p class="text-[9px] text-zinc-400">Empates</p>
                </div>
                <div class="text-center bg-blue-500/10 rounded-xl p-2 border border-blue-500/20">
                    <p class="text-lg font-bold text-blue-400">${awayWins}</p>
                    <p class="text-[9px] text-zinc-400">${away}</p>
                </div>
            </div>
            <p class="text-xs text-zinc-500 mb-2 font-bold">Últimos ${total} enfrentamientos</p>
            ${matchesHTML}
        `;
    } catch (err) {
        overlay.querySelector('.h2h-popup').innerHTML = `<p class="text-red-400 text-center p-4">Error: ${err.message}</p>`;
    }
}

// ===== Standings (Tabla de posiciones) =====
async function renderStandings() {
    const container = document.getElementById('mainContent');
    const apiKey = localStorage.getItem('sportsKey') || '';
    if (!apiKey) {
        container.innerHTML = `<div class="p-4 text-center mt-16"><p class="text-zinc-400 mb-2">Necesitás la API-SPORTS KEY</p><p class="text-zinc-600 text-xs">Configurala en ⚙️ Config</p></div>`;
        return;
    }

    // Buscar ligas únicas del Excel
    const allLeagues = [];
    Object.values(allData).forEach(rows => {
        rows.forEach(r => { if (r.league) allLeagues.push(r.league); });
    });
    const uniqueLeagues = [...new Set(allLeagues)].slice(0, 10);

    if (!uniqueLeagues.length) {
        container.innerHTML = `<div class="p-4 text-center mt-16"><p class="text-zinc-400">Sin ligas para mostrar</p></div>`;
        return;
    }

    container.innerHTML = `<div class="p-4 view-fade-enter">
        <h2 class="text-xl font-extrabold text-yellow-400 mb-4">🏆 Tabla de Posiciones</h2>
        <div class="flex gap-2 overflow-x-auto pb-3 mb-4" id="standingsTabs">
            ${uniqueLeagues.map((l, i) => `<button onclick="loadStandings('${l.replace(/'/g,"\\'")}', this)" class="filter-chip ${i === 0 ? 'active' : ''}">${l}</button>`).join('')}
        </div>
        <div id="standingsContent">
            <div class="loading-overlay"><div class="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full spinner"></div><p class="text-zinc-400 text-sm">Cargando tabla...</p></div>
        </div>
    </div>`;

    // Cargar la primera liga
    loadStandings(uniqueLeagues[0], document.querySelector('#standingsTabs .filter-chip'));
}

async function loadStandings(leagueName, chip) {
    // Actualizar chips
    document.querySelectorAll('#standingsTabs .filter-chip').forEach(c => c.classList.remove('active'));
    if (chip) chip.classList.add('active');

    const container = document.getElementById('standingsContent');
    const apiKey = localStorage.getItem('sportsKey') || '';
    container.innerHTML = `<div class="loading-overlay"><div class="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full spinner"></div></div>`;

    try {
        // Buscar la liga en api-sports
        const searchRes = await fetch(`https://v3.football.api-sports.io/leagues?search=${encodeURIComponent(leagueName.split(' - ')[0])}`, { headers: { 'x-apisports-key': apiKey } });
        const searchData = await searchRes.json();
        const league = searchData.response?.[0];

        if (!league) {
            container.innerHTML = `<p class="text-zinc-500 text-center p-4">No se encontró la liga "${leagueName}"</p>`;
            return;
        }

        const season = new Date().getFullYear();
        const standRes = await fetch(`https://v3.football.api-sports.io/standings?league=${league.league.id}&season=${season}`, { headers: { 'x-apisports-key': apiKey } });
        const standData = await standRes.json();
        const standings = standData.response?.[0]?.league?.standings?.[0] || [];

        if (!standings.length) {
            container.innerHTML = `<p class="text-zinc-500 text-center p-4">Sin standings para ${leagueName}</p>`;
            return;
        }

        container.innerHTML = `<div class="overflow-x-auto">
            <table class="standings-table">
                <thead><tr>
                    <th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Pts</th>
                </tr></thead>
                <tbody>
                    ${standings.map(s => {
                        const pos = s.rank;
                        const posCls = pos <= 4 ? 'top' : pos <= 10 ? 'mid' : 'bottom';
                        return `<tr>
                            <td class="standings-pos ${posCls}">${pos}</td>
                            <td class="font-bold text-xs">${s.team?.name || '?'}</td>
                            <td>${s.all?.played || 0}</td>
                            <td>${s.all?.win || 0}</td>
                            <td>${s.all?.draw || 0}</td>
                            <td>${s.all?.lose || 0}</td>
                            <td>${s.all?.goals?.for || 0}</td>
                            <td>${s.all?.goals?.against || 0}</td>
                            <td class="font-extrabold">${s.points || 0}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-center p-4">Error: ${err.message}</p>`;
    }
}
