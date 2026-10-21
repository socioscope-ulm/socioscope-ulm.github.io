# Passage à une source autonome pour Socioscope ULM

**Statut : branche de préparation seulement. Ne pas supprimer l'ancien dépôt.**
Les fichiers du client et du serveur ont été copiés dans l'organisation socioscope-ulm.
La publication de la branche principale n'a pas été modifiée par cette opération.

## Dépendances permanentes à conserver
- Auth et comptes Supabase (membres, rôles et sessions).
- Base PostgreSQL du projet Supabase : imports, décisions, calculs et validations.
- Bucket privé socioscope-private : graines, fichiers originaux, RUP, extractions.
- Edge Function socioscope-api : version en production jusqu'à validation d'un déploiement depuis ce dépôt.

## Prérequis avant fusion sur main
1. Vérifier qu'un build GitHub Pages se réalise depuis ce dépôt, sans checkout de fnme-pointage.
2. Protéger et reconstituer hors Git les trois références privées attendues sous private-data/references/. Elles sont absentes du dépôt public. Ne pas déposer de données nominatives ou de secrets dans GitHub.
3. Configurer le secret SUPABASE_ACCESS_TOKEN sur le nouveau dépôt ; vérifier la possibilité de redéployer le serveur avant de supprimer l'ancien.
4. Vérifier l'URL de référence et les redirections Auth Supabase ; garder https://socioscope-ulm.github.io comme adresse principale.
5. Sauvegarder les tables, les utilisateurs et le stockage Supabase avant bascule.
6. Tester les imports nouveaux et leur validation pour bilans sociaux, fichiers individuels, RUP et références salariales ; vérifier tous les recalculs (évolutions, emplois, NR/GF, GF19, masse salariale, rémunération, CSV/PDF).
7. Tester les rôles admin/lecteur, les rapprochements, les départs confirmés, les cadres dirigeants et les fiches manuelles.
8. Effectuer la bascule du build et de l'API depuis le nouveau dépôt, puis observer une période de stabilité.
9. Ensuite seulement supprimer le relais socioscope-bridge et l'ancien dépôt.
10. Supprimer le workflow temporaire stage-autonomy.yml une fois la bascule terminée.

## Retour arrière
Revenir au commit GitHub Pages précédent sans modifier le projet Supabase.
