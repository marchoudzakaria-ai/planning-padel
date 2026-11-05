/*
 * Parseur de texte padel (e-mails Ten'Up/FFT, Padel Club, 4PADEL, Doinsport, Playtomic, SMS…).
 * Le même code est copié dans apps-script/Code.gs : si tu modifies l'un, modifie l'autre.
 * parsePadelText(texte, objet, dateDeReception) → { type, title, date, time, club, city, category, status, partner, price, link }
 * padelEventKey(ev) → identifiant stable d'un événement (sert à fusionner les e-mails qui parlent du même tournoi)
 */
(function (root) {
  var MONTHS = {
    janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
    'août': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, 'décembre': 12, decembre: 12,
    janv: 1, 'févr': 2, fevr: 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, 'déc': 12, dec: 12
  };
  var MONTH_RE = '(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|janv|févr|fevr|avr|juil|sept|oct|nov|déc|dec)\\.?';
  var NAME = "[A-ZÀ-Ý][A-Za-zÀ-ÿ'’\\-]+(?: [A-ZÀ-Ý][A-Za-zÀ-ÿ'’\\-]+){0,2}";

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, ''); }

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
    var partieHead = /pour la partie|la partie du|partie ouverte|open match|match ouvert|annulation du match/.test(head);
    var tournoiHead = /tournoi|homologu|juge[\s-]arbitre|convocation|\bp\s?(25|50|100|250|500|1000|1500|2000)\b|épreuve/.test(head);
    out.type = partieHead && !/tournoi/.test(head) ? 'partie' : (tournoiHead ? 'tournoi' : (/partie|réservation|reservation|terrain|piste/.test(low) ? 'partie' : 'tournoi'));

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
    else if (subject && !genericSubject) out.title = subject.trim().slice(0, 90);
    else out.title = 'Tournoi' + (out.category ? ' ' + out.category : '') + (out.club ? ' – ' + out.club : '');

    return out;
  }

  // Même tournoi = même type + même date + même catégorie ; même partie = même date + même heure.
  function padelEventKey(ev) {
    if (!ev || !ev.date) return '';
    return ev.type === 'partie'
      ? 'partie:' + ev.date + ':' + (ev.time || '')
      : 'tournoi:' + ev.date + ':' + (ev.category || ev.time || '');
  }

  root.parsePadelText = parsePadelText;
  root.padelEventKey = padelEventKey;
})(typeof window !== 'undefined' ? window : this);
