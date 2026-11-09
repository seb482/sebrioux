// Logique métier du passeport virtuel (aucun accès au DOM ni au stockage).
// Toutes les fonctions qui modifient l'état renvoient une copie : { ok, state } ou { ok: false, erreur(s) }.

export const STORAGE_KEY = 'passeport-basques:v1';
export const SCHEMA_VERSION = 1;

// Caractères sans ambiguïté (pas de 0/O, 1/I/L) pour les codes générés.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const iso = () => new Date().toISOString();
const clone = (x) => structuredClone(x);
const erreur = (message) => ({ ok: false, erreur: message });
const erreurs = (liste) => ({ ok: false, erreurs: liste });

export function genId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function genCode(longueur = 8, rand = Math.random) {
  let s = '';
  for (let i = 0; i < longueur; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return s;
}

export function normCode(valeur) {
  return String(valeur ?? '').trim().toUpperCase();
}

export function nouveauCode(state, rand = Math.random) {
  for (let i = 0; i < 50; i++) {
    const c = genCode(8, rand);
    if (!state.attraits.some((a) => a.codeQR === c)) return c;
  }
  return genCode(14, rand);
}

// Données de départ : trois attraits (dont la traverse) et trois récompenses d'exemple.
export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    settings: {
      titre: 'Passeport virtuel',
      mrc: 'MRC des Basques',
      sousTitre: 'Visitez les attraits de la MRC et accumulez des pistoles.',
      monnaie: 'pistoles',
      pistolesParEtampe: 10,
      pinAdmin: '1234',
    },
    attraits: [
      {
        id: 'traverse-trois-pistoles',
        nom: 'La traverse Trois-Pistoles – Les Escoumins',
        categorie: 'Traversier',
        lieu: 'Quai de Trois-Pistoles',
        description:
          'Traversée du Saint-Laurent entre Trois-Pistoles et Les Escoumins (environ 1 h 30), exploitée par la Compagnie de navigation des Basques. Service saisonnier, de mi-mai à mi-octobre ; horaires selon les marées.',
        codeQR: 'TRAVERSE-01',
        actif: true,
        ordre: 1,
      },
      {
        id: 'iles-aux-basques',
        nom: 'Îles aux Basques',
        categorie: 'Patrimoine et nature',
        lieu: 'Au large de Trois-Pistoles',
        description:
          "Petite île à environ 5 km de Trois-Pistoles où des baleiniers basques découpaient autrefois les baleines. Des vestiges de fours à huile de baleine y ont été repérés.",
        codeQR: 'ILES-02',
        actif: true,
        ordre: 2,
      },
      {
        id: 'eglise-trois-pistoles',
        nom: 'Église de Trois-Pistoles',
        categorie: 'Patrimoine religieux',
        lieu: 'Trois-Pistoles',
        description: 'Un des lieux de culte patrimoniaux de Trois-Pistoles. Texte à compléter.',
        codeQR: 'EGLISE-03',
        actif: true,
        ordre: 3,
      },
    ],
    recompenses: [
      { id: 'rec-cafe', titre: 'Un café offert', seuil: 10, description: 'Chez un commerçant partenaire (à confirmer).' },
      { id: 'rec-bon', titre: 'Bon d’achat de 10 $', seuil: 25, description: 'Exemple : à remplacer par une offre réelle.' },
      { id: 'rec-souvenir', titre: 'Article souvenir', seuil: 50, description: 'Exemple : à remplacer par une offre réelle.' },
    ],
    joueur: { nom: '', etampes: {}, ajustements: [], reclamees: {} },
  };
}

// Complète un objet importé ou lu du stockage avec les champs facultatifs.
export function normaliser(obj) {
  const d = defaultState();
  return {
    version: SCHEMA_VERSION,
    settings: { ...d.settings, ...(obj.settings || {}) },
    attraits: obj.attraits.map((a) => ({
      categorie: '',
      lieu: '',
      description: '',
      actif: true,
      ordre: 0,
      ...a,
      codeQR: normCode(a.codeQR),
    })),
    recompenses: obj.recompenses.map((r) => ({ description: '', ...r })),
    joueur: {
      nom: '',
      etampes: {},
      ajustements: [],
      reclamees: {},
      ...obj.joueur,
    },
  };
}

export function valider(obj) {
  if (!obj || typeof obj !== 'object') return erreur('Données invalides.');
  if (!obj.settings || typeof obj.settings !== 'object') return erreur('Paramètres manquants.');
  if (!Array.isArray(obj.attraits) || !Array.isArray(obj.recompenses)) {
    return erreur('Liste d’attraits ou de récompenses manquante.');
  }
  if (!obj.joueur || typeof obj.joueur !== 'object') return erreur('Passeport du joueur manquant.');
  for (const a of obj.attraits) {
    if (!a || !a.id || !a.nom || !a.codeQR) return erreur(`Attrait incomplet : ${a?.nom || a?.id || '?'}.`);
  }
  const codes = obj.attraits.map((a) => normCode(a.codeQR));
  if (new Set(codes).size !== codes.length) return erreur('Deux attraits partagent le même code QR.');
  for (const r of obj.recompenses) {
    if (!r || !r.id || !r.titre || !(Number(r.seuil) >= 0)) return erreur('Récompense incomplète.');
  }
  return { ok: true };
}

// Accepte un code brut, ou une URL contenant ?e=CODE (ce qu'un appareil photo ouvre après un scan).
export function extraireCode(texte) {
  const t = String(texte ?? '').trim();
  const m = t.match(/[?&]e=([^&#\s]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return t;
}

export function urlPourCode(base, code) {
  const u = new URL(base);
  u.search = '';
  u.hash = '';
  u.searchParams.set('e', code);
  return u.toString();
}

export function findAttraitByCode(state, code) {
  const c = normCode(code);
  return state.attraits.find((a) => normCode(a.codeQR) === c) || null;
}

export function nbEtampes(state) {
  return state.attraits.filter((a) => state.joueur.etampes[a.id]).length;
}

export function sommeAjustements(state) {
  return state.joueur.ajustements.reduce((s, a) => s + a.montant, 0);
}

export function totalPistoles(state) {
  const brut = nbEtampes(state) * state.settings.pistolesParEtampe + sommeAjustements(state);
  return Math.max(0, brut);
}

// Scan d'un code QR : ajoute l'étampe si l'attrait est actif et pas encore étampé.
export function estampiller(state, code, now = iso()) {
  const attrait = findAttraitByCode(state, code);
  if (!attrait) return { ok: false, raison: 'code-inconnu' };
  if (!attrait.actif) return { ok: false, raison: 'inactif', attrait };
  if (state.joueur.etampes[attrait.id]) return { ok: false, raison: 'deja', attrait };
  const next = clone(state);
  next.joueur.etampes[attrait.id] = { date: now, source: 'qr' };
  return { ok: true, attrait, gain: state.settings.pistolesParEtampe, state: next };
}

// Mode admin : ajoute ou retire une étampe manuellement.
export function basculerEtampe(state, attraitId, now = iso()) {
  if (!state.attraits.some((a) => a.id === attraitId)) return erreur('Attrait introuvable.');
  const next = clone(state);
  if (next.joueur.etampes[attraitId]) delete next.joueur.etampes[attraitId];
  else next.joueur.etampes[attraitId] = { date: now, source: 'admin' };
  return { ok: true, state: next };
}

export function ajouterAjustement(state, montant, note = '', now = iso()) {
  const m = Math.round(Number(montant));
  if (!Number.isFinite(m) || m === 0) return erreur('Montant invalide (entier non nul).');
  const next = clone(state);
  next.joueur.ajustements.push({
    id: genId('aj'),
    date: now,
    montant: m,
    note: String(note ?? '').trim().slice(0, 120),
  });
  return { ok: true, state: next };
}

export function supprimerAjustement(state, id) {
  const next = clone(state);
  next.joueur.ajustements = next.joueur.ajustements.filter((a) => a.id !== id);
  return { ok: true, state: next };
}

export function reinitialiserPasseport(state) {
  const next = clone(state);
  next.joueur = { nom: '', etampes: {}, ajustements: [], reclamees: {} };
  return { ok: true, state: next };
}

export function definirNomJoueur(state, nom) {
  const next = clone(state);
  next.joueur.nom = String(nom ?? '').trim().slice(0, 60);
  return { ok: true, state: next };
}

export function statutRecompenses(state) {
  const total = totalPistoles(state);
  return [...state.recompenses]
    .sort((a, b) => a.seuil - b.seuil)
    .map((r) => ({
      ...r,
      progres: r.seuil > 0 ? Math.min(1, total / r.seuil) : 1,
      debloquee: total >= r.seuil,
      reclamee: !!state.joueur.reclamees[r.id],
    }));
}

export function reclamer(state, id, now = iso()) {
  const r = statutRecompenses(state).find((x) => x.id === id);
  if (!r) return erreur('Récompense introuvable.');
  if (!r.debloquee) return erreur('Cette récompense n’est pas encore débloquée.');
  if (r.reclamee) return erreur('Cette récompense a déjà été réclamée.');
  const next = clone(state);
  next.joueur.reclamees[id] = now;
  return { ok: true, state: next };
}

export function annulerReclamation(state, id) {
  const next = clone(state);
  delete next.joueur.reclamees[id];
  return { ok: true, state: next };
}

// Crée ou modifie un attrait. Sans code QR, un code unique est généré.
export function sauverAttrait(state, data = {}) {
  const liste = [];
  const nom = String(data.nom ?? '').trim().slice(0, 120);
  if (!nom) liste.push('Le nom est obligatoire.');
  let code = normCode(data.codeQR);
  if (!code) code = nouveauCode(state);
  if (!/^[A-Z0-9-]{4,24}$/.test(code)) liste.push('Le code QR doit contenir 4 à 24 lettres, chiffres ou tirets.');
  if (state.attraits.some((a) => a.codeQR === code && a.id !== data.id)) {
    liste.push('Ce code QR est déjà utilisé par un autre attrait.');
  }
  if (liste.length) return { ...erreurs(liste), state };

  const next = clone(state);
  const existant = data.id ? next.attraits.find((a) => a.id === data.id) : null;
  const ordre = Number.parseInt(data.ordre, 10);
  const valeurs = {
    nom,
    categorie: String(data.categorie ?? '').trim().slice(0, 60),
    lieu: String(data.lieu ?? '').trim().slice(0, 120),
    description: String(data.description ?? '').trim().slice(0, 1000),
    codeQR: code,
    actif: data.actif !== false,
    ordre: Number.isFinite(ordre) ? ordre : next.attraits.length + 1,
  };
  if (existant) {
    Object.assign(existant, valeurs);
    return { ok: true, state: next, attrait: existant };
  }
  const nouveau = { id: genId('attrait'), ...valeurs };
  next.attraits.push(nouveau);
  return { ok: true, state: next, attrait: nouveau };
}

export function supprimerAttrait(state, id) {
  const next = clone(state);
  next.attraits = next.attraits.filter((a) => a.id !== id);
  delete next.joueur.etampes[id];
  return { ok: true, state: next };
}

export function sauverRecompense(state, data = {}) {
  const liste = [];
  const titre = String(data.titre ?? '').trim().slice(0, 120);
  const seuil = Math.round(Number(data.seuil));
  if (!titre) liste.push('Le titre est obligatoire.');
  if (!Number.isFinite(seuil) || seuil < 1) liste.push('Le seuil doit être un entier d’au moins 1.');
  if (liste.length) return { ...erreurs(liste), state };

  const next = clone(state);
  const valeurs = {
    titre,
    seuil,
    description: String(data.description ?? '').trim().slice(0, 500),
  };
  const existant = data.id ? next.recompenses.find((r) => r.id === data.id) : null;
  if (existant) {
    Object.assign(existant, valeurs);
    return { ok: true, state: next, recompense: existant };
  }
  const nouvelle = { id: genId('rec'), ...valeurs };
  next.recompenses.push(nouvelle);
  return { ok: true, state: next, recompense: nouvelle };
}

export function supprimerRecompense(state, id) {
  const next = clone(state);
  next.recompenses = next.recompenses.filter((r) => r.id !== id);
  delete next.joueur.reclamees[id];
  return { ok: true, state: next };
}

export function sauverParametres(state, p = {}) {
  const liste = [];
  const pistoles = Math.round(Number(p.pistolesParEtampe));
  const pin = String(p.pinAdmin ?? '').trim();
  if (!Number.isFinite(pistoles) || pistoles < 0) liste.push('Pistoles par étampe : entier positif ou nul.');
  if (pin.length < 4) liste.push('Le NIP administrateur doit contenir au moins 4 caractères.');
  if (liste.length) return { ...erreurs(liste), state };

  const texte = (v, defaut = '') => String(v ?? '').trim().slice(0, 200) || defaut;
  const next = clone(state);
  next.settings = {
    ...next.settings,
    titre: texte(p.titre, 'Passeport virtuel'),
    sousTitre: texte(p.sousTitre),
    mrc: texte(p.mrc),
    monnaie: texte(p.monnaie, 'pistoles'),
    pistolesParEtampe: pistoles,
    pinAdmin: pin,
  };
  return { ok: true, state: next };
}
