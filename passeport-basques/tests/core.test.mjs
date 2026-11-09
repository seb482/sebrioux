import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../js/core.js';

const base = () => core.defaultState();

test('un scan ajoute une étampe et crédite les pistoles', () => {
  const s = base();
  const r = core.estampiller(s, 'TRAVERSE-01', '2026-07-01T12:00:00.000Z');
  assert.equal(r.ok, true);
  assert.equal(r.gain, 10);
  assert.equal(r.attrait.id, 'traverse-trois-pistoles');
  assert.equal(core.totalPistoles(r.state), 10);
  assert.equal(core.nbEtampes(r.state), 1);
  // l'état d'origine n'est pas modifié
  assert.equal(core.nbEtampes(s), 0);
});

test('un même attrait ne peut être étampé qu’une fois', () => {
  const s = core.estampiller(base(), 'ILES-02').state;
  const r = core.estampiller(s, 'ILES-02');
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'deja');
  assert.equal(core.totalPistoles(s), 10);
});

test('code inconnu et attrait inactif sont refusés', () => {
  assert.equal(core.estampiller(base(), 'NOPE-99').raison, 'code-inconnu');
  const s = base();
  s.attraits[1].actif = false;
  const r = core.estampiller(s, 'ILES-02');
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'inactif');
});

test('la recherche de code ignore la casse et les espaces', () => {
  const r = core.estampiller(base(), '  traverse-01 ');
  assert.equal(r.ok, true);
});

test('extraireCode lit une URL de QR ou un code brut', () => {
  assert.equal(core.extraireCode('https://seb482.github.io/sebrioux/passeport-basques/?e=TRAVERSE-01'), 'TRAVERSE-01');
  assert.equal(core.extraireCode('https://x.test/?foo=1&e=ILES%2D02#top'), 'ILES-02');
  assert.equal(core.extraireCode('  EGLISE-03 '), 'EGLISE-03');
});

test('urlPourCode remplace l’ancienne query et le fragment', () => {
  const url = core.urlPourCode('https://exemple.test/app/?e=ANCIEN&x=1#haut', 'NOUVEAU-7');
  assert.equal(url, 'https://exemple.test/app/?e=NOUVEAU-7');
});

test('les pistoles incluent les ajustements manuels et ne descendent pas sous zéro', () => {
  let s = core.estampiller(base(), 'TRAVERSE-01').state;
  s = core.ajouterAjustement(s, 5, 'Bonus accueil').state;
  assert.equal(core.totalPistoles(s), 15);
  s = core.ajouterAjustement(s, -40, 'Correction').state;
  assert.equal(core.totalPistoles(s), 0);
  assert.equal(core.ajouterAjustement(s, 0).ok, false);
  assert.equal(core.ajouterAjustement(s, 'abc').ok, false);
});

test('les récompenses se débloquent selon les seuils et se réclament une seule fois', () => {
  let s = base();
  for (const c of ['TRAVERSE-01', 'ILES-02', 'EGLISE-03']) s = core.estampiller(s, c).state;
  s = core.ajouterAjustement(s, 10, 'test').state; // total = 40
  const statut = core.statutRecompenses(s);
  const cafe = statut.find((r) => r.id === 'rec-cafe');
  const souvenir = statut.find((r) => r.id === 'rec-souvenir');
  assert.equal(cafe.debloquee, true);
  assert.equal(souvenir.debloquee, false);
  assert.ok(Math.abs(souvenir.progres - 0.8) < 1e-9);

  assert.equal(core.reclamer(s, 'rec-souvenir').ok, false);
  const r1 = core.reclamer(s, 'rec-cafe', '2026-07-02T10:00:00.000Z');
  assert.equal(r1.ok, true);
  assert.equal(core.reclamer(r1.state, 'rec-cafe').ok, false);
  assert.equal(core.statutRecompenses(r1.state).find((r) => r.id === 'rec-cafe').reclamee, true);

  const annulee = core.annulerReclamation(r1.state, 'rec-cafe').state;
  assert.equal(core.statutRecompenses(annulee).find((r) => r.id === 'rec-cafe').reclamee, false);
});

test('basculerEtampe ajoute puis retire une étampe manuelle', () => {
  const a = core.basculerEtampe(base(), 'eglise-trois-pistoles', '2026-07-03T00:00:00.000Z');
  assert.equal(a.state.joueur.etampes['eglise-trois-pistoles'].source, 'admin');
  const b = core.basculerEtampe(a.state, 'eglise-trois-pistoles');
  assert.equal(b.state.joueur.etampes['eglise-trois-pistoles'], undefined);
  assert.equal(core.basculerEtampe(base(), 'inconnu').ok, false);
});

test('sauverAttrait refuse un nom vide et un code QR déjà utilisé', () => {
  const s = base();
  const vide = core.sauverAttrait(s, { nom: '  ' });
  assert.equal(vide.ok, false);
  assert.ok(vide.erreurs.some((e) => e.includes('nom')));

  const doublon = core.sauverAttrait(s, { nom: 'Autre', codeQR: 'traverse-01' });
  assert.equal(doublon.ok, false);
  assert.ok(doublon.erreurs.some((e) => e.includes('déjà utilisé')));
});

test('sauverAttrait génère un code à la création et met à jour sans changer l’id', () => {
  const s = base();
  const cree = core.sauverAttrait(s, { nom: 'Halte panoramique', categorie: 'Nature' });
  assert.equal(cree.ok, true);
  assert.match(cree.attrait.codeQR, /^[A-Z0-9]{8}$/);
  assert.equal(cree.state.attraits.length, 4);

  const maj = core.sauverAttrait(cree.state, { id: cree.attrait.id, nom: 'Halte renommée', codeQR: cree.attrait.codeQR, actif: false });
  assert.equal(maj.ok, true);
  assert.equal(maj.state.attraits.length, 4);
  const trouve = maj.state.attraits.find((a) => a.id === cree.attrait.id);
  assert.equal(trouve.nom, 'Halte renommée');
  assert.equal(trouve.actif, false);
});

test('supprimer un attrait retire aussi son étampe', () => {
  const s = core.estampiller(base(), 'TRAVERSE-01').state;
  const r = core.supprimerAttrait(s, 'traverse-trois-pistoles');
  assert.equal(r.state.attraits.length, 2);
  assert.equal(core.totalPistoles(r.state), 0);
});

test('sauverRecompense valide le titre et le seuil', () => {
  assert.equal(core.sauverRecompense(base(), { titre: '', seuil: 5 }).ok, false);
  assert.equal(core.sauverRecompense(base(), { titre: 'X', seuil: 0 }).ok, false);
  const r = core.sauverRecompense(base(), { titre: 'Tuque', seuil: 75.4, description: 'Brodée' });
  assert.equal(r.ok, true);
  assert.equal(r.recompense.seuil, 75);
});

test('sauverParametres refuse un NIP trop court', () => {
  assert.equal(core.sauverParametres(base(), { pistolesParEtampe: 10, pinAdmin: '12' }).ok, false);
  const r = core.sauverParametres(base(), { titre: 'Mon passeport', pistolesParEtampe: '15', pinAdmin: '9876' });
  assert.equal(r.ok, true);
  assert.equal(r.state.settings.pistolesParEtampe, 15);
  assert.equal(r.state.settings.pinAdmin, '9876');
});

test('valider accepte l’état par défaut et refuse un code QR dupliqué', () => {
  assert.equal(core.valider(base()).ok, true);
  const s = base();
  s.attraits[1].codeQR = s.attraits[0].codeQR;
  assert.equal(core.valider(s).ok, false);
  assert.equal(core.valider(null).ok, false);
});

test('normaliser complète les champs facultatifs d’une sauvegarde', () => {
  const brut = { settings: { titre: 'T' }, attraits: [{ id: 'a', nom: 'A', codeQR: 'abcd-1' }], recompenses: [], joueur: {} };
  const n = core.normaliser(brut);
  assert.equal(n.attraits[0].codeQR, 'ABCD-1');
  assert.equal(n.attraits[0].actif, true);
  assert.deepEqual(n.joueur.etampes, {});
  assert.equal(n.settings.pistolesParEtampe, 10);
});

test('reinitialiserPasseport vide le passeport mais garde les attraits', () => {
  let s = core.estampiller(base(), 'TRAVERSE-01').state;
  s = core.definirNomJoueur(s, 'Léa').state;
  const r = core.reinitialiserPasseport(s).state;
  assert.equal(core.totalPistoles(r), 0);
  assert.equal(r.joueur.nom, '');
  assert.equal(r.attraits.length, 3);
});

test('fusionnerContenu remplace attraits et récompenses mais garde le passeport local', () => {
  let s = core.estampiller(base(), 'TRAVERSE-01').state;
  s.settings.pinAdmin = '5555';
  const contenu = {
    misAJour: '2026-12-01',
    settings: { titre: 'Nouveau titre', pistolesParEtampe: 20 },
    attraits: [{ id: 'nouveau', nom: 'Nouvel attrait', codeQR: 'NOUV-01', actif: true }],
    recompenses: [{ id: 'r', titre: 'R', seuil: 5 }],
  };
  const r = core.fusionnerContenu(s, contenu);
  assert.equal(r.ok, true);
  assert.equal(r.state.attraits.length, 1);
  assert.equal(r.state.settings.titre, 'Nouveau titre');
  assert.equal(r.state.settings.pinAdmin, '5555');
  assert.equal(r.state.misAJour, '2026-12-01');
  // l'étampe locale référence un attrait disparu : elle ne compte plus
  assert.equal(core.totalPistoles(r.state), 0);
});

test('fusionnerContenu refuse un contenu invalide sans toucher à l’état', () => {
  const s = base();
  assert.equal(core.fusionnerContenu(s, { attraits: 'pas une liste' }).ok, false);
});

test('contenuPourExport ne contient ni NIP ni passeport', () => {
  const s = core.estampiller(base(), 'TRAVERSE-01').state;
  const c = core.contenuPourExport(s);
  assert.equal(c.settings.pinAdmin, undefined);
  assert.equal(c.joueur, undefined);
  assert.equal(c.attraits.length, 3);
  // le contenu exporté est lisible par fusionnerContenu
  assert.equal(core.fusionnerContenu(base(), JSON.parse(JSON.stringify(c))).ok, true);
});

test('chaque passeport a un numéro de 9 chiffres conservé à la normalisation', () => {
  assert.match(base().joueur.numero, /^\d{9}$/);
  const brut = { settings: {}, attraits: [], recompenses: [], joueur: { numero: '123456789' } };
  assert.equal(core.normaliser(brut).joueur.numero, '123456789');
  const sans = core.normaliser({ settings: {}, attraits: [], recompenses: [], joueur: {} });
  assert.match(sans.joueur.numero, /^\d{9}$/);
});
