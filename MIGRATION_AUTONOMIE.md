# Suivi de la bascule autonome — état de production

**Statut au 21 octobre 2026 : frontend et API autonomes publiés, retour arrière conservé.**

- Application GitHub Pages déployée depuis `socioscope-ulm/socioscope-ulm.github.io` : [run réussi](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39638217181).
- Serveur Supabase `socioscope-api` **version 21 active**, déployée depuis les sources GitHub du nouveau dépôt et les références privées `socioscope.salary_references`.
- Vérification autonome du client et de la compilation du serveur : [run réussi](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39638396442).
- Tests publics sans identifiants : [run réussi](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39637494090) (page HTTP 200, CORS ancien/nouveau domaine 204, accès sans session 401, origine inconnue 403).
- Version antérieure du site : branche `retour-arriere-avant-autonomie-20261021` (commit `72ad188ffb2cddb40fe95fadbb5f3b89e28685f7`).
- Version 20 antérieure de la fonction `socioscope-api` : **source exacte 796649 caractères** sauvegardée dans `socioscope_backup.edge_function_rollback_20261021`, empreinte MD5 `81606e86cc60508fae2199b7f66acc60`. L'archive se trouve dans un schéma non accessible aux utilisateurs anonymes.
- Tables et références conservées, snapshots datés ; aucun effacement des 29 objets du bucket privé et aucune suppression de l'ancien dépôt ou de l'ancienne adresse.
- **Reste à vérifier** : connexion réelle administrateur/lecteur, imports Excel/RUP, écritures, calculs et exports après la version 21. **Sauvegarde externe complète non effectuée**.

## Procédure de retour arrière (si nécessaire)

1. Restaurer d'abord `socioscope-api` version 20 à l'aide du code exact enregistré en privé dans `socioscope_backup.edge_function_rollback_20261021` via le déploiement Supabase ; conserver `verify_jwt=false` comme sur l'original et vérifier l'accès API sans connexion.
2. Re-publier, si besoin, la version historique du site depuis la branche de secours (commit indiqué) ou rétablir le workflow Pages historique pointant vers l'ancien dépôt. Le simple changement d'adresse URL ne rétablit pas le backend.
3. **Ne pas restaurer automatiquement un snapshot de données daté** : des utilisateurs peuvent avoir saisi de nouvelles données entre-temps. Ne faire de restauration de données qu'après vérification et analyse ciblée.
4. Ne pas supprimer les tables de références ni l'ancien dépôt avant la validation métier complète.

---

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

## Conservation des majorations et filtres — exigence obligatoire
- Ne pas remplacer les règles existantes de `src/lib/agent-payroll.ts` (`agencyResidence`) ni les filtres de l'interface dans `src/app/agents.tsx`.
- Affectation actuellement programmée : AMTC / AMT CENTRE / CENTRE -> `1.24`; AMTE / AMT EST / EST et AMTSO / AMT SUD-OUEST / SUD-OUEST -> `1.245`. Une agence non reconnue utilise `1.245` à titre **provisoire** et doit conserver ce signalement.
- Le choix manuel de majoration du simulateur doit rester fonctionnel, en particulier `1.24`, `1.245` et `1.25` lorsque la grille propose la variante.
- Les grilles 2020, 2022, 2023 et 2026 transmises contiennent les trois variantes `1.25`, `1.245`, `1.24`, avec les montants en centimes et par NR / échelon. Pour 2026, la grille SGE commence au NR 50 : ne pas créer artificiellement de NR 30 à 45.
- Les années 2021, 2024 et 2025 sont déjà présentes dans la fonction `socioscope-api` en production : les récupérer telles quelles pour reconstruire l'historique et comparer les résultats, sans extrapoler à partir des années voisines.
- Vérifier une recette de non-régression à majoration identique : couples (NR, échelon, agence/filtre) sur plusieurs années, et conserver les paramètres de calcul des taux horaires, primes RPC/RPEM et exclusions actuelles.
- Pas de changement de règles de majoration en production lors de la migration des références : seuls les fichiers source et l'autonomie du déploiement sont concernés.

## Réalisation contrôlée du 21 octobre 2026 — récupération et sauvegarde
- Copie de précaution des sept tables métier dans le schéma privé `socioscope_backup`, sous noms suffixés `_20261021`. Vérification : 1 238 décisions, 5 comptes membres.
- Inventaire daté des 29 objets du bucket `socioscope-private` dans `socioscope_backup.storage_inventory_20261021` ; inventaire de 5 comptes Supabase Auth dans `socioscope_backup.auth_inventory_20261021`. **Ce sont des inventaires, pas des copies des objets ni une sauvegarde complète d'Auth.**
- Récupération exacte des trois jeux de références à partir du code déployé de la fonction `socioscope-api` version 20, préservée dans la table privée `socioscope_backup.salary_reference_recovery_20261021` : `salary-grid-2026.json` (3 majorations), `annual-bonuses-2025.json` (18 GF), `historical-salary-grids.json` (15 grilles). Ne jamais pousser ces contenus dans le dépôt public.
- Redirection des invitations et récupérations corrigée vers `https://socioscope-ulm.github.io/` **uniquement dans la branche de préparation**.
- **BLOQUANT** : les sauvegardes de tables résident sur le même projet Supabase que la production. Effectuer aussi un export PostgreSQL externe, une copie réelle des 29 fichiers privés et une vérification de restauration avant toute bascule.
- **BLOQUANT** : la procédure de déploiement indépendante a encore besoin d'un canal sécurisé de provisionnement des références et d'un accès `SUPABASE_ACCESS_TOKEN` configuré dans les secrets du nouveau dépôt ; aucune publication du serveur depuis le nouveau dépôt n'a été validée.
- Garder `main` et les deux adresses inchangées jusqu'aux tests fonctionnels authentifiés, et ne supprimer ni l'ancien site ni son dépôt.

## Avancement supplémentaire — reconstruction sans ancien dépôt
- La table privée `socioscope.salary_references` a été créée dans la même base Supabase et alimentée à partir des trois références sauvées ; RLS activée, pas de droits directs `anon`/`authenticated`.
- Contrôle d'intégrité effectué : les trois documents JSON sont rigoureusement identiques à ceux conservés dans `socioscope_backup.salary_reference_recovery_20261021`.
- `server/references.ts` lit désormais les références historiques depuis la base privée, côté serveur ; il n'importe plus de fichiers `private-data/references/*.json`.
- `src/lib/agent-payroll.ts` exige des références explicites validées et ne dépend plus des imports JSON privés embarqués ; les règles métier de majoration et d'échelon sont conservées.
- `server/index.ts` préserve l'origine autorisée sur les requêtes internes pour éviter les 403 en écriture depuis la nouvelle adresse, sans relâcher la liste des origines autorisées.
- La vérification GitHub Actions **Verify autonomous Socioscope source** : succès le 21 octobre 2026, run `39633946291` ; source sans checkout de l'ancien dépôt, compilation Pages réussie et tests de régression existants réussis.
- Le workflow de déploiement du serveur est préparé pour utiliser uniquement le code de la nouvelle organisation ; le secret GitHub `SUPABASE_ACCESS_TOKEN` reste à configurer pour le déclencher.
- **Aucune modification de la branche `main` et aucun redéploiement de `socioscope-api` en production : bascule réservée à la fin de la recette et de la sauvegarde externe.**

## Validation autonome complète depuis la nouvelle organisation
Le workflow GitHub Actions `Verify autonomous Socioscope source` a réussi intégralement sur `preparation-autonomie` le 21 octobre 2026 : https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39634743651 . Les étapes réussies couvrent : absence de référence à l'ancien dépôt, compilation statique Vite pour GitHub Pages, tests de régression, préparation de la fonction Edge, et vérification des types Deno du serveur. La fonction et l'interface sont donc **reconstructibles depuis le seul code du nouveau dépôt** ; ce succès ne prouve pas encore que les imports et calculs authentifiés fonctionnent après un nouveau déploiement, faute de test d'intégration live. 
