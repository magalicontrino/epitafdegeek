/* Réglages du site publié.
 *
 * Ces deux valeurs apparaissent en clair dans la page mise en ligne : ce ne
 * sont pas des secrets, elles ont donc leur place dans le dépôt. Les garder
 * ici évite d'avoir à les retaper à chaque publication — et d'oublier, ce
 * qui remettrait le formulaire hors service.
 *
 * Les variables d'environnement restent prioritaires, pour un essai ponctuel.
 */

export const SITE = {
  // Nom de domaine du site publié. Écrit dans le fichier CNAME de GitHub Pages.
  domaine: process.env.DOMAINE ?? 'epitafdegeek.com',

  // Service qui reçoit les propositions et les transmet par e-mail.
  // Compte Formspree gratuit : 50 propositions par mois.
  formEndpoint: process.env.FORM_ENDPOINT ?? 'https://formspree.io/f/mgogbkrp',
};
