import * as core from './core.js';

const zone = document.getElementById('contenu');

let state = charger();
let vue = 'passeport'; // passeport | scanner | recompenses | admin
let adminOK = false;
let onglet = 'attraits'; // attraits | passeport | recompenses | parametres
let editId = null; // null = liste ; '' = nouvel attrait ; id = modification
let editRecoId = null;
let banniere = null; // { texte, type }
let dernier = null; // id du dernier attrait étampé (animation)
let flux = null;
let timerScan = null;

const monnaie = () => state.settings.monnaie || 'pistoles';
const trouver = (liste, id) => liste.find((x) => x.id === id);
const fmt = (iso) => new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Stockage local ----------

function charger() {
  let brut = null;
  try {
    brut = localStorage.getItem(core.STORAGE_KEY);
  } catch {
    /* stockage bloqué : on repart des données de départ */
  }
  if (!brut) return core.defaultState();
  try {
    const obj = JSON.parse(brut);
    const v = core.valider(obj);
    if (!v.ok) throw new Error(v.erreur);
    return core.normaliser(obj);
  } catch (e) {
    console.warn('Données locales invalides, copie de sauvegarde créée.', e);
    try {
      localStorage.setItem(`${core.STORAGE_KEY}:sauvegarde`, brut);
    } catch {
      /* ignoré */
    }
    return core.defaultState();
  }
}

function sauver() {
  try {
    localStorage.setItem(core.STORAGE_KEY, JSON.stringify(state));
  } catch {
    dire('Impossible d’enregistrer sur cet appareil (stockage plein ou bloqué).', 'erreur');
  }
}

// ---------- Rendu ----------

function dire(texte, type = 'info') {
  banniere = { texte, type };
}

function rendu() {
  arreterScanner();
  document.getElementById('titre').textContent = state.settings.titre;
  document.getElementById('mrc').textContent = state.settings.mrc;
  document.title = `${state.settings.titre} – ${state.settings.mrc}`;
  document.querySelectorAll('[data-vue]').forEach((b) => {
    b.setAttribute('aria-current', String(b.dataset.vue === vue));
  });
  const vues = { passeport: vuePasseport, scanner: vueScanner, recompenses: vueRecompenses, admin: vueAdmin };
  const html = vues[vue]();
  dernier = null;
  zone.innerHTML = (banniere ? `<p class="banniere ${banniere.type}" role="status">${esc(banniere.texte)}</p>` : '') + html;
  banniere = null;
  if (vue === 'scanner') demarrerScanner();
}

function vuePasseport() {
  const total = core.totalPistoles(state);
  const etampes = core.nbEtampes(state);
  const prochaine = core.statutRecompenses(state).find((r) => !r.debloquee);
  const cartes = state.attraits
    .filter((a) => a.actif || state.joueur.etampes[a.id])
    .map(carteAttrait)
    .join('');
  return `
    <section class="resume" aria-label="Résumé du passeport">
      <div><span class="chiffre">${total}</span><span class="legende">${esc(monnaie())}</span></div>
      <div><span class="chiffre">${etampes}/${state.attraits.length}</span><span class="legende">étampes</span></div>
    </section>
    <p class="intro">${esc(state.settings.sousTitre)}</p>
    ${
      prochaine
        ? `<p class="prochaine">Prochaine récompense : <strong>${esc(prochaine.titre)}</strong> à ${prochaine.seuil} ${esc(monnaie())}
           <span class="barre"><span style="width:${Math.round(prochaine.progres * 100)}%"></span></span></p>`
        : '<p class="prochaine">Toutes les récompenses sont débloquées !</p>'
    }
    <form data-form="nom-joueur" class="ligne nom">
      <label class="sr" for="nom-joueur">Nom sur le passeport</label>
      <input id="nom-joueur" name="nom" value="${esc(state.joueur.nom)}" placeholder="Votre prénom (facultatif)" maxlength="60">
      <button>Enregistrer</button>
    </form>
    <div class="grille">${cartes || '<p>Aucun attrait pour le moment.</p>'}</div>`;
}

function carteAttrait(a) {
  const et = state.joueur.etampes[a.id];
  const classes = ['carte', et ? 'fait' : '', !a.actif ? 'inactif' : '', dernier === a.id ? 'nouvelle' : ''].filter(Boolean).join(' ');
  const pied = et
    ? `<div class="etampe" aria-label="Étampé le ${esc(fmt(et.date))}"><span class="etampe-titre">Visité</span><span>${esc(fmt(et.date))}</span></div>`
    : a.actif
      ? `<p class="a-faire">Scannez le code QR sur place.</p>`
      : `<p class="a-faire">Non disponible pour le moment.</p>`;
  return `
    <article class="${classes}">
      <p class="categorie">${esc(a.categorie || 'Attrait')}</p>
      <h2>${esc(a.nom)}</h2>
      ${a.lieu ? `<p class="lieu">${esc(a.lieu)}</p>` : ''}
      ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
      ${pied}
    </article>`;
}

function vueScanner() {
  const camera = 'BarcodeDetector' in window;
  return `
    <section class="scan">
      <h2>Scanner un code QR</h2>
      <p>Repérez le code QR installé sur place (panneau, kiosque, quai…) et pointez-le vers la caméra.</p>
      ${camera ? '<div class="cadre"><video id="scan-video" playsinline muted></video></div>' : ''}
      <p id="scan-statut" class="statut">${
        camera
          ? 'Démarrage de la caméra…'
          : 'La lecture par caméra n’est pas disponible dans ce navigateur. Sur iPhone, utilisez l’appareil photo natif : le code ouvre directement le passeport. Sinon, saisissez le code ci-dessous.'
      }</p>
      <form data-form="scan-manuel" class="ligne">
        <label class="sr" for="code-manuel">Code de l’attrait</label>
        <input id="code-manuel" name="code" placeholder="Ex. TRAVERSE-01" autocomplete="off" autocapitalize="characters" required>
        <button>Valider</button>
      </form>
    </section>`;
}

function vueRecompenses() {
  const total = core.totalPistoles(state);
  const liste = core.statutRecompenses(state);
  if (!liste.length) return '<p>Aucune récompense définie.</p>';
  return `
    <section class="recompenses">
      <h2>Récompenses</h2>
      <p class="intro">Vous avez <strong>${total} ${esc(monnaie())}</strong>.</p>
      ${liste
        .map(
          (r) => `
        <article class="carte reco ${r.reclamee ? 'reclamee' : r.debloquee ? 'debloquee' : ''}">
          <h3>${esc(r.titre)}</h3>
          ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
          <p class="seuil">${r.seuil} ${esc(monnaie())}</p>
          <div class="barre"><span style="width:${Math.round(r.progres * 100)}%"></span></div>
          ${
            r.reclamee
              ? '<p class="ok">✓ Réclamée</p>'
              : r.debloquee
                ? `<button data-action="reclamer" data-id="${esc(r.id)}">Réclamer</button>`
                : `<p class="a-faire">Encore ${Math.max(0, r.seuil - total)} ${esc(monnaie())}.</p>`
          }
        </article>`,
        )
        .join('')}
    </section>`;
}

// ---------- Mode admin ----------

function vueAdmin() {
  if (!adminOK) {
    return `
      <section class="admin-acces">
        <h2>Mode administrateur</h2>
        <p>Entrez le NIP pour modifier les attraits, le passeport, les récompenses et les paramètres.</p>
        <form data-form="pin" class="ligne">
          <label class="sr" for="pin">NIP</label>
          <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="off" required>
          <button>Déverrouiller</button>
        </form>
        <p class="petit">Le NIP est conservé sur cet appareil : ce n’est pas une protection forte.</p>
      </section>`;
  }
  const onglets = [
    ['attraits', 'Attraits'],
    ['passeport', 'Passeport'],
    ['recompenses', 'Récompenses'],
    ['parametres', 'Paramètres'],
  ];
  const corps = {
    attraits: adminAttraits,
    passeport: adminPasseport,
    recompenses: adminRecompenses,
    parametres: adminParametres,
  }[onglet]();
  return `
    <nav class="sous-onglets" aria-label="Sections de l’administration">
      ${onglets
        .map(([k, l]) => `<button data-action="onglet" data-onglet="${k}" aria-pressed="${onglet === k}">${l}</button>`)
        .join('')}
      <button data-action="verrouiller" class="discret">Verrouiller</button>
    </nav>
    ${corps}`;
}

function adminAttraits() {
  if (editId !== null) {
    return formAttrait(editId ? trouver(state.attraits, editId) : null);
  }
  return `
    <div class="entete-section">
      <h2>Attraits (${state.attraits.length})</h2>
      <button data-action="nouvel-attrait">+ Ajouter</button>
    </div>
    <div class="liste-admin">
      ${state.attraits
        .map(
          (a) => `
        <article class="carte admin-item">
          <div>
            <strong>${esc(a.nom)}</strong>
            <span class="petit">${esc(a.categorie || '')}</span><br>
            <span class="petit">Code : <code>${esc(a.codeQR)}</code> · ${a.actif ? 'Actif' : 'Inactif'}
            · ${state.joueur.etampes[a.id] ? 'étampé' : 'non étampé'}</span>
          </div>
          <div class="actions">
            <button data-action="edit-attrait" data-id="${esc(a.id)}">Modifier</button>
            <button data-action="qr" data-id="${esc(a.id)}">QR</button>
            <button data-action="toggle-attrait" data-id="${esc(a.id)}">${a.actif ? 'Désactiver' : 'Activer'}</button>
            <button data-action="supprimer-attrait" data-id="${esc(a.id)}" class="danger">Supprimer</button>
          </div>
        </article>`,
        )
        .join('')}
    </div>`;
}

function formAttrait(a) {
  const v = a || {};
  return `
    <h2>${a ? 'Modifier l’attrait' : 'Nouvel attrait'}</h2>
    <form data-form="attrait" class="formulaire">
      <label>Nom <input name="nom" required maxlength="120" value="${esc(v.nom)}"></label>
      <label>Catégorie <input name="categorie" maxlength="60" value="${esc(v.categorie)}" placeholder="Patrimoine, Nature, Traversier…"></label>
      <label>Lieu <input name="lieu" maxlength="120" value="${esc(v.lieu)}"></label>
      <label>Description <textarea name="description" rows="4" maxlength="1000">${esc(v.description)}</textarea></label>
      <label>Code QR
        <span class="ligne">
          <input name="codeQR" maxlength="24" value="${esc(v.codeQR)}" placeholder="Vide = généré automatiquement">
          <button type="button" data-action="regen-code">Nouveau code</button>
        </span>
      </label>
      <label>Ordre d’affichage <input name="ordre" type="number" value="${esc(v.ordre ?? '')}"></label>
      <label class="case"><input type="checkbox" name="actif" ${v.actif !== false ? 'checked' : ''}> Actif (visible et scannable)</label>
      <div class="actions">
        <button>Enregistrer</button>
        <button type="button" data-action="annuler-edit" class="discret">Annuler</button>
      </div>
    </form>`;
}

function adminPasseport() {
  const lignes = [...state.attraits]
    .sort((a, b) => a.ordre - b.ordre)
    .map((a) => {
      const et = state.joueur.etampes[a.id];
      const source = et ? (et.source === 'admin' ? 'manuel' : 'scanné') : '';
      return `
        <label class="case ligne-etampe">
          <input type="checkbox" data-action="basculer-etampe" data-id="${esc(a.id)}" ${et ? 'checked' : ''}>
          <span>${esc(a.nom)}</span>
          <span class="petit">${source}</span>
        </label>`;
    })
    .join('');
  const ajustements = state.joueur.ajustements
    .map(
      (a) => `
      <li>
        <strong>${a.montant > 0 ? '+' : ''}${a.montant} ${esc(monnaie())}</strong> ${esc(a.note || '')}
        <span class="petit">${esc(fmt(a.date))}</span>
        <button data-action="supprimer-ajustement" data-id="${esc(a.id)}" class="petit danger">Retirer</button>
      </li>`,
    )
    .join('');
  return `
    <h2>Passeport de ${esc(state.joueur.nom || 'visiteur')}</h2>
    <form data-form="nom-joueur" class="ligne nom">
      <label class="sr" for="nom-admin">Nom</label>
      <input id="nom-admin" name="nom" value="${esc(state.joueur.nom)}" maxlength="60" placeholder="Nom du visiteur">
      <button>Enregistrer</button>
    </form>
    <h3>Étampes</h3>
    <p class="petit">Cochez pour ajouter ou retirer une étampe à la main.</p>
    <div class="liste-cases">${lignes}</div>
    <h3>Pistoles</h3>
    <p>Total : <strong>${core.totalPistoles(state)} ${esc(monnaie())}</strong>
      <span class="petit">(${core.nbEtampes(state)} étampe(s) × ${state.settings.pistolesParEtampe} + ajustements ${core.sommeAjustements(state)})</span></p>
    <form data-form="ajustement" class="ligne">
      <label class="sr" for="montant">Montant</label>
      <input id="montant" name="montant" type="number" step="1" required placeholder="+5 ou -3">
      <label class="sr" for="note">Motif</label>
      <input id="note" name="note" maxlength="120" placeholder="Motif (facultatif)">
      <button>Ajouter</button>
    </form>
    <ul class="ajustements">${ajustements || '<li class="petit">Aucun ajustement manuel.</li>'}</ul>
    <h3>Réinitialiser</h3>
    <button data-action="reset-passeport" class="danger">Vider le passeport</button>`;
}

function adminRecompenses() {
  if (editRecoId !== null) {
    return formRecompense(editRecoId ? trouver(state.recompenses, editRecoId) : null);
  }
  const liste = [...state.recompenses].sort((a, b) => a.seuil - b.seuil);
  return `
    <div class="entete-section">
      <h2>Récompenses</h2>
      <button data-action="nouvelle-reco">+ Ajouter</button>
    </div>
    <div class="liste-admin">
      ${liste
        .map((r) => {
          const date = state.joueur.reclamees[r.id];
          return `
          <article class="carte admin-item">
            <div>
              <strong>${esc(r.titre)}</strong> — ${r.seuil} ${esc(monnaie())}<br>
              <span class="petit">${esc(r.description || '')}</span><br>
              <span class="petit">${date ? `Réclamée le ${esc(fmt(date))}` : 'Non réclamée'}</span>
            </div>
            <div class="actions">
              <button data-action="edit-reco" data-id="${esc(r.id)}">Modifier</button>
              ${date ? `<button data-action="annuler-reclamation" data-id="${esc(r.id)}">Annuler la réclamation</button>` : ''}
              <button data-action="supprimer-reco" data-id="${esc(r.id)}" class="danger">Supprimer</button>
            </div>
          </article>`;
        })
        .join('')}
    </div>`;
}

function formRecompense(r) {
  const v = r || {};
  return `
    <h2>${r ? 'Modifier la récompense' : 'Nouvelle récompense'}</h2>
    <form data-form="recompense" class="formulaire">
      <label>Titre <input name="titre" required maxlength="120" value="${esc(v.titre)}"></label>
      <label>Seuil (${esc(monnaie())}) <input name="seuil" type="number" min="1" required value="${esc(v.seuil ?? '')}"></label>
      <label>Description <textarea name="description" rows="3" maxlength="500">${esc(v.description)}</textarea></label>
      <div class="actions">
        <button>Enregistrer</button>
        <button type="button" data-action="annuler-edit" class="discret">Annuler</button>
      </div>
    </form>`;
}

function adminParametres() {
  const s = state.settings;
  return `
    <h2>Paramètres</h2>
    <form data-form="parametres" class="formulaire">
      <label>Titre <input name="titre" maxlength="200" value="${esc(s.titre)}"></label>
      <label>Sous-titre <input name="sousTitre" maxlength="200" value="${esc(s.sousTitre)}"></label>
      <label>Territoire <input name="mrc" maxlength="200" value="${esc(s.mrc)}"></label>
      <label>Nom de la monnaie <input name="monnaie" maxlength="200" value="${esc(s.monnaie)}"></label>
      <label>Pistoles par étampe <input name="pistolesParEtampe" type="number" min="0" value="${esc(s.pistolesParEtampe)}"></label>
      <label>NIP administrateur (4 caractères min.) <input name="pinAdmin" minlength="4" value="${esc(s.pinAdmin)}"></label>
      <div class="actions"><button>Enregistrer les paramètres</button></div>
    </form>
    <h3>Données</h3>
    <div class="actions">
      <button data-action="exporter">Exporter (JSON)</button>
      <label class="bouton">Importer (JSON)<input id="import-fichier" type="file" accept="application/json,.json" hidden></label>
      <button data-action="reset-tout" class="danger">Tout réinitialiser</button>
    </div>
    <p class="petit">Les données sont conservées sur cet appareil. Exportez une sauvegarde régulièrement.</p>`;
}

// ---------- Actions ----------

function appliquer(r, succes) {
  if (!r.ok) {
    dire((r.erreurs || [r.erreur]).join(' '), 'erreur');
  } else {
    state = r.state;
    sauver();
    if (succes) dire(succes, 'succes');
  }
  rendu();
}

const ACTIONS = {
  vue(el) {
    vue = el.dataset.vue;
    onglet = 'attraits';
    editId = null;
    editRecoId = null;
    banniere = null;
    rendu();
  },
  onglet(el) {
    onglet = el.dataset.onglet;
    editId = null;
    editRecoId = null;
    rendu();
  },
  verrouiller() {
    adminOK = false;
    rendu();
  },
  'nouvel-attrait'() {
    editId = '';
    rendu();
  },
  'edit-attrait'(el) {
    editId = el.dataset.id;
    rendu();
  },
  'annuler-edit'() {
    editId = null;
    editRecoId = null;
    rendu();
  },
  'regen-code'(el) {
    el.form.elements.codeQR.value = core.nouveauCode(state);
  },
  'toggle-attrait'(el) {
    const a = trouver(state.attraits, el.dataset.id);
    if (a) appliquer(core.sauverAttrait(state, { ...a, actif: !a.actif }), 'Attrait mis à jour.');
  },
  'supprimer-attrait'(el) {
    const a = trouver(state.attraits, el.dataset.id);
    if (!a || !confirm(`Supprimer « ${a.nom} » et son étampe ?`)) return;
    appliquer(core.supprimerAttrait(state, a.id), 'Attrait supprimé.');
  },
  qr(el) {
    ouvrirQR(el.dataset.id);
  },
  imprimer() {
    window.print();
  },
  'basculer-etampe'(el) {
    appliquer(core.basculerEtampe(state, el.dataset.id));
  },
  'supprimer-ajustement'(el) {
    appliquer(core.supprimerAjustement(state, el.dataset.id));
  },
  'reset-passeport'() {
    if (!confirm('Vider le passeport (étampes, pistoles, réclamations) ?')) return;
    appliquer(core.reinitialiserPasseport(state), 'Passeport vidé.');
  },
  'nouvelle-reco'() {
    editRecoId = '';
    rendu();
  },
  'edit-reco'(el) {
    editRecoId = el.dataset.id;
    rendu();
  },
  'supprimer-reco'(el) {
    const r = trouver(state.recompenses, el.dataset.id);
    if (!r || !confirm(`Supprimer la récompense « ${r.titre} » ?`)) return;
    appliquer(core.supprimerRecompense(state, r.id), 'Récompense supprimée.');
  },
  reclamer(el) {
    appliquer(core.reclamer(state, el.dataset.id), 'Récompense réclamée !');
  },
  'annuler-reclamation'(el) {
    appliquer(core.annulerReclamation(state, el.dataset.id), 'Réclamation annulée.');
  },
  exporter() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `passeport-basques-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'reset-tout'() {
    if (!confirm('Effacer TOUTES les données (attraits, récompenses, passeport, paramètres) ?')) return;
    state = core.defaultState();
    sauver();
    dire('Données réinitialisées.', 'succes');
    rendu();
  },
  'fermer-modal': fermerModal,
};

const FORMS = {
  pin(fd) {
    if (fd.get('pin') === state.settings.pinAdmin) {
      adminOK = true;
      banniere = null;
    } else {
      dire('NIP incorrect.', 'erreur');
    }
    rendu();
  },
  attrait(fd) {
    const r = core.sauverAttrait(state, {
      id: editId || undefined,
      nom: fd.get('nom'),
      categorie: fd.get('categorie'),
      lieu: fd.get('lieu'),
      description: fd.get('description'),
      codeQR: fd.get('codeQR'),
      actif: fd.has('actif'),
      ordre: fd.get('ordre'),
    });
    if (r.ok) editId = null;
    appliquer(r, 'Attrait enregistré.');
  },
  recompense(fd) {
    const r = core.sauverRecompense(state, {
      id: editRecoId || undefined,
      titre: fd.get('titre'),
      seuil: fd.get('seuil'),
      description: fd.get('description'),
    });
    if (r.ok) editRecoId = null;
    appliquer(r, 'Récompense enregistrée.');
  },
  parametres(fd) {
    appliquer(core.sauverParametres(state, Object.fromEntries(fd)), 'Paramètres enregistrés.');
  },
  ajustement(fd) {
    appliquer(core.ajouterAjustement(state, fd.get('montant'), fd.get('note')), 'Ajustement ajouté.');
  },
  'nom-joueur'(fd) {
    appliquer(core.definirNomJoueur(state, fd.get('nom')));
  },
  'scan-manuel'(fd) {
    traiterCode(String(fd.get('code') ?? ''));
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) {
    ACTIONS[el.dataset.action](el, e);
    return;
  }
  if (e.target.id === 'modal') fermerModal();
});

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (!f.dataset.form) return;
  e.preventDefault();
  if (FORMS[f.dataset.form]) FORMS[f.dataset.form](new FormData(f));
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'import-fichier') importer(e.target.files[0]);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fermerModal();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) arreterScanner();
});

async function importer(fichier) {
  if (!fichier) return;
  let obj;
  try {
    obj = JSON.parse(await fichier.text());
  } catch {
    dire('Fichier JSON invalide.', 'erreur');
    rendu();
    return;
  }
  const v = core.valider(obj);
  if (!v.ok) {
    dire(v.erreur, 'erreur');
    rendu();
    return;
  }
  if (!confirm('Remplacer les données actuelles par cette sauvegarde ?')) {
    rendu();
    return;
  }
  state = core.normaliser(obj);
  sauver();
  dire('Sauvegarde importée.', 'succes');
  rendu();
}

// ---------- Scan de codes QR ----------

const MESSAGES = {
  'code-inconnu': () => 'Ce code QR ne correspond à aucun attrait du passeport.',
  inactif: (r) => `${r.attrait.nom} n’est pas disponible pour le moment.`,
  deja: (r) => `${r.attrait.nom} est déjà étampé dans votre passeport.`,
};

function traiterCode(valeur) {
  const brut = core.extraireCode(valeur);
  if (!brut) {
    dire('Saisissez un code.', 'erreur');
    rendu();
    return;
  }
  const r = core.estampiller(state, brut);
  if (r.ok) {
    state = r.state;
    sauver();
    dernier = r.attrait.id;
    dire(`${r.attrait.nom} : étampe ajoutée ! +${r.gain} ${monnaie()}.`, 'succes');
  } else {
    dire(MESSAGES[r.raison](r), 'erreur');
  }
  vue = 'passeport';
  rendu();
}

async function demarrerScanner() {
  arreterScanner();
  const video = document.getElementById('scan-video');
  const statut = document.getElementById('scan-statut');
  if (!video || !('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) return;
  try {
    flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = flux;
    await video.play();
    const detecteur = new BarcodeDetector({ formats: ['qr_code'] });
    timerScan = setInterval(async () => {
      if (video.readyState < 2 || !timerScan) return;
      try {
        const codes = await detecteur.detect(video);
        if (codes.length && timerScan) traiterCode(codes[0].rawValue);
      } catch {
        /* image pas encore prête : on réessaie */
      }
    }, 350);
    if (statut) statut.textContent = 'Pointez la caméra vers le code QR…';
  } catch {
    if (statut) statut.textContent = 'Caméra inaccessible (autorisation refusée ?). Utilisez la saisie manuelle.';
  }
}

function arreterScanner() {
  clearInterval(timerScan);
  timerScan = null;
  if (flux) {
    flux.getTracks().forEach((t) => t.stop());
    flux = null;
  }
}

// ---------- QR d'un attrait (mode admin) ----------

function ouvrirQR(id) {
  const a = trouver(state.attraits, id);
  if (!a) return;
  const url = core.urlPourCode(location.href, a.codeQR);
  document.getElementById('modal-titre').textContent = a.nom;
  const corps = document.getElementById('modal-corps');
  corps.innerHTML = `
    <div id="qr-image" class="qr"></div>
    <p class="petit">Code : <code>${esc(a.codeQR)}</code></p>
    <p class="petit url">${esc(url)}</p>
    <div class="actions">
      <button data-action="imprimer">Imprimer</button>
      <button data-action="fermer-modal" class="discret">Fermer</button>
    </div>`;
  if (window.QRCode) {
    new QRCode(document.getElementById('qr-image'), {
      text: url,
      width: 240,
      height: 240,
      correctLevel: QRCode.CorrectLevel.M,
    });
  } else {
    document.getElementById('qr-image').innerHTML =
      '<p class="erreur">Générateur de QR indisponible (connexion requise au premier chargement).</p>';
  }
  document.getElementById('modal').hidden = false;
}

function fermerModal() {
  document.getElementById('modal').hidden = true;
  document.getElementById('modal-corps').innerHTML = '';
}

// ---------- Installation sur l'écran d'accueil ----------

const dejaInstallee = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const iosSafari = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
let invitation = null; // événement beforeinstallprompt (Chrome, Edge, Android)
let plusTard = false;
try {
  plusTard = localStorage.getItem(`${core.STORAGE_KEY}:plus-tard`) === '1';
} catch {
  /* ignoré */
}

function majInstallation() {
  const bloc = document.getElementById('installation');
  if (!bloc) return;
  const montrer = !dejaInstallee && !plusTard && (invitation || iosSafari);
  bloc.hidden = !montrer;
  document.getElementById('btn-installer').hidden = !invitation;
  document.getElementById('aide-ios').hidden = !(iosSafari && !invitation);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  invitation = e;
  majInstallation();
});

window.addEventListener('appinstalled', () => {
  invitation = null;
  majInstallation();
});

document.getElementById('btn-installer').addEventListener('click', async () => {
  if (!invitation) return;
  invitation.prompt();
  await invitation.userChoice;
  invitation = null;
  majInstallation();
});

document.getElementById('btn-plus-tard').addEventListener('click', () => {
  plusTard = true;
  try {
    localStorage.setItem(`${core.STORAGE_KEY}:plus-tard`, '1');
  } catch {
    /* ignoré */
  }
  majInstallation();
});

majInstallation();

// ---------- Démarrage ----------

const codeInitial = new URLSearchParams(location.search).get('e');
if (codeInitial) {
  history.replaceState(null, '', location.pathname);
  traiterCode(codeInitial);
} else {
  rendu();
}
