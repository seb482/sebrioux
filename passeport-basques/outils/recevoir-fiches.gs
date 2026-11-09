/**
 * Reçoit les fiches du passeport et les ajoute à la feuille de calcul.
 *
 * Mise en service (une seule fois, dans le compte qui possède le tableur) :
 *   1. Ouvrir le tableur « Fiches WowLesBasque ».
 *   2. Extensions > Apps Script. Remplacer le contenu par ce fichier. Enregistrer.
 *   3. Déployer > Nouveau déploiement > Type : application Web.
 *        Exécuter en tant que : moi
 *        Accès : Tout le monde
 *   4. Copier l'URL du déploiement (elle se termine par /exec) et la donner au développeur.
 *
 * La feuille doit avoir ces colonnes en ligne 1 (A à K), dans cet ordre :
 *   Reçu le | Numéro de passeport | Nom de famille | Prénoms | Sexe | Lieu de résidence |
 *   Date d'émission | Courriel | Infolettre | Nombre d'étampes | Pistoles
 */

const FEUILLE = 'Feuille 1';

function doPost(e) {
  try {
    const f = JSON.parse(e.postData.contents);
    const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEUILLE);
    const numero = String(f.numero || '');
    // Une seule ligne par passeport : si le numéro existe déjà, on met la ligne à jour.
    const donnees = feuille.getDataRange().getValues();
    let ligne = -1;
    for (let i = 1; i < donnees.length; i++) {
      if (String(donnees[i][1]) === numero) { ligne = i + 1; break; }
    }
    const valeurs = [
      new Date(),
      numero,
      f.nom || '',
      f.prenoms || '',
      f.sexe || '',
      f.residence || '',
      f.emission || '',
      f.courriel || '',
      f.infolettre === 'oui' ? 'Oui' : (f.infolettre === 'non' ? 'Non' : ''),
      Number(f.nombreEtampes) || 0,
      Number(f.pistoles) || 0,
    ];
    if (ligne > 0) {
      feuille.getRange(ligne, 1, 1, valeurs.length).setValues([valeurs]);
    } else {
      feuille.appendRow(valeurs);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, erreur: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}
