// Archivage de la version 3 de socioscope-transfer, déjà neutralisée avant le
// retrait : aucune opération de transfert, réponse HTTP 410 uniquement.
// Le dépôt autonome n'importe pas cette fonction et ne la déploie pas.
Deno.serve(() => new Response('Migration closed', {status:410}));
