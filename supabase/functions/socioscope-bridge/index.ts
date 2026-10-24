// Ancien relais retiré de la chaîne de production autonome Socioscope ULM.
// Ce fichier est conservé uniquement pour empêcher toute réactivation accidentelle.
// L'application utilise directement /functions/v1/socioscope-api sur son projet Supabase.
// Aucun appel, proxy, ni redirection vers l'ancienne adresse n'est autorisé ici.
Deno.serve(() => new Response('Historical bridge retired', {status:410}));
