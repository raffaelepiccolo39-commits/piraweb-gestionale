# Compilare l'app (iOS / Android)

L'app e' lo **stesso codice** del sito. Non c'e' un secondo progetto: cambia
solo come viene compilato.

## Il comando

```bash
NEXT_PUBLIC_API_ORIGIN=https://gestionale.piraweb.it npm run app:ios      # apre Xcode
NEXT_PUBLIC_API_ORIGIN=https://gestionale.piraweb.it npm run app:android  # apre Android Studio
```

`npm run app` da solo builda l'esportazione statica in `out/` e la sincronizza
nei progetti nativi (`npx cap sync`), senza aprire nulla.

## Perche' NEXT_PUBLIC_API_ORIGIN

Nel pacchetto dell'app non ci sono le API (l'export statico non le tollera):
restano su Vercel. Questa variabile dice all'app dove chiamarle. Senza, l'app
non saprebbe a chi parlare. Vedi `src/lib/api-origin.ts`.

## Cosa serve installato

- **iOS**: Xcode (gia' presente) + una volta sola `sudo gem install cocoapods`
  se un plugin lo richiede (il Capacitor nuovo usa Swift Package Manager, di
  norma CocoaPods non serve piu').
- **Android**: Android Studio (gratuito) — porta con se' l'Android SDK.

## Il flusso, ogni volta che cambi il codice

1. `npm run app` (builda + sincronizza)
2. In Xcode / Android Studio premi Run per provarla sul simulatore o sul
   telefono collegato.

Le cartelle `ios/` e `android/` si versionano (contengono icone, permessi,
configurazione). NON si versionano `out/` e le copie web dentro i progetti
nativi: le rigenera ogni build (vedi .gitignore).
