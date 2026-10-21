## Validation des tests fonctionnels et vérification des anciens relais — 21 octobre 2026

**Validation utilisateur** : les tests fonctionnels du nouveau site sont déclarés concluants, et le bandeau administrateur affiche bien `Version serveur v22`. L'utilisateur autorise la poursuite de l'audit de séparation ; aucune suppression de l'ancienne adresse ou des relais n'a été demandée explicitement à ce stade.

**État de production** : le site utilise directement la fonction `socioscope-api` v22. L'ancienne adresse et le nouveau site restent liés au **même projet Supabase** (ceci est normal et ne prouve pas une dépendance au dépôt GitHub historique).

**Relais hérités** :
- `socioscope-transfer` version 3 renvoie déjà `410 Migration closed` : elle n'assure plus de transfert actif.
- `socioscope-bridge` version 1 transmet les requêtes à `socioscope-api` en utilisant l'origine historique ; le nouveau client `src/session.ts` appelle directement `socioscope-api`, sans ce relais.
- Les derniers journaux observés du relais `socioscope-bridge` datent du 21 octobre 2026 à **13:47:22 UTC** ; les requêtes plus anciennes peuvent provenir de sessions encore ouvertes ou de tests. Les journaux ne garantissent pas l'absence de clients anciens.
- L'ancien dépôt `fnme-pointage/socioscope-ulm` contient le secours pour les liens d'authentification historiques et son workflow de déploiement est bloqué sauf confirmation explicite. Il est maintenu pour le retour arrière.

**Reste à réaliser avant le retrait effectif** :
1. Valider les réglages de redirection Auth côté Supabase, notamment invitations et réinitialisations de mot de passe depuis l'ancienne URL.
2. Organiser l'arrêt volontaire de l'ancienne adresse, en maintenant une redirection ou une page d'information pour les utilisateurs ayant enregistré l'ancien lien.
3. Après extinction de l'ancien site et contrôle d'absence d'usage, retirer la compatibilité CORS de l'ancien domaine par une nouvelle version testée de l'API.
4. Retirer `socioscope-bridge` et `socioscope-transfer` seulement après une autorisation explicite, en conservant leurs sources et les moyens de retour arrière.
5. La sauvegarde externe complète reste recommandée, mais l'utilisateur ne souhaite pas la rendre obligatoire à ce stade. **Aucune suppression du projet Supabase, des comptes, des données ou des fichiers privés n'est prévue.**

## Première republication entièrement autonome — 21 octobre 2026

- Demande métier : afficher le numéro **réel** de version du serveur dans le bandeau gauche, sous « Socioscope » et « ULM · Observatoire social », uniquement pour le compte administrateur.
- Le serveur utilise `DENO_DEPLOYMENT_ID` (variable d'exécution fournie par Supabase ; suffixe numérique) et renvoie `serverVersion` seulement dans la réponse de session administrateur.
- Interface et tests déployés exclusivement depuis `socioscope-ulm/socioscope-ulm.github.io`.
- Le workflow GitHub autonome a **publié avec succès la fonction `socioscope-api` version 22** : [GitHub Actions déploiement réussi](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39652236524).
- Le premier essai a échoué **avant le déploiement** en raison d'une limitation GitHub sur la résolution du dernier CLI Supabase. Le workflow a été corrigé en fixant la version `2.117.0`, puis relancé avec succès.
- Vérifications après déploiement : [contrôles publics et protection des sessions réussis](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39652190447) ; 5 membres, 1 238 décisions, 29 objets privés et 3 références salariales intacts.
- Le déclencheur temporaire créé pour ce premier essai a été **supprimé** après succès. Le workflow de serveur redevient exclusivement manuel.
- L'ancien site et son dépôt sont inchangés par cette fonctionnalité ; CORS historique maintenu pour permettre un retour arrière.
- Le test d'affichage avec une session d'administrateur dans le navigateur reste à valider par l'utilisateur. La version v22 est confirmée par l'API de gestion Supabase, et le parseur a été testé sur les formats documentés.

# État d'autonomie du Socioscope ULM — 21 octobre 2026

## Adresses
- Production : https://socioscope-ulm.github.io/
- Simulation hors production : https://socioscope-ulm.github.io/test/
- Ancienne adresse conservée : https://fnme-pointage.github.io/socioscope-ulm/

## Acquis
- Le nouveau site se construit et se publie depuis le seul dépôt `socioscope-ulm/socioscope-ulm.github.io`.
- Son serveur Supabase `socioscope-api` est déployé en **version 22** depuis le code présent dans ce dépôt.
- Les trois références salariales privées sont conservées dans `socioscope.salary_references`, hors GitHub.
- Les comptes et données métier partagent le projet Supabase `ovssjbldmsowzojeftyr` : il ne faut pas supprimer ce projet.
- Les utilisateurs et l'administrateur ont validé leurs connexions. La simulation Excel/RUP hors production a été testée.
- Un exemplaire exact du code du serveur v20 est archivé dans `socioscope_backup.edge_function_rollback_20261021` ; la version d'interface antérieure est conservée dans la branche GitHub `retour-arriere-avant-autonomie-20261021`.

## Publication suivante du serveur
Le workflow `.github/workflows/deploy-supabase.yml` est volontairement **manuel**. Il assemble dans GitHub Actions une copie complète du serveur et des routes nécessaires depuis ce dépôt, avec une configuration Deno locale et sans référence privée JSON, puis vérifie son code avant tout déploiement.

Le secret GitHub Actions `SUPABASE_ACCESS_TOKEN` a été ajouté au **nouveau dépôt**, puis validé le 21 octobre 2026 par [GitHub Actions — seconde exécution réussie du contrôle d'autorisation](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39648826329). Le workflow a utilisé le jeton pour consulter en lecture seule la liste des Edge Functions du projet Supabase ; il n'a déployé aucun code et n'a modifié aucune donnée.

L'autorisation de déploiement et la compilation sont vérifiées. **Une publication complète a réussi le 21 octobre 2026**, comme détaillé plus haut pour la version 22. Les prochaines publications restent manuelles et contrôlées.

Le mode de déploiement n'agit que sur `socioscope-api` et conserve `--no-verify-jwt` ; l'application elle-même vérifie les JWT Supabase et les comptes autorisés. Les futures mises à jour doivent être testées avant déclenchement manuel.

## Compatibilité et limites restantes
- **Sécurité du dépôt historique :** son workflow de déploiement Supabase exige désormais la confirmation manuelle `RESTAURER_ANCIEN_SERVEUR` avant toute réinstallation de l'ancien serveur, évitant une régression accidentelle. Le dépôt historique et le rollback restent accessibles. Une branche de secours du workflow a été créée : `secours-workflow-api-avant-verrouillage-20261021`.
- **Activité des relais :** `socioscope-bridge` a eu des requêtes plus tôt le 21 octobre 2026 ; dernière trace observée à 13:47 UTC, aucune requête sur les deux heures précédant la vérification. Ne pas le supprimer sur cette seule base ; l'API principale `socioscope-api` est bien active en version 22.
- Le serveur accepte provisoirement les origines `https://socioscope-ulm.github.io` **et** `https://fnme-pointage.github.io` pour préserver un retour arrière.
- Le dépôt historique n'est plus sollicité par les workflows du nouveau site. Son workflow d'API est déjà manuel, pas automatique.
- Le relais `socioscope-bridge` et la fonction `socioscope-transfer` restent présents dans Supabase. Leur suppression exigerait une étude d'usage indépendante : ils ne constituent pas une preuve que le nouveau site en dépend.
- La simulation `/test/` ne valide que les fonctions de lecture et rapprochement côté navigateur. Elle ne teste pas une nouvelle écriture de production ou une restauration intégrale.
- Les 29 fichiers du bucket privé ne disposent pas encore d'une sauvegarde externe indépendante complète.
- La base partagée Supabase est un service essentiel du nouveau site ; **ne pas supprimer le projet Supabase** en désactivant l'ancienne adresse.
- Ne pas supprimer l'ancienne URL ou le dépôt de retour arrière sans une autorisation explicite et des tests supplémentaires.

## Vérification avant toute suppression ultérieure
1. Sauvegarde hors Supabase des 29 fichiers privés et des tables, plus inventaire des comptes sans divulguer les mots de passe.
2. Vérification des URL de redirection Supabase Auth : site principal, anciennes redirections d'invitation/réinitialisation.
3. Test d'une publication serveur manuelle depuis le nouveau dépôt et restauration v20 documentée, sans exposer d'identifiants.
4. Vérification des accès, imports réels lors de la prochaine disponibilité des fichiers, calculs, exports et stockage.
5. Retrait des autorisations de l'ancien domaine et des éventuels relais seulement après extinction officielle de l'ancienne adresse.

**Ne rien supprimer à ce stade.**
