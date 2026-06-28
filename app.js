/* ===== Apex Athletics Pro — App Principal ===== */

// ===== Configuración =====
const SPORT_ICONS = {
    soccer: "⚽", tennis: "🎾", basketball: "🏀",
    hockey: "🏒", volleyball: "🏐", handball: "🤾"
};
const LEAGUE_COLORS = [
    '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444',
    '#f97316', '#06b6d4', '#84cc16', '#ec4899', '#14b8a6'
];

// ===== Estado global =====
let allData = {};
let currentSport = null;
let currentView = 'pronos';
let leagueColorMap = {};
let resultsCache = {};
let authToken = null; // Token de autenticación del backend
let betminesImgs = [];
let forebetImgs = [];
let wordContents = {};
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// ===== Utilidades =====

/** Muestra un toast temporal en pantalla */
function showToast(message, isError = false) {
    // Eliminar toasts anteriores
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' toast-error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

/** Parsea fecha en formato DD.MM.YYYY HH:MM */
function parseDate(str) {
    if (!str) return null;
    const m = String(str).trim().match(/^(\d+)\.(\d+)\.(\d{4})(?:\s+(\d+):(\d+))?/);
    if (!m) return null;
    return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] || 0, +m[5] || 0));
}

function getLocalTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString('es-CL', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: USER_TZ
    });
}

function getLocalDayKey(date) {
    if (!date) return 'sin-fecha';
    return date.toLocaleDateString('es-CL', { timeZone: USER_TZ });
}

function getLocalDayLabel(date) {
    if (!date) return 'Sin fecha';
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const opts = { timeZone: USER_TZ, weekday: 'short', day: 'numeric', month: 'short' };
    const todayKey = today.toLocaleDateString('es-CL', { timeZone: USER_TZ });
    const tomorrowKey = tomorrow.toLocaleDateString('es-CL', { timeZone: USER_TZ });
    const dateKey = date.toLocaleDateString('es-CL', { timeZone: USER_TZ });
    const label = date.toLocaleDateString('es-CL', opts);
    if (dateKey === todayKey) return '📅 Hoy — ' + label;
    if (dateKey === tomorrowKey) return '📅 Mañana — ' + label;
    return '📅 ' + label;
}

function pct(val) {
    return Math.round((parseFloat(val) || 0) * 100);
}

function pill(value, label, colorClass) {
    return `<div class="stat-pill bg-zinc-800">
        <div class="${colorClass} text-lg font-bold">${value}</div>
        <div class="text-zinc-500 text-xs mt-0.5">${label}</div>
    </div>`;
}

function normalize(str) {
    return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// ===== Autenticación con backend =====

async function authenticate(password) {
    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Error de autenticación');
        }

        const data = await res.json();
        authToken = data.token;
        localStorage.setItem('authToken', authToken);
        return true;
    } catch (err) {
        console.error('Auth error:', err);
        throw err;
    }
}

/** Verifica si el token guardado sigue válido */
function isTokenValid() {
    if (!authToken) return false;
    try {
        const data = JSON.parse(atob(authToken));
        return data.auth && data.exp > Date.now();
    } catch {
        return false;
    }
}

// ===== Navegación =====

function goToNext() {
    document.getElementById('introScreen').style.display = 'none';
    if (isTokenValid() && Object.keys(allData).length > 0) {
        showApp(Object.keys(allData));
    } else {
        document.getElementById('uploadScreen').classList.remove('hidden');
    }
}

async function checkPassword() {
    const input = document.getElementById('passwordInput');
    const v = input.value.trim();

    if (!v) {
        showToast('Ingresa la contraseña', true);
        return;
    }

    try {
        await authenticate(v);
        showToast('✅ Acceso concedido');
        loadExcel();
    } catch (err) {
        showToast('❌ ' + (err.message || 'Clave incorrecta'), true);
        input.value = '';
        input.focus();
    }
}

function goToUpload() {
    document.getElementById('appScreen').classList.add('hidden');
    document.getElementById('uploadScreen').classList.remove('hidden');
    document.getElementById('passwordInput').value = '';
}

// ===== Carga de Excel =====

function loadExcel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        // Validar tamaño (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            showToast('El archivo es demasiado grande (máx 10MB)', true);
            return;
        }

        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
                allData = {};

                wb.SheetNames.forEach(name => {
                    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name]);
                    if (rows.length > 0) {
                        // Validar que al menos tenga columnas esperadas
                        const firstRow = rows[0];
                        const hasRequired = firstRow.home || firstRow.Home ||
                            firstRow.equipo || firstRow.Equipo;
                        if (!hasRequired) {
                            console.warn(`Hoja "${name}": no se encontró columna "home" o "equipo"`);
                        }
                        allData[name] = rows;
                    }
                });

                if (Object.keys(allData).length === 0) {
                    showToast('El archivo no tiene datos válidos', true);
                    return;
                }

                localStorage.setItem('apexData', JSON.stringify(allData));
                resultsCache = {};
                showToast(`✅ ${Object.keys(allData).length} deporte(s) cargado(s)`);
                showApp(Object.keys(allData));
            } catch (err) {
                console.error('Error parsing Excel:', err);
                showToast('Error al leer el archivo Excel', true);
            }
        };
        reader.onerror = () => showToast('Error al leer el archivo', true);
        reader.readAsArrayBuffer(file);
    };
    input.click();
}

// ===== App principal =====

function showApp(sports) {
    document.getElementById('uploadScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    buildLeagueColors(sports);
    buildTabs(sports);
    switchSport(sports[0]);
}

function buildLeagueColors(sports) {
    leagueColorMap = {};
    let i = 0;
    sports.forEach(sport => {
        (allData[sport] || []).forEach(row => {
            const lg = row.league || 'Sin liga';
            if (!leagueColorMap[lg]) {
                leagueColorMap[lg] = LEAGUE_COLORS[i % LEAGUE_COLORS.length];
                i++;
            }
        });
    });
}

function buildTabs(sports) {
    document.getElementById('sportTabs').innerHTML = sports.map(s =>
        `<button id="tab-${s}" onclick="switchSport('${s}')"
            class="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold bg-zinc-800 text-zinc-300">
            ${SPORT_ICONS[s] || '🏟'} ${s.charAt(0).toUpperCase() + s.slice(1)}
            <span class="ml-1 text-xs opacity-60">${allData[s]?.length || 0}</span>
        </button>`
    ).join('');
}

function switchSport(sport) {
    if (currentSport) {
        const p = document.getElementById('tab-' + currentSport);
        if (p) p.classList.remove('tab-active');
    }
    currentSport = sport;
    const c = document.getElementById('tab-' + sport);
    if (c) c.classList.add('tab-active');

    if (currentView === 'pronos') renderPronos(sport, allData[sport] || []);
    else if (currentView === 'analisis') renderAnalisis();
    else if (currentView === 'word') renderWord();
    else if (currentView === 'fuentes') renderFuentes();
    else if (currentView === 'config') renderConfig();
    window.scrollTo(0, 0);
}

function switchView(view) {
    currentView = view;
    const views = ['pronos', 'resultados', 'analisis', 'fuentes', 'config', 'word'];
    views.forEach(v => {
        const btn = document.getElementById('nav' + v.charAt(0).toUpperCase() + v.slice(1));
        if (btn) {
            btn.classList.toggle('active', v === view);
            btn.classList.toggle('text-yellow-400', v === view);
            btn.classList.toggle('text-zinc-400', v !== view);
        }
    });

    const st = document.getElementById('sportTabs').parentElement;
    if (view === 'pronos') {
        st.style.display = '';
        if (currentSport) renderPronos(currentSport, allData[currentSport] || []);
        else if (Object.keys(allData).length > 0) switchSport(Object.keys(allData)[0]);
    } else {
        st.style.display = 'none';
        if (view === 'resultados' && currentSport) renderResultados(currentSport);
        else if (view === 'analisis') renderAnalisis();
        else if (view === 'fuentes') renderFuentes();
        else if (view === 'config') renderConfig();
        else if (view === 'word') renderWord();
    }
    window.scrollTo(0, 0);
}

// ===== Vista Pronos =====

function renderPronos(sport, data) {
    const container = document.getElementById('mainContent');
    container.innerHTML = '';

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-zinc-500 text-center mt-16">Sin datos</p>';
        return;
    }

    // Filtrar partidos de hoy (o primer día disponible)
    const todayKey = new Date().toLocaleDateString('es-CL', { timeZone: USER_TZ });
    let matches = data.filter(r => {
        const d = parseDate(r.date);
        return d && getLocalDayKey(d) === todayKey;
    });

    if (!matches.length) {
        const days = [...new Set(data.map(r => {
            const d = parseDate(r.date);
            return d ? getLocalDayKey(d) : null;
        }).filter(Boolean))];
        if (days.length) {
            matches = data.filter(r => {
                const d = parseDate(r.date);
                return d && getLocalDayKey(d) === days[0];
            });
        }
    }

    // Botón de análisis IA (solo fútbol)
    const matchCount = matches.length;
    if (matchCount > 0 && sport === 'soccer') {
        const btnWrap = document.createElement('div');
        btnWrap.className = 'px-4 pt-4';
        btnWrap.innerHTML = `
            <button id="btnAnalizarHoy"
                class="w-full py-4 bg-yellow-400 text-black font-bold rounded-2xl text-base">
                🤖 Analizar Hoy con IA (${matchCount} partidos)
            </button>
            <div id="analisisHoyResult" class="mt-3"></div>`;
        container.appendChild(btnWrap);

        document.getElementById('btnAnalizarHoy').onclick = function () {
            const checks = document.querySelectorAll('.match-check:checked');
            const fullData = allData[sport] || data;
            let seleccion = data;
            if (checks.length > 0) {
                const ids = Array.from(checks).map(ch => ch.getAttribute('data-match-id'));
                seleccion = fullData.filter(r =>
                    ids.includes((r.home || '') + '|' + (r.away || '') + '|' + (r.date || ''))
                );
            }
            analizarHoy(sport, seleccion, checks.length > 0);
        };

        container.addEventListener('change', function (e) {
            if (!e.target.classList.contains('match-check')) return;
            const n = document.querySelectorAll('.match-check:checked').length;
            const btn = document.getElementById('btnAnalizarHoy');
            if (btn) {
                btn.innerHTML = n > 0
                    ? `🤖 Analizar Seleccionados (${n})`
                    : `🤖 Analizar Hoy con IA (${matchCount} partidos)`;
            }
        });
    }

    // Ordenar y agrupar por día y liga
    const parsed = data.map(row => ({ ...row, _date: parseDate(row.date) }));
    parsed.sort((a, b) => {
        const da = a._date?.getTime() || 0;
        const db = b._date?.getTime() || 0;
        return da !== db ? da - db : (a.league || '').localeCompare(b.league || '');
    });

    const byDay = {};
    parsed.forEach(row => {
        const dk = getLocalDayKey(row._date);
        if (!byDay[dk]) byDay[dk] = { label: getLocalDayLabel(row._date), leagues: {} };
        const lg = row.league || 'Sin liga';
        if (!byDay[dk].leagues[lg]) byDay[dk].leagues[lg] = [];
        byDay[dk].leagues[lg].push(row);
    });

    const wrap = document.createElement('div');
    wrap.className = 'p-4';

    Object.values(byDay).forEach(dayGroup => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day-header rounded-xl px-4 py-3 mb-4 mt-2';
        dayDiv.innerHTML = `<span class="font-bold text-yellow-400">${dayGroup.label}</span>`;
        wrap.appendChild(dayDiv);

        Object.entries(dayGroup.leagues).forEach(([leagueName, leagueMatches]) => {
            const color = leagueColorMap[leagueName] || '#eab308';
            const lgDiv = document.createElement('div');
            lgDiv.className = 'flex items-center gap-2 mb-3 ml-1 px-2';
            lgDiv.innerHTML = `
                <span class="league-badge"
                    style="background:${color}22;color:${color};border:1px solid ${color}44">
                    ${leagueName}
                </span>
                <span class="text-zinc-600 text-xs">${leagueMatches.length} partidos</span>`;
            wrap.appendChild(lgDiv);

            leagueMatches.forEach(row => {
                const mid = (row.home || '') + '|' + (row.away || '') + '|' + (row.date || '');
                wrap.appendChild(buildCard(sport, row, color, mid));
            });
        });
    });

    container.appendChild(wrap);
}

function buildCard(sport, row, leagueColor, matchId) {
    const div = document.createElement('div');
    div.className = 'card bg-zinc-900 rounded-2xl p-4 mb-3 border border-zinc-800';
    const timeStr = getLocalTime(row._date);
    const h = pct(row['1x2_h']), a = pct(row['1x2_a']);
    let statsHTML = '';

    if (sport === 'soccer') {
        const d = pct(row['1x2_d']),
            o15 = pct(row['o_1.5']),
            o25 = pct(row['o_2.5']),
            u25 = pct(row['u_2.5']),
            u35 = pct(row['u_3.5']);
        const best = Math.max(u25, u35);
        const isBest = best > 55;
        if (isBest) div.classList.add('best');

        statsHTML = `
            <div class="grid grid-cols-3 gap-2 mt-3">
                ${pill(h + '%', 'Local', 'text-yellow-400')}
                ${pill(d + '%', 'Empate', 'text-yellow-400')}
                ${pill(a + '%', 'Visita', 'text-yellow-400')}
            </div>
            <div class="grid grid-cols-4 gap-2 mt-2">
                ${pill(o15 + '%', 'O 1.5', 'text-emerald-400')}
                ${pill(o25 + '%', 'O 2.5', 'text-emerald-400')}
                ${pill(u25 + '%', 'U 2.5', u25 === best && isBest ? 'text-green-300 font-bold' : 'text-sky-400')}
                ${pill(u35 + '%', 'U 3.5', u35 === best && isBest ? 'text-green-300 font-bold' : 'text-sky-400')}
            </div>`;
    } else if (sport === 'tennis') {
        const o25 = pct(row['o_2.5']), u25 = pct(row['u_2.5']);
        statsHTML = `
            <div class="grid grid-cols-2 gap-2 mt-3">
                ${pill(h + '%', 'Local', 'text-yellow-400')}
                ${pill(a + '%', 'Visita', 'text-yellow-400')}
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2">
                ${pill(o25 + '%', 'O 2.5 sets', 'text-emerald-400')}
                ${pill(u25 + '%', 'U 2.5 sets', 'text-sky-400')}
            </div>`;
    } else {
        statsHTML = `
            <div class="grid grid-cols-2 gap-2 mt-3">
                ${pill(h + '%', 'Local', 'text-yellow-400')}
                ${pill(a + '%', 'Visita', 'text-yellow-400')}
            </div>`;
    }

    div.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-start gap-2 flex-1 pr-2">
                ${sport === 'soccer'
            ? `<input type="checkbox" class="match-check mt-1 w-5 h-5 accent-yellow-400 flex-shrink-0"
                       data-match-id="${matchId}">`
            : ''}
                <p class="font-bold text-sm leading-tight">
                    ${row.home || '?'} <span class="text-zinc-500">vs</span> ${row.away || '?'}
                </p>
            </div>
            ${timeStr
            ? `<span class="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0"
                       style="background:${leagueColor}22;color:${leagueColor}">${timeStr}</span>`
            : ''}
        </div>
        ${statsHTML}`;

    return div;
}

// ===== API de resultados (a través del proxy seguro) =====

async function fetchRealResults(sport, dates) {
    if (!authToken) {
        showToast('No autenticado. Recarga la página.', true);
        return [];
    }

    if (!dates || !dates.length) return [];

    try {
        const url = `/api/sports-proxy?sport=${encodeURIComponent(sport)}&date=${encodeURIComponent(dates[0])}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!res.ok) {
            if (res.status === 401) {
                showToast('Sesión expirada. Vuelve a ingresar la clave.', true);
                authToken = null;
                localStorage.removeItem('authToken');
                return [];
            }
            throw new Error(`Error del servidor: ${res.status}`);
        }

        const data = await res.json();
        return data.response || [];
    } catch (err) {
        console.error('Error fetching results:', err);
        showToast('Error al obtener resultados', true);
        return [];
    }
}

function findMatch(row, apiGames) {
    const h = normalize(row.home), a = normalize(row.away);
    for (const g of apiGames) {
        const gh = normalize(g.teams?.home?.name || '');
        const ga = normalize(g.teams?.away?.name || '');
        if ((gh.includes(h) || h.includes(gh)) && (ga.includes(a) || a.includes(ga))) {
            return g;
        }
    }
    return null;
}

// ===== Vista Resultados =====

async function renderResultados(sport) {
    const container = document.getElementById('mainContent');
    const data = allData[sport] || [];

    if (!data.length) {
        container.innerHTML = '<p class="text-zinc-500 text-center mt-16">Sin datos</p>';
        return;
    }

    container.innerHTML = `
        <div class="loading-overlay">
            <div class="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full spinner"></div>
            <p class="text-zinc-400">Buscando resultados...</p>
        </div>`;

    const cacheKey = sport + '_' + (data[0]?.date || '');
    if (resultsCache[cacheKey]) {
        renderResultadosUI(sport, data, resultsCache[cacheKey]);
        return;
    }

    const dates = [...new Set(data.slice(0, 20).map(r => {
        const m = String(r.date || '').match(/(\d+)\.(\d+)\.(\d{4})/);
        return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '';
    }).filter(Boolean))];

    const apiGames = await fetchRealResults(sport, dates);
    const resultados = data.slice(0, 20).map(row => {
        const g = findMatch(row, apiGames);
        if (!g) return { marcador: '?', estado: 'pendiente' };

        const sc = sport === 'soccer' ? g.goals : g.scores;
        const score = sport === 'soccer'
            ? (sc?.home !== null && sc?.away !== null ? sc.home + '-' + sc.away : null)
            : (sc?.home?.total !== undefined ? sc.home.total + '-' + sc.away.total : null);

        const finished = g.fixture?.status?.short === 'FT' || g.status?.short === 'FT';
        return {
            marcador: score || '?',
            estado: finished && score ? 'finalizado' : 'pendiente'
        };
    });

    resultsCache[cacheKey] = resultados;
    renderResultadosUI(sport, data, resultados);
}

function renderResultadosUI(sport, data, resultados) {
    const container = document.getElementById('mainContent');
    container.innerHTML = '';

    let aciertos = 0, errores = 0, pendientes = 0;
    const wrap = document.createElement('div');
    wrap.className = 'p-4';

    const cards = data.slice(0, 20).map((row, i) => {
        const res = resultados[i] || { marcador: '?', estado: 'pendiente' };
        const finalizado = res.estado === 'finalizado' && res.marcador !== '?';
        let acierto = null, pronostico = '';

        if (finalizado) {
            const parts = res.marcador.split('-').map(Number);
            const g1 = parts[0] || 0, g2 = parts[1] || 0;
            const ganador = g1 > g2 ? 'local' : g2 > g1 ? 'visita' : 'empate';
            const probH = parseFloat(row['1x2_h'] || 0);
            const probD = parseFloat(row['1x2_d'] || 0);
            const probA = parseFloat(row['1x2_a'] || 0);
            const maxProb = Math.max(probH, probD || 0, probA);
            let pg = maxProb === probH ? 'local' : maxProb === probD ? 'empate' : 'visita';
            if (sport !== 'soccer' && !row['1x2_d']) pg = probH > probA ? 'local' : 'visita';
            acierto = pg === ganador;
            pronostico = 'Pronó: ' + (pg === 'local' ? row.home : pg === 'visita' ? row.away : 'Empate');
        }

        if (acierto === true) aciertos++;
        else if (acierto === false) errores++;
        else pendientes++;

        const color = leagueColorMap[row.league || ''] || '#eab308';
        const timeStr = getLocalTime(parseDate(row.date));

        return `
            <div class="card bg-zinc-900 rounded-2xl p-4 mb-3 border ${acierto === true ? 'border-green-500' : acierto === false ? 'border-red-500' : 'border-zinc-800'}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1 pr-2">
                        <p class="font-bold text-sm">${row.home || '?'} <span class="text-zinc-500">vs</span> ${row.away || '?'}</p>
                        <p class="text-xs mt-0.5" style="color:${color}">${row.league || ''}</p>
                    </div>
                    <div class="text-right flex-shrink-0">
                        ${timeStr ? `<p class="text-xs text-zinc-500">${timeStr}</p>` : ''}
                        <p class="text-2xl font-bold mt-1 ${finalizado ? 'text-white' : 'text-zinc-600'}">${res.marcador}</p>
                    </div>
                </div>
                <div class="flex justify-between items-center mt-2 pt-2 border-t border-zinc-800">
                    <span class="text-xs text-zinc-500">${pronostico}</span>
                    <span class="text-lg">${acierto === true ? '✅' : acierto === false ? '❌' : '⏳'}</span>
                </div>
            </div>`;
    }).join('');

    const total = aciertos + errores;
    const pct_ac = total > 0 ? Math.round(aciertos / total * 100) : 0;

    wrap.innerHTML = `
        <div class="bg-zinc-900 rounded-2xl p-4 mb-4 border border-yellow-500/30">
            <p class="text-yellow-400 font-bold text-center mb-3">📊 Resumen</p>
            <div class="grid grid-cols-3 gap-3 mb-3">
                <div class="text-center bg-green-500/10 rounded-xl p-3 border border-green-500/30">
                    <div class="text-green-400 text-2xl font-bold">${aciertos}</div>
                    <div class="text-xs text-zinc-400">✅ Aciertos</div>
                </div>
                <div class="text-center bg-red-500/10 rounded-xl p-3 border border-red-500/30">
                    <div class="text-red-400 text-2xl font-bold">${errores}</div>
                    <div class="text-xs text-zinc-400">❌ Errores</div>
                </div>
                <div class="text-center bg-zinc-800 rounded-xl p-3">
                    <div class="text-zinc-300 text-2xl font-bold">${pendientes}</div>
                    <div class="text-xs text-zinc-400">⏳ Pendientes</div>
                </div>
            </div>
            ${total > 0 ? `
                <div class="bg-zinc-800 rounded-full h-3 overflow-hidden">
                    <div class="h-full bg-green-500 rounded-full" style="width:${pct_ac}%"></div>
                </div>
                <p class="text-center text-sm mt-2 font-bold text-green-400">${pct_ac}% de acierto</p>` : ''}
        </div>
        <button onclick="resultsCache={};renderResultados('${sport}')"
            class="w-full py-3 bg-zinc-800 text-yellow-400 rounded-2xl text-sm font-bold mb-4">
            🔄 Actualizar
        </button>
        ${cards}`;

    container.appendChild(wrap);
}

// ===== IA: Groq y Gemini =====

async function geminiCall(imageBase64, prompt) {
    const key = localStorage.getItem('geminiKey') || '';
    if (!key) throw new Error('Sin clave Gemini. Configúrala en ⚙️ Config');

    const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }, { text: prompt }] }]
            })
        }
    );

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Error Gemini: ${res.status}`);
    }

    const j = await res.json();
    return j.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function groqCall(content, maxTokens) {
    const key = localStorage.getItem('groqKey') || '';
    if (!key) throw new Error('Sin clave Groq. Configúrala en ⚙️ Config');

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({
            model: typeof content === 'string' ? 'llama-3.3-70b-versatile' : 'llama-3.2-11b-vision-preview',
            max_tokens: maxTokens,
            messages: [{ role: 'user', content }]
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Error Groq: ${res.status}`);
    }

    const j = await res.json();
    return j.choices?.[0]?.message?.content || '';
}

// ===== Vista Análisis =====

function renderAnalisis() {
    document.getElementById('mainContent').innerHTML = `
        <div class="p-4">
            <h2 class="text-xl font-bold text-yellow-400 mb-4">🎯 Análisis Combinado</h2>
            <div class="bg-zinc-900 rounded-2xl p-4 mb-4 border border-yellow-500/30">
                <p class="text-sm text-zinc-400 mb-3">Sube capturas de pronósticos del día</p>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <p class="text-xs text-zinc-500 mb-2 font-bold">📸 BETMINES</p>
                        <label class="block w-full py-4 bg-zinc-800 rounded-2xl text-center text-sm cursor-pointer hover:bg-zinc-700">
                            ${betminesImgs.length > 0 ? betminesImgs.length + ' foto(s) ✅' : 'Seleccionar'}
                            <input type="file" accept="image/*" multiple class="hidden" onchange="loadImgs(event,'betmines')">
                        </label>
                    </div>
                    <div>
                        <p class="text-xs text-zinc-500 mb-2 font-bold">📸 FOREBET</p>
                        <label class="block w-full py-4 bg-zinc-800 rounded-2xl text-center text-sm cursor-pointer hover:bg-zinc-700">
                            ${forebetImgs.length > 0 ? forebetImgs.length + ' foto(s) ✅' : 'Seleccionar'}
                            <input type="file" accept="image/*" multiple class="hidden" onchange="loadImgs(event,'forebet')">
                        </label>
                    </div>
                </div>
            </div>
            <button onclick="runAnalisis()"
                class="w-full py-5 bg-yellow-400 text-black font-bold rounded-3xl text-xl mb-4">
                🤖 Generar Análisis
            </button>
            <div id="analisisResult"></div>
        </div>`;
}

function loadImgs(event, source) {
    const files = Array.from(event.target.files);
    const arr = source === 'betmines' ? betminesImgs : forebetImgs;
    arr.length = 0;
    let loaded = 0;

    files.forEach(file => {
        // Validar tamaño (max 5MB por imagen)
        if (file.size > 5 * 1024 * 1024) {
            showToast(`${file.name} es muy grande (máx 5MB)`, true);
            return;
        }

        const reader = new FileReader();
        reader.onload = e => {
            arr.push(e.target.result.split(',')[1]);
            loaded++;
            if (loaded === files.length) renderAnalisis();
        };
        reader.readAsDataURL(file);
    });
}

async function runAnalisis() {
    const result = document.getElementById('analisisResult');

    if (!betminesImgs.length && !forebetImgs.length) {
        showToast('Sube al menos una captura', true);
        return;
    }

    if (!localStorage.getItem('groqKey')) {
        showToast('Configura tu clave Groq en ⚙️ Config', true);
        return;
    }

    try {
        result.innerHTML = `
            <div class="loading-overlay">
                <div class="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full spinner"></div>
                <p class="text-zinc-400 text-sm">Paso 1: Leyendo Betmines...</p>
            </div>`;

        let betTxt = 'Sin datos';
        if (betminesImgs.length) {
            const results = [];
            for (const img of betminesImgs.slice(0, 2)) {
                const base64 = img.replace(/^data:image\/[a-z]+;base64,/, '');
                results.push(await geminiCall(base64,
                    'Lee esta imagen de BETMINES con cuidado. Lista SOLO los partidos que puedes leer claramente. Para cada partido escribe exactamente: EquipoLocal vs EquipoVisita: PREDICCION. Una linea por partido. PREDICCION debe ser LOCAL, EMPATE o VISITA. NO inventes nombres, solo escribe lo que ves claramente en la imagen.'
                ));
            }
            betTxt = results.join('\n');
        }

        result.innerHTML = `
            <div class="loading-overlay">
                <div class="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full spinner"></div>
                <p class="text-zinc-400 text-sm">Paso 2: Leyendo Forebet...</p>
            </div>`;

        let foreTxt = 'Sin datos';
        if (forebetImgs.length) {
            const results = [];
            for (const img of forebetImgs.slice(0, 2)) {
                const base64 = img.replace(/^data:image\/[a-z]+;base64,/, '');
                results.push(await geminiCall(base64,
                    'Lee esta imagen de FOREBET con cuidado. Lista SOLO los partidos que puedes leer claramente. Para cada partido escribe exactamente: EquipoLocal vs EquipoVisita: PREDICCION PORCENTAJE%. Una linea por partido. PREDICCION debe ser LOCAL, EMPATE o VISITA. NO inventes nombres, solo escribe lo que ves claramente en la imagen.'
                ));
            }
            foreTxt = results.join('\n');
        }

        result.innerHTML = `
            <div class="loading-overlay">
                <div class="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full spinner"></div>
                <p class="text-zinc-400 text-sm">Paso 3: Generando veredictos...</p>
            </div>`;

        const prompt = 'BETMINES:\n' + betTxt + '\n\nFOREBET:\n' + foreTxt +
            '\n\nEres un analista de apuestas. Cruza los datos de BETMINES y FOREBET y genera un veredicto para CADA partido listado. Para cada partido escribe EXACTAMENTE en una sola linea este formato:\n' +
            'Partido: NombreLocal vs NombreVisita | Betmines: PREDICCION | Forebet: PREDICCION % | Veredicto: LOCAL o EMPATE o VISITA | Confianza: NUMERO_ENTRE_50_Y_95 | Razon: texto corto\n\n' +
            'Reglas:\n- Si ambos coinciden, confianza alta (75-95)\n- Si difieren, confianza media (50-65)\n' +
            '- Veredicto siempre en mayusculas: LOCAL, EMPATE o VISITA\n- ESCRIBE TODOS los partidos, no omitas ninguno\n' +
            '- Solo las lineas con los partidos, sin texto extra antes ni despues.';

        const resp = await groqCall(prompt, 1000);
        const lineas = resp.split('\n').filter(l => l.trim().length > 5);
        const partidos = lineas.map(l => {
            const get = (key) => {
                const i = l.indexOf(key);
                if (i < 0) return '—';
                const v = l.slice(i + key.length);
                const j = v.indexOf(' | ');
                return (j >= 0 ? v.slice(0, j) : v).trim();
            };
            return {
                partido: get('Partido:'),
                betmines: get('Betmines:'),
                forebet: get('Forebet:'),
                veredicto: get('Veredicto:').toUpperCase(),
                confianza: parseInt(get('Confianza:')) || 70,
                razon: get('Razon:')
            };
        });

        renderAnalisisResult(partidos);
    } catch (err) {
        console.error('Error en análisis:', err);
        result.innerHTML = `
            <div class="text-center mt-8">
                <div class="text-4xl mb-3">⚠️</div>
                <p class="text-zinc-400 mb-2">Error en el análisis</p>
                <p class="text-red-400 text-sm mb-4">${err.message}</p>
                <button onclick="runAnalisis()"
                    class="bg-yellow-400 text-black px-6 py-3 rounded-2xl font-bold">
                    Reintentar
                </button>
            </div>`;
    }
}

function renderAnalisisResult(partidos) {
    const result = document.getElementById('analisisResult');
    if (!partidos.length) {
        result.innerHTML = '<p class="text-zinc-500 text-center mt-8">No se encontraron partidos</p>';
        return;
    }

    const colores = { LOCAL: 'border-green-500', EMPATE: 'border-yellow-500', VISITA: 'border-blue-500' };
    const iconos = { LOCAL: '🏠', EMPATE: '🤝', VISITA: '✈️' };
    const total = partidos.length;
    const altas = partidos.filter(p => (p.confianza || 0) >= 70).length;

    const summary = `
        <div class="bg-zinc-900 rounded-2xl p-4 mb-4 border border-yellow-500/30">
            <div class="flex justify-between items-center mb-3">
                <p class="text-yellow-400 font-bold text-sm uppercase tracking-widest">📊 Resumen</p>
                <span class="text-zinc-500 text-xs">${total} partidos</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center">
                <div class="bg-zinc-800 rounded-xl p-2">
                    <p class="text-2xl font-bold text-white">${total}</p>
                    <p class="text-zinc-500 text-xs">Total</p>
                </div>
                <div class="bg-zinc-800 rounded-xl p-2">
                    <p class="text-2xl font-bold text-green-400">${altas}</p>
                    <p class="text-zinc-500 text-xs">Alta conf.</p>
                </div>
                <div class="bg-zinc-800 rounded-xl p-2">
                    <p class="text-2xl font-bold text-yellow-400">${total - altas}</p>
                    <p class="text-zinc-500 text-xs">Media/baja</p>
                </div>
            </div>
        </div>`;

    const lista = partidos.map(p => {
        const conf = p.confianza || 0;
        const colortxt = conf >= 70 ? 'text-green-400' : conf >= 50 ? 'text-yellow-400' : 'text-zinc-400';
        const border = colores[p.veredicto] || 'border-zinc-700';

        return `
            <div class="bg-zinc-900 rounded-2xl p-4 mb-3 border ${border}">
                <p class="font-bold text-sm mb-3">${p.partido}</p>
                <div class="space-y-1 mb-3">
                    <div class="flex justify-between text-xs">
                        <span class="text-zinc-500">🔨 Betmines</span>
                        <span class="text-zinc-300">${p.betmines || '−'}</span>
                    </div>
                    <div class="flex justify-between text-xs">
                        <span class="text-zinc-500">📈 Forebet</span>
                        <span class="text-zinc-300">${p.forebet || '−'}</span>
                    </div>
                </div>
                <div class="bg-zinc-800 rounded-xl p-3 flex justify-between items-center">
                    <div>
                        <p class="text-xs text-zinc-500 mb-1">🎯 Veredicto</p>
                        <p class="font-bold text-lg">${iconos[p.veredicto] || ''} ${p.veredicto || '−'}</p>
                        <p class="text-zinc-500 text-xs mt-1">${p.razon || ''}</p>
                    </div>
                    <div class="text-right">
                        <p class="${colortxt} text-3xl font-bold">${conf}%</p>
                        <p class="text-zinc-600 text-xs">confianza</p>
                    </div>
                </div>
            </div>`;
    }).join('');

    result.innerHTML = summary + lista;
}

// ===== Vista Fuentes =====

function renderFuentes() {
    document.getElementById('mainContent').innerHTML = `
        <div class="p-4">
            <p class="text-zinc-500 text-xs text-center mb-4 uppercase tracking-widest font-bold">Otras Fuentes</p>
            <div class="space-y-3">
                <a href="https://betmines.com" target="_blank"
                    class="flex items-center gap-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800 hover:border-zinc-600 transition">
                    <span class="text-2xl">⛏️</span>
                    <div><p class="font-bold">Betmines</p><p class="text-zinc-500 text-xs">Estadísticas y pronósticos</p></div>
                    <span class="ml-auto text-zinc-600">→</span>
                </a>
                <a href="https://forebet.com" target="_blank"
                    class="flex items-center gap-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800 hover:border-zinc-600 transition">
                    <span class="text-2xl">📊</span>
                    <div><p class="font-bold">Forebet</p><p class="text-zinc-500 text-xs">Predicciones matemáticas</p></div>
                    <span class="ml-auto text-zinc-600">→</span>
                </a>
                <a href="https://adamchoi.co.uk" target="_blank"
                    class="flex items-center gap-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800 hover:border-zinc-600 transition">
                    <span class="text-2xl">🔢</span>
                    <div><p class="font-bold">AdamChoi</p><p class="text-zinc-500 text-xs">Datos históricos</p></div>
                    <span class="ml-auto text-zinc-600">→</span>
                </a>
                <a href="https://sofascore.com" target="_blank"
                    class="flex items-center gap-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800 hover:border-zinc-600 transition">
                    <span class="text-2xl">⚡</span>
                    <div><p class="font-bold">SofaScore</p><p class="text-zinc-500 text-xs">Resultados en vivo</p></div>
                    <span class="ml-auto text-zinc-600">→</span>
                </a>
            </div>
        </div>`;
}

// ===== Vista Config =====

function renderConfig() {
    document.getElementById('mainContent').innerHTML = `
        <div class="p-4">
            <h2 class="text-xl font-bold text-yellow-400 mb-4">⚙️ Configuración</h2>
            <div class="bg-zinc-900 rounded-2xl p-4 mb-4 border border-yellow-500/30 space-y-4">
                <div>
                    <p class="text-xs text-zinc-500 mb-2 font-bold">🔑 GROQ API KEY (veredictos)</p>
                    <input type="password" id="inputGroq" placeholder="gsk_..."
                        value="${localStorage.getItem('groqKey') || ''}"
                        class="w-full bg-zinc-800 text-white px-4 py-3 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
                </div>
                <div>
                    <p class="text-xs text-zinc-500 mb-2 font-bold">🔑 GEMINI API KEY (lectura imágenes)</p>
                    <input type="password" id="inputGemini" placeholder="AIza..."
                        value="${localStorage.getItem('geminiKey') || ''}"
                        class="w-full bg-zinc-800 text-white px-4 py-3 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400">
                </div>
                <div class="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700">
                    <p class="text-xs text-green-400 font-bold mb-1">🔒 API-SPORTS KEY</p>
                    <p class="text-xs text-zinc-500">Ahora se gestiona desde el servidor (Vercel Environment Variables). No necesitas ingresarla aquí.</p>
                </div>
            </div>
            <button onclick="saveConfig()"
                class="w-full py-5 bg-yellow-400 text-black font-bold rounded-3xl text-xl">
                💾 Guardar
            </button>
            <p class="text-zinc-600 text-xs text-center mt-3">Las claves de IA se guardan solo en tu dispositivo 🔒</p>
        </div>`;
}

function saveConfig() {
    localStorage.setItem('groqKey', document.getElementById('inputGroq').value.trim());
    localStorage.setItem('geminiKey', document.getElementById('inputGemini').value.trim());
    showToast('✅ Configuración guardada');
    switchView('pronos');
}

// ===== Análisis del día con IA =====

async function analizarHoy(sport, data, esSeleccionManual) {
    if (!localStorage.getItem('groqKey')) {
        showToast('Configura Groq en ⚙️ Config', true);
        return;
    }

    let hoy;
    let totalDia;

    if (esSeleccionManual) {
        hoy = data;
        totalDia = data.length;
    } else {
        const tk = new Date().toLocaleDateString('es-CL', { timeZone: USER_TZ });
        hoy = data.filter(r => {
            const d = parseDate(r.date);
            return d && getLocalDayKey(d) === tk;
        });
        if (!hoy.length) {
            const dias = [...new Set(data.map(r => {
                const d = parseDate(r.date);
                return d ? getLocalDayKey(d) : null;
            }).filter(Boolean))];
            if (dias.length) {
                hoy = data.filter(r => {
                    const d = parseDate(r.date);
                    return d && getLocalDayKey(d) === dias[0];
                });
            }
        }
        totalDia = hoy.length;
        hoy = hoy.slice(0, 40);
    }

    if (sport !== 'soccer') {
        showToast('El análisis con IA solo está disponible para Fútbol por ahora', true);
        return;
    }

    if (!hoy.length) {
        showToast('No hay partidos hoy', true);
        return;
    }

    const rd = document.getElementById('analisisHoyResult');
    const bt = document.getElementById('btnAnalizarHoy');
    bt.disabled = true;
    bt.textContent = '⏳ Analizando...';

    rd.innerHTML = `
        <div class="flex items-center gap-3 p-4 bg-zinc-900 rounded-2xl border border-yellow-500/30">
            <div class="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full spinner"></div>
            <p class="text-zinc-400 text-sm">Analizando ${hoy.length} partidos...</p>
        </div>`;

    const lista = hoy.map((r, i) => {
        const h = Math.round((parseFloat(r['1x2_h'] || 0)) * 100);
        const d = Math.round((parseFloat(r['1x2_d'] || 0)) * 100);
        const a = Math.round((parseFloat(r['1x2_a'] || 0)) * 100);
        const o15 = Math.round((parseFloat(r['o_1.5'] || 0)) * 100);
        const o25 = Math.round((parseFloat(r['o_2.5'] || 0)) * 100);
        const u25 = Math.round((parseFloat(r['u_2.5'] || 0)) * 100);
        const u35 = Math.round((parseFloat(r['u_3.5'] || 0)) * 100);
        return (i + 1) + '. ' + (r.home || '?') + ' vs ' + (r.away || '?') + ' [' + (r.league || '') + ']\n' +
            '   1X2 -> Local:' + h + '% Empate:' + d + '% Visita:' + a + '%\n' +
            '   Goles -> Over1.5:' + o15 + '% Over2.5:' + o25 + '% Under2.5:' + u25 + '% Under3.5:' + u35 + '%';
    }).join('\n\n');

    const prompt = 'Eres un analista experto en apuestas deportivas con anos de experiencia leyendo modelos estadisticos de Forebet y Betmines. ' +
        'Analiza estos ' + hoy.length + ' partidos de ' + sport + ' con maximo rigor profesional:\n\n' + lista +
        '\n\nPara CADA partido sin excepcion, escribe un analisis completo en este formato EXACTO:\n---\n' +
        'Partido: Local vs Visita\n' +
        'Veredicto Principal: resultado 1x2 mas probable con tu justificacion estadistica\n' +
        'Mercado de Goles: recomendacion Over/Under basada en los porcentajes, explicando si el partido pinta abierto o cerrado\n' +
        'Lectura del Modelo: identifica si las probabilidades muestran un partido parejo, con favorito claro, o con se;ales contradictorias entre el mercado 1x2 y el de goles\n' +
        'Confianza: Alta, Media o Baja, justificando por que\n' +
        'Razonamiento Experto: parrafo extenso (4-6 lineas) explicando el patron completo del partido segun los datos disponibles, que tipo de partido se espera, y tu recomendacion final\n---\n\n' +
        'Se riguroso, profesional y especifico con los numeros. No repitas frases genericas, cada analisis debe ser unico segun los datos reales del partido.';

    try {
        const texto = await groqCall(prompt, 4000);
        const partes = texto.split('---').filter(p => p.trim() && p.includes('Partido:'));

        const html = partes.map(p => {
            const lines = p.trim().split('\n').filter(l => l.trim());
            const color = p.includes('Alta') ? 'border-green-500 bg-green-500/5'
                : p.includes('Media') ? 'border-yellow-500 bg-yellow-500/5'
                    : 'border-zinc-700 bg-zinc-900';
            return `<div class="rounded-2xl p-4 mb-3 border ${color}">` +
                lines.map(l => `<p class="text-sm mb-1">${l}</p>`).join('') +
                '</div>';
        }).join('');

        rd.innerHTML = `<p class="text-yellow-400 font-bold text-sm mb-3">🤖 ${partes.length} analizados${
            totalDia > 40 ? ' (de ' + totalDia + ' totales del dia, se analizan los primeros 40)' : ''
        }</p>` + (html || `<p class="text-zinc-400 text-sm p-4 bg-zinc-900 rounded-2xl">${texto}</p>`);
    } catch (err) {
        console.error('Error en análisis:', err);
        rd.innerHTML = `<p class="text-red-400 text-sm p-4">Error: ${err.message}</p>`;
    }

    bt.disabled = false;
    bt.textContent = '🔄 Re-analizar';
}

// ===== Vista Word =====

function renderWord() {
    const container = document.getElementById('mainContent');
    const sports = Object.keys(allData).length
        ? Object.keys(allData)
        : ['soccer', 'tennis', 'basketball', 'hockey', 'volleyball', 'handball'];

    let sportSelector = '<select id="wordSportSelect" class="bg-zinc-800 text-white px-4 py-3 rounded-2xl text-sm border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-yellow-400">';
    sports.forEach(s => {
        const label = s.charAt(0).toUpperCase() + s.slice(1);
        const icon = SPORT_ICONS[s] || '🏟';
        const hasContent = wordContents[s] ? ' ✅' : '';
        sportSelector += `<option value="${s}">${icon} ${label}${hasContent}</option>`;
    });
    sportSelector += '</select>';

    container.innerHTML = `
        <div class="p-4">
            <div class="bg-zinc-900 rounded-2xl p-6 mb-4 border border-zinc-800">
                <div class="flex flex-wrap gap-4 items-center mb-4">
                    <div class="flex items-center gap-2">
                        <span class="text-zinc-400 text-sm">Deporte:</span>
                        ${sportSelector}
                    </div>
                    <button id="wordUploadBtn"
                        class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-2xl font-bold text-white text-sm flex items-center gap-2">
                        📂 Cargar Word (.docx)
                    </button>
                    <input type="file" id="wordFileInput" accept=".docx" style="display:none;">
                    <span id="wordFileName" class="text-zinc-400 text-sm">Ningún archivo cargado</span>
                    <span id="wordStatus" class="text-zinc-500 text-xs"></span>
                </div>
                <div class="flex flex-wrap gap-2 text-xs text-zinc-500">
                    <span>📌 Los archivos se guardan por deporte</span>
                    <span class="text-green-400">●</span><span>cargado</span>
                </div>
            </div>
            <div id="wordContent"
                class="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 min-h-[300px] text-zinc-300 text-sm leading-relaxed">
                <div class="flex flex-col items-center justify-center h-64 text-zinc-600">
                    <span class="text-5xl mb-4">📄</span>
                    <p>Selecciona un deporte y carga su archivo Word</p>
                    <p class="text-xs mt-2 text-zinc-700">Ej: ANALISIS_DETALLADO_PARTE1_SOCCER.docx</p>
                </div>
            </div>
        </div>`;

    const select = document.getElementById('wordSportSelect');
    select.addEventListener('change', function () {
        const sport = this.value;
        if (wordContents[sport]) {
            document.getElementById('wordContent').innerHTML = wordContents[sport];
            document.getElementById('wordFileName').innerHTML = `📄 ${sport} (cargado)`;
        } else {
            document.getElementById('wordContent').innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-zinc-600">
                    <span class="text-5xl mb-4">📄</span>
                    <p>No hay archivo cargado para ${sport}</p>
                    <p class="text-xs mt-2 text-zinc-700">Carga uno usando el botón</p>
                </div>`;
            document.getElementById('wordFileName').innerHTML = `Ningún archivo cargado para ${sport}`;
        }
        document.getElementById('wordStatus').innerHTML = '';
    });

    document.getElementById('wordUploadBtn').onclick = () => document.getElementById('wordFileInput').click();
    document.getElementById('wordFileInput').onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const sportSelect = document.getElementById('wordSportSelect');
        const currentSportVal = sportSelect.value;

        document.getElementById('wordStatus').innerHTML = '⏳ Procesando...';
        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                mammoth.convertToHtml({ arrayBuffer: ev.target.result })
                    .then(function (result) {
                        wordContents[currentSportVal] = result.value;
                        document.getElementById('wordContent').innerHTML = result.value;
                        document.getElementById('wordFileName').innerHTML = `📄 ${file.name} (${currentSportVal})`;
                        document.getElementById('wordStatus').innerHTML = '✅ Cargado correctamente';

                        const opt = sportSelect.querySelector(`option[value="${currentSportVal}"]`);
                        if (opt) {
                            const label = opt.textContent.replace(' ✅', '');
                            opt.textContent = label + ' ✅';
                        }
                    })
                    .catch(function (err) {
                        document.getElementById('wordContent').innerHTML = `
                            <div class="text-red-400 p-8 text-center">
                                ❌ Error al leer el archivo: ${err.message}
                                <br><span class="text-xs text-zinc-500 mt-2 block">Verifica que el archivo no esté dañado</span>
                            </div>`;
                        document.getElementById('wordStatus').innerHTML = '❌ Error';
                    });
            } catch (err) {
                showToast('Error al procesar el archivo Word', true);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const initialSport = select ? select.value : (sports[0] || 'soccer');
    if (wordContents[initialSport]) {
        document.getElementById('wordContent').innerHTML = wordContents[initialSport];
        document.getElementById('wordFileName').innerHTML = `📄 ${initialSport} (cargado)`;
    }
}

// ===== Init =====

window.onload = () => {
    // Restaurar token guardado
    authToken = localStorage.getItem('authToken') || null;

    // Restaurar datos Excel guardados
    try {
        const s = localStorage.getItem('apexData');
        if (s) allData = JSON.parse(s);
    } catch {
        allData = {};
    }
};
