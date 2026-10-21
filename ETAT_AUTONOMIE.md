# Socioscope ULM — état de l'autonomie (21 octobre 2026)

## Adresses et architecture validées

- **Application officielle** : https://socioscope-ulm.github.io/
- **Simulations locales côté navigateur** : https://socioscope-ulm.github.io/test/
- **Ancienne adresse conservée uniquement comme redirection** : https://fnme-pointage.github.io/socioscope-ulm/
- **Code autonome** : dépôt `socioscope-ulm/socioscope-ulm.github.io`. Ses déploiements GitHub Pages et Supabase ne nécessitent plus le dépôt historique.
- **Serveur Supabase** : fonction `socioscope-api` **v23 ACTIVE** dans le projet `ovssjbldmsowzojeftyr`. Il s'agit désormais de l'**unique Edge Function** du projet.
- **Données privées** : conservées dans le projet Supabase existant. Ne jamais supprimer ce projet pour fermer le site historique.

## Connexion, nouveaux accès et récupération de mot de passe

**Configuration en production auditée et vérifiée** :
- Supabase Auth `site_url` = `https://socioscope-ulm.github.io/` (corrigé depuis l'ancienne adresse le 21/10/2026).
- La nouvelle adresse est autorisée comme URL de retour des courriels d'inscription, d'invitation et de récupération.
- La connexion par email et la création de comptes sont activées côté Auth, mais l'application n'autorise l'accès qu'aux personnes validées dans `socioscope.members`.
- Le bouton « Mot de passe oublié » appelle directement l'API Auth Supabase avec la nouvelle URL.
- « Première connexion » appelle la même plateforme avec la nouvelle URL, puis la confirmation du compte.
- Depuis « Gérer les accès », l'administrateur peut autoriser une adresse et générer un lien d'activation ou de récupération ; ces liens sont créés côté serveur et explicitement redirigés vers la nouvelle adresse.
- Les routes de gestion des accès et de génération de liens exigent un compte administrateur authentifié ; les tests HTTP refusent les requêtes sans session.
- Les anciens courriels de connexion / réinitialisation peuvent toujours pointer vers l'ancien lien, **qui redirige vers le nouveau en conservant le fragment et les paramètres du jeton**.
- **Une ancienne URL reste volontairement autorisée dans `uri_allow_list` de Supabase Auth pour respecter les liens déjà émis.** Elle n'est plus l'URL principale et le nouveau site n'en dépend pas.
- Aucune invitation ou réinitialisation réelle n'a été générée pour un utilisateur lors de ces contrôles ; la remise effective d'un courriel dans une boîte de réception nécessiterait un test de bout en bout avec un utilisateur volontaire.

## Nettoyage technique accompli

1. L'ancienne adresse GitHub Pages a été remplacée par une redirection immédiate vers la nouvelle (y compris `404.html` et liens Auth à fragment).
2. L'ancien domaine `https://fnme-pointage.github.io` a été retiré de la liste CORS autorisée de l'API. Une requête depuis ce domaine reçoit **403** ; depuis le nouveau domaine une requête sans session reçoit **401**.
3. La fonction `socioscope-api` **v23** a été publiée depuis le **nouveau dépôt GitHub**, après compilation et tests.
4. Les fonctions inutilisées `socioscope-bridge` et `socioscope-transfer` ont été **supprimées du déploiement Supabase**, après vérification de l'absence de dépendance de la nouvelle interface. Seule `socioscope-api` reste déployée.
5. La remise en service du relais depuis l'ancien dépôt est protégée par une confirmation explicite ; le déploiement du serveur historique nécessite également une confirmation.
6. Les workflows ponctuels ayant servi à changer `site_url`, déployer l'API et supprimer les deux relais ont été supprimés du nouveau dépôt. Les futurs déploiements de l'API restent exclusivement manuels.

## Contrôles et preuves de publication

- [Vérification préalable du nouveau domaine et des anciens relais](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39669981245).
- [Configuration du Site URL Auth basculée et contrôlée](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39670132522).
- [Tests des mots de passe, invitations, accès administrateur et compilation Deno](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39670579584).
- [Déploiement réussi de l'API v23 sans l'ancienne origine CORS](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39670808946).
- [Suppression contrôlée des deux anciennes Edge Functions](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39671137960).
- [Audit final du domaine principal, de la redirection héritée, des accès et du CORS](https://github.com/socioscope-ulm/socioscope-ulm.github.io/actions/runs/39671448417).
- Les tests fonctionnels généraux du nouveau Socioscope ainsi que l'affichage de la version v22 avaient été validés par l'administrateur avant ce nettoyage. La version de l'API est désormais **v23**.
- Vérification de cohérence après suppression : **5 membres, 1 238 décisions, 29 fichiers privés, 3 références salariales** toujours présents.

## Retour arrière et précautions

- Branche du nouveau dépôt conservant l'état avant le nettoyage : `secours-v22-auth-et-origines-avant-nettoyage-20261021`.
- Branche historique conservant l'application précédente : `fnme-pointage/socioscope-ulm:secours-ancien-socioscope-avant-redirection-20261021`.
- Les sources des relais sont préservées dans le nouveau dépôt sous `supabase/functions/socioscope-bridge/index.ts` et `supabase/functions/socioscope-transfer/index.ts` (cette dernière ne retournait déjà que HTTP 410).
- Une ancienne version de l'API v20 a été archivée dans `socioscope_backup.edge_function_rollback_20261021` dans Supabase et une ancienne interface dans la branche `retour-arriere-avant-autonomie-20261021`.
- **Les sauvegardes internes ne remplacent pas une sauvegarde indépendante** de la base et des 29 fichiers privés, qui demeure recommandée sans être imposée.
- Conserver l'ancien site comme redirection (et sa compatibilité Auth pour les liens déjà expédiés), même si le nouveau site est complètement autonome. Ne pas supprimer GitHub Pages, les fichiers privés, la base ou le projet Supabase.
