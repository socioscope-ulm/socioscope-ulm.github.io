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
10. Le workflow temporaire stage-autonomy.yml a déjà été retiré de main après la copie ; maintenir la branche de préparation sans nouvelle synchronisation implicite.

## Retour arrière
Revenir au commit GitHub Pages précédent sans modifier le projet Supabase.

## Audit technique — 21 octobre 2026

### Déjà préparé et vérifié
- Copie autonome du code source dans cette branche du **nouveau** dépôt GitHub.
- Compilation de l'interface depuis cette branche, sans checkout de l'ancien dépôt : **réussie** dans GitHub Actions.
- Workflow de publication autonome préparé dans `.github/workflows/deploy-pages.yml`, inactif tant que la branche n'est pas fusionnée sur main.
- Workflow de déploiement serveur indépendant préparé dans `.github/workflows/deploy-supabase.yml`, exclusivement manuel et explicitement bloqué en l'absence de références privées.
- Origine de référence du futur serveur mise à `https://socioscope-ulm.github.io` ; l'ancien domaine reste temporairement autorisé pendant la cohabitation.
- Suppression de l'ancien workflow concurrent de la branche main du nouveau dépôt : il reconstruisait toutes les 15 minutes depuis l'ancien dépôt et remplaçait l'API par `socioscope-bridge`. Un seul workflow de publication reste opérationnel en production.

### Limitations à lever AVANT de rendre le dépôt historique supprimable
- La fonction Supabase actuelle reste déployée à partir d'un ancien paquet construit à partir du dépôt historique. La nouvelle branche contient ses sources, mais les références `private-data/references/` nécessaires à un **nouveau** build backend ne figurent pas dans GitHub.
- Stocker les références dans un support privé contrôlé (par exemple le bucket privé Supabase), ou les restaurer dans GitHub Actions depuis un système sécurisé ; ne jamais les ajouter au dépôt Git public.
- Prévoir le secret de déploiement `SUPABASE_ACCESS_TOKEN` dans le nouveau dépôt, et un test du déploiement serveur complet avec sauvegarde/retour arrière.
- Un build frontal réussi ne valide pas les connexions et écritures métier authentifiées ; réaliser une recette en conditions réelles avec un compte administrateur et un compte lecteur.
- Ne pas modifier les URLs de redirection Supabase Auth sans vérifier les liens d'invitation et de récupération de compte.
- Tant que la branche n'est pas fusionnée, `.github/workflows/deploy-pages.yml` sur main utilise encore l'ancien dépôt ; cette dépendance est conservée volontairement pour éviter une coupure.

### Vérifications de non-régression des imports

| Parcours | Stockage/traitement | À tester après bascule |
|---|---|---|
| Bilan social | `imports`, objets `imports/`, observations | Nouveau fichier, validation, rafraîchissement des tableaux et écarts annuels |
| Fichier individuel | `agent_imports`, objets `agents/` | Nouvelle année, choix automatiquement du fichier précédent, mouvements et effectifs |
| RUP | `agent_imports` et `agents/` | Mise à jour des dates, anciennetés et fiches individuelles |
| Grilles et primes | `payroll_imports`, références validées | Actualisation des rémunérations, calculs horaires et comparatifs |
| Décisions administrateur | `agent_decisions` | Départs, présences, rapprochements, corrections et cadres dirigeants manuels |
| Exports | Données déjà validées | CSV des absents, exports des analyses et PDF |

**Niveau de préparation :** copie du frontend et workflows autonome effectués ; sortie de dépendance backend et recette fonctionnelle encore requises. **Ne pas fusionner sur main.**

### Vérification supplémentaire : propriété Supabase
Le projet Supabase `Socioscope ULM` est en état `ACTIVE_HEALTHY` et identifié par `ovssjbldmsowzojeftyr`. Avant l'abandon du compte GitHub historique, vérifier **qui administre l'organisation Supabase propriétaire du projet**, la facturation, les sauvegardes, et que l'équipe du nouveau Socioscope conservera tous les droits de gestion indépendamment de l'ancien compte GitHub.

### Préparation du serveur encore bloquée
Les trois fichiers de barèmes intégrés dans l'actuel serveur déployé ne sont pas disponibles dans le dépôt historique public, ni sous les objets de stockage nommés `references/` dans le bucket consulté. Les conserver hors Git est obligatoire, mais ils devront être restaurés depuis leur source fiable puis provisionnés en privé afin que la nouvelle organisation puisse reconstruire et déployer `socioscope-api` sans l'ancien dépôt. La recette devra confirmer les mêmes résultats numériques que la version en production, surtout pour rémunérations et coefficients.
