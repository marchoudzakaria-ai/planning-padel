/* Planning Padel — PWA mobile-first, sans build. Données en localStorage + synchro Gmail (Apps Script). */
(function () {
  'use strict';

  // ---------- Constantes ----------
  var STATUS = {
    repere:   { label: 'Repéré',     cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300', dot: 'bg-zinc-400', rank: 0 },
    attente:  { label: 'En attente', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', dot: 'bg-amber-400', rank: 1 },
    inscrit:  { label: 'Inscrit',    cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300', dot: 'bg-sky-400', rank: 2 },
    confirme: { label: 'Confirmé',   cls: 'bg-lime-100 text-lime-800 dark:bg-ball/15 dark:text-ball', dot: 'bg-ball', rank: 3 },
    annule:   { label: 'Annulé',     cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', dot: 'bg-rose-400', rank: 4 }
  };
  var TYPES = {
    tournoi: { label: 'Tournoi', short: 'Tournoi', accent: 'bg-ball text-zinc-950', ring: 'border-l-ball', dot: 'bg-ball' },
    partie:  { label: 'Partie ouverte', short: 'Partie', accent: 'bg-sky-400 text-zinc-950', ring: 'border-l-sky-400', dot: 'bg-sky-400' }
  };
  var SOURCES = { manuel: 'Manuel', gmail: 'Gmail', tenup: "Ten'Up", padelclub: 'Padel Club', '4padel': '4PADEL', doinsport: 'Doinsport', playtomic: 'Playtomic', esprit: 'Esprit Padel', convoc: 'Convocation', nomad: 'Padel Nomado', now: 'Padel Now', collage: 'Collage' };
  var CATEGORIES = ['', 'P25', 'P50', 'P100', 'P250', 'P500', 'P1000', 'P1500', 'P2000'];

  // ---------- Utilitaires ----------
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var toISO = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var fromISO = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var todayISO = function () { return toISO(new Date()); };
  var addDays = function (iso, n) { var d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
  var uid = function () { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); };
  var buzz = function () { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} };
  var daysUntil = function (iso) { return Math.round((fromISO(iso) - fromISO(todayISO())) / 86400000); };
  var fmtLong = function (iso) { return fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };

  var store = {
    load: function (k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    save: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // ---------- État ----------
  var settings = Object.assign(
    { theme: 'dark', syncUrl: '', token: '', lastSync: null, tombstones: [], seeded: false },
    store.load('padel.settings', {})
  );
  var events = store.load('padel.events', null);
  if (!events) { events = []; settings.seeded = true; } // plus d'exemples automatiques : charge-les depuis Réglages si besoin
  var ui = { view: 'list', filter: 'all', month: todayISO().slice(0, 7), day: todayISO(), syncing: false, showPast: false };

  function persist() { store.save('padel.events', events); store.save('padel.settings', settings); }
  persist();

  function sampleEvents() {
    var t = todayISO();
    return [
      { id: uid(), type: 'tournoi', title: 'Open de la Toussaint', category: 'P250', date: addDays(t, 3), time: '09:00', club: 'Padel Club Exemple', city: 'Lyon', partner: 'Karim', status: 'confirme', source: 'manuel', price: '30', notes: 'Exemple — supprime-moi', link: '' },
      { id: uid(), type: 'partie', title: 'Partie ouverte niveau 4-5', date: addDays(t, 1), time: '19:30', club: 'Indoor Padel', city: 'Villeurbanne', partner: '', status: 'inscrit', source: 'manuel', price: '12', notes: 'Exemple', link: '' },
      { id: uid(), type: 'tournoi', title: 'Tournoi mixte', category: 'P100', date: addDays(t, 12), time: '13:00', club: 'Padel Arena', city: 'Bron', partner: 'Sarah', status: 'attente', source: 'manuel', price: '25', notes: 'Exemple', link: '' },
      { id: uid(), type: 'partie', title: 'Partie du dimanche', date: addDays(t, 6), time: '10:00', club: 'Padel Club Exemple', city: 'Lyon', partner: '', status: 'repere', source: 'manuel', price: '', notes: 'Exemple', link: '' }
    ];
  }

  // ---------- Thème ----------
  function applyTheme() {
    var dark = settings.theme === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#09090b' : '#fafafa');
  }

  // ---------- Sélecteurs ----------
  function sorted(list) {
    return list.slice().sort(function (a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); });
  }
  function filtered() {
    return events.filter(function (e) { return ui.filter === 'all' || e.type === ui.filter; });
  }
  function upcoming(list) { var t = todayISO(); return sorted(list.filter(function (e) { return e.date >= t; })); }
  function past(list) { var t = todayISO(); return sorted(list.filter(function (e) { return e.date < t; })).reverse(); }

  // ---------- Composants ----------
  function pill(status) {
    var s = STATUS[status] || STATUS.repere;
    return '<span class="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ' + s.cls + '">' + s.label + '</span>';
  }

  function card(e) {
    var d = fromISO(e.date);
    var ty = TYPES[e.type] || TYPES.tournoi;
    var meta = [e.time ? e.time.replace(':', 'h') : '', e.club, e.city].filter(Boolean).map(esc).join(' · ');
    var dim = e.status === 'annule' ? ' opacity-50' : '';
    return '' +
      '<button data-action="open" data-id="' + esc(e.id) + '" class="press flex w-full items-center gap-3 rounded-2xl border-l-4 ' + ty.ring + ' bg-white p-3 text-left shadow-sm dark:bg-zinc-900' + dim + '">' +
        '<div class="flex w-12 shrink-0 flex-col items-center rounded-xl bg-zinc-100 py-1.5 dark:bg-zinc-800">' +
          '<span class="text-[10px] font-semibold uppercase text-zinc-500">' + d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') + '</span>' +
          '<span class="text-xl font-bold leading-none">' + d.getDate() + '</span>' +
          '<span class="text-[10px] uppercase text-zinc-500">' + d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') + '</span>' +
        '</div>' +
        '<div class="min-w-0 flex-1">' +
          '<div class="mb-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-zinc-500">' +
            '<span class="h-2 w-2 shrink-0 rounded-full ' + ty.dot + '"></span>' + ty.short + (e.category ? ' · ' + esc(e.category) : '') +
            (e.source && e.source !== 'manuel' ? ' · <span class="normal-case">' + esc(SOURCES[e.source] || e.source) + '</span>' : '') +
          '</div>' +
          '<div class="truncate font-semibold">' + esc(e.title || ty.label) + '</div>' +
          '<div class="truncate text-sm text-zinc-500 dark:text-zinc-400">' + (meta || '&nbsp;') + '</div>' +
        '</div>' +
        pill(e.status) +
      '</button>';
  }

  function chips() {
    var opts = [['all', 'Tout'], ['tournoi', 'Tournois'], ['partie', 'Parties ouvertes']];
    return '<div class="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">' + opts.map(function (o) {
      var on = ui.filter === o[0];
      return '<button data-action="filter" data-v="' + o[0] + '" class="press shrink-0 rounded-full px-4 py-2 text-sm font-semibold ' +
        (on ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-white text-zinc-600 shadow-sm dark:bg-zinc-900 dark:text-zinc-300') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function header(title, sub) {
    var dark = settings.theme === 'dark';
    return '<header class="mb-4 flex items-center justify-between">' +
      '<div><p class="text-sm text-zinc-500">' + esc(sub || '') + '</p><h1 class="text-2xl font-bold tracking-tight">' + esc(title) + '</h1></div>' +
      '<button data-action="theme" aria-label="Changer de thème" class="press flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm dark:bg-zinc-900">' +
        (dark
          ? '<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path stroke-linecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
          : '<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>') +
      '</button></header>';
  }

  function emptyState(msg) {
    return '<div class="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">' +
      '<div class="mb-2 text-3xl">🎾</div><p class="mb-4">' + msg + '</p>' +
      '<button data-action="new" class="press rounded-xl bg-ball px-4 py-2.5 font-semibold text-zinc-950">Ajouter</button></div>';
  }

  // ---------- Vues ----------
  function viewList() {
    var list = filtered();
    var up = upcoming(list).filter(function (e) { return e.status !== 'annule'; });
    var upAll = upcoming(list);
    var next = up[0];
    var all = upcoming(events).filter(function (e) { return e.status !== 'annule'; });
    var nT = all.filter(function (e) { return e.type === 'tournoi'; }).length;
    var nP = all.filter(function (e) { return e.type === 'partie'; }).length;
    var nW = all.filter(function (e) { return e.status === 'attente' || e.status === 'repere'; }).length;

    var h = header('Mon planning', cap(fmtLong(todayISO())));

    if (next) {
      var dd = daysUntil(next.date);
      var when = dd === 0 ? "Aujourd'hui" : dd === 1 ? 'Demain' : 'Dans ' + dd + ' jours';
      h += '<button data-action="open" data-id="' + esc(next.id) + '" class="press mb-4 block w-full overflow-hidden rounded-3xl bg-zinc-900 p-5 text-left text-white shadow-lg dark:bg-gradient-to-br dark:from-zinc-800 dark:to-zinc-900">' +
        '<div class="mb-3 flex items-center justify-between"><span class="rounded-full ' + TYPES[next.type].accent + ' px-3 py-1 text-xs font-bold">Prochain · ' + when + '</span>' + pill(next.status) + '</div>' +
        '<div class="text-xl font-bold leading-tight">' + esc(next.title) + (next.category ? ' <span class="text-ball">' + esc(next.category) + '</span>' : '') + '</div>' +
        '<div class="mt-1 text-sm text-zinc-300">' + esc(cap(fmtLong(next.date))) + (next.time ? ' · ' + next.time.replace(':', 'h') : '') + '</div>' +
        '<div class="text-sm text-zinc-400">' + esc([next.club, next.city].filter(Boolean).join(', ')) + (next.partner ? ' · avec ' + esc(next.partner) : '') + '</div>' +
        '</button>';
    }

    h += '<div class="mb-4 grid grid-cols-3 gap-2">' +
      stat(nT, 'Tournois', 'text-lime-600 dark:text-ball') + stat(nP, 'Parties', 'text-sky-500') + stat(nW, 'À valider', 'text-amber-500') + '</div>';

    h += chips();

    if (!upAll.length) h += emptyState('Rien de prévu pour l’instant.');
    else {
      var t = todayISO(), wk = addDays(t, 7), mo = addDays(t, 31);
      var groups = [
        ["Aujourd'hui", function (e) { return e.date === t; }],
        ['Cette semaine', function (e) { return e.date > t && e.date <= wk; }],
        ['Ce mois-ci', function (e) { return e.date > wk && e.date <= mo; }],
        ['Plus tard', function (e) { return e.date > mo; }]
      ];
      groups.forEach(function (g) {
        var items = upAll.filter(g[1]);
        if (!items.length) return;
        h += '<h2 class="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-zinc-500">' + g[0] + ' <span class="font-normal">(' + items.length + ')</span></h2>';
        h += '<div class="space-y-2">' + items.map(card).join('') + '</div>';
      });
    }

    var ps = past(list);
    if (ps.length) {
      h += '<button data-action="togglePast" class="mt-6 w-full rounded-xl py-3 text-sm font-semibold text-zinc-500">' +
        (ui.showPast ? 'Masquer' : 'Voir') + ' l’historique (' + ps.length + ')</button>';
      if (ui.showPast) h += '<div class="space-y-2 opacity-70">' + ps.map(card).join('') + '</div>';
    }
    return h;
  }

  function stat(n, label, color) {
    return '<div class="rounded-2xl bg-white p-3 shadow-sm dark:bg-zinc-900"><div class="text-2xl font-bold ' + color + '">' + n + '</div><div class="text-xs text-zinc-500">' + label + '</div></div>';
  }

  function viewCal() {
    var p = ui.month.split('-').map(Number), y = p[0], m = p[1];
    var first = new Date(y, m - 1, 1);
    var startOffset = (first.getDay() + 6) % 7; // lundi = 0
    var days = new Date(y, m, 0).getDate();
    var list = filtered();
    var byDay = {};
    list.forEach(function (e) { (byDay[e.date] = byDay[e.date] || []).push(e); });
    var t = todayISO();

    var h = header(cap(first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })), 'Calendrier');
    h += chips();
    h += '<div class="rounded-3xl bg-white p-3 shadow-sm dark:bg-zinc-900">' +
      '<div class="mb-2 flex items-center justify-between">' +
        '<button data-action="month" data-v="-1" aria-label="Mois précédent" class="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">‹</button>' +
        '<button data-action="today" class="press rounded-full px-3 py-2 text-sm font-semibold text-zinc-500">Aujourd’hui</button>' +
        '<button data-action="month" data-v="1" aria-label="Mois suivant" class="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">›</button>' +
      '</div>' +
      '<div class="grid grid-cols-7 text-center text-[11px] font-semibold text-zinc-500">' +
        ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(function (d) { return '<div class="py-1">' + d + '</div>'; }).join('') + '</div>' +
      '<div class="grid grid-cols-7 gap-1">';
    for (var i = 0; i < startOffset; i++) h += '<div></div>';
    for (var d = 1; d <= days; d++) {
      var iso = y + '-' + pad(m) + '-' + pad(d);
      var evs = byDay[iso] || [];
      var sel = iso === ui.day, isT = iso === t;
      h += '<button data-action="day" data-v="' + iso + '" class="press flex aspect-square flex-col items-center justify-center rounded-xl text-sm ' +
        (sel ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold' : isT ? 'ring-2 ring-ball font-bold' : '') + '">' + d +
        '<span class="mt-0.5 flex h-1.5 gap-0.5">' + evs.slice(0, 3).map(function (e) {
          return '<span class="h-1.5 w-1.5 rounded-full ' + (e.status === 'annule' ? 'bg-rose-400' : TYPES[e.type].dot) + '"></span>';
        }).join('') + '</span></button>';
    }
    h += '</div></div>';

    var dayEvents = sorted(byDay[ui.day] || []);
    h += '<h2 class="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-zinc-500">' + esc(cap(fmtLong(ui.day))) + '</h2>';
    h += dayEvents.length
      ? '<div class="space-y-2">' + dayEvents.map(card).join('') + '</div>'
      : '<button data-action="new" data-date="' + ui.day + '" class="press w-full rounded-2xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">+ Ajouter ce jour-là</button>';
    return h;
  }

  function viewSync() {
    var ls = settings.lastSync;
    var configured = !!settings.syncUrl;
    var h = header('Connexions', 'Synchronisation');
    h += '<div class="mb-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-zinc-900">' +
      '<div class="mb-1 flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full ' + (configured ? 'bg-ball' : 'bg-zinc-400') + '"></span>' +
      '<span class="font-semibold">Passerelle Gmail</span><span class="ml-auto text-xs text-zinc-500">' + (configured ? 'configurée' : 'non configurée') + '</span></div>' +
      '<p class="mb-4 text-sm text-zinc-500">Ten\'Up, Padel Club, 4PADEL et Doinsport envoient leurs confirmations par e-mail : le script lit ces e-mails dans ton Gmail et les transforme en événements.</p>' +
      (ls ? '<p class="mb-4 text-sm">Dernière synchro : <b>' + new Date(ls.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + '</b> — ' + ls.added + ' ajouté(s), ' + ls.updated + ' mis à jour</p>' : '') +
      '<button data-action="sync" class="press flex w-full items-center justify-center gap-2 rounded-2xl bg-ball py-3.5 font-bold text-zinc-950"' + (ui.syncing ? ' disabled' : '') + '>' +
        (ui.syncing ? '<svg class="spin h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/></svg> Synchronisation…' : 'Synchroniser maintenant') +
      '</button>' +
      (!configured ? '<button data-nav="settings" class="mt-2 w-full py-2 text-sm font-semibold text-zinc-500">Configurer l’URL du script →</button>' : '') +
      '</div>';

    var srcs = [
      ["Ten'Up (FFT)", 'no-reply@fft.fr — inscriptions, listes d’attente', 'tenup'],
      ['Padel Club', 'automatic@padelclub.app — paiements, désistements', 'padelclub'],
      ['4PADEL', 'saint-priest@4padel.fr — parties', '4padel'],
      ['Doinsport', 'Gones Padel et clubs Doinsport — réservations', 'doinsport'],
      ['Convocations', 'E-mails « Convocation » des juges-arbitres', 'convoc'],
      ['Libellé Gmail « padel »', 'Tout e-mail que tu étiquettes toi-même', 'gmail']
    ];
    h += '<h2 class="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Sources lues par le script</h2><div class="mb-4 space-y-2">' +
      srcs.map(function (s) {
        var n = events.filter(function (e) { return e.source === s[2]; }).length;
        return '<div class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-zinc-900"><div class="min-w-0 flex-1"><div class="font-semibold">' + s[0] + '</div><div class="text-sm text-zinc-500">' + s[1] + '</div></div><span class="text-sm font-semibold text-zinc-500">' + n + '</span></div>';
      }).join('') + '</div>';

    h += '<div class="rounded-3xl bg-white p-5 shadow-sm dark:bg-zinc-900"><div class="mb-1 font-semibold">Import rapide</div>' +
      '<p class="mb-3 text-sm text-zinc-500">Colle un e-mail, un SMS ou un message WhatsApp : la date, l’heure, le club et le statut sont détectés automatiquement.</p>' +
      '<button data-action="paste" class="press w-full rounded-2xl bg-zinc-900 py-3.5 font-semibold text-white dark:bg-white dark:text-zinc-900">Coller un message</button></div>';
    return h;
  }

  function viewSettings() {
    var h = header('Réglages', 'Planning Padel');
    var input = 'w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-800';
    h += '<form data-form="settings" class="mb-4 space-y-3 rounded-3xl bg-white p-5 shadow-sm dark:bg-zinc-900">' +
      '<div class="font-semibold">Passerelle Gmail (Apps Script)</div>' +
      '<label class="block text-sm"><span class="mb-1 block text-zinc-500">URL de l’application web</span><input name="syncUrl" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(settings.syncUrl) + '" class="' + input + '"></label>' +
      '<label class="block text-sm"><span class="mb-1 block text-zinc-500">Jeton secret (TOKEN du script)</span><input name="token" type="password" autocomplete="off" value="' + esc(settings.token) + '" class="' + input + '"></label>' +
      '<button class="press w-full rounded-2xl bg-ball py-3 font-bold text-zinc-950">Enregistrer</button></form>';

    var row = function (action, label, sub, danger) {
      return '<button data-action="' + action + '" class="press flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-sm dark:bg-zinc-900"><span><span class="block font-semibold ' + (danger ? 'text-rose-500' : '') + '">' + label + '</span><span class="text-sm text-zinc-500">' + sub + '</span></span><span class="text-zinc-400">›</span></button>';
    };
    h += '<div class="space-y-2">' +
      row('theme', 'Thème', settings.theme === 'dark' ? 'Sombre' : 'Clair') +
      row('icsAll', 'Exporter vers mon agenda', 'Fichier .ics de tous les événements à venir') +
      row('backup', 'Sauvegarder mes données', 'Télécharger un fichier JSON') +
      row('restore', 'Importer un fichier', 'Sauvegarde ou import Gmail (.json), sans doublons') +
      row('samples', 'Charger des exemples', 'Pour tester l’interface') +
      row('reset', 'Tout effacer', 'Supprime les données de cet appareil', true) +
      '</div><p class="mt-6 text-center text-xs text-zinc-500">' + events.length + ' événement(s) stocké(s) sur cet appareil</p>';
    return h;
  }

  // ---------- Bottom sheet ----------
  function openSheet(html) {
    $('#sheet-body').innerHTML = html;
    $('#sheet').classList.add('open'); $('#backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    $('#sheet').classList.remove('open'); $('#backdrop').classList.remove('open');
    document.body.style.overflow = '';
  }

  function detail(e) {
    var ty = TYPES[e.type];
    var rows = [
      ['📅', cap(fmtLong(e.date)) + (e.time ? ' à ' + e.time.replace(':', 'h') : '')],
      ['📍', [e.club, e.city].filter(Boolean).join(', ')],
      ['🤝', e.partner ? 'Avec ' + e.partner : ''],
      ['💶', e.price ? e.price + ' €' : ''],
      ['📝', e.notes],
      ['🔗', e.source && e.source !== 'manuel' ? 'Source : ' + (SOURCES[e.source] || e.source) : '']
    ].filter(function (r) { return r[1]; });
    return '' +
      '<div class="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zinc-500"><span class="h-2 w-2 rounded-full ' + ty.dot + '"></span>' + ty.label + (e.category ? ' · ' + esc(e.category) : '') + '</div>' +
      '<h2 class="mb-4 text-2xl font-bold leading-tight">' + esc(e.title) + '</h2>' +
      '<div class="mb-5 space-y-2">' + rows.map(function (r) { return '<div class="flex gap-3"><span>' + r[0] + '</span><span class="text-zinc-700 dark:text-zinc-300">' + esc(r[1]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Statut</div>' +
      '<div class="mb-6 flex flex-wrap gap-2">' + Object.keys(STATUS).map(function (k) {
        var on = e.status === k;
        return '<button data-action="setStatus" data-id="' + esc(e.id) + '" data-v="' + k + '" class="press rounded-full px-3.5 py-2 text-sm font-semibold ' +
          (on ? STATUS[k].cls + ' ring-2 ring-current' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300') + '">' + STATUS[k].label + '</button>';
      }).join('') + '</div>' +
      '<div class="grid grid-cols-2 gap-2">' +
        '<button data-action="edit" data-id="' + esc(e.id) + '" class="press rounded-2xl bg-zinc-900 py-3.5 font-semibold text-white dark:bg-white dark:text-zinc-900">Modifier</button>' +
        '<button data-action="ics" data-id="' + esc(e.id) + '" class="press rounded-2xl bg-zinc-100 py-3.5 font-semibold dark:bg-zinc-800">+ Agenda</button>' +
        (e.link ? '<a href="' + esc(e.link) + '" target="_blank" rel="noopener" class="press col-span-2 rounded-2xl bg-zinc-100 py-3.5 text-center font-semibold dark:bg-zinc-800">Ouvrir le lien</a>' : '') +
        '<button data-action="delete" data-id="' + esc(e.id) + '" class="press col-span-2 rounded-2xl py-3 font-semibold text-rose-500">Supprimer</button>' +
      '</div>';
  }

  function form(e, opts) {
    opts = opts || {};
    e = e || { type: ui.filter === 'partie' ? 'partie' : 'tournoi', status: 'inscrit', date: opts.date || (ui.view === 'cal' ? ui.day : todayISO()), time: '' };
    var input = 'w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-800';
    var lab = function (t, inner, extra) { return '<label class="block text-sm ' + (extra || '') + '"><span class="mb-1 block text-zinc-500">' + t + '</span>' + inner + '</label>'; };
    var seg = function (name, opts2, val) {
      return '<div class="grid gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800" style="grid-template-columns:repeat(' + opts2.length + ',1fr)">' + opts2.map(function (o) {
        return '<label class="cursor-pointer"><input type="radio" name="' + name + '" value="' + o[0] + '" class="peer sr-only"' + (val === o[0] ? ' checked' : '') + '>' +
          '<span class="block rounded-lg py-2.5 text-center text-sm font-semibold text-zinc-500 peer-checked:bg-white peer-checked:text-zinc-900 peer-checked:shadow dark:peer-checked:bg-zinc-950 dark:peer-checked:text-white">' + o[1] + '</span></label>';
      }).join('') + '</div>';
    };
    return '' +
      '<h2 class="mb-4 text-xl font-bold">' + (e.id ? 'Modifier' : 'Nouvel événement') + '</h2>' +
      (!e.id ? '<details class="mb-4 rounded-2xl bg-zinc-100 p-3 dark:bg-zinc-800"' + (opts.paste ? ' open' : '') + '><summary class="cursor-pointer text-sm font-semibold">📋 Remplir depuis un e-mail / SMS</summary>' +
        '<textarea id="pasteBox" rows="5" placeholder="Colle ici le texte de la confirmation…" class="mt-3 w-full rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"></textarea>' +
        '<button type="button" data-action="parse" class="press mt-2 w-full rounded-xl bg-ball py-2.5 font-semibold text-zinc-950">Analyser le texte</button></details>' : '') +
      '<form data-form="event" data-id="' + esc(e.id || '') + '" class="space-y-3">' +
        seg('type', [['tournoi', 'Tournoi'], ['partie', 'Partie ouverte']], e.type) +
        lab('Titre', '<input name="title" required value="' + esc(e.title) + '" placeholder="Open d’hiver, Partie niveau 5…" class="' + input + '">') +
        '<div class="grid grid-cols-2 gap-2">' +
          lab('Date', '<input name="date" type="date" required value="' + esc(e.date) + '" class="' + input + '">') +
          lab('Heure', '<input name="time" type="time" value="' + esc(e.time) + '" class="' + input + '">') +
        '</div>' +
        '<div class="grid grid-cols-2 gap-2">' +
          lab('Club', '<input name="club" value="' + esc(e.club) + '" class="' + input + '">') +
          lab('Ville', '<input name="city" value="' + esc(e.city) + '" class="' + input + '">') +
        '</div>' +
        '<div class="grid grid-cols-2 gap-2">' +
          lab('Catégorie', '<select name="category" class="' + input + '">' + CATEGORIES.map(function (c) { return '<option value="' + c + '"' + (e.category === c ? ' selected' : '') + '>' + (c || '—') + '</option>'; }).join('') + '</select>') +
          lab('Prix (€)', '<input name="price" inputmode="decimal" value="' + esc(e.price) + '" class="' + input + '">') +
        '</div>' +
        lab('Partenaire', '<input name="partner" value="' + esc(e.partner) + '" class="' + input + '">') +
        '<div><span class="mb-1 block text-sm text-zinc-500">Statut</span>' +
          seg('status', Object.keys(STATUS).map(function (k) { return [k, STATUS[k].label.replace('En attente', 'Attente')]; }), e.status) + '</div>' +
        lab('Lien (Ten\'Up, appli…)', '<input name="link" type="url" inputmode="url" value="' + esc(e.link) + '" class="' + input + '">') +
        lab('Notes', '<textarea name="notes" rows="2" class="' + input + '">' + esc(e.notes) + '</textarea>') +
        '<button class="press w-full rounded-2xl bg-ball py-4 text-lg font-bold text-zinc-950">Enregistrer</button>' +
      '</form>';
  }

  function fillForm(data) {
    var f = document.querySelector('form[data-form="event"]');
    if (!f) return;
    Object.keys(data).forEach(function (k) {
      var el = f.elements[k];
      if (!el || data[k] == null || data[k] === '') return;
      if (el instanceof RadioNodeList) { Array.prototype.forEach.call(el, function (r) { r.checked = r.value === data[k]; }); }
      else el.value = data[k];
    });
  }

  // ---------- Actions ----------
  function find(id) { return events.find(function (e) { return e.id === id; }); }

  function saveEvent(f) {
    var fd = new FormData(f), id = f.dataset.id;
    var data = {};
    ['type', 'title', 'date', 'time', 'club', 'city', 'category', 'price', 'partner', 'status', 'link', 'notes'].forEach(function (k) { data[k] = (fd.get(k) || '').toString().trim(); });
    if (id) { Object.assign(find(id), data, { edited: true }); toast('Modifié ✓'); }
    else { events.push(Object.assign({ id: uid(), source: f.dataset.source || 'manuel' }, data)); toast('Ajouté ✓'); }
    ui.day = data.date; ui.month = data.date.slice(0, 7);
    persist(); closeSheet(); render(); buzz();
  }

  function removeEvent(id) {
    var e = find(id);
    if (!e || !confirm('Supprimer « ' + e.title + ' » ?')) return;
    if (e.sourceId) settings.tombstones.push(e.sourceId); // évite qu'il revienne à la prochaine synchro
    events = events.filter(function (x) { return x.id !== id; });
    persist(); closeSheet(); render(); toast('Supprimé'); buzz();
  }

  function mergeIncoming(list) {
    var added = 0, updated = 0;
    list.forEach(function (inc) {
      if (!inc.sourceId || !inc.date || settings.tombstones.indexOf(inc.sourceId) >= 0) return;
      var local = events.find(function (e) { return e.sourceId === inc.sourceId; });
      if (!local) {
        events.push(Object.assign({ id: uid(), notes: '', price: '', partner: '' }, inc));
        added++;
      } else if (!local.edited) {
        var before = JSON.stringify(local);
        Object.assign(local, inc);
        if (JSON.stringify(local) !== before) updated++;
      } else if ((STATUS[inc.status] || {}).rank > (STATUS[local.status] || {}).rank) {
        local.status = inc.status; updated++; // tu as modifié l'événement : on ne met à jour que la progression du statut
      }
    });
    return { added: added, updated: updated };
  }

  function sync(silent) {
    if (!settings.syncUrl) {
      if (!silent) { toast('Renseigne d’abord l’URL du script'); go('settings'); }
      return;
    }
    ui.syncing = true; if (!silent) render();
    var url;
    try { url = new URL(settings.syncUrl); } catch (e) { ui.syncing = false; render(); toast('URL invalide'); return; }
    url.searchParams.set('token', settings.token);
    var lastRes = null;
    fetch(url.toString(), { redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        var res = mergeIncoming(data.events || []);
        settings.lastSync = { at: Date.now(), added: res.added, updated: res.updated };
        persist();
        lastRes = res;
        if (!silent) toast(res.added + ' ajouté(s), ' + res.updated + ' mis à jour');
        else if (res.added || res.updated) { toast('📬 Nouveau mail padel : ' + res.added + ' ajouté(s), ' + res.updated + ' mis à jour'); buzz(); }
      })
      .catch(function (err) { if (!silent) toast('Échec de la synchro : ' + err.message); })
      .then(function () {
        ui.syncing = false;
        // En silencieux, on ne redessine que s'il y a du nouveau (évite d'effacer une saisie en cours)
        if (!silent || ui.view === 'sync' || (lastRes && (lastRes.added || lastRes.updated))) render();
      });
  }

  // ---------- Export ICS / JSON ----------
  function icsEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
  function toICS(list) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Planning Padel//FR', 'CALSCALE:GREGORIAN'];
    list.forEach(function (e) {
      var d = e.date.replace(/-/g, '');
      L.push('BEGIN:VEVENT', 'UID:' + e.id + '@planning-padel', 'DTSTAMP:' + stamp);
      if (e.time) {
        var start = new Date(fromISO(e.date).getTime());
        var hm = e.time.split(':').map(Number); start.setHours(hm[0], hm[1]);
        var end = new Date(start.getTime() + (e.type === 'tournoi' ? 6 : 1.5) * 3600000);
        var f = function (x) { return toISO(x).replace(/-/g, '') + 'T' + pad(x.getHours()) + pad(x.getMinutes()) + '00'; };
        L.push('DTSTART:' + f(start), 'DTEND:' + f(end));
      } else {
        L.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + addDays(e.date, 1).replace(/-/g, ''));
      }
      L.push('SUMMARY:' + icsEsc((e.type === 'tournoi' ? '🏆 ' : '🎾 ') + e.title + (e.category ? ' ' + e.category : '')));
      if (e.club || e.city) L.push('LOCATION:' + icsEsc([e.club, e.city].filter(Boolean).join(', ')));
      L.push('DESCRIPTION:' + icsEsc(['Statut : ' + (STATUS[e.status] || {}).label, e.partner ? 'Partenaire : ' + e.partner : '', e.notes, e.link].filter(Boolean).join('\n')));
      if (e.status === 'annule') L.push('STATUS:CANCELLED');
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n');
  }
  function download(name, content, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function restore() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = function () {
      var file = inp.files[0]; if (!file) return;
      file.text().then(function (txt) {
        var data = JSON.parse(txt);
        if (!Array.isArray(data.events)) throw new Error('format');
        var known = {}; events.forEach(function (e) { known[e.id] = 1; if (e.sourceId) known[e.sourceId] = 1; });
        var add = data.events.filter(function (e) { return !known[e.id] && !(e.sourceId && known[e.sourceId]); });
        events = events.concat(add); persist(); render(); toast(add.length + ' événement(s) importé(s)');
      }).catch(function () { toast('Fichier invalide'); });
    };
    inp.click();
  }

  // ---------- Toast ----------
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.innerHTML = '<div class="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-zinc-900">' + esc(msg) + '</div>';
    t.style.opacity = '1';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.style.opacity = '0'; }, 2600);
  }

  // ---------- Rendu & navigation ----------
  function render() {
    var views = { list: viewList, cal: viewCal, sync: viewSync, settings: viewSettings };
    $('#view').innerHTML = views[ui.view]();
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      var on = b.dataset.nav === ui.view;
      b.classList.toggle('text-zinc-900', on); b.classList.toggle('dark:text-white', on);
      b.classList.toggle('text-zinc-400', !on); b.classList.toggle('dark:text-zinc-500', !on);
    });
  }
  function go(v) { ui.view = v; render(); window.scrollTo(0, 0); }

  document.addEventListener('click', function (ev) {
    var nav = ev.target.closest('[data-nav]');
    if (nav) { buzz(); go(nav.dataset.nav); return; }
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action, id = el.dataset.id, v = el.dataset.v, e;
    switch (a) {
      case 'close': closeSheet(); break;
      case 'new': buzz(); openSheet(form(null, { date: el.dataset.date })); break;
      case 'paste': openSheet(form(null, { paste: true })); setTimeout(function () { var p = $('#pasteBox'); p && p.focus(); }, 300); break;
      case 'open': buzz(); e = find(id); if (e) openSheet(detail(e)); break;
      case 'edit': openSheet(form(find(id))); break;
      case 'delete': removeEvent(id); break;
      case 'setStatus': e = find(id); e.status = v; e.edited = true; persist(); openSheet(detail(e)); render(); buzz(); break;
      case 'ics': e = find(id); download('padel-' + e.date + '.ics', toICS([e]), 'text/calendar'); break;
      case 'icsAll': download('planning-padel.ics', toICS(upcoming(events)), 'text/calendar'); break;
      case 'filter': ui.filter = v; render(); break;
      case 'togglePast': ui.showPast = !ui.showPast; render(); break;
      case 'month': var p = ui.month.split('-').map(Number), d = new Date(p[0], p[1] - 1 + Number(v), 1); ui.month = toISO(d).slice(0, 7); render(); break;
      case 'today': ui.day = todayISO(); ui.month = ui.day.slice(0, 7); render(); break;
      case 'day': ui.day = v; render(); break;
      case 'theme': settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); persist(); render(); break;
      case 'sync': sync(false); break;
      case 'parse':
        var txt = ($('#pasteBox') || {}).value || '';
        if (!txt.trim()) { toast('Colle d’abord un texte'); break; }
        var r = window.parsePadelText(txt, '');
        // Pour un texte collé, la 1re ligne non vide sert de titre si elle est courte
        var firstLine = txt.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
        if (firstLine.length <= 80) r.title = firstLine;
        fillForm(r);
        var f = document.querySelector('form[data-form="event"]'); if (f) f.dataset.source = 'collage';
        toast(r.date ? 'Champs remplis — vérifie avant d’enregistrer' : 'Pas de date trouvée, complète à la main');
        break;
      case 'backup': download('padel-sauvegarde-' + todayISO() + '.json', JSON.stringify({ version: 1, events: events }, null, 2), 'application/json'); break;
      case 'restore': restore(); break;
      case 'samples': events = events.concat(sampleEvents()); persist(); render(); toast('Exemples ajoutés'); break;
      case 'reset': if (confirm('Effacer tous les événements de cet appareil ?')) { events = []; settings.tombstones = []; persist(); render(); toast('Données effacées'); } break;
    }
  });

  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    ev.preventDefault();
    if (f.dataset.form === 'event') saveEvent(f);
    if (f.dataset.form === 'settings') {
      settings.syncUrl = f.elements.syncUrl.value.trim();
      settings.token = f.elements.token.value.trim();
      persist(); toast('Réglages enregistrés'); buzz();
    }
  });

  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeSheet(); });

  // ---------- Démarrage ----------
  applyTheme();
  render();
  // Lien magique généré par le script (fonction lienPourTelephone) : #sync=URL&token=JETON
  (function configFromLink() {
    var h = location.hash.slice(1);
    if (h.indexOf('sync=') < 0) return;
    var q = {}; h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (q.sync && q.token) {
      settings.syncUrl = q.sync; settings.token = q.token; settings.lastSync = null; persist();
      toast('Connexion Gmail configurée ✓');
    }
    history.replaceState(null, '', location.pathname + location.search); // retire le jeton de la barre d'adresse
  })();

  // Mise à jour automatique : à l'ouverture, au retour dans l'app, et toutes les 5 min tant qu'elle est ouverte.
  // (Côté Google, le script vérifie ta boîte toutes les 5 min : l'app récupère donc un nouveau mail en ≤ 5 min.)
  function autoSync() {
    if (!settings.syncUrl || ui.syncing || document.visibilityState !== 'visible') return;
    if (settings.lastSync && Date.now() - settings.lastSync.at < 60000) return; // pas plus d'une fois par minute
    sync(true);
  }
  autoSync();
  document.addEventListener('visibilitychange', autoSync);
  window.addEventListener('online', autoSync);
  setInterval(autoSync, 5 * 60000);

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
