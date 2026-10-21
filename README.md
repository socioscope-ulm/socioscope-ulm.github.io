# Socioscope ULM

Application de consultation des bilans sociaux et des situations individuelles ULM.

- Interface GitHub Pages ; connexion Supabase par adresse mail et mot de passe.
- Documents et historiques exclusivement dans le stockage privé Supabase.
- Administration réservée aux comptes autorisés comme administrateurs ; lecteurs en consultation seule.
- Les permissions sont contrôlées côté serveur à chaque requête.

## Développement

Installer les versions déclarées dans `package.json`, puis `npm run build`. La sortie statique est `docs/`.

Le serveur `server/index.ts` est une fonction Supabase Edge. Ses variables sensibles sont fournies par Supabase ; ne jamais les placer dans le site ou le dépôt. Les données d’historique et les documents ne font pas partie du dépôt.
