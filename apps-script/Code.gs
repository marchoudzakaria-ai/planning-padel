/**
 * PLANNING PADEL — Passerelle Gmail (Google Apps Script)
 * -----------------------------------------------------
 * Vérifie ta boîte Gmail toutes les 5 minutes. Dès qu'un e-mail de padel arrive
 * (Ten'Up/FFT, Padel Club, 4PADEL, Doinsport, Playtomic, Esprit Padel, convocation, libellé "padel"),
 * il recalcule la liste de tes tournois et parties. L'app la récupère à chaque ouverture.
 * Le script tourne dans TON compte Google : aucun mot de passe n'est stocké, rien ne transite par un tiers.
 *
 * INSTALLATION (3 étapes, voir README.md section 4) :
 *   1. Colle ce fichier, renseigne APP_URL ci-dessous, puis lance la fonction  installer  (▶ Exécuter).
 *   2. Déployer → Nouveau déploiement → Application Web → Exécuter en tant que « Moi », accès « Tout le monde ».
 *   3. Lance la fonction  lienPourTelephone  et ouvre le lien affiché sur ton téléphone.
 */

const CONFIG = {
  // Adresse de ton app en ligne (Netlify, GitHub Pages…), ex. 'https://planning-padel.netlify.app/'
  APP_URL: 'https://marchoudzakaria-ai.github.io/planning-padel/',
  // Adresse publique du script (Déployer → Gérer les déploiements → URL qui finit par /exec).
  // Laisse vide : le script la devine. Remplis-la si le lien généré contient « /dev ».
  WEBAPP_URL: '',

  DAYS: 120,                    // fenêtre de recherche dans Gmail (jours)
  MAX_THREADS_PER_SOURCE: 50,
  CHECK_EVERY_MINUTES: 5,       // valeurs possibles : 1, 5, 10, 15, 30

  // Expéditeurs relevés dans ta boîte le 05/11/2026.
  SOURCES: [
    { id: 'tenup',     query: 'from:no-reply@fft.fr subject:inscription' },                 // Ten'Up / FFT Homologation
    { id: 'padelclub', query: 'from:automatic@padelclub.app' },                              // Padel Club (paiements, listes d'attente, désistements)
    { id: '4padel',    query: 'from:4padel.fr subject:(participation OR annulation OR réservation)' }, // 4PADEL (parties)
    { id: 'doinsport', query: 'from:doinsport.com subject:réservation' },                    // Gones Padel & clubs Doinsport
    { id: 'playtomic', query: 'from:playtomic.io' },
    { id: 'esprit',    query: 'from:inscription@espritpadel.com' },
    { id: 'gmail',     query: 'label:padel' },                                               // tout e-mail que tu étiquettes « padel »
    { id: 'convoc',    query: 'subject:convocation (tournoi OR padel)' }                     // convocations des juges-arbitres
    // Padel Now (padel-now.co) n'envoie que des e-mails de classement : pas de source pour l'instant.
    // Padel Nomado : aucun e-mail trouvé. Ajoute { id: 'nomad', query: 'from:ADRESSE' } dès que tu en reçois un.
  ]
};

const PROPS = PropertiesService.getScriptProperties();

/* ============================ INSTALLATION ============================ */

/** ▶ À lancer une fois : crée ton jeton secret et la vérification automatique toutes les 5 min. */
function installer() {
  if (!PROPS.getProperty('TOKEN')) PROPS.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'verifierNouveauxMails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('verifierNouveauxMails').timeBased().everyMinutes(CONFIG.CHECK_EVERY_MINUTES).create();
  PROPS.deleteProperty('LAST_MAIL_AT');
  verifierNouveauxMails();
  Logger.log('✅ Installé. Vérification automatique toutes les ' + CONFIG.CHECK_EVERY_MINUTES + ' min.');
  Logger.log('➡️ Étape suivante : Déployer → Nouveau déploiement → Application Web, puis lance « lienPourTelephone ».');
}

/** ▶ À lancer après le déploiement : affiche le lien qui configure l'app sur ton téléphone en un clic. */
function lienPourTelephone() {
  const url = CONFIG.WEBAPP_URL || ScriptApp.getService().getUrl();
  if (/\/dev$/.test(url)) throw new Error('Adresse de test (/dev) détectée : copie l’URL qui finit par /exec (Déployer → Gérer les déploiements) dans WEBAPP_URL, puis relance.');
  const token = PROPS.getProperty('TOKEN');
  if (!token) throw new Error('Lance d’abord la fonction « installer ».');
  if (!url) throw new Error('Déploie d’abord le script en Application Web (Déployer → Nouveau déploiement).');
  const hash = '#sync=' + encodeURIComponent(url) + '&token=' + token;
  if (CONFIG.APP_URL) {
    Logger.log('📱 Ouvre ce lien sur ton téléphone (ne le partage pas, il contient ton jeton) :');
    Logger.log(CONFIG.APP_URL.replace(/#.*$/, '') + hash);
  } else {
    Logger.log('Renseigne APP_URL en haut du script pour obtenir un lien en un clic. En attendant, colle dans l’app (Réglages) :');
    Logger.log('URL : ' + url);
    Logger.log('Jeton : ' + token);
  }
}

/** ▶ Pour tout arrêter : supprime la vérification automatique. */
function desinstaller() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Vérification automatique arrêtée.');
}

/* ===================== VÉRIFICATION AUTOMATIQUE ===================== */

/**
 * Lancé toutes les 5 min par le déclencheur. Une seule recherche Gmail légère :
 * on ne relit tous les e-mails que si un nouveau message de padel est arrivé (économise les quotas Google).
 */
function verifierNouveauxMails() {
  const all = CONFIG.SOURCES.filter(function (s) { return !/ADRESSE|REMPLACE_PAR/.test(s.query); })
    .map(function (s) { return '(' + s.query + ')'; }).join(' OR ');
  const latest = GmailApp.search('(' + all + ') newer_than:' + CONFIG.DAYS + 'd', 0, 1);
  const lastAt = latest.length ? String(latest[0].getLastMessageDate().getTime()) : '0';
  const stored = loadEvents_();
  if (stored && PROPS.getProperty('LAST_MAIL_AT') === lastAt) return; // rien de nouveau
  saveEvents_(collect_());
  PROPS.setProperty('LAST_MAIL_AT', lastAt);
}

/* ============================ API POUR L'APP ============================ */

/** GET https://script.google.com/macros/s/…/exec?token=…  (&fresh=1 pour forcer une relecture complète) */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const token = PROPS.getProperty('TOKEN');
  if (!token || p.token !== token) return json_({ error: 'Jeton invalide' });
  let events = p.fresh ? null : loadEvents_();
  if (!events) { events = collect_(); saveEvents_(events); }
  return json_({ updatedAt: PROPS.getProperty('UPDATED_AT'), events: events });
}

// Stockage : Script Properties (limite 9 Ko par valeur → découpage en morceaux).
function saveEvents_(events) {
  const s = JSON.stringify(events), size = 8000, n = Math.ceil(s.length / size) || 1;
  const data = { EV_N: String(n), UPDATED_AT: new Date().toISOString() };
  for (let i = 0; i < n; i++) data['EV_' + i] = s.slice(i * size, (i + 1) * size);
  PROPS.setProperties(data);
}
function loadEvents_() {
  const n = +PROPS.getProperty('EV_N');
  if (!n) return null;
  let s = '';
  for (let i = 0; i < n; i++) s += PROPS.getProperty('EV_' + i) || '';
  try { return JSON.parse(s); } catch (err) { return null; }
}

/**
 * Chaque e-mail est analysé séparément (Gmail regroupe parfois plusieurs inscriptions Ten'Up
 * dans une même conversation), puis les e-mails qui parlent du même tournoi/partie sont fusionnés :
 * le statut le plus récent gagne, les autres champs viennent du premier e-mail qui les contient.
 */
function collect_() {
  const seenMsg = {};
  const items = [];
  CONFIG.SOURCES.forEach(function (src) {
    if (/ADRESSE|REMPLACE_PAR/.test(src.query)) return;
    GmailApp.search(src.query + ' newer_than:' + CONFIG.DAYS + 'd', 0, CONFIG.MAX_THREADS_PER_SOURCE).forEach(function (th) {
      th.getMessages().forEach(function (msg) {
        const id = msg.getId();
        if (seenMsg[id]) return;
        seenMsg[id] = true;
        const ev = parsePadelText(msg.getPlainBody().slice(0, 20000), msg.getSubject(), msg.getDate());
        if (!ev.date) return;
        ev.source = src.id;
        ev.receivedAt = msg.getDate().getTime();
        ev.mail = 'https://mail.google.com/mail/u/0/#all/' + id;
        items.push(ev);
      });
    });
  });

  items.sort(function (a, b) { return a.receivedAt - b.receivedAt; }); // du plus ancien au plus récent
  const RANK = { repere: 0, attente: 1, inscrit: 2, confirme: 3 };
  const byKey = {};
  items.forEach(function (ev) {
    const key = padelEventKey(ev);
    const cur = byKey[key];
    if (ev.status === 'annule') ev.annulAt = ev.receivedAt;
    if (!cur) { byKey[key] = ev; return; }
    Object.keys(ev).forEach(function (k) { if (!cur[k] && ev[k]) cur[k] = ev[k]; });
    // Ten'Up fait foi pour le nom du tournoi, le club et le lien
    if (ev.source === 'tenup') ['title', 'club', 'link', 'category'].forEach(function (k) { if (ev[k]) cur[k] = ev[k]; });
    // Statut : une annulation récente l'emporte ; sinon on garde le statut le plus avancé (confirmé > inscrit > attente)
    if (ev.status === 'annule') cur.status = 'annule';
    else if (cur.status === 'annule' && RANK[ev.status] >= RANK.inscrit && ev.receivedAt > cur.annulAt) cur.status = ev.status; // réinscription
    else if (cur.status !== 'annule' && RANK[ev.status] > RANK[cur.status]) cur.status = ev.status;
    if (ev.status === 'annule') cur.annulAt = ev.receivedAt;
    cur.receivedAt = ev.receivedAt;
  });

  const minDate = Utilities.formatDate(new Date(Date.now() - 45 * 86400000), 'Europe/Paris', 'yyyy-MM-dd');
  return Object.keys(byKey).map(function (key) {
    const ev = byKey[key];
    ev.sourceId = key;
    if (!ev.link) ev.link = ev.mail;
    delete ev.mail; delete ev.receivedAt; delete ev.annulAt;
    return ev;
  }).filter(function (ev) { return ev.date >= minDate; })
    .sort(function (a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); });
}

/** À lancer depuis l'éditeur (bouton ▶) pour vérifier ce qui est détecté, sans passer par l'app. */
function testerExtraction() {
  const evs = collect_();
  Logger.log(evs.length + ' événement(s) détecté(s)');
  evs.forEach(function (e) { Logger.log([e.date, e.time, e.type, e.status, e.category, e.title, e.club, e.partner].join(' | ')); });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================================================================
 * Parseur — copie de parser.js (même logique que l'import « Coller un message » de l'app)
 * =================================================================== */
var MONTHS = {
  janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  'août': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, 'décembre': 12, decembre: 12,
  janv: 1, 'févr': 2, fevr: 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, 'déc': 12, dec: 12
};
var MONTH_RE = '(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|janv|févr|fevr|avr|juil|sept|oct|nov|déc|dec)\\.?';
var NAME = "[A-ZÀ-Ý][A-Za-zÀ-ÿ'’\\-]+(?: [A-ZÀ-Ý][A-Za-zÀ-ÿ'’\\-]+){0,2}";

function pad(n) { return (n < 10 ? '0' : '') + n; }
function clean(s) { return String(s || '').replace(/[*_|]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, ''); }

// Sans année : année courante, ou la suivante si la date est passée depuis plus de 60 jours.
function guessYear(m, d, now) {
  var y = now.getFullYear();
  if ((now - new Date(y, m - 1, d)) / 86400000 > 60) y += 1;
  return y;
}

function parsePadelText(text, subject, now) {
  now = now || new Date();
  subject = String(subject || '');
  var body = String(text || '').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  var raw = subject + '\n' + body;
  var flat = raw.replace(/\s+/g, ' ');
  var low = flat.toLowerCase();
  var head = (subject + ' ' + body.slice(0, 600)).replace(/\s+/g, ' ').toLowerCase(); // début du mail = le plus fiable
  var out = {}, m;

  // --- Date ---
  m = low.match(new RegExp('(\\d{1,2})(?:er)?\\s+' + MONTH_RE + '(?:\\s+(\\d{4}))?'));
  if (m) {
    var mo = MONTHS[m[2]], d = +m[1];
    if (mo && d >= 1 && d <= 31) out.date = (m[3] ? +m[3] : guessYear(mo, d, now)) + '-' + pad(mo) + '-' + pad(d);
  }
  if (!out.date) {
    m = low.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m && +m[2] >= 1 && +m[2] <= 12) {
      var yy = +m[3]; if (yy < 100) yy += 2000;
      out.date = yy + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    }
  }
  if (!out.date) {
    m = low.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) out.date = m[1] + '-' + m[2] + '-' + m[3];
  }

  // --- Heure (09h00, 9h, 18:30) — on ignore les heures de "Date d'inscription : … à 10:46" ---
  var lowNoInscr = low.replace(/date d.inscription[^a-z]*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4} à \d{1,2}[:h]\d{2}/g, '');
  m = lowNoInscr.match(/(?:^|[^\d])([01]?\d|2[0-3])\s?(?:h|:)\s?([0-5]\d)?(?![\d])/);
  if (m) out.time = pad(+m[1]) + ':' + (m[2] || '00');

  // --- Type (on regarde surtout le début du mail) ---
  // Une phrase explicite sur « la partie » l'emporte (les e-mails 4PADEL contiennent parfois des pubs de tournois)
  var partieHead = /pour la partie|la partie du|la partie qui|partie ouverte|open match|match ouvert|annulation du match/.test(head);
  var tournoiHead = /tournoi|homologu|juge[\s-]arbitre|convocation|\bp\s?(25|50|100|250|500|1000|1500|2000)\b|épreuve/.test(head);
  out.type = partieHead ? 'partie' : (tournoiHead ? 'tournoi' : (/partie|réservation|reservation|terrain|piste/.test(low) ? 'partie' : 'tournoi'));

  // --- Catégorie FFT ---
  m = flat.match(/\bP\s?(25|50|100|250|500|1000|1500|2000)\b/i);
  if (m) out.category = 'P' + m[1];

  // --- Statut (du plus fort au plus faible) ---
  if (/annul|désistement|desistement/.test(head)) out.status = 'annule';
  else if (/liste d.attente|en attente|waiting list|à confirmer|a confirmer/.test(head)) out.status = 'attente';
  else if (/convocation|convoqu|(est|a été) (confirmée|validée|acceptée)|reçu avec succès|nous te confirmons ta réservation|réservation confirmée|paiement reçu/.test(head)) out.status = 'confirme';
  else if (/inscri|enregistr|demande de participation|demande de partenaire/.test(head)) out.status = 'inscrit';
  else if (/confirm|validé|accept/.test(head)) out.status = 'confirme';
  else out.status = 'repere';

  // --- Club / lieu ---
  var clubPatterns = [
    /organisé par le club (.{2,60}?) du \d/i,                         // Ten'Up / FFT
    /au club (.{2,60}?)(?: a été| est |,|\.|$)/i,                       // Padel Club
    /chez (.{2,50}?)(?:\.|,| pour | le | !|$)/i,                        // 4PADEL
    /dans le club (.{2,50}?)(?:,|\.| c'est|$)/i,
    /réservation à (.{2,40}?) a bien/i,                                // Doinsport
    /(?:^|\n)\s*(?:club|lieu|centre|complexe|organisateur|où)\s*[:\-–]\s*(.{2,80})(?:\n|$)/i
  ];
  for (var i = 0; i < clubPatterns.length && !out.club; i++) {
    m = (i === 5 ? raw : flat).match(clubPatterns[i]);
    if (m) out.club = clean(m[1]);
  }
  if (!out.club) {
    m = flat.match(/(?:^|\s)(?:au|chez|à)\s+((?:le |la |l')?[A-Z][\w'’&.\- ]{0,40}?(?:Padel|Club|Center|Arena|Indoor)[\w'’\- ]{0,25})/);
    if (m) out.club = clean(m[1]);
  }

  // --- Ville (code postal + ville) ---
  m = raw.match(/\b\d{5}[ \t]+([A-ZÉÈÀ][A-Za-zÀ-ÿ'’\- ]{1,30})/);
  if (m) out.city = clean(m[1]);

  // --- Partenaire ---
  m = raw.match(/^\s*(?:partenaire|binôme|binome|coéquipier|équipier)\s*[:\-–]\s*(.{2,60})$/im)
    || flat.match(new RegExp('(?:avec votre partenaire|inscrits? avec|en paire avec)\\s+(' + NAME + ')'))
    || flat.match(new RegExp('(' + NAME + ') souhaite former une paire avec vous'));
  if (m) out.partner = clean(m[1]);

  // --- Prix ---
  m = flat.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s?€/);
  if (m && !/€\s?par|par an|par mois/.test(flat.slice(m.index, m.index + 20))) out.price = m[1].replace(',', '.');

  // --- Lien (fiche Ten'Up en priorité) ---
  m = raw.match(/tenup\.fft\.fr\/tournoi\/\d+/);
  if (m) out.link = 'https://' + m[0];
  else { m = raw.match(/https?:\/\/[^\s<>"')\]]+/); if (m) out.link = m[0]; }

  // --- Titre ---
  m = flat.match(/(?:au |du |le )?tournoi (.{3,70}?)(?:,? prévu le| organisé par| a été| du \d| de demain)/i);
  var genericSubject = /^(votre inscription|playtomic|confirmation|re:|tr:|fwd?:)\s*$/i.test(subject.trim()) || /^\[/.test(subject.trim()) || /^(re|tr|fwd?)\s*:/i.test(subject.trim());
  if (m && out.type === 'tournoi') out.title = clean(m[1]);
  else if (out.type === 'partie') out.title = 'Partie' + (out.club ? ' – ' + out.club : '');
  else if (subject && !genericSubject) out.title = clean(subject.replace(/[^\w\sÀ-ÿ'’()\-–—·:/]/g, '')).slice(0, 90);
  else out.title = 'Tournoi' + (out.category ? ' ' + out.category : '') + (out.club ? ' – ' + out.club : '');

  return out;
}

// Même tournoi = même date (la catégorie n'est pas toujours écrite) ; même partie = même date + même heure.
function padelEventKey(ev) {
  if (!ev || !ev.date) return '';
  return ev.type === 'partie' ? 'partie:' + ev.date + ':' + (ev.time || '') : 'tournoi:' + ev.date;
}

