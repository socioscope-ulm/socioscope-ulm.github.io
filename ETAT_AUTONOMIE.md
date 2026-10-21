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
- Son serveur Supabase `socioscope-api` est déployé en version 21 depuis le code présent dans ce dépôt.
- Les trois références salariales privées sont conservées dans `socioscope.salary_references`, hors GitHub.
- Les comptes et données métier partagent le projet Supabase `ovssjbldmsowzojeftyr` : il ne faut pas supprimer ce projet.
- Les utilisateurs et l'administrateur ont validé leurs connexions. La simulation Excel/RUP hors production a été testée.
- Un exemplaire exact du code du serveur v20 est archivé dans `socioscope_backup.edge_function_rollback_20261021` ; la version d'interface antérieure est conservée dans la branche GitHub `retour-arriere-avant-autonomie-20261021`.

## Publication suivante du serveur
Le workflow `.github/workflows/deploy-supabase.yml` est volontairement **manuel**. Il assemble dans GitHub Actions une copie complète du serveur et des routes nécessaires depuis ce dépôt, avec une configuration Deno locale et sans référence privée JSON, puis vérifie son code avant tout déploiement.

Le secret GitHub Actions `SUPABASE_ACCESS_TOKEN` a été ajouté au **nouveau dépôt**, puis validé le 21 octobre 2026 par [GitHub Actions — seconde exécution réussie du contrôle d'autorisation](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39648826329). Le workflow a utilisé le jeton pour consulter en lecture seule la liste des Edge Functions du projet Supabase ; il n'a déployé aucun code et n'a modifié aucune donnée.

L'autorisation nécessaire au futur déploiement est ainsi vérifiée. La compilation complète du serveur a également réussi. **Un véritable redéploiement depuis le nouveau workflow n'a pas encore été exécuté** : il devra rester volontaire et accompagné des contrôles de régression et d'un retour arrière.

Le mode de déploiement n'agit que sur `socioscope-api` et conserve `--no-verify-jwt` ; l'application elle-même vérifie les JWT Supabase et les comptes autorisés. Les futures mises à jour doivent être testées avant déclenchement manuel.

## Compatibilité et limites restantes
- **Sécurité du dépôt historique :** son workflow de déploiement Supabase exige désormais la confirmation manuelle `RESTAURER_ANCIEN_SERVEUR` avant toute réinstallation de l'ancien serveur, évitant une régression accidentelle. Le dépôt historique et le rollback restent accessibles. Une branche de secours du workflow a été créée : `secours-workflow-api-avant-verrouillage-20261021`.
- **Activité des relais :** `socioscope-bridge` a eu des requêtes plus tôt le 21 octobre 2026 ; dernière trace observée à 13:47 UTC, aucune requête sur les deux heures précédant la vérification. Ne pas le supprimer sur cette seule base ; l'API principale `socioscope-api` est bien active en version 21.
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
