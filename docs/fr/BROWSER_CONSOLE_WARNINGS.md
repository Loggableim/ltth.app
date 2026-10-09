# Avertissements de la console du navigateur – notes techniques

## Portée

Ce guide aide à classer les avertissements de la console du navigateur dans la version actuelle de LTTH. Les messages varient selon le navigateur, sa version et les ressources chargées. Un exemple ne prouve pas qu’une intégration donnée est actuellement chargée.

## Erreurs audio et de média

Des messages comme « Media resource could not be decoded » peuvent affecter la lecture. Vérifiez d’abord l’URL exacte et le fichier source indiqué par la console. Dans cette version du code, le tableau de bord utilise une courte source WAV valide pour débloquer la lecture audio. Si l’avertissement réapparaît, reproduisez-le avec la version actuelle et inspectez la ressource audio réellement chargée.

## Préfixes CSS

Les navigateurs peuvent signaler des propriétés telles que -webkit- ou -moz-. Elles peuvent servir de solution de compatibilité intentionnelle. Vérifiez le fichier et la ligne indiqués ; ne supprimez un préfixe qu’après avoir confirmé que les navigateurs pris en charge ne seront pas affectés.

## Sélecteurs et règles inconnus

Pour une pseudo-classe ou une règle at inconnue, la console indique généralement la feuille de style concernée. Utilisez cette source pour déterminer si l’avertissement provient de LTTH, d’un plugin ou d’une dépendance intégrée. Corrigez les règles obsolètes lorsqu’elles viennent du code actif du projet.

## Étapes de diagnostic

1. Notez le navigateur et sa version, le message exact, le fichier et la ligne.
2. Rechargez le tableau de bord dans une nouvelle session et vérifiez si le message se reproduit.
3. Identifiez la ressource signalée dans l’onglet Réseau de la session actuelle.
4. Examinez les erreurs et les requêtes échouées de LTTH ; ne filtrez les avertissements qu’après avoir vérifié leur source réelle.

N’appliquez pas de filtre global fondé sur d’anciens noms de fichiers ou d’anciennes intégrations. Utilisez la source affichée par la console actuelle.
